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
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

# Fish Audio API key and models
FISH_API_KEY = os.getenv("FISH_LABS_API_KEY", "")
FISH_MODEL_IDS = [
    os.getenv("FISH_LABS_MODEL_ID", ""),  # Primary model
    "c3ab3d55ad154918ad44418770803848",  # Alternative models
    "b1f9011713e94a68967add052dea9a77",
    "772b84677250463ab82a76a308bcf2df"
]

# Gemini API for personalized messages
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Vapi configuration (from environment variables)
VAPI_API_KEY = os.getenv("VAPI_API_KEY", "")
VAPI_PHONE_NUMBER_ID = os.getenv("VAPI_PHONE_NUMBER_ID", "")
VAPI_SLACK_OFF_ASSISTANT_ID = os.getenv("VAPI_SLACK_OFF_ASSISTANT_ID", "")

# Supabase configuration (for getting user's phone number)
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
current_task = "work"  # Store current task for personalized messages

# Sleep detection
sleep_start_time = None
SLEEP_THRESHOLD = 5  # 5 seconds before alert
sleep_alert_triggered = False
sleep_countdown = None

# User gone (not visible) detection
absence_start_time = None
ABSENCE_THRESHOLD = 30  # 30 seconds before calling user
absence_alert_triggered = False
absence_countdown = None

# Phone detection (disabled - not working properly)
phone_detection_enabled = False

# Base wake-up messages (used as fallback or inspiration)
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
        # Use fallback if Gemini is not configured
        import random
        return random.choice(WAKE_UP_MESSAGES)
    
    try:
        import requests
        import json
        
        # Make a request to Gemini API
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
            print(f"Gemini API error: {response.status_code}")
            raise Exception(f"Gemini API error: {response.status_code}")
            
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        # Fallback to random pre-written message
        import random
        return random.choice(WAKE_UP_MESSAGES)

def generate_fish_audio(text, model_id=None):
    """Generate audio using Fish Audio SDK with random voice model."""
    print(f"generate_fish_audio called with text: {text}")
    
    if not FISH_API_KEY:
        print("Fish Audio API key not configured")
        return None
    
    # Select random model if not specified
    if not model_id:
        import random
        available_models = [m for m in FISH_MODEL_IDS if m]  # Filter out empty strings
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
        # Generate audio using the SDK
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
        # Save audio data to a temporary file first
        import tempfile
        import os
        
        # Create a temporary file with .wav extension
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_file_path = temp_file.name
        
        # Use system command to play the audio file
        if os.name == 'posix':  # macOS/Linux
            os.system(f"afplay '{temp_file_path}'")
        else:  # Windows
            os.system(f"start {temp_file_path}")
        
        # Clean up the temporary file after a delay
        import threading
        def cleanup():
            time.sleep(5)  # Wait 5 seconds for audio to finish
            try:
                os.unlink(temp_file_path)
            except:
                pass
        
        threading.Thread(target=cleanup, daemon=True).start()
            
    except Exception as e:
        print(f"Error playing audio: {e}")
        # Fallback: use system beep
        import os
        os.system("afplay /System/Library/Sounds/Alarm.aiff" if os.name == "posix" else "echo \a")

