let video = null;
let stream = null;

async function initWebcam() {
  try {
    console.log('📹 Initializing webcam...');
    document.getElementById('status').textContent = 'Requesting camera access...';
    
    // Request webcam access
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: 640, 
        height: 480,
        facingMode: 'user'
      } 
    });
    
    console.log('📹 Webcam access granted!');
    document.getElementById('status').textContent = 'Camera active ✓';
    
    // Create video element
    video = document.getElementById('video');
    video.srcObject = stream;
    await video.play();
    
    console.log('📹 Video playing');
  } catch (error) {
    console.error('Error initializing webcam:', error);
    document.getElementById('status').textContent = 'Error: ' + error.message;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkFace') {
    // Capture current frame
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      
      console.log('📹 Captured frame, size:', imageData.length, 'bytes');
      
      // Send image data back
      sendResponse({ imageData });
      document.getElementById('status').textContent = 'Frame captured at ' + new Date().toLocaleTimeString();
    } catch (error) {
      console.error('Error capturing frame:', error);
      sendResponse({ error: error.message });
    }
    
    return true; // Keep channel open
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('📹 Webcam monitor page loaded');
  initWebcam();
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    console.log('📹 Webcam stream stopped');
  }
});
