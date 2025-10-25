
// Import configuration from config.js
importScripts('config.js');

let monitoringInterval = null;
let lettaAgentId = LETTA_AGENT_ID;
let currentTabUrl = null;
let tabStartTime = null;
let pendingCheck = null;
let momCalled = false;
let lastStrikeTime = null;

// Initialize lastStrikeTime from storage on service worker start
chrome.storage.local.get(['lastStrikeTime']).then(({ lastStrikeTime: stored }) => {
  if (stored) {
    lastStrikeTime = stored;
    console.log('✅ Restored lastStrikeTime from storage:', new Date(lastStrikeTime).toLocaleTimeString());
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startMonitoring') {
    startMonitoring();
  } else if (message.action === 'stopMonitoring') {
    stopMonitoring();
  } else if (message.action === 'pauseMonitoring') {
    console.log('⏸️ Monitoring paused');
  } else if (message.action === 'resumeMonitoring') {
    console.log('▶️ Monitoring resumed');
  }
  // Recording functionality removed - screenshots are captured automatically during monitoring
  return true;
});

async function startMonitoring() {
  if (monitoringInterval) return;
  
  console.log('Starting task monitoring');
  
  // Reset strikes and checks to 0 when starting
  await chrome.storage.local.set({
    strikes: 0,
    checks: 0
  });
  
  // Reset tab tracking
  currentTabUrl = null;
  tabStartTime = null;
  momCalled = false;
  lastStrikeTime = null;
  
  // Reset away call flag
  await chrome.storage.local.set({ awayCallMade: false });
  
  // Use existing Letta agent
  console.log('Using Letta agent ID:', lettaAgentId);
  
  // Webcam detection disabled - only calling mom for 2 strikes
  // startWebcamDetection();
  
  // Check more frequently to update status quickly
  monitoringInterval = setInterval(async () => {
    console.log('📊 Periodic check triggered...');
    
    // Check if session is still active
    const isSessionActive = await checkSessionFromBackground();
    if (!isSessionActive) {
      console.log('❌ Session no longer active, stopping monitoring');
      await stopMonitoring();
      return;
    }
    
    await checkTask();
  }, 5000); // Check every 5 seconds instead of 30
  
  // Initial check
  console.log('🚀 Starting initial check...');
  await checkTask();
}

let webcamCheckInterval = null;
let awayCallTimeout = null;
let userPresentCount = 0;
let webcamTabId = null;

function startWebcamDetection() {
  console.log('📹 Starting webcam detection...');
  
  // Create a persistent tab for webcam monitoring
  createWebcamTab();
}

async function createWebcamTab() {
  try {
    console.log('📹 Creating webcam tab...');
    
    // Create a new tab for webcam monitoring
    const tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({
        url: chrome.runtime.getURL('webcam-monitor.html'),
        active: false // Hidden tab
      }, (tab) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(tab);
        }
      });
    });
    
    webcamTabId = tab.id;
    console.log('📹 Webcam tab created with ID:', webcamTabId);
    
    // Wait a bit for the tab to load and request camera permission
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Webcam checking disabled - only calling mom for 2 strikes
    // Start checking every minute
    // webcamCheckInterval = setInterval(async () => {
    //   console.log('⏰ Webcam check interval triggered...');
    //   await checkWebcamForUser();
    // }, 60000); // 1 minute
    
    // Initial check after setup
    // setTimeout(() => {
    //   console.log('🚀 Starting initial webcam check...');
    //   checkWebcamForUser();
    // }, 5000);
  } catch (error) {
    console.error('Error creating webcam tab:', error);
  }
}

