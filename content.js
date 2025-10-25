// Content script placeholder
// This can be used for future enhancements like page analysis
console.log('Productivity Task Monitor loaded');

// Track active webcam stream
let activeStream = null;

// Listen for strike alerts and webcam checks from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'showStrikeAlert') {
    const alertMessage = `⚠️ STRIKE ADDED!\n\nYou're not on a productive website.\n\nYou've been on ${message.hostname} for 30+ seconds.\n\nTotal strikes: ${message.strikes}`;
    alert(alertMessage);
    sendResponse({ success: true });
  } else if (message.action === 'checkWebcam') {
    // Handle webcam check and return image data
    try {
      const imageData = await checkWebcamForImageData();
      sendResponse({ imageData });
    } catch (error) {
      console.error('Error checking webcam:', error);
      sendResponse({ error: error.message });
    }
    return true; // Keep channel open for async
  } else if (message.action === 'stopWebcam') {
    // Stop the webcam stream
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
      console.log('📹 Webcam stopped');
    }
    sendResponse({ success: true });
  }
  return true;
});

async function checkWebcamForImageData() {
  let video = null;
  try {
    console.log('📹 Starting webcam check...');
    
    // Request webcam access - this will prompt the user
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: 640, 
        height: 480,
        facingMode: 'user'
      } 
    });
    
    console.log('📹 Webcam access granted!');
    
    // Track the stream
    activeStream = stream;
    
    // Create video element
    video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.style.position = 'fixed';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';
    video.style.zIndex = '-1';
    document.body.appendChild(video);
    
    // Wait for video to start playing
    await video.play();
    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        setTimeout(resolve, 1000); // Give it more time to stabilize
      };
    });
    
    // Capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Get image data
    const imageData = canvas.toDataURL('image/jpeg', 0.8);
    
    console.log('📹 Captured webcam frame, image size:', imageData.length, 'bytes');
    
    // Clean up video element
    if (video && video.parentNode) {
      document.body.removeChild(video);
    }
    
    // Clean up stream
    stream.getTracks().forEach(track => track.stop());
    activeStream = null;
    
    console.log('📹 Returning image data to background script');
    return imageData;
  } catch (error) {
    console.error('Error in webcam check:', error);
    
    // Clean up on error
    if (video && video.parentNode) {
      document.body.removeChild(video);
    }
    if (activeStream) {
      activeStream.getTracks().forEach(track => track.stop());
      activeStream = null;
    }
    
    return false;
  }
}

async function detectFaceWithClaude(imageData) {
  try {
    const CLAUDE_API_KEY = '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';
    
    // Remove the data URL prefix
    const base64Image = imageData.split(',')[1];
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: 'Look at this webcam image. Carefully examine if there is a clear, visible human face (not just hair, clothing, or body parts - but an actual face with eyes, nose, mouth visible). Respond with only YES if you see a clear face, or NO if there is no face or the face is not clearly visible.'
            }
          ]
        }]
      })
    });
    
    const data = await response.json();
    console.log('📹 Claude vision response:', data);
    
    if (data.content && data.content[0] && data.content[0].text) {
      const answer = data.content[0].text.trim().toUpperCase();
      return answer.includes('YES');
    }
    
    return false;
  } catch (error) {
    console.error('Error calling Claude vision:', error);
    return false;
  }
}
