"""
Vision Monitor Server
Streams camera feed and runs attention analysis.
Integrates with Chrome extension overlay.
"""

from flask import Flask, Response, jsonify
from flask_cors import CORS
import cv2
import threading
import time
from collections import deque
import sys
import os

# Add vision directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'vision'))

from attention_monitor import PipelineConfig, AttentionMonitorPipeline
from attention_monitor.audio import SoundManager
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

# Global state
camera = None
camera_running = False
session_active = False
current_status = "Looking for face..."
alert_countdown = None
alert_canceled = False
frame_queue = deque(maxlen=1)
analysis_thread = None

# Load config from root .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Fish Audio API key and models
FISH_API_KEY = os.getenv("FISH_LABS_API_KEY", "")
FISH_MODEL_IDS = [
    os.getenv("FISH_LABS_MODEL_ID", ""),
    "c3ab3d55ad154918ad44418770803848",
    "b1f9011713e94a68967add052dea9a77",
    "772b84677250463ab82a76a308bcf2df"
]

# Gemini API for personalized messages
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Vapi configuration
VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID", "")
VAPI_SLACK_OFF_ASSISTANT_ID = os.getenv("VAPI_SLACK_OFF_ASSISTANT_ID", "")

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

print(f"Debug: Current working directory: {os.getcwd()}")
print(f"Debug: Looking for .env file at: {os.path.join(os.path.dirname(__file__), '.env')}")
print(f"Debug: FISH_API_KEY loaded: {bool(FISH_API_KEY)}")
print(f"Debug: FISH_MODEL_ID loaded: {bool(FISH_MODEL_IDS[0])}")
print(f"Debug: VAPI_API_KEY loaded: {bool(VAPI_API_KEY)}")
print(f"Debug: VAPI_PHONE_NUMBER_ID loaded: {bool(VAPI_PHONE_NUMBER_ID)}")
print(f"Debug: VAPI_SLACK_OFF_ASSISTANT_ID loaded: {bool(VAPI_SLACK_OFF_ASSISTANT_ID)}")

# Detection variables
current_task = "work"

# State tracking with consecutive time
sleep_start_time = None
SLEEP_THRESHOLD = 5
sleep_alert_triggered = False
sleep_countdown = None

absence_start_time = None
ABSENCE_THRESHOLD = 5  # Changed to 5 seconds
absence_alert_triggered = False
absence_countdown = None

looking_away_start_time = None
LOOKING_AWAY_THRESHOLD = 5
looking_away_strike_triggered = False
looking_away_countdown = None

# Thresholds for state detection
YAW_THRESHOLD = 30.0  
PITCH_THRESHOLD = 30.0 
EAR_THRESHOLD = 0.01

# Wake-up messages
WAKE_UP_MESSAGES = [
    "WAKE UP YOU LAZY BUM! Stop sleeping and get back to work! You're wasting time and being completely unproductive! Your mom would be so disappointed in you right now!",
    "GET UP RIGHT NOW! You're being incredibly lazy and wasting precious time! This is unacceptable behavior! Get your act together immediately!",
    "SLEEP IS FOR THE WEAK! Wake up this instant! You have important work to do and here you are napping like a sloth! Your future self will hate you!",
    "WHAT IS WRONG WITH YOU?! Get your butt out of dreamland and back to reality! You're ruining your productivity streak!",
    "WAKE UP YOU SLEEPING DISASTER! You have responsibilities and here you are taking a nap! This is completely unprofessional and lazy!",
    "ALERT! LAZINESS DETECTED! Wake up before I report this to your future employer! Get moving and start being productive like a responsible adult!",
]