async function checkWebcamForUser() {
  try {
    const { isMonitoring, yourPhoneNumber } = await chrome.storage.local.get(['isMonitoring', 'yourPhoneNumber']);
    
    if (!isMonitoring) return;
    
    if (!webcamTabId) {
      console.log('⚠️ Webcam tab not initialized yet');
      return;
    }
    
    console.log('📹 Checking webcam for user presence...');
    
    // Send message to webcam tab to capture and analyze frame
    const hasUser = await new Promise((resolve) => {
      chrome.tabs.sendMessage(webcamTabId, { action: 'checkFace' }, async (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to webcam tab:', chrome.runtime.lastError);
          resolve(false);
          return;
        }
        
        if (!response || !response.imageData) {
          console.log('❌ No image data from webcam tab');
          resolve(false);
          return;
        }
        
        console.log('📹 Received image data, analyzing with Claude...');
        
        // Analyze with Claude vision
        const hasUser = await analyzeWebcamWithClaude(response.imageData);
        resolve(hasUser);
      });
    });
    
    if (hasUser) {
      console.log('✅ User detected in front of computer');
      userPresentCount++;
      
      // Cancel any pending call
      if (awayCallTimeout) {
        console.log('✅ User is back, canceling away call');
        clearTimeout(awayCallTimeout);
        awayCallTimeout = null;
        await chrome.storage.local.set({ awayCallMade: false });
      }
    } else {
      console.log('⚠️ No user detected in front of computer');
      userPresentCount = 0;
      
      // Start timer for calling user if not already started
      if (!awayCallTimeout) {
        console.log('⏱️ Starting 30-second timer to call user...');
        
        awayCallTimeout = setTimeout(async () => {
          console.log('📞 User has been away for 30 seconds, calling them...');
          
          // Check if we've already called
          const { awayCallMade } = await chrome.storage.local.get(['awayCallMade']);
          
          if (!awayCallMade && yourPhoneNumber) {
            console.log('📞 Calling user because they are away from computer');
            await chrome.storage.local.set({ awayCallMade: true });
            await callUserAway();
          } else {
            console.log('📞 Already called or no phone number set');
          }
        }, 30000); // 30 seconds
      }
    }
  } catch (error) {
    console.error('Error checking webcam:', error);
  }
}

