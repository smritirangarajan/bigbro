document.addEventListener('DOMContentLoaded', async () => {
  const loginPrompt = document.getElementById('login-prompt');
  const mainContainer = document.getElementById('main-container');
  const taskInput = document.getElementById('task-input');
  const taskInputWrapper = document.getElementById('task-input-wrapper');
  const monitoringControls = document.getElementById('monitoring-controls');
  const momPhoneInput = document.getElementById('mom-phone-input');
  const yourPhoneInput = document.getElementById('your-phone-input');
  const setTaskBtn = document.getElementById('set-task-btn');
  const pauseTaskBtn = document.getElementById('pause-task-btn');
  const resumeTaskBtn = document.getElementById('resume-task-btn');
  const stopTaskBtn = document.getElementById('stop-task-btn');
  const currentTaskDisplay = document.getElementById('current-task');
  const strikeCount = document.getElementById('strike-count');
  const monitoringIndicator = document.getElementById('monitoring-indicator');
  const monitoringText = document.getElementById('monitoring-text');
  const openWebappBtn = document.getElementById('open-webapp-btn');
  
  // Check if user is logged in by checking for phone numbers in Supabase
  async function checkLoginStatus() {
    try {
      console.log('🔍 Checking login status...');
      const phoneData = await getPhoneNumbersFromSupabase();
      console.log('📱 Phone data received:', phoneData);
      
      const hasPhoneNumbers = phoneData && (phoneData.momPhone || phoneData.yourPhone);
      console.log('✅ Has phone numbers:', hasPhoneNumbers);
      
      // Check if session is active by checking vision server status
      const isSessionActive = await checkVisionServerSession();
      console.log('📋 Session active:', isSessionActive);
      
      return hasPhoneNumbers && isSessionActive;
    } catch (error) {
      console.error('❌ Not logged in:', error);
      return false;
    }
  }
  
  // Check if session is active by querying vision server
  async function checkVisionServerSession() {
    try {
      const response = await fetch('http://localhost:8080/status');
      if (!response.ok) return false;
      
      const data = await response.json();
      // Session is active if vision server is running and session_active is true
      return data.session_active === true;
    } catch (error) {
      console.log('Vision server not reachable:', error);
      return false;
    }
  }
  
  // Check login and show appropriate UI
  const isLoggedIn = await checkLoginStatus();
  console.log('🔐 Login status:', isLoggedIn);
  
  // Only show main container if logged in AND session is active
  if (isLoggedIn) {
    console.log('✅ Logged in and session active - showing main UI');
    loginPrompt.style.display = 'none';
    mainContainer.style.display = 'block';
    
    // Load phone numbers
    const phoneData = await getPhoneNumbersFromSupabase();
    if (phoneData && phoneData.momPhone) {
      momPhoneInput.value = phoneData.momPhone;
      console.log('✅ Loaded mom phone:', phoneData.momPhone);
    }
    if (phoneData && phoneData.yourPhone) {
      yourPhoneInput.value = phoneData.yourPhone;
      console.log('✅ Loaded your phone:', phoneData.yourPhone);
    }
  } else {
    console.log('❌ Not logged in or session not active - showing login prompt');
    loginPrompt.style.display = 'block';
    mainContainer.style.display = 'none';
  }
  
  // Also periodically check if session becomes active
  setInterval(async () => {
    const isLoggedIn = await checkLoginStatus();
    if (isLoggedIn) {
      if (loginPrompt.style.display !== 'none') {
        console.log('✅ Session now active - showing main UI');
        loginPrompt.style.display = 'none';
        mainContainer.style.display = 'block';
      }
    } else {
      if (mainContainer.style.display !== 'none') {
        console.log('❌ Session no longer active - showing login prompt');
        loginPrompt.style.display = 'block';
        mainContainer.style.display = 'none';
      }
    }
  }, 2000); // Check every 2 seconds
  
  // Open web app button
  openWebappBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://localhost:8000' });
  });

  // Load current state
  async function loadState() {
    const result = await chrome.storage.local.get(['currentTask', 'isMonitoring', 'isPaused', 'strikes', 'checks', 'momPhoneNumber', 'yourPhoneNumber']);
    
    if (result.currentTask) {
      currentTaskDisplay.innerHTML = `<p class="task-text">${result.currentTask}</p>`;
    } else {
      currentTaskDisplay.innerHTML = '<p class="no-task">No task set yet</p>';
    }
    
    // Load phone numbers if saved
    if (result.momPhoneNumber) {
      momPhoneInput.value = result.momPhoneNumber;
    }
    
    if (result.yourPhoneNumber) {
      yourPhoneInput.value = result.yourPhoneNumber;
    }
    
    // Show/hide UI based on monitoring state
    if (result.isMonitoring) {
      monitoringIndicator.classList.add('active');
      monitoringText.textContent = result.isPaused ? 'Monitoring: PAUSED' : 'Monitoring: ON';
      
      // Hide task input wrapper completely
      taskInputWrapper.style.display = 'none';
      
      // Show monitoring controls
      monitoringControls.style.display = 'block';
      
      // Show pause/resume based on paused state
      if (result.isPaused) {
        pauseTaskBtn.style.display = 'none';
        resumeTaskBtn.style.display = 'inline-block';
      } else {
        pauseTaskBtn.style.display = 'inline-block';
        resumeTaskBtn.style.display = 'none';
      }
    } else {
      monitoringIndicator.classList.remove('active');
      monitoringText.textContent = 'Monitoring: OFF';
      
      // Show task input wrapper
      taskInputWrapper.style.display = 'block';
      
      // Hide monitoring controls
      monitoringControls.style.display = 'none';
      
      // Clear inputs
      taskInput.value = '';
    }
    
    const strikes = result.strikes || 0;
    strikeCount.textContent = strikes;
  }

  // Set task
  setTaskBtn.addEventListener('click', async () => {
    const task = taskInput.value.trim();
    if (!task) {
      alert('Please enter a task');
      return;
    }

    // Check if session is active
    const isSessionActive = await checkSessionActive();
    if (!isSessionActive) {
      alert('Please start a session in the web app first (http://localhost:8000)');
      return;
    }

    // Phone numbers are already loaded from Supabase
    const momPhone = momPhoneInput.value.trim();
    const yourPhone = yourPhoneInput.value.trim();
    
    if (!momPhone && !yourPhone) {
      alert('Please set your phone numbers in the web app settings first');
      return;
    }

    await chrome.storage.local.set({
      currentTask: task,
      momPhoneNumber: momPhone,
      yourPhoneNumber: yourPhone,
      isMonitoring: true,
      startTime: Date.now()
    });

    taskInput.value = '';
    momPhoneInput.value = '';
    yourPhoneInput.value = '';
    await loadState();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'startMonitoring', task: task });
  });

  // Pause monitoring
  pauseTaskBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ isPaused: true });
    pauseTaskBtn.style.display = 'none';
    resumeTaskBtn.style.display = 'inline-block';
    chrome.runtime.sendMessage({ action: 'pauseMonitoring' });
    await loadState(); // Refresh UI
  });

  // Resume monitoring
  resumeTaskBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ isPaused: false });
    pauseTaskBtn.style.display = 'inline-block';
    resumeTaskBtn.style.display = 'none';
    chrome.runtime.sendMessage({ action: 'resumeMonitoring' });
    await loadState(); // Refresh UI
  });

  // Finish task (stop monitoring)
  stopTaskBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ 
      isMonitoring: false,
      isPaused: false,
      currentTask: '', // Clear the task
      strikes: 0,
      checks: 0,
      currentTabProductivity: 'Unknown',
      tabStartTime: null
    });
    
    // Clear the task input
    taskInput.value = '';
    
    await loadState();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'stopMonitoring' });
  });

  await loadState();
  
  // Listen for updates
  chrome.storage.onChanged.addListener(loadState);

  // Current Tab Info
  const currentTabUrl = document.getElementById('current-tab-url');
  const productivityBadge = document.getElementById('productivity-badge');
  const countdownDiv = document.getElementById('strike-countdown');

  // Function to get hostname from URL
  function getHostname(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  // Update current tab info
  async function updateCurrentTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentTabUrl.textContent = getHostname(tab.url);
        
        // Get productivity status and justification from background
        const { 
          currentTabProductivity, 
          adjustedTabStartTime,
          isPaused,
          productivityJustification 
        } = await chrome.storage.local.get([
          'currentTabProductivity',
          'adjustedTabStartTime',
          'isPaused',
          'productivityJustification'
        ]);
        
        // Update badge
        productivityBadge.textContent = currentTabProductivity || 'Checking...';
        productivityBadge.className = 'status-badge ' + (currentTabProductivity === 'Productive' ? 'productive' : currentTabProductivity === 'Unproductive' ? 'unproductive' : 'unknown');
        
        // Update justification message
        const justificationDiv = document.getElementById('productivity-justification');
        if (productivityJustification) {
          justificationDiv.textContent = productivityJustification;
          justificationDiv.style.display = 'block';
        } else {
          justificationDiv.textContent = '';
          justificationDiv.style.display = 'none';
        }
        
        // Update countdown - pause if monitoring is paused
        if (isPaused) {
          countdownDiv.textContent = 'Monitoring paused';
          countdownDiv.className = 'countdown';
        } else if (currentTabProductivity === 'Unproductive' && adjustedTabStartTime) {
          const elapsed = Math.floor((Date.now() - adjustedTabStartTime) / 1000);
          const remaining = Math.max(0, 30 - elapsed);
          
          if (remaining > 0) {
            countdownDiv.textContent = `Strike in: ${remaining}s`;
            countdownDiv.className = 'countdown active';
          } else {
            countdownDiv.textContent = 'Strike imminent!';
            countdownDiv.className = 'countdown active';
          }
        } else {
          countdownDiv.textContent = currentTabProductivity === 'Productive' ? 'Keep working! ✅' : '';
          countdownDiv.className = 'countdown';
        }
      }
    } catch (error) {
      console.error('Error updating tab info:', error);
    }
  }

  // Update tab info periodically
  updateCurrentTabInfo();
  setInterval(updateCurrentTabInfo, 1000);

  // Listen for tab changes
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.currentTabProductivity || changes.adjustedTabStartTime || changes.isPaused || changes.productivityJustification) {
      updateCurrentTabInfo();
    }
  });
  
// Camera feed and attention monitoring
const cameraSection = document.getElementById('camera-section');
const cameraFeed = document.getElementById('camera-feed');
const cameraPlaceholder = document.getElementById('camera-placeholder');
const attentionStatus = document.getElementById('attention-status');
const attentionText = document.getElementById('attention-text');
const sleepAlert = document.getElementById('sleep-alert');
const countdownTimer = document.getElementById('countdown-timer');
const imAwakeBtn = document.getElementById('im-awake-btn');
const absenceAlert = document.getElementById('absence-alert');
const absenceCountdownTimer = document.getElementById('absence-countdown-timer');
const imBackBtn = document.getElementById('im-back-btn');
  
  // Check if session is active and show camera section
  async function updateCameraSection() {
    // Check Supabase session status (same as login check)
    const isSessionActive = await checkSessionActive();
    
    console.log('📹 Camera section check - Session active:', isSessionActive);
    
    if (isSessionActive) {
      cameraSection.style.display = 'block';
      cameraFeed.src = 'http://localhost:8080/video_feed';
      cameraFeed.style.display = 'block';
      cameraPlaceholder.style.display = 'none';
      
      console.log('📹 Camera section shown');
      
      // Start updating attention status
      updateAttentionStatus();
    } else {
      cameraSection.style.display = 'none';
      console.log('📹 Camera section hidden');
    }
  }
  
// Update attention status from vision server
async function updateAttentionStatus() {
  try {
    const response = await fetch('http://localhost:8080/status');
    const data = await response.json();
    
    // Update status text
    attentionText.textContent = data.status;
    
    // Update status class based on status type
    attentionStatus.className = 'attention-status';
    if (data.statusType === 'focused') {
      attentionStatus.classList.add('status-focused');
      attentionStatus.innerHTML = '<span class="status-icon">✅</span><span id="attention-text">Focused - Great work!</span>';
    } else if (data.statusType === 'sleeping') {
      attentionStatus.classList.add('status-sleeping');
      if (data.countdown && data.countdown > 0) {
        attentionStatus.innerHTML = `<span class="status-icon">😴</span><span id="attention-text">Sleeping - ${data.consequence} in ${data.countdown}s</span>`;
      } else {
        attentionStatus.innerHTML = '<span class="status-icon">😴</span><span id="attention-text">Sleeping</span>';
      }
    } else if (data.statusType === 'looking_away') {
      attentionStatus.classList.add('status-default');
      if (data.countdown && data.countdown > 0) {
        attentionStatus.innerHTML = `<span class="status-icon">👀</span><span id="attention-text">Looking away - ${data.consequence} in ${data.countdown}s</span>`;
      } else {
        attentionStatus.innerHTML = '<span class="status-icon">👀</span><span id="attention-text">Looking away</span>';
      }
    } else if (data.statusType === 'not_present') {
      attentionStatus.classList.add('status-default');
      if (data.countdown && data.countdown > 0) {
        attentionStatus.innerHTML = `<span class="status-icon">👻</span><span id="attention-text">Not present - ${data.consequence} in ${data.countdown}s</span>`;
      } else {
        attentionStatus.innerHTML = '<span class="status-icon">👻</span><span id="attention-text">Not present</span>';
      }
    } else {
      attentionStatus.classList.add('status-default');
      attentionStatus.innerHTML = `<span class="status-icon">👁️</span><span id="attention-text">${data.status}</span>`;
    }
    
    // Hide the old popup alerts since we now have persistent status bar
    sleepAlert.style.display = 'none';
    absenceAlert.style.display = 'none';
    
  } catch (error) {
    console.error('Error updating attention status:', error);
    attentionStatus.className = 'attention-status status-default';
    attentionStatus.innerHTML = '<span class="status-icon">❓</span><span id="attention-text">Status unavailable</span>';
    sleepAlert.style.display = 'none';
    absenceAlert.style.display = 'none';
  }
}
  
  // Check camera section periodically
  updateCameraSection();
  setInterval(updateCameraSection, 2000);
  
// Update attention status every 500ms
setInterval(updateAttentionStatus, 500);

// Handle "I'm Awake!" button click
imAwakeBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('http://localhost:8080/cancel_alert', { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      sleepAlert.style.display = 'none';
      console.log('Sleep alert cancelled');
    }
  } catch (error) {
    console.error('Error cancelling sleep alert:', error);
  }
});

// Handle "I'm Back!" button click (for absence alert)
imBackBtn.addEventListener('click', async () => {
  try {
    const response = await fetch('http://localhost:8080/cancel_alert', { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      absenceAlert.style.display = 'none';
      console.log('Absence alert cancelled');
    }
  } catch (error) {
    console.error('Error cancelling absence alert:', error);
  }
});
});
