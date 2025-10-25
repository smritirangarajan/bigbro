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

# Load config
load_dotenv(os.path.join(os.path.dirname(__file__), 'vision', '.env'))

# Fish Audio API key and model
FISH_API_KEY = os.getenv("FISH_LABS_API_KEY", "")
FISH_MODEL_ID = os.getenv("FISH_LABS_MODEL_ID", "")

print(f"Debug: Current working directory: {os.getcwd()}")
print(f"Debug: Looking for .env file at: {os.path.join(os.path.dirname(__file__), 'vision', '.env')}")
print(f"Debug: FISH_API_KEY loaded: {bool(FISH_API_KEY)}")
print(f"Debug: FISH_MODEL_ID loaded: {bool(FISH_MODEL_ID)}")

# Sleep detection variables
sleep_start_time = None
SLEEP_THRESHOLD = 5  # 5 seconds for testing (was 60)
alert_triggered = False

def generate_fish_audio(text, model_id=None):
    """Generate audio using Fish Audio SDK."""
    print(f"generate_fish_audio called with text: {text}")
    
    if not FISH_API_KEY:
        print("Fish Audio API key not configured")
        return None
    
    if not model_id:
        model_id = FISH_MODEL_ID
    
    if not model_id:
        print("Fish Audio model ID not configured")
        return None
    
    print(f"Using API key: {FISH_API_KEY[:10]}...")
    print(f"Using model ID: {model_id}")
    
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


def run_attention_analysis():
    """Run simple attention analysis with sleep detection."""
    global current_status, alert_countdown, alert_canceled, sleep_start_time, alert_triggered
    
    import mediapipe as mp
    
    print("Starting attention analysis...")
    
    # Initialize MediaPipe Face Mesh
    mp_face_mesh = mp.solutions.face_mesh
    mp_drawing = mp.solutions.drawing_utils
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
        
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        
        if results.multi_face_landmarks:
            # Face detected - check if eyes are open or closed
            landmarks = results.multi_face_landmarks[0].landmark
            
            # Get left and right eye landmarks
            left_eye_top = landmarks[159].y
            left_eye_bottom = landmarks[145].y
            right_eye_top = landmarks[386].y
            right_eye_bottom = landmarks[374].y
            
            # Calculate eye aspect ratio (EAR)
            left_ear = abs(left_eye_top - left_eye_bottom)
            right_ear = abs(right_eye_top - right_eye_bottom)
            avg_ear = (left_ear + right_ear) / 2
            
            # Update status based on EAR
            if avg_ear > 0.02:
                current_status = "Alert and focused"
                # Reset sleep tracking when awake
                if sleep_start_time is not None:
                    print(f"User woke up after {time.time() - sleep_start_time:.1f} seconds")
                sleep_start_time = None
                alert_triggered = False
                alert_countdown = None
            elif avg_ear > 0.01:
                current_status = "Slightly drowsy"
                # Reset sleep tracking when slightly drowsy
                if sleep_start_time is not None:
                    print(f"User became drowsy after {time.time() - sleep_start_time:.1f} seconds")
                sleep_start_time = None
                alert_triggered = False
                alert_countdown = None
            else:
                current_status = "Sleeping"
                
                # Start sleep timer if not already started
                if sleep_start_time is None:
                    sleep_start_time = time.time()
                    print(f"Sleep detected at {time.time()}")
                
                # Calculate sleep duration
                sleep_duration = time.time() - sleep_start_time
                print(f"Sleep duration: {sleep_duration:.1f}s (threshold: {SLEEP_THRESHOLD}s)")
                
                # Check if we've been sleeping for more than threshold
                if sleep_duration >= SLEEP_THRESHOLD and not alert_triggered:
                    print(f"Sleep alert triggered after {sleep_duration:.1f} seconds")
                    alert_triggered = True
                    
                    # Generate and play wake-up message
                    wake_up_message = "WAKE UP YOU LAZY BUM! Stop sleeping and get back to work! You're wasting time and being completely unproductive! Your mom would be so disappointed in you right now! Get your act together and focus on your work immediately!"
                    print(f"Generating wake-up audio: {wake_up_message}")
                    
                    audio_data = generate_fish_audio(wake_up_message)
                    if audio_data:
                        print(f"Audio generated successfully, length: {len(audio_data)} bytes")
                        play_audio_alert(audio_data)
                    else:
                        print("Fish Audio failed, using fallback")
                        # Fallback to system alert
                        import os
                        os.system("afplay /System/Library/Sounds/Alarm.aiff")
                
                # Set countdown for display
                if sleep_duration < SLEEP_THRESHOLD:
                    remaining_time = SLEEP_THRESHOLD - sleep_duration
                    alert_countdown = time.time() + remaining_time
                else:
                    alert_countdown = None
        else:
            current_status = "Looking for face..."
            # Reset sleep tracking when no face detected
            sleep_start_time = None
            alert_triggered = False
            alert_countdown = None
        
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
    global alert_countdown, alert_canceled
    
    countdown_val = None
    if alert_countdown is not None and not alert_canceled:
        remaining = max(0, int(alert_countdown - time.time()))
        if remaining > 0:
            countdown_val = remaining
    
    status_type = "default"
    if "sleep" in current_status.lower():
        status_type = "sleeping"
    elif "focused" in current_status.lower() or "alert" in current_status.lower():
        status_type = "focused"
    
    return jsonify({
        "status": current_status,
        "statusType": status_type,
        "countdown": countdown_val
    })


@app.route('/cancel_alert', methods=['POST'])
def cancel_alert():
    """Cancel the pending alert."""
    global alert_canceled, sleep_start_time, alert_triggered
    alert_canceled = True
    sleep_start_time = None
    alert_triggered = False
    return jsonify({"success": True})


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