async function analyzeWebcamWithClaude(imageData) {
  try {
    const CLAUDE_API_KEY = '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';
    
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

async function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  
  // Reset tracking variables
  currentTabUrl = null;
  tabStartTime = null;
  
  // Clear any pending checks
  if (pendingCheck) {
    clearTimeout(pendingCheck);
    pendingCheck = null;
  }
  
  // Stop webcam detection
  if (webcamCheckInterval) {
    clearInterval(webcamCheckInterval);
    webcamCheckInterval = null;
  }
  
  // Clear away call timeout
  if (awayCallTimeout) {
    clearTimeout(awayCallTimeout);
    awayCallTimeout = null;
  }
  
  // Close the webcam tab
  if (webcamTabId) {
    console.log('📹 Closing webcam tab...');
    try {
      chrome.tabs.remove(webcamTabId).catch(() => {
        // Tab might already be closed
      });
      webcamTabId = null;
    } catch (error) {
      console.log('Could not close webcam tab:', error);
    }
  }
  
  // Reset stats in storage
  await chrome.storage.local.set({
    isMonitoring: false,
    strikes: 0,
    checks: 0,
    currentTabProductivity: 'Unknown',
    tabStartTime: null,
    awayCallMade: false
  });
  
  console.log('Stopped task monitoring and reset all stats');
}

async function checkTask() {
  try {
    const { currentTask, isMonitoring, isPaused } = await chrome.storage.local.get(['currentTask', 'isMonitoring', 'isPaused']);
    
    console.log('🔍 checkTask called. isMonitoring:', isMonitoring, 'isPaused:', isPaused, 'currentTask:', currentTask);
    
    if (!isMonitoring) {
      console.log('❌ Monitoring is OFF, skipping check');
      return;
    }
    
    // If paused, don't check but don't reset anything
    if (isPaused) {
      console.log('⏸️ Monitoring is PAUSED, skipping check');
      return;
    }
    
    if (!currentTask) {
      console.log('❌ No task set, skipping check');
      return;
    }
    
    console.log('✅ Checking task status for task:', currentTask);
    
    // Get current tab info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    // Check if tab has changed
    const tabChanged = currentTabUrl !== tab.url;
    
    if (tabChanged) {
      console.log('Tab changed, resetting timer');
      currentTabUrl = tab.url;
      tabStartTime = Date.now();
      lastStrikeTime = null; // Reset cooldown on tab change
      
      // Store tab info and clear lastStrikeTime
      await chrome.storage.local.set({
        tabStartTime: tabStartTime,
        currentTabProductivity: 'Checking...',
        lastStrikeTime: null
      });
      
      // Clear any pending check
      if (pendingCheck) {
        clearTimeout(pendingCheck);
        pendingCheck = null;
      }
      // Don't return - continue to check status
    }
    
    // Calculate time spent on current tab
    const timeOnTab = Date.now() - (tabStartTime || Date.now());
    
    // Always check productivity status immediately
    // Only delay the strike, not the status check
    if (timeOnTab < 30000) {
      console.log(`Only been on tab for ${Math.floor(timeOnTab/1000)}s, status will be checked but strike delayed...`);
      
      // Clear any existing pending check
      if (pendingCheck) {
        clearTimeout(pendingCheck);
      }
      
      // Schedule strike check for when we hit 30 seconds
      const timeRemaining = 30000 - timeOnTab;
      pendingCheck = setTimeout(() => {
        checkTask();
      }, timeRemaining);
    }
    
    // Continue to check status immediately (don't return early)
    
    const pageInfo = {
      title: tab.title,
      url: tab.url
    };
    
    console.log('Analyzing page:', pageInfo.url);
    
    // Try Letta agent first (most intelligent)
    let isOnTask = null;
    
    if (lettaAgentId) {
      console.log('🤖 Trying Letta agent:', lettaAgentId);
      isOnTask = await checkWithLetta(lettaAgentId, pageInfo);
      console.log('Letta result:', isOnTask);
    } else {
      console.log('⚠️ No Letta agent ID');
    }
    
    // If Letta not available or fails, try Claude
    if (isOnTask === null) {
      console.log('🔄 Letta check not available, trying Claude...');
      isOnTask = await checkWithClaude(currentTask, pageInfo);
      console.log('Claude result:', isOnTask);
    }
    
    // If Claude also fails, try Gemini as fallback
    if (isOnTask === null) {
      console.log('🔄 Claude check inconclusive, trying Gemini fallback...');
      const geminiCheck = await checkWithGemini(currentTask, pageInfo);
      if (geminiCheck !== null) {
        isOnTask = geminiCheck;
        console.log('Gemini result:', isOnTask);
      } else {
        // If all APIs fail, skip this check
        console.log('❌ All API checks failed, skipping this check');
        return;
      }
    }
    
    console.log('AI determined isOnTask:', isOnTask);
    
    // Always update status immediately
    await chrome.storage.local.set({ 
      currentTabProductivity: isOnTask ? 'Productive' : 'Unproductive'
    });
    
    // Calculate time spent on current tab (recalculate since we used it earlier)
    const timeOnTabNow = Date.now() - (tabStartTime || Date.now());
    
    // Check if 30 seconds have passed since last strike
    const timeSinceLastStrike = lastStrikeTime ? Date.now() - lastStrikeTime : Infinity;
    const canAddStrike = timeSinceLastStrike >= 30000;
    
    console.log('⏰ Cooldown check - Last strike:', lastStrikeTime ? new Date(lastStrikeTime).toLocaleTimeString() : 'never', 'Time since:', Math.floor(timeSinceLastStrike / 1000), 's', 'Can add:', canAddStrike);
    console.log('🔍 DEBUG shouldAddStrike calculation:');
    console.log('  - isOnTask:', isOnTask);
    console.log('  - !isOnTask:', !isOnTask);
    console.log('  - timeOnTabNow:', timeOnTabNow, 'ms (>= 30000?', timeOnTabNow >= 30000, ')');
    console.log('  - canAddStrike:', canAddStrike);
    
    // Only add strike if user has been on site for 30+ seconds AND it's been 30+ seconds since last strike
    const shouldAddStrike = !isOnTask && timeOnTabNow >= 30000 && canAddStrike;
    
    if (!isOnTask && timeOnTabNow >= 30000 && !canAddStrike) {
      console.log('⏸️ Cooldown active - skipping strike, must wait', Math.ceil((30000 - timeSinceLastStrike) / 1000), 'more seconds');
    }
    
    // If we should add a strike, update lastStrikeTime FIRST to prevent duplicates
    if (shouldAddStrike) {
      lastStrikeTime = Date.now();
      // Save to storage so it persists across service worker restarts
      await chrome.storage.local.set({ lastStrikeTime: lastStrikeTime });
      console.log('⏰ Last strike time updated (before adding strike), must wait 30 seconds for next strike');
    }
    
    // Update stats (isOnTask is now guaranteed to be a boolean)
    const { strikes, checks } = await chrome.storage.local.get(['strikes', 'checks']);
    const newChecks = (checks || 0) + 1;
    const newStrikes = (strikes || 0) + (shouldAddStrike ? 1 : 0);
    
    // Store productivity status and stats
    await chrome.storage.local.set({ 
      strikes: newStrikes,
      checks: newChecks
    });
    
    console.log('🔍 DEBUG: shouldAddStrike:', shouldAddStrike, 'newStrikes:', newStrikes);
    
    if (shouldAddStrike) {
      console.log('✅ Entering shouldAddStrike block');
      
      // Get hostname safely
      let hostname = 'this website';
      try {
        hostname = new URL(pageInfo.url).hostname;
      } catch (e) {
        hostname = pageInfo.url.substring(0, 50);
      }
      
      console.log('User is off task on:', hostname);
      
      // Log strike (no popup)
      console.log('⚠️ STRIKE ADDED! User is not on a productive website.');
      console.log(`User has been on ${hostname} for 30+ seconds. Total strikes: ${newStrikes}`);
      
      // Update Supabase total_strikes
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_strikes`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.log('Could not update Supabase strikes:', e);
      }
      
      console.log('✅ Strike logged successfully! Total strikes:', newStrikes);
      console.log('📊 Current newStrikes:', newStrikes, 'momCalled:', momCalled);
      
      // Call mom if we hit 3 strikes and haven't called yet
      console.log('📞 Checking if should call mom... newStrikes:', newStrikes, '>= 3?', newStrikes >= 3, 'momCalled:', momCalled, '!momCalled:', !momCalled);
      
      if (newStrikes >= 3 && !momCalled) {
        console.log('📞 3 strikes reached! Calling mom...');
        console.log('📞 momCalled status before call:', momCalled);
        momCalled = true; // Set this FIRST to prevent duplicate calls
        console.log('📞 Set momCalled to true, now calling...');
        
        // Reset display strikes to 0 but keep tracking in backend
        await chrome.storage.local.set({ strikes: 0 });
        
        await callMom(currentTask);
        console.log('📞 Call completed');
      } else {
        console.log('📞 Skipping call - newStrikes:', newStrikes, '>= 3?', newStrikes >= 3, 'momCalled:', momCalled);
      }
    } else {
      console.log('✅ User is on task!');
    }
    
  } catch (error) {
    console.error('Error checking task:', error);
  }
}

async function checkWithClaude(task, pageInfo, screenshotData = null) {
  try {
    // Capture screenshot if not provided
    if (!screenshotData) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          screenshotData = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
          console.log('📸 Screenshot captured for analysis');
        }
      } catch (e) {
        console.log('Could not capture screenshot:', e);
      }
    }
    
    // Build content array with text and optionally image
    const content = [
      {
        type: 'text',
        text: `You are a productivity monitor. The user said they are working on: "${task}"

Their current browser tab shows:
- Title: "${pageInfo.title}"
- URL: ${pageInfo.url}

Analyze the screenshot (if provided) to see what's actually on the screen. 

Determine if the user appears to be on task or off task based on:
1. The website content visible in the screenshot
2. The URL and title
3. Whether the content matches their STATED TASK

CRITICAL: The user is ONLY on task if what they're doing matches their stated task.

Key examples:
- Task "answer emails" or "send emails" or "reply to emails" + Gmail → ON_TASK
- Task "learn Java" and Khan Academy showing Java → ON_TASK
- Task "answer emails" but Khan Academy showing math → OFF_TASK
- Task "learn math" but Instagram → OFF_TASK

IMPORTANT: When the task involves emails/messages, being on Gmail/Outlook/Yahoo Mail is ON_TASK even if you can't see the exact content. The website context matters.

The content must DIRECTLY relate to their stated task. Be flexible with interpretation - if task says "emails" and they're on an email client, that's ON_TASK.

Respond with only "ON_TASK" or "OFF_TASK".`
      }
    ];
    
    // Add screenshot if available
    if (screenshotData) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: screenshotData.split(',')[1] // Remove data:image/png;base64, prefix
        }
      });
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: content
        }]
      })
    });
    
    const data = await response.json();
    
    // Handle Claude response safely
    if (!data || !data.content || !data.content[0]) {
      console.error('Claude API: Invalid response structure', data);
      return null;
    }
    
    const result = data.content[0].text.trim().toUpperCase();
    
    console.log('Claude response:', result);
    
    return result === 'ON_TASK';
    
  } catch (error) {
    console.error('Claude API error:', error);
    return null;
  }
}

async function checkWithGemini(task, pageInfo) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a productivity monitor. The user said they are working on: "${task}"

Their current browser tab shows:
- Title: "${pageInfo.title}"
- URL: ${pageInfo.url}

Determine if the user appears to be on task or off task based on their stated task.

CRITICAL: The user is ONLY on task if what they're doing matches their stated task.

Key examples:
- Task "answer emails" or "send emails" or "reply to emails" + Gmail → ON_TASK
- Task "learn Java" and Khan Academy showing Java → ON_TASK
- Task "answer emails" but Khan Academy showing math → OFF_TASK

IMPORTANT: When the task involves emails/messages, being on Gmail/Outlook/Yahoo Mail is ON_TASK even if you can't see the exact content. The website context matters.
- If they said "learn math" and they're on Instagram → OFF_TASK

The content must DIRECTLY relate to their stated task.

Respond with only "ON_TASK" or "OFF_TASK".`
          }]
        }]
      })
    });
    
    const data = await response.json();
    
    // Handle Gemini response safely
    if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content || !data.candidates[0].content.parts || !data.candidates[0].content.parts[0]) {
      console.error('Gemini API: Invalid response structure', data);
      return null;
    }
    
    const result = data.candidates[0].content.parts[0].text.trim().toUpperCase();
    
    console.log('Gemini response:', result);
    
    return result.includes('ON_TASK') ? true : (result.includes('OFF_TASK') ? false : null);
    
  } catch (error) {
    console.error('Gemini API error:', error);
    return null;
  }
}

