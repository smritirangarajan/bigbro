"""
Fish Audio TTS Configuration
Handles voice model selection and text-to-speech generation
"""

import os
from typing import Optional

# Fish Audio API Configuration
FISH_AUDIO_API_KEY = '4ad0b8865064441bb62a3ea15675895c'
FISH_AUDIO_BASE_URL = 'https://api.fishaudio.com/v1'

# Default voice models (user can select in settings)
DEFAULT_VOICE_MODEL = 'default'
AVAILABLE_VOICES = {
    'default': {
        'model': 'fish-speech-1.5',
        'voice_id': 'default'
    },
    'energetic': {
        'model': 'fish-speech-1.5',
        'voice_id': 'energetic'
    },
    'calm': {
        'model': 'fish-speech-1.5',
        'voice_id': 'calm'
    },
}

# Alert messages (angry/motivating tone)
SLEEP_ALERT_MESSAGES = [
    "HEY! WAKE UP! You're falling asleep at your desk! Get back to work NOW!",
    "SNAP OUT OF IT! You're sleeping when you should be working! FOCUS!",
    "WAKE UP! You're supposed to be working on your task, not napping! MOVE IT!",
    "HEY YOU! Eyes open! You're sleeping on the job! Get back to work RIGHT NOW!",
    "WAKE UP! This is unacceptable! You need to FOCUS and get your work done!",
    "SLEEPING AGAIN? Are you serious? Wake up and get back to your task!"
]


def get_voice_config(voice_name: str = None) -> dict:
    """Get voice configuration by name, defaults to DEFAULT_VOICE_MODEL"""
    voice_name = voice_name or DEFAULT_VOICE_MODEL
    return AVAILABLE_VOICES.get(voice_name, AVAILABLE_VOICES[DEFAULT_VOICE_MODEL])


async def generate_voice_alert(message: str, voice_name: Optional[str] = None) -> Optional[bytes]:
    """
    Generate voice alert using Fish Audio TTS
    
    Args:
        message: Text to convert to speech
        voice_name: Voice model to use (optional)
    
    Returns:
        Audio bytes or None if generation fails
    """
    try:
        import aiohttp
        
        voice_config = get_voice_config(voice_name)
        
        # Fish Audio TTS API endpoint
        url = f"{FISH_AUDIO_BASE_URL}/tts"
        
        payload = {
            "text": message,
            "model": voice_config['model'],
            "voice": voice_config['voice_id'],
        }
        
        headers = {
            "Authorization": f"Bearer {FISH_AUDIO_API_KEY}",
            "Content-Type": "application/json"
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as response:
                if response.status == 200:
                    audio_data = await response.read()
                    print(f"🔊 Generated voice alert: '{message}' with voice '{voice_name or 'default'}'")
                    return audio_data
                else:
                    error_text = await response.text()
                    print(f"❌ Fish Audio API error: {response.status} - {error_text}")
                    return None
        
    except Exception as e:
        print(f"❌ Error generating voice alert: {e}")
        return None


def play_audio(audio_data: bytes) -> None:
    """
    Play audio alert
    
    Args:
        audio_data: Audio bytes to play
    """
    try:
        import pygame
        
        # Initialize pygame mixer
        pygame.mixer.init()
        
        # Create temporary audio file
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_file:
            tmp_file.write(audio_data)
            tmp_file_path = tmp_file.name
        
        # Play audio
        pygame.mixer.music.load(tmp_file_path)
        pygame.mixer.music.play()
        
        # Wait for playback to finish
        while pygame.mixer.music.get_busy():
            import time
            time.sleep(0.1)
        
        # Cleanup
        os.unlink(tmp_file_path)
        
    except Exception as e:
        print(f"❌ Error playing audio: {e}")
