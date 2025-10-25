
// Import configuration - for Manifest V3, we'll use the constants directly
const CLAUDE_API_KEY = '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';
const GEMINI_API_KEY = 'AIzaSyAyL9mtisO5d6eFS0j260rsZaxfbYavWSE';
const LETTA_API_KEY = 'sk-let-OTY4NzFmYjQtYTRkNi00ODEwLTg3ZTktMjA3YzIxYjkwODY2OmEwN2MwZjFmLTczY2UtNGE3Zi05MDYyLTQ2YTRlMmVlZTZmMg==';
const LETTA_PROJECT = '0504569d-4b34-4dc1-92ad-deec931ff616';
const LETTA_AGENT_ID = 'agent-90ee73f6-e688-470d-977a-7f0e8f31c783';

let monitoringInterval = null;
let lettaAgentId = LETTA_AGENT_ID;
let recordingInterval = null;
let recordingStream = null;
let currentTabUrl = null;
let tabStartTime = null;
let pendingCheck = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startMonitoring') {
    startMonitoring();
  } else if (message.action === 'stopMonitoring') {
    stopMonitoring();
  } else if (message.action === 'startRecording') {
    startVisualRecording(message.streamId);
  } else if (message.action === 'stopRecording') {
    stopVisualRecording();
  }
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
  
  // Use existing Letta agent
  console.log('Using Letta agent ID:', lettaAgentId);
  
  // Check more frequently to update status quickly
  monitoringInterval = setInterval(async () => {
    console.log('📊 Periodic check triggered...');
    await checkTask();
  }, 5000); // Check every 5 seconds instead of 30
  
  // Initial check
  console.log('🚀 Starting initial check...');
  await checkTask();
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  console.log('Stopped task monitoring');
}

async function checkTask() {
  try {
    const { currentTask, isMonitoring } = await chrome.storage.local.get(['currentTask', 'isMonitoring']);
    
    console.log('🔍 checkTask called. isMonitoring:', isMonitoring, 'currentTask:', currentTask);
    
    if (!isMonitoring) {
      console.log('❌ Monitoring is OFF, skipping check');
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
      
      // Store tab info
      await chrome.storage.local.set({
        tabStartTime: tabStartTime,
        currentTabProductivity: 'Checking...'
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
    
    // Only add strike if user has been on site for 30+ seconds
    const shouldAddStrike = !isOnTask && timeOnTabNow >= 30000;
    
    // Update stats (isOnTask is now guaranteed to be a boolean)
    const { strikes, checks } = await chrome.storage.local.get(['strikes', 'checks']);
    const newChecks = (checks || 0) + 1;
    const newStrikes = (strikes || 0) + (shouldAddStrike ? 1 : 0);
    
    // Store productivity status and stats
    await chrome.storage.local.set({ 
      strikes: newStrikes,
      checks: newChecks
    });
    
    if (shouldAddStrike) {
      // Get hostname safely
      let hostname = 'this website';
      try {
        hostname = new URL(pageInfo.url).hostname;
      } catch (e) {
        hostname = pageInfo.url.substring(0, 50);
      }
      
      console.log('User is off task on:', hostname);
      
      // Show popup alert
      console.log('⚠️ STRIKE ADDED! You\'re not on a productive website.');
      console.log(`You've been on ${hostname} for 30+ seconds. Total strikes: ${newStrikes}`);
      
      // Try to show alert in active tab
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'showStrikeAlert',
            hostname: hostname,
            strikes: newStrikes
          }).catch(() => {
            // If content script not loaded, that's ok
            console.log('Content script not available for alert');
          });
        }
      } catch (error) {
        console.log('Could not show alert:', error);
      }
      
      console.log('✅ Strike logged successfully! Total strikes:', newStrikes);
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
- If they said "answer emails" but they're on Khan Academy doing math → OFF_TASK
- If they said "learn Java" and they're on Khan Academy learning Java → ON_TASK
- If they said "answer emails" and they're on Gmail → ON_TASK
- If they said "learn math" and they're on Instagram → OFF_TASK

The content must DIRECTLY relate to their stated task. Related educational content counts as on task ONLY if it matches the task topic.

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
- If they said "answer emails" but they're on Khan Academy doing math → OFF_TASK
- If they said "learn Java" and they're on Khan Academy learning Java → ON_TASK
- If they said "answer emails" and they're on Gmail → ON_TASK
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
  const LETTA_API_KEY = 'sk-let-OTY4NzFmYjQtYTRkNi00ODEwLTg3ZTktMjA3YzIxYjkwODY2OmEwN2MwZjFmLTczY2UtNGE3Zi05MDYyLTQ2YTRlMmVlZTZmMg==';
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

// Visual Recording Functions
async function startVisualRecording(streamId) {
  if (recordingInterval) return;
  
  console.log('Starting visual recording...');
  
  recordingInterval = setInterval(async () => {
    await analyzeCurrentScreen();
  }, 30000);
  
  await analyzeCurrentScreen();
}

function stopVisualRecording() {
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
  console.log('Stopped visual recording');
}

async function analyzeCurrentScreen() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    
    console.log('Screen captured for analysis');
    
  } catch (error) {
    console.error('Error analyzing screen:', error);
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
console.log('Using Letta agent ID:', lettaAgentId);

// Check if monitoring is already active on startup
chrome.storage.local.get(['isMonitoring'], (result) => {
  if (result.isMonitoring) {
    console.log('📊 Monitoring was active, restarting...');
    startMonitoring();
  }
});