def generate_personalized_message(activity="work"):
    """Generate a personalized wake-up message using Gemini."""
    if not GEMINI_API_KEY:
        import random
        return random.choice(WAKE_UP_MESSAGES)
    
    try:
        import requests
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={GEMINI_API_KEY}"
        
        prompt = f"""Create a UNHINGED, EXTREMELY HARSH wake-up message for someone who fell asleep while doing {activity}. 

Requirements:
- Be MEAN and AGGRESSIVE but in a motivational way
- Mention specific consequences of sleeping during {activity}
- Make it personal and scathing
- Use CAPS for emphasis
- Keep it under 100 words
- Be creative and make it memorable

Generate ONLY the wake-up message, nothing else."""
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        response = requests.post(url, json=payload, timeout=5)
        if response.status_code == 200:
            data = response.json()
            message = data['candidates'][0]['content']['parts'][0]['text'].strip()
            print(f"✨ Gemini generated personalized message: {message}")
            return message
        else:
            raise Exception(f"Gemini API error: {response.status_code}")
            
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        import random
        return random.choice(WAKE_UP_MESSAGES)

def generate_fish_audio(text, model_id=None):
    """Generate audio using Fish Audio SDK with random voice model."""
    print(f"generate_fish_audio called with text: {text}")
    
    if not FISH_API_KEY:
        print("Fish Audio API key not configured")
        return None
    
    if not model_id:
        import random
        available_models = [m for m in FISH_MODEL_IDS if m]
        if available_models:
            model_id = random.choice(available_models)
        else:
            print("Fish Audio model ID not configured")
            return None
    
    print(f"Using model ID: {model_id}")
    print(f"Using API key: {FISH_API_KEY[:10]}...")
    
    try:
        print("Importing fish_audio_sdk...")
        from fish_audio_sdk import Session, TTSRequest
        
        print("Creating Fish Audio session...")
        session = Session(FISH_API_KEY)
        
        print("Generating audio using TTS...")
        audio_data = b""
        for chunk in session.tts(TTSRequest(text=text, model_id=model_id)):
            audio_data += chunk
        
        print(f"Audio generation completed, total bytes: {len(audio_data)}")
        return audio_data
            
    except Exception as e:
        print(f"Error generating Fish Audio: {e}")
        import traceback
        traceback.print_exc()
        return None

def play_audio_alert(audio_data):
    """Play audio alert using system audio."""
    try:
        import tempfile
        import os
        
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_file_path = temp_file.name
        
        if os.name == 'posix':
            os.system(f"afplay '{temp_file_path}'")
        else:
            os.system(f"start {temp_file_path}")
        
        import threading
        def cleanup():
            time.sleep(5)
            try:
                os.unlink(temp_file_path)
            except:
                pass
        
        threading.Thread(target=cleanup, daemon=True).start()
            
    except Exception as e:
        print(f"Error playing audio: {e}")
        import os
        os.system("afplay /System/Library/Sounds/Alarm.aiff" if os.name == "posix" else "echo \a")

def get_user_phone_from_supabase():
    """Get the user's phone number from Supabase for the active session."""
    try:
        import requests
        
        # First, get the user_id from user_sessions table
        sessions_url = f"{SUPABASE_URL}/rest/v1/user_sessions?select=user_id&is_active=eq.true&limit=1"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
        }
        
        sessions_response = requests.get(sessions_url, headers=headers, timeout=5)
        print(f"🔍 Active sessions query response: {sessions_response.status_code}")
        
        if sessions_response.status_code == 200:
            sessions_data = sessions_response.json()
            print(f"📊 Active sessions found: {len(sessions_data)}")
            if sessions_data and len(sessions_data) > 0:
                user_id = sessions_data[0].get('user_id')
                print(f"👤 Found active user_id: {user_id}")
                
                # Now get the phone number for this specific user
                phone_url = f"{SUPABASE_URL}/rest/v1/user_settings?select=your_phone&user_id=eq.{user_id}&limit=1"
                phone_response = requests.get(phone_url, headers=headers, timeout=5)
                
                if phone_response.status_code == 200:
                    phone_data = phone_response.json()
                    print(f"📊 Phone data found: {len(phone_data)}")
                    if phone_data and len(phone_data) > 0:
                        phone_number = phone_data[0].get('your_phone', '')
                        print(f"📞 Retrieved user phone number: {phone_number}")
                        return phone_number
                    else:
                        print("No phone number found for this user")
                else:
                    print(f"Phone query failed: {phone_response.text}")
            else:
                print("No active sessions found")
        else:
            print(f"Sessions query failed: {sessions_response.text}")
        
        return None
        
    except Exception as e:
        print(f"Error fetching phone number from Supabase: {e}")
        import traceback
        traceback.print_exc()
        return None