async function initializeLettaAgent(task) {
  try {
    console.log('🚀 Initializing Letta agent with task:', task);
    console.log('Using API URL:', `https://api.letta.ai/v1/projects/${LETTA_PROJECT}/agents`);
    
    const requestBody = {
      model: 'openai/gpt-4o-mini',
      name: 'Productivity Monitor',
      memoryBlocks: [
        {
          label: 'user_task',
          description: 'The current task the user is working on.',
          limit: 1000,
          value: `User's Stated Task: ${task}\nTimestamp: ${new Date().toISOString()}`,
        },
        {
          label: 'productivity_rules',
          description: 'Core rule: User is ONLY on task if what they are doing matches their stated task.',
          limit: 2000,
          value: `CORE PRINCIPLE: The user is ONLY productive if what they're doing matches their stated task.

ON_TASK Examples:
- Said "answer emails" + on Gmail = PRODUCTIVE
- Said "learn Java" + on Java tutorial = PRODUCTIVE
- Said "write docs" + on Notion = PRODUCTIVE

OFF_TASK Examples:
- Said "answer emails" + on Khan Academy = UNPRODUCTIVE
- Said "learn math" + on Instagram = UNPRODUCTIVE
- Said "debug code" + on Netflix = UNPRODUCTIVE

Decision Rule: Does this website help the user complete their stated task? If YES → PRODUCTIVE, If NO → UNPRODUCTIVE`,
        },
        {
          label: 'site_examples',
          description: 'Examples of task-matching logic.',
          limit: 1500,
          value: `Task Matching Examples:

PRODUCTIVE Matches:
✓ "answer emails" → Gmail, Outlook, Yahoo Mail
✓ "learn programming" → Khan Academy programming, Codecademy, FreeCodeCamp
✓ "write report" → Google Docs, Notion, Microsoft Word
✓ "debug code" → GitHub, Stack Overflow, technical documentation
✓ "manage tasks" → Trello, Asana, Todoist

UNPRODUCTIVE Mismatches:
✗ "answer emails" → Khan Academy (even if educational)
✗ "write report" → Instagram (even if informative)
✗ "learn math" → TikTok (even if math videos)
✗ "debug code" → YouTube (unless actively watching tutorial)

General Rules:
- Social media (Instagram, TikTok, Twitter) = almost always UNPRODUCTIVE
- Entertainment (Netflix, Hulu) = always UNPRODUCTIVE
- Educational sites only productive if they MATCH the task topic`,
        },
        {
          label: 'decision_logic',
          description: 'Step-by-step decision process for determining productivity.',
          limit: 1000,
          value: `Decision Process (follow these steps):

1. Read the user's stated task
2. Look at the current website URL and title
3. Ask: "Does this website help the user complete their stated task?"
4. If YES → Respond with "PRODUCTIVE"
5. If NO → Respond with "UNPRODUCTIVE"

Be STRICT about task matching:
- Vague relevance does NOT count
- The website must be directly useful for the stated task
- Educational content only counts if it matches the task topic
- When in doubt, ask: "Would clicking this link help me do what I said I'd do?"`,
        }
      ]
    };
    
    console.log('Request body size:', JSON.stringify(requestBody).length, 'bytes');
    
    const response = await fetch(`https://api.letta.ai/v1/projects/${LETTA_PROJECT}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LETTA_API_KEY}`,
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Sent request, waiting for response...');
    
    // For debugging - log the raw response
    const responseClone = response.clone();
    const responseText = await responseClone.text();
    console.log('Raw response:', responseText.substring(0, 500));
    
    // Continue with original response
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read error response';
      }
      console.error('Letta API error response:', errorText);
      console.error('Response headers:', response.headers);
      throw new Error(`Letta API error: ${response.status} - ${errorText}`);
    }

    const agent = await response.json();
    console.log('✅ Letta agent created successfully! ID:', agent.id);
    return agent.id;
    
  } catch (error) {
    console.error('❌ Error initializing Letta agent:', error);
    console.error('Error details:', error.message, error.stack);
    
    // Check if it's a network error
    if (error.message.includes('Failed to fetch')) {
      console.error('🚨 Network error - possible causes:');
      console.error('  1. CORS issue - Letta API might not allow browser requests');
      console.error('  2. Network connectivity issue');
      console.error('  3. Incorrect API endpoint');
      console.error('  Solution: The extension will fallback to Claude/Gemini');
    }
    
    return null;
  }
}

