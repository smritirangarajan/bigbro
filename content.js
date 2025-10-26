// Content script placeholder
// This can be used for future enhancements like page analysis
console.log('Productivity Task Monitor loaded');

// Track active webcam stream
let activeStream = null;

// Quiz mode content capture
let lastScrollTime = Date.now();
let contentCaptureInterval = null;

// Initialize quiz mode content capture
function initQuizModeCapture() {
  if (contentCaptureInterval) {
    console.log('📝 DEBUG: Content capture already initialized');
    return;
  }
  
  console.log('📝 Initializing quiz mode content capture');
  
  // Capture content when user scrolls
  let lastScrollTop = 0;
  window.addEventListener('scroll', () => {
    lastScrollTime = Date.now();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    console.log('📝 DEBUG: Scroll detected, scrollTop:', scrollTop);
    
    // Only capture if user scrolled significantly (more than 200px)
    if (Math.abs(scrollTop - lastScrollTop) > 200) {
      console.log('📝 DEBUG: Significant scroll detected, capturing content');
      capturePageContent();
      lastScrollTop = scrollTop;
    }
  });
  
  // Also capture content every 10 seconds if on the same page
  contentCaptureInterval = setInterval(() => {
    const timeSinceScroll = Date.now() - lastScrollTime;
    console.log('📝 DEBUG: Timer tick, time since scroll:', timeSinceScroll, 'ms');
    
    // Only capture if user recently scrolled (within last 30 seconds)
    if (timeSinceScroll < 30000) {
      console.log('📝 DEBUG: Recent scroll detected, capturing content');
      capturePageContent();
    } else {
      console.log('📝 DEBUG: No recent scroll, skipping capture');
    }
  }, 10000);
  
  console.log('📝 DEBUG: Content capture initialized with interval');
}

function stopQuizModeCapture() {
  if (contentCaptureInterval) {
    clearInterval(contentCaptureInterval);
    contentCaptureInterval = null;
    console.log('📝 Stopped quiz mode content capture');
  }
}

async function capturePageContent() {
  console.log('📸 DEBUG: capturePageContent called');
  
  // Capture screenshot first for Claude Vision
  try {
    console.log('📸 DEBUG: Attempting to capture screenshot...');
    const screenshot = await captureScreenshot();
    console.log('📸 DEBUG: Screenshot captured, length:', screenshot.length);
    
    // Send screenshot to background for Claude Vision processing
    chrome.runtime.sendMessage({
      action: 'processScreenshot',
      screenshot: screenshot,
      url: window.location.href,
      title: document.title
    });
    console.log('📸 DEBUG: Screenshot sent to background script');
  } catch (error) {
    console.error('❌ Error capturing screenshot:', error);
  }
  
  // Also capture text content as fallback
  const mainSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '#content',
    '.main-content'
  ];
  
  let mainContent = null;
  for (const selector of mainSelectors) {
    mainContent = document.querySelector(selector);
    if (mainContent) break;
  }
  
  const sourceElement = mainContent || document.body;
  let textContent = sourceElement.innerText || sourceElement.textContent;
  
  // Remove navigation, footer, and common non-content elements
  const nonContentSelectors = 'nav, header, footer, aside, .nav, .navigation, .menu, .sidebar, .ad, .advertisement, .ads, .cookie, .modal';
  const nonContentElements = sourceElement.querySelectorAll(nonContentSelectors);
  nonContentElements.forEach(el => {
    const clone = el.cloneNode(true);
    const cloneText = clone.innerText || clone.textContent;
    if (cloneText) {
      textContent = textContent.replace(cloneText, '');
    }
  });
  
  const cleanText = textContent
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2000);
  
  if (cleanText.length >= 50) {
    console.log('📥 DEBUG: Clean text length:', cleanText.length);
    console.log('📥 DEBUG: Current URL:', window.location.href);
    
    // Send to background for ChromaDB storage
    chrome.runtime.sendMessage({
      action: 'cacheContent',
      content: cleanText,
      url: window.location.href,
      title: document.title
    }, (response) => {
      console.log('📥 DEBUG: Response from background:', response);
    });
    
    console.log('📥 Captured content for quiz:', cleanText.substring(0, 100) + '...');
  } else {
    console.log('📥 DEBUG: Text too short, length:', cleanText.length);
  }
}

async function captureScreenshot() {
  try {
    // Request screen capture
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        mediaSource: 'screen',
        cursor: 'never'
      }
    });
    
    // Create video element to capture frame
    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    await video.play();
    
    // Wait for video to be ready
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create canvas and capture frame
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Get image as base64
    const screenshot = canvas.toDataURL('image/png', 0.8);
    
    // Stop the stream
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    
    return screenshot;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    // Fallback to sending a message that screenshot failed
    chrome.runtime.sendMessage({
      action: 'screenshotFailed',
      error: error.message
    });
    throw error;
  }
}

// Check if quiz mode is enabled and start/stop capture accordingly
chrome.storage.local.get(['quizMode']).then(({ quizMode }) => {
  console.log('📝 DEBUG: Quiz mode state:', quizMode);
  if (quizMode) {
    console.log('📝 DEBUG: Quiz mode enabled, initializing content capture');
    initQuizModeCapture();
  } else {
    console.log('📝 DEBUG: Quiz mode disabled');
  }
});

// Listen for quiz mode changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('📝 DEBUG: Storage changed:', changes);
  if (namespace === 'local' && changes.quizMode) {
    console.log('📝 DEBUG: Quiz mode changed to:', changes.quizMode.newValue);
    if (changes.quizMode.newValue) {
      console.log('📝 DEBUG: Starting quiz capture');
      initQuizModeCapture();
    } else {
      console.log('📝 DEBUG: Stopping quiz capture');
      stopQuizModeCapture();
    }
  }
});

// Listen for strike alerts and webcam checks from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'showStrikeAlert') {
    const alertMessage = `⚠️ STRIKE ADDED!\n\nYou're not on a productive website.\n\nYou've been on ${message.hostname} for 30+ seconds.\n\nTotal strikes: ${message.strikes}`;
    alert(alertMessage);
    sendResponse({ success: true });
  } else if (message.action === 'getUserId') {
    // Get user ID from meta tag on the page
    const userIdMeta = document.querySelector('meta[name="user-id"]');
    const userId = userIdMeta ? userIdMeta.content : null;
    console.log('Content script - getUserID called, userId:', userId);
    sendResponse({ userId });
    return true; // Keep channel open
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
    // Import config
    const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
    if (!response || !response.CLAUDE_API_KEY) {
      console.error('Claude API key not available');
      return false;
    }
    const CLAUDE_API_KEY = response.CLAUDE_API_KEY;
    
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