def increment_strikes_supabase():
    """Increment strikes in Supabase and check if call is needed."""
    try:
        import requests
        
        # Get user_id from active session
        sessions_url = f"{SUPABASE_URL}/rest/v1/user_sessions?select=user_id&is_active=eq.true&limit=1"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json"
        }
        
        sessions_response = requests.get(sessions_url, headers=headers, timeout=5)
        if sessions_response.status_code == 200:
            sessions_data = sessions_response.json()
            if sessions_data and len(sessions_data) > 0:
                user_id = sessions_data[0].get('user_id')
                print(f"👤 Found active user_id: {user_id}")
            else:
                print("❌ No active session found, cannot increment strikes")
                return 0
        else:
            print(f"❌ Failed to get user_id: {sessions_response.status_code}")
            return 0
        
        # Increment strikes for this user
        url = f"{SUPABASE_URL}/rest/v1/rpc/increment_strikes"
        print(f"📤 Calling Supabase RPC: {url}")
        print(f"📤 Request body: {{'user_id': '{user_id}'}}")
        
        response = requests.post(url, json={"user_id": user_id}, headers=headers, timeout=5)
        
        print(f"📤 Response status: {response.status_code}")
        print(f"📤 Response text: {response.text[:200]}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"📊 Strike increment response: {data}")
            
            # Extract total_strikes from response
            if isinstance(data, list) and len(data) > 0:
                new_strike_count = data[0].get('total_strikes', 0)
            elif isinstance(data, dict):
                new_strike_count = data.get('total_strikes', 0)
            else:
                new_strike_count = 0
            
            print(f"✅ Strike incremented in Supabase. New total: {new_strike_count}")
            
            # Check if we should call after 2 strikes
            if new_strike_count >= 2:
                print(f"🚨 User has reached 2+ strikes. Calling now...")
                call_user_vapi()
                return new_strike_count
        else:
            print(f"❌ Failed to increment strike: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Error incrementing strikes: {e}")
        import traceback
        traceback.print_exc()
    
    return 0

def call_user_vapi():
    """Call the user via Vapi when they're away."""
    global absence_alert_triggered
    
    print("📞 call_user_vapi() called")
    
    if absence_alert_triggered:
        print("📞 Call already triggered in this absence period, skipping")
        return
    
    if not VAPI_API_KEY or not VAPI_PHONE_NUMBER_ID or not VAPI_SLACK_OFF_ASSISTANT_ID:
        print("Vapi configuration missing, skipping call")
        return
    
    user_phone = get_user_phone_from_supabase()
    if not user_phone:
        print("Could not retrieve user phone number from Supabase")
        return
    
    try:
        import requests
        
        url = "https://api.vapi.ai/call"
        headers = {
            "Authorization": f"Bearer {VAPI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "assistantId": VAPI_SLACK_OFF_ASSISTANT_ID,
            "phoneNumberId": VAPI_PHONE_NUMBER_ID,
            "customer": {
                "number": user_phone
            }
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        
        if response.status_code == 200:
            print(f"✅ Vapi call initiated successfully to {user_phone}")
        else:
            print(f"❌ Vapi call failed: {response.status_code} - {response.text}")
            
    except Exception as e:
        print(f"Error calling Vapi: {e}")
        import traceback
        traceback.print_exc()

def generate_frames():
    """Generate camera frames for video streaming."""
    global camera, camera_running
    
    if not session_active:
        print("Session not active, camera not started")
        return
    
    camera = cv2.VideoCapture(0)
    if not camera.isOpened():
        print("Camera not available")
        return
    
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    camera_running = True
    print("Camera started")
    
    while camera_running and session_active:
        success, frame = camera.read()
        if not success:
            break
        
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ret:
            continue
        
        frame_bytes = buffer.tobytes()
        frame_queue.append(frame_bytes)
        
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    
    print("Camera stopped")
    if camera:
        camera.release()

def estimate_head_pose(landmarks, image_shape):
    """Estimate head pose (yaw, pitch) from face landmarks using proper 3D geometry."""
    import numpy as np
    
    # Use the same landmark indices as the dormant system
    # Key points for pose estimation
    nose_tip_idx = 1
    chin_idx = 199
    left_eye_outer_idx = 33
    right_eye_outer_idx = 263
    mouth_left_idx = 61
    mouth_right_idx = 291
    
    # Convert landmarks to 2D points (normalized coordinates)
    height, width = image_shape[:2]
    
    # Extract 2D points
    points_2d = np.array([
        [landmarks[nose_tip_idx].x * width, landmarks[nose_tip_idx].y * height],
        [landmarks[chin_idx].x * width, landmarks[chin_idx].y * height],
        [landmarks[left_eye_outer_idx].x * width, landmarks[left_eye_outer_idx].y * height],
        [landmarks[right_eye_outer_idx].x * width, landmarks[right_eye_outer_idx].y * height],
        [landmarks[mouth_left_idx].x * width, landmarks[mouth_left_idx].y * height],
        [landmarks[mouth_right_idx].x * width, landmarks[mouth_right_idx].y * height],
    ], dtype=np.float64)
    
    # 3D model points (standard face model in mm)
    points_3d = np.array([
        (0.0, 0.0, 0.0),           # Nose tip
        (0.0, -63.6, -12.5),       # Chin
        (-43.3, 32.7, -26.0),      # Left eye outer corner
        (43.3, 32.7, -26.0),       # Right eye outer corner
        (-28.9, -28.9, -24.1),     # Left mouth corner
        (28.9, -28.9, -24.1),      # Right mouth corner
    ], dtype=np.float64)
    
    # Camera internals
    focal_length = width
    center = (width / 2, height / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype=np.float64)
    
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)
    
    try:
        # Solve PnP
        success, rotation_vector, _ = cv2.solvePnP(
            points_3d, 
            points_2d, 
            camera_matrix, 
            dist_coeffs, 
            flags=cv2.SOLVEPNP_ITERATIVE
        )
        
        if not success:
            return 0.0, 0.0
        
        # Convert rotation vector to rotation matrix
        rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
        
        # Calculate Euler angles
        sy = np.sqrt(rotation_matrix[0, 0] ** 2 + rotation_matrix[1, 0] ** 2)
        
        pitch = np.degrees(np.arctan2(-rotation_matrix[2, 0], sy))
        yaw = np.degrees(np.arctan2(rotation_matrix[1, 0], rotation_matrix[0, 0]))
        
        # Debug output to see actual values
        if abs(yaw) > 10 or abs(pitch) > 10:
            print(f"📐 Head pose: yaw={yaw:.1f}°, pitch={pitch:.1f}°")
        
        return yaw, pitch
        
    except Exception as e:
        print(f"Error in pose estimation: {e}")
        return 0.0, 0.0

def run_attention_analysis():
    """Run attention analysis with 4 states: focused, sleeping, looking_away, not_present."""
    global current_status
    global sleep_start_time, sleep_alert_triggered, sleep_countdown
    global absence_start_time, absence_alert_triggered, absence_countdown
    global looking_away_start_time, looking_away_strike_triggered, looking_away_countdown
    
    import mediapipe as mp
    
    print("Starting attention analysis...")
    print(f"📊 Detection thresholds: YAW={YAW_THRESHOLD}°, PITCH={PITCH_THRESHOLD}°, EAR={EAR_THRESHOLD}")
    
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    while session_active:
        success, frame = cap.read()
        if not success:
            break
        
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        
        if results.multi_face_landmarks:
            landmarks = results.multi_face_landmarks[0].landmark
            
            # Calculate eye aspect ratio
            left_eye_top = landmarks[159].y
            left_eye_bottom = landmarks[145].y
            right_eye_top = landmarks[386].y
            right_eye_bottom = landmarks[374].y
            left_ear = abs(left_eye_top - left_eye_bottom)
            right_ear = abs(right_eye_top - right_eye_bottom)
            avg_ear = (left_ear + right_ear) / 2
            
            # Estimate head pose
            yaw, pitch = estimate_head_pose(landmarks, frame.shape[:2])
            
            # Determine state priority: sleeping > looking_away > focused
            if avg_ear < EAR_THRESHOLD:
                # SLEEPING state
                current_status = "Sleeping"
                if sleep_start_time is None:
                    sleep_start_time = time.time()
                    print("😴 Sleep detected")
                
                sleep_duration = time.time() - sleep_start_time
                
                if sleep_duration < SLEEP_THRESHOLD:
                    sleep_countdown = time.time() + (SLEEP_THRESHOLD - sleep_duration)
                else:
                    sleep_countdown = None
                
                if sleep_duration >= SLEEP_THRESHOLD and not sleep_alert_triggered:
                    print(f"🚨 Sleep alert after {sleep_duration:.1f}s")
                    sleep_alert_triggered = True
                    wake_up_message = generate_personalized_message(current_task)
                    audio_data = generate_fish_audio(wake_up_message)
                    if audio_data:
                        play_audio_alert(audio_data)
                
                # Reset looking_away when sleeping
                looking_away_start_time = None
                looking_away_strike_triggered = False
                looking_away_countdown = None
                
            elif abs(yaw) > YAW_THRESHOLD or abs(pitch) > PITCH_THRESHOLD:
                # LOOKING_AWAY state
                current_status = f"Looking away (yaw={yaw:.1f}°, pitch={pitch:.1f}°)"
                if looking_away_start_time is None:
                    looking_away_start_time = time.time()
                    print(f"👀 Looking away detected: yaw={yaw:.1f}°, pitch={pitch:.1f}°")
                
                looking_away_duration = time.time() - looking_away_start_time
                
                if looking_away_duration < LOOKING_AWAY_THRESHOLD:
                    looking_away_countdown = time.time() + (LOOKING_AWAY_THRESHOLD - looking_away_duration)
                else:
                    looking_away_countdown = None
                
                if looking_away_duration >= LOOKING_AWAY_THRESHOLD and not looking_away_strike_triggered:
                    print(f"⚠️ Looking away too long ({looking_away_duration:.1f}s) - adding strike")
                    increment_strikes_supabase()
                    looking_away_strike_triggered = True
                    # Reset timer after strike
                    looking_away_start_time = None
                    looking_away_countdown = None
                
                # Reset sleep when looking away
                sleep_start_time = None
                sleep_alert_triggered = False
                sleep_countdown = None
                
            else:
                # FOCUSED state
                current_status = "Focused"
                
                # Reset all timers
                if sleep_start_time is not None:
                    print(f"✅ Woke up after {time.time() - sleep_start_time:.1f}s")
                sleep_start_time = None
                sleep_alert_triggered = False
                sleep_countdown = None
                
                if looking_away_start_time is not None:
                    print(f"✅ Focused again after {time.time() - looking_away_start_time:.1f}s")
                looking_away_start_time = None
                looking_away_strike_triggered = False
                looking_away_countdown = None
            
            # Reset absence when face is detected
            if absence_start_time is not None:
                print(f"✅ User returned after {time.time() - absence_start_time:.1f}s")
            absence_start_time = None
            absence_alert_triggered = False
            absence_countdown = None
            
        else:
            # NOT_PRESENT state (no face detected)
            current_status = "Not present"
            
            if absence_start_time is None:
                absence_start_time = time.time()
                print("👻 User not present - timer started")
            
            absence_duration = time.time() - absence_start_time
            
            # Set countdown if we haven't triggered the alert yet
            if not absence_alert_triggered and absence_duration < ABSENCE_THRESHOLD:
                remaining_time = ABSENCE_THRESHOLD - absence_duration
                absence_countdown = time.time() + remaining_time
                print(f"⏳ User absent - {remaining_time:.1f}s until call")
            elif not absence_alert_triggered:
                absence_countdown = None
                print(f"🚨 User absent for {absence_duration:.1f}s - calling via Vapi")
                call_user_vapi()
                absence_alert_triggered = True
            else:
                absence_countdown = None
            
            # Reset other timers when not present
            sleep_start_time = None
            sleep_alert_triggered = False
            sleep_countdown = None
            
            looking_away_start_time = None
            looking_away_strike_triggered = False
            looking_away_countdown = None
        
        time.sleep(0.5)
    
    cap.release()
    face_mesh.close()
    print("Attention analysis stopped")


@app.route('/video_feed')
def video_feed():
    """Video streaming route."""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


@app.route('/status')
def status():
    """Get current status and countdown."""
    global sleep_countdown, absence_countdown, looking_away_countdown, current_status, session_active
    
    countdown_val = None
    consequence = None
    
    # Determine which countdown to show based on status
    if "not present" in current_status.lower():
        if absence_countdown is not None:
            remaining = max(0, int(absence_countdown - time.time()))
            if remaining > 0:
                countdown_val = remaining
                consequence = "phone call"
    elif "sleep" in current_status.lower():
        if sleep_countdown is not None:
            remaining = max(0, int(sleep_countdown - time.time()))
            if remaining > 0:
                countdown_val = remaining
                consequence = "loud wake-up call"
    elif "looking away" in current_status.lower():
        if looking_away_countdown is not None:
            remaining = max(0, int(looking_away_countdown - time.time()))
            if remaining > 0:
                countdown_val = remaining
                consequence = "strike added"
    
    # Determine status type
    status_type = "focused"
    if "sleep" in current_status.lower():
        status_type = "sleeping"
    elif "not present" in current_status.lower():
        status_type = "not_present"
    elif "looking away" in current_status.lower():
        status_type = "looking_away"
    
    return jsonify({
        "status": current_status,
        "statusType": status_type,
        "countdown": countdown_val,
        "consequence": consequence,
        "session_active": session_active
    })


@app.route('/cancel_alert', methods=['POST'])
def cancel_alert():
    """Cancel the pending alert."""
    global sleep_start_time, sleep_alert_triggered, sleep_countdown
    global absence_start_time, absence_alert_triggered, absence_countdown
    global looking_away_start_time, looking_away_strike_triggered, looking_away_countdown
    
    # Reset all alerts
    sleep_start_time = None
    sleep_alert_triggered = False
    sleep_countdown = None
    
    absence_start_time = None
    absence_alert_triggered = False
    absence_countdown = None
    
    looking_away_start_time = None
    looking_away_strike_triggered = False
    looking_away_countdown = None
    
    return jsonify({"success": True})


@app.route('/update_task', methods=['POST'])
def update_task():
    """Update the current task for personalized messages."""
    global current_task
    
    from flask import request
    data = request.get_json()
    if data and 'task' in data:
        current_task = data['task']
        print(f"📝 Task updated to: {current_task}")
        return jsonify({"success": True, "task": current_task})
    
    return jsonify({"success": False, "error": "No task provided"})


@app.route('/start_session', methods=['POST'])
def start_session():
    """Start the vision monitoring session."""
    global session_active, analysis_thread
    
    print("=== START SESSION CALLED ===")
    session_active = True
    print("Vision session started")
    
    if not analysis_thread or not analysis_thread.is_alive():
        analysis_thread = threading.Thread(target=run_attention_analysis, daemon=True)
        analysis_thread.start()
    
    return jsonify({"success": True, "message": "Session started"})


@app.route('/stop_session', methods=['POST'])
def stop_session():
    """Stop the vision monitoring session."""
    global session_active, camera_running, camera
    global sleep_start_time, sleep_alert_triggered, sleep_countdown
    global absence_start_time, absence_alert_triggered, absence_countdown
    global looking_away_start_time, looking_away_strike_triggered, looking_away_countdown
    
    session_active = False
    camera_running = False
    
    # Reset all timers
    sleep_start_time = None
    sleep_alert_triggered = False
    sleep_countdown = None
    
    absence_start_time = None
    absence_alert_triggered = False
    absence_countdown = None
    
    looking_away_start_time = None
    looking_away_strike_triggered = False
    looking_away_countdown = None
    
    if camera:
        camera.release()
        camera = None
    
    print("Vision session stopped")
    
    return jsonify({"success": True, "message": "Session stopped"})


def stop_camera():
    """Stop the camera."""
    global camera_running, camera
    camera_running = False
    if camera:
        camera.release()
        camera = None


if __name__ == '__main__':
    print("Starting Vision Monitor Server...")
    print("Camera feed will be available at http://localhost:8080/video_feed")
    print("Extension overlay will use this server for camera feed")
    
    app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)