// Keep the old function structure for the rest of the blocks
async function initializeLettaAgent_OLD(task) {
  const LETTA_API_KEY = 'sk-let-OTY4NzFmYjQtYTRkNi00ODEwLTg3ZTktMjA3YzIxYjkwODY2OjEyYTE4OTUyLTNmNGEtNDliNy1hM2IyLTFhM2I0ODNhYzU2NQ==';
  const LETTA_PROJECT = '0504569d-4b34-4dc1-92ad-deec931ff616';
  
  try {
    console.log('🚀 Initializing Letta agent with task:', task);
    
    const response = await fetch(`https://api.letta.ai/v1/projects/${LETTA_PROJECT}/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LETTA_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        name: 'Productivity Monitor',
        memoryBlocks: [
          {
            label: 'user_task',
            description: 'The current task the user is working on. This helps determine if websites are relevant to their goal.',
            limit: 1000,
            value: `Current Task: ${task}\nTimestamp: ${new Date().toISOString()}`,
          },
          {
            label: 'productivity_rules',
            description: 'General rules for determining if websites are productive or unproductive based on the user\'s task.',
            limit: 2000,
            value: `You are a productivity monitoring agent. Your job is to determine if a website is productive or unproductive based on the user's current task.

PRODUCTIVE categories (ALWAYS mark as productive):
- Khan Academy: ALL Khan Academy pages are ALWAYS productive
- Educational sites: wikipedia.org, developer.mozilla.org, stackoverflow.com, freecodecamp.org, coursera.org
- Development tools: github.com, gitlab.com, bitbucket.org
- Documentation: docs.microsoft.com, docs.python.org, nodejs.org/docs
- Productivity tools: notion.so, trello.com, asana.com, todoist.com
- Coding platforms: codepen.io, jsfiddle.net, codesandbox.io, repl.it
- Technical blogs: medium.com (technical articles), dev.to, hackernoon.com
- News/research related to task content
- LEARNING SITES: Any site with "learn", "course", "tutorial", "training" in the URL or title

UNPRODUCTIVE categories:
- Social media: twitter.com, facebook.com, instagram.com, tiktok.com, snapchat.com, reddit.com
- Entertainment: youtube.com (unless educational/tutorial), netflix.com, hulu.com
- Shopping: amazon.com, ebay.com, etsy.com
- Gaming: twitch.tv, discord.com/gaming

Respond with ONLY "PRODUCTIVE" or "UNPRODUCTIVE".`,
          },
          {
            label: 'site_examples',
            description: 'Specific examples of known productive and unproductive websites to help with classification.',
            limit: 1500,
            value: `EXAMPLES OF PRODUCTIVE SITES:
- khanacademy.org (ALL pages)
- wikipedia.org (ALL pages)  
- stackoverflow.com (ALL pages)
- github.com (ALL pages)
- freecodecamp.org
- coursera.org
- developer.mozilla.org
- docs.python.org
- docs.microsoft.com
- medium.com/tag/programming
- dev.to
- codecademy.com
- udemy.com
- edx.org
- code.org
- w3schools.com
- tutorialspoint.com
- geeksforgeeks.org
- repl.it
- codesandbox.io
- codepen.io
- jsfiddle.net

EXAMPLES OF UNPRODUCTIVE SITES:
- instagram.com (ALL pages - SOCIAL MEDIA)
- twitter.com (ALL pages - SOCIAL MEDIA)
- facebook.com (ALL pages - SOCIAL MEDIA)
- tiktok.com (ALL pages - SOCIAL MEDIA)
- snapchat.com (ALL pages - SOCIAL MEDIA)
- reddit.com/r/funny or /r/pics (entertainment)
- youtube.com/watch?v=... (non-educational videos)
- netflix.com (ALL pages - ENTERTAINMENT)
- hulu.com (ALL pages - ENTERTAINMENT)
- amazon.com (unless buying work supplies - SHOPPING)
- ebay.com (unless buying work supplies - SHOPPING)
- twitch.tv (ALL pages - GAMING/ENTERTAINMENT)
- discord.com (unless clearly work-related)
- 9gag.com (ALL pages - ENTERTAINMENT)
- buzzfeed.com (ALL pages - ENTERTAINMENT)
- imgur.com (ALL pages - ENTERTAINMENT)`,
          },
          {
            label: 'decision_logic',
            description: 'Step-by-step decision process for classifying websites as productive or unproductive.',
            limit: 1000,
            value: `DECISION LOGIC PROCESS:

1. Parse URL to get domain
2. Check if domain matches ANY productive example → PRODUCTIVE
3. Check if domain matches ANY unproductive example → UNPRODUCTIVE  
4. If domain contains educational keywords (learn, course, tutorial, training, docs) → PRODUCTIVE
5. If domain contains entertainment keywords (game, watch, stream, shop) AND not work-related → UNPRODUCTIVE
6. If completely ambiguous and could help user's task → PRODUCTIVE
7. If completely ambiguous and clearly distracting → UNPRODUCTIVE

SPECIAL RULES:
- Khan Academy is ALWAYS productive regardless of content
- Instagram/Twitter/Facebook are ALWAYS unproductive
- Wikipedia is ALWAYS productive
- Stack Overflow is ALWAYS productive
- GitHub is ALWAYS productive
- Netflix/YouTube (non-educational) is ALWAYS unproductive`,
          },
        ],
      }),
    });

    console.log('Letta API response status:', response.status);
    
    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Could not read error response';
      }
      console.error('Letta API error response:', errorText);
      console.error('Response headers:', response.headers);
      throw new Error(`Letta API error: ${response.status} - ${errorText}`);
    }

    const agent = await response.json();
    console.log('✅ Letta agent created successfully! ID:', agent.id);
    return agent.id;
    
  } catch (error) {
    console.error('❌ Error initializing Letta agent:', error);
    console.error('Error details:', error.message, error.stack);
    return null;
  }
}

async function checkWithLetta(agentId, pageInfo) {
  try {
    console.log('🤖 Letta check called for URL:', pageInfo.url);
    
    // Get current task
    const { currentTask } = await chrome.storage.local.get(['currentTask']);
    
    console.log('📤 Sending request to Letta agent:', agentId);
    const response = await fetch(`https://api.letta.ai/v1/projects/${LETTA_PROJECT}/agents/${agentId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LETTA_API_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze if this website matches my stated task:

MY STATED TASK: ${currentTask || 'Not specified'}
WEBSITE TITLE: ${pageInfo.title}
WEBSITE URL: ${pageInfo.url}

Decision Criteria: Does this website help me complete my stated task?

Use your memory blocks to determine if this website is PRODUCTIVE (matches my task) or UNPRODUCTIVE (does not match my task).

Respond with ONLY "PRODUCTIVE" or "UNPRODUCTIVE" - no other text.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Letta API error: ${response.status}`);
    }

    console.log('✅ Letta API response received');
    const data = await response.json();
    console.log('Letta full response:', JSON.stringify(data).substring(0, 500));
    
    const lastMessage = data.messages[data.messages.length - 1];
    const decision = lastMessage.content[0].text.trim().toUpperCase();
    
    console.log('🎯 Letta decision:', decision);
    
    return decision.includes('PRODUCTIVE');
    
  } catch (error) {
    console.error('❌ Error checking with Letta:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

// Recording functions removed - screenshots are captured automatically during monitoring

// Vapi function to call mom when user hits 2 strikes
async function callMom(currentTask) {
  try {
    
    const { momPhoneNumber } = await chrome.storage.local.get(['momPhoneNumber']);
    console.log('📞 Retrieved momPhoneNumber from storage:', momPhoneNumber);
    
    if (!momPhoneNumber) {
      console.log('❌ No mom phone number set, cannot call');
      return;
    }
    
    // Add country code if not present
    let phoneNumber = momPhoneNumber.trim();
    if (!phoneNumber.startsWith('+')) {
      // Assume US if no country code provided
      phoneNumber = '+1' + phoneNumber.replace(/[^0-9]/g, '');
    }
    
    console.log('📞 Calling mom at:', phoneNumber);
    console.log('📞 API endpoint: https://api.vapi.ai/call');
    
    const requestBody = {
      assistantId: VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber
      }
    };
    console.log('📞 Request body:', JSON.stringify(requestBody));
    
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('📞 Response status:', response.status);
    
    if (response.ok) {
      const responseData = await response.json();
      console.log('✅ Mom call initiated successfully:', responseData);
      
      // Update Supabase total_calls
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_calls`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (e) {
        console.log('Could not update Supabase calls:', e);
      }
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to call mom. Status:', response.status, 'Error:', errorText);
    }
  } catch (error) {
    console.error('❌ Error calling mom:', error);
    console.error('❌ Error stack:', error.stack);
  }
}

// Vapi function to call user when they are away from computer
async function callUserAway() {
  try {
    
    const { yourPhoneNumber } = await chrome.storage.local.get(['yourPhoneNumber']);
    console.log('📞 Retrieved yourPhoneNumber from storage:', yourPhoneNumber);
    
    if (!yourPhoneNumber) {
      console.log('❌ No your phone number set, cannot call');
      return;
    }
    
    // Add country code if not present
    let phoneNumber = yourPhoneNumber.trim();
    if (!phoneNumber.startsWith('+')) {
      // Assume US if no country code provided
      phoneNumber = '+1' + phoneNumber.replace(/[^0-9]/g, '');
    }
    
    console.log('📞 Calling user because they are away at:', phoneNumber);
    
    const requestBody = {
      assistantId: VAPI_AWAY_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneNumber
      }
    };
    console.log('📞 Request body:', JSON.stringify(requestBody));
    
    const response = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('📞 Response status:', response.status);
    
    if (response.ok) {
      const responseData = await response.json();
      console.log('✅ Away call initiated successfully:', responseData);
    } else {
      const errorText = await response.text();
      console.error('❌ Failed to call user. Status:', response.status, 'Error:', errorText);
    }
  } catch (error) {
    console.error('❌ Error calling user for being away:', error);
    console.error('❌ Error stack:', error.stack);
  }
}

// Check session status from background script
async function checkSessionFromBackground() {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_sessions?select=is_active`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return data.some(session => session.is_active === true);
    }
    
    return false;
  } catch (error) {
    console.error('Error checking session status:', error);
    return false;
  }
}

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('✅ Extension installed, initializing storage...');
  chrome.storage.local.set({
    strikes: 0,
    checks: 0,
    isMonitoring: false,
    isRecording: false,
    currentTabProductivity: 'Unknown'
  });
});

// Log when service worker starts
console.log('🚀 Background service worker loaded');
console.log('✅ background.js is running!');
console.log('Using Letta agent ID:', lettaAgentId);
console.log('Current time:', new Date().toLocaleTimeString());

// Check if monitoring is already active on startup
chrome.storage.local.get(['isMonitoring'], (result) => {
  if (result.isMonitoring) {
    console.log('📊 Monitoring was active, restarting...');
    startMonitoring();
  }
});
