document.addEventListener('DOMContentLoaded', async () => {
  const taskInput = document.getElementById('task-input');
  const setTaskBtn = document.getElementById('set-task-btn');
  const stopTaskBtn = document.getElementById('stop-task-btn');
  const currentTaskDisplay = document.getElementById('current-task');
  const strikeCount = document.getElementById('strike-count');
  const monitoringIndicator = document.getElementById('monitoring-indicator');
  const monitoringText = document.getElementById('monitoring-text');

  // Load current state
  async function loadState() {
    const result = await chrome.storage.local.get(['currentTask', 'isMonitoring', 'strikes', 'checks']);
    
    if (result.currentTask) {
      currentTaskDisplay.innerHTML = `<p class="task-text">${result.currentTask}</p>`;
    }
    
    if (result.isMonitoring) {
      monitoringIndicator.classList.add('active');
      monitoringText.textContent = 'Monitoring: ON';
    } else {
      monitoringIndicator.classList.remove('active');
      monitoringText.textContent = 'Monitoring: OFF';
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

    await chrome.storage.local.set({
      currentTask: task,
      isMonitoring: true,
      startTime: Date.now()
    });

    taskInput.value = '';
    await loadState();
    
    // Notify background script
    chrome.runtime.sendMessage({ action: 'startMonitoring', task: task });
  });

  // Stop monitoring
  stopTaskBtn.addEventListener('click', async () => {
    await chrome.storage.local.set({ 
      isMonitoring: false
      // Don't reset stats - just pause monitoring
    });
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