def get_user_phone_from_supabase():
    """Get the user's phone number from Supabase."""
    try:
        import requests
        
        # Get the first user with a phone number from user_settings table
        url = f"{SUPABASE_URL}/rest/v1/user_settings?select=your_phone&your_phone=not.is.null&limit=1"
        headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"
        }
        
        response = requests.get(url, headers=headers, timeout=5)
        print(f"🔍 Supabase response: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"📊 Users found: {len(data)}")
            if data:
                phone_number = data[0].get('your_phone', '')
                print(f"📞 Retrieved user phone number: {phone_number}")
                return phone_number
            else:
                print("No users with phone numbers found")
        else:
            print(f"Supabase query failed: {response.text}")
        
        return None
        
    except Exception as e:
        print(f"Error fetching phone number from Supabase: {e}")
        import traceback
        traceback.print_exc()
        return None

def call_user_vapi():
    """Call the user via Vapi when they're slacking off."""
    global absence_alert_triggered
    
    print("📞 call_user_vapi() called")
    
    if absence_alert_triggered:
        print("📞 Call already triggered in this absence period, skipping")
        return  # Only call once per absence period
    
    if not VAPI_API_KEY or not VAPI_PHONE_NUMBER_ID or not VAPI_SLACK_OFF_ASSISTANT_ID:
        print("Vapi configuration missing, skipping call")
        return
    
    # Get user's phone number from Supabase
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
    
    # Only start camera if session is active
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
        
        # Encode frame as JPEG
        ret, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if not ret:
            continue
        
        frame_bytes = buffer.tobytes()
        frame_queue.append(frame_bytes)
        
        # Yield frame for streaming
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
    
    print("Camera stopped")
    if camera:
        camera.release()


def detect_phone_use(frame):
    """Detect if user is holding a phone using improved detection."""
    try:
        # Method 1: Check for dark rectangular objects (phone screens)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Threshold to find dark regions (phone screens are typically dark)
        _, thresh = cv2.threshold(blurred, 50, 255, cv2.THRESH_BINARY_INV)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            # Phone screens are typically 3000-80000 pixels at 640x480 resolution
            if 3000 < area < 80000:
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / float(h) if h > 0 else 0
                # Phone aspect ratios are typically 0.5 to 2.0
                if 0.4 < aspect_ratio < 2.5:
                    # Check if it's in the center/upper portion of the frame (where phones are held)
                    center_x = x + w / 2
                    center_y = y + h / 2
                    frame_center_x = frame.shape[1] / 2
                    frame_center_y = frame.shape[0] / 2
                    
                    # Phone is typically held near the center or top of the frame
                    if (abs(center_x - frame_center_x) < frame.shape[1] * 0.4 and 
                        center_y < frame.shape[0] * 0.6):
                        return True
        
        # Method 2: Check for bright rectangular edges (phone edges/borders)
        edges = cv2.Canny(blurred, 50, 150)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if 1000 < area < 60000:
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = w / float(h) if h > 0 else 0
                if 0.5 < aspect_ratio < 2.0:
                    # Check for rectangular shape
                    rect_area = w * h
                    extent = float(area) / rect_area if rect_area > 0 else 0
                    # Phones typically have high extent (close to rectangular)
                    if extent > 0.5:
                        return True
        
        return False
    except Exception as e:
        print(f"Error in phone detection: {e}")
        return False

def run_attention_analysis():
    """Run attention analysis - three modes: focused, sleeping, user gone."""
    global current_status
    global sleep_start_time, sleep_alert_triggered, sleep_countdown
    global absence_start_time, absence_alert_triggered, absence_countdown
    
    import mediapipe as mp
    
    print("Starting attention analysis...")
    
    # Initialize MediaPipe Face Mesh
    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    
    # Get camera
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    
    while session_active:
        success, frame = cap.read()
        if not success:
            break
        
        # Phone detection is disabled, skipping
        
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        
        if results.multi_face_landmarks:
            # Face detected - check sleep
            landmarks = results.multi_face_landmarks[0].landmark
            
            # Check sleep using eye aspect ratio
            left_eye_top = landmarks[159].y
            left_eye_bottom = landmarks[145].y
            right_eye_top = landmarks[386].y
            right_eye_bottom = landmarks[374].y
            left_ear = abs(left_eye_top - left_eye_bottom)
            right_ear = abs(right_eye_top - right_eye_bottom)
            avg_ear = (left_ear + right_ear) / 2
            
            # Determine current state
            if avg_ear < 0.01:
                # Sleeping
                current_status = "Sleeping"
                if sleep_start_time is None:
                    sleep_start_time = time.time()
                    print("😴 Sleep detected")
                
                sleep_duration = time.time() - sleep_start_time
                
                # Sleep countdown
                if sleep_duration < SLEEP_THRESHOLD:
                    sleep_countdown = time.time() + (SLEEP_THRESHOLD - sleep_duration)
                else:
                    sleep_countdown = None
                
                # Trigger alert
                if sleep_duration >= SLEEP_THRESHOLD and not sleep_alert_triggered:
                    print(f"🚨 Sleep alert after {sleep_duration:.1f}s")
                    sleep_alert_triggered = True
                    wake_up_message = generate_personalized_message(current_task)
                    audio_data = generate_fish_audio(wake_up_message)
                    if audio_data:
                        play_audio_alert(audio_data)
            else:
                # Focused
                current_status = "Focused"
                # Reset sleep timer
                if sleep_start_time is not None:
                    print(f"✅ Woke up after {time.time() - sleep_start_time:.1f}s")
                sleep_start_time = None
                sleep_alert_triggered = False
                sleep_countdown = None
            
            # Reset absence tracking when face is detected
            if absence_start_time is not None:
                print(f"✅ User returned after {time.time() - absence_start_time:.1f}s")
            absence_start_time = None
            absence_alert_triggered = False
            absence_countdown = None
        else:
            # No face detected - user gone
            current_status = "User gone"
            
            # Start absence timer if not already started
            if absence_start_time is None:
                absence_start_time = time.time()
                print("👻 User gone - timer started")
            
            # Calculate absence duration
            absence_duration = time.time() - absence_start_time
            
            # Set countdown
            if absence_duration < ABSENCE_THRESHOLD and not absence_alert_triggered:
                absence_countdown = time.time() + (ABSENCE_THRESHOLD - absence_duration)
            else:
                absence_countdown = None
            
            # Trigger Vapi call
            if absence_duration >= ABSENCE_THRESHOLD and not absence_alert_triggered:
                print(f"🚨 User gone for {absence_duration:.1f}s - calling via Vapi")
                call_user_vapi()
                absence_alert_triggered = True
        
        time.sleep(0.5)  # Update every 500ms
    
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
    global sleep_countdown, absence_countdown, current_status, session_active
    
    countdown_val = None
    
    # Determine which countdown to show based on status
    if "gone" in current_status.lower():
        # User gone
        if absence_countdown is not None:
            remaining = max(0, int(absence_countdown - time.time()))
            if remaining > 0:
                countdown_val = remaining
    elif "sleep" in current_status.lower():
        # Sleeping
        if sleep_countdown is not None:
            remaining = max(0, int(sleep_countdown - time.time()))
            if remaining > 0:
                countdown_val = remaining
    
    # Determine status type - only three modes now
    status_type = "focused"  # default
    if "sleep" in current_status.lower():
        status_type = "sleeping"
    elif "gone" in current_status.lower():
        status_type = "gone"
    
    return jsonify({
        "status": current_status,
        "statusType": status_type,
        "countdown": countdown_val,
        "session_active": session_active
    })


@app.route('/cancel_alert', methods=['POST'])
def cancel_alert():
    """Cancel the pending alert."""
    global sleep_start_time, sleep_alert_triggered, sleep_countdown
    global absence_start_time, absence_alert_triggered, absence_countdown
    
    # Reset sleep alert
    sleep_start_time = None
    sleep_alert_triggered = False
    sleep_countdown = None
    
    # Reset absence alert
    absence_start_time = None
    absence_alert_triggered = False
    absence_countdown = None
    
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
    
    # Fish Audio is now integrated into sleep detection
    
    # Start attention analysis thread if not already running
    if not analysis_thread or not analysis_thread.is_alive():
        analysis_thread = threading.Thread(target=run_attention_analysis, daemon=True)
        analysis_thread.start()
    
    return jsonify({"success": True, "message": "Session started"})


@app.route('/stop_session', methods=['POST'])
def stop_session():
    """Stop the vision monitoring session."""
    global session_active, camera_running, camera, sleep_start_time, alert_triggered, alert_countdown
    
    session_active = False
    camera_running = False
    sleep_start_time = None
    alert_triggered = False
    alert_countdown = None
    
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
    
    # Start Flask server
    app.run(host='0.0.0.0', port=8080, debug=False, threaded=True)