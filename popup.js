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
      
      // Also check if session is active
      const isSessionActive = await checkSessionActive();
      console.log('📋 Session active:', isSessionActive);
      
      return hasPhoneNumbers && isSessionActive;
    } catch (error) {
      console.error('❌ Not logged in:', error);
      return false;
    }
  }
  
  // Check login and show appropriate UI
  const isLoggedIn = await checkLoginStatus();
  console.log('🔐 Login status:', isLoggedIn);
  
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
    console.log('❌ Not logged in - showing login prompt');
    loginPrompt.style.display = 'block';
    mainContainer.style.display = 'none';
  }
  
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
        
        // Get productivity status from background
        const { currentTabProductivity, tabStartTime } = await chrome.storage.local.get([
          'currentTabProductivity',
          'tabStartTime'
        ]);
        
        // Update badge
        productivityBadge.textContent = currentTabProductivity || 'Checking...';
        productivityBadge.className = 'status-badge ' + (currentTabProductivity === 'Productive' ? 'productive' : currentTabProductivity === 'Unproductive' ? 'unproductive' : 'unknown');
        
        // Update countdown
        if (currentTabProductivity === 'Unproductive' && tabStartTime) {
          const elapsed = Math.floor((Date.now() - tabStartTime) / 1000);
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
    if (changes.currentTabProductivity || changes.tabStartTime) {
      updateCurrentTabInfo();
    }
  });
});
