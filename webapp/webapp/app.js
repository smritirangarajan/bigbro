// Main Application Script
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, CLAUDE_API_KEY, VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID, VAPI_AWAY_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID } from './config.js';

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let currentUser = null;
let isMonitoring = false;
let webcamStream = null;
let monitoringInterval = null;
let webcamCheckInterval = null;
let awayCallTimeout = null;
let currentTask = '';
let strikeCount = 0;
let momCalled = false;

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const overlay = document.getElementById('overlay');

// Initialize
checkSession();

// Authentication
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    await loadUserSettings();
    showMainApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  authSection.style.display = 'flex';
  mainSection.style.display = 'none';
}

function showMainApp() {
  authSection.style.display = 'none';
  mainSection.style.display = 'grid';
}

// Auth handlers
document.getElementById('switch-to-signup')?.addEventListener('click', () => {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('signup-view').style.display = 'block';
});

document.getElementById('switch-to-login')?.addEventListener('click', () => {
  document.getElementById('signup-view').style.display = 'none';
  document.getElementById('login-view').style.display = 'block';
});

document.getElementById('signup-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  
  if (!email || !password) {
    showMessage('Please fill in all fields', 'error');
    return;
  }
  
  const { data, error } = await supabase.auth.signUp({ email, password });
  
  if (error) {
    showMessage(error.message, 'error');
  } else {
    showMessage('Account created! Please log in.', 'success');
  }
});

document.getElementById('login-btn')?.addEventListener('click', async () => {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  if (!email || !password) {
    showMessage('Please fill in all fields', 'error');
    return;
  }
  
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  
  if (error) {
    showMessage(error.message, 'error');
  } else {
    currentUser = data.user;
    await loadUserSettings();
    showMainApp();
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentUser = null;
  if (isMonitoring) stopMonitoring();
  showAuth();
});

function showMessage(text, type) {
  const msg = document.getElementById('auth-message');
  msg.textContent = text;
  msg.className = `message active ${type}`;
  setTimeout(() => msg.className = 'message', 5000);
}

// Settings
async function loadUserSettings() {
  if (!currentUser) return;
  
  const { data } = await supabase
    .from('user_settings')
    .select('mom_phone, your_phone')
    .eq('user_id', currentUser.id)
    .single();
  
  if (data) {
    document.getElementById('mom-phone').value = data.mom_phone || '';
    document.getElementById('your-phone').value = data.your_phone || '';
  }
}

document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
  const momPhone = document.getElementById('mom-phone').value;
  const yourPhone = document.getElementById('your-phone').value;
  
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: currentUser.id,
      mom_phone: momPhone || null,
      your_phone: yourPhone || null
    });
  
  alert(error ? 'Error: ' + error.message : 'Settings saved!');
});

// Monitoring
document.getElementById('start-monitoring-btn')?.addEventListener('click', async () => {
  const task = document.getElementById('task-input').value.trim();
  if (!task) {
    alert('Please enter a task');
    return;
  }
  
  currentTask = task;
  await startMonitoring();
});

document.getElementById('stop-monitoring-btn')?.addEventListener('click', () => {
  stopMonitoring();
});

async function startMonitoring() {
  isMonitoring = true;
  
  // Show overlay
  overlay.style.display = 'block';
  document.getElementById('overlay-task').textContent = currentTask;
  document.getElementById('start-monitoring-btn').style.display = 'none';
  document.getElementById('stop-monitoring-btn').style.display = 'block';
  
  // Start webcam
  await initWebcam();
  
  // Start monitoring
  monitoringInterval = setInterval(checkProductivity, 5000);
  webcamCheckInterval = setInterval(checkWebcam, 60000);
  
  checkProductivity();
}

function stopMonitoring() {
  isMonitoring = false;
  overlay.style.display = 'none';
  document.getElementById('start-monitoring-btn').style.display = 'block';
  document.getElementById('stop-monitoring-btn').style.display = 'none';
  
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  
  if (monitoringInterval) clearInterval(monitoringInterval);
  if (webcamCheckInterval) clearInterval(webcamCheckInterval);
  if (awayCallTimeout) clearTimeout(awayCallTimeout);
}

async function initWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    document.getElementById('webcam-preview').srcObject = webcamStream;
  } catch (error) {
    console.error('Webcam error:', error);
  }
}

async function checkProductivity() {
  if (!isMonitoring) return;
  
  // Get current tab info (would need extension API)
  const status = Math.random() > 0.5 ? 'Productive' : 'Unproductive';
  const badge = document.getElementById('overlay-status');
  
  badge.textContent = status;
  badge.className = `badge ${status.toLowerCase()}`;
  
  // Update strikes if unproductive
  if (status === 'Unproductive') {
    strikeCount++;
    document.getElementById('overlay-strikes').textContent = strikeCount;
    document.getElementById('strike-count').textContent = strikeCount;
    
    // Call mom at 2 strikes
    if (strikeCount >= 2 && !momCalled) {
      momCalled = true;
      await callMom();
    }
  }
}

async function checkWebcam() {
  if (!isMonitoring || !webcamStream) return;
  
  // Capture frame and check for face
  const video = document.getElementById('webcam-preview');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);
  
  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  const hasFace = await detectFaceWithClaude(imageData);
  
  if (!hasFace) {
    if (!awayCallTimeout) {
      awayCallTimeout = setTimeout(async () => {
        await callUser();
      }, 30000);
    }
  } else {
    if (awayCallTimeout) clearTimeout(awayCallTimeout);
  }
}

async function detectFaceWithClaude(imageData) {
  try {
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
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            { type: 'text', text: 'Is there a clear human face visible? Respond only YES or NO.' }
          ]
        }]
      })
    });
    
    const data = await response.json();
    const answer = data.content[0].text.trim().toUpperCase();
    return answer.includes('YES');
  } catch (error) {
    console.error('Face detection error:', error);
    return true;
  }
}

async function callMom() {
  const momPhone = document.getElementById('mom-phone').value;
  if (!momPhone) return;
  
  // Call using Vapi
  // Implementation here
  console.log('Calling mom at', momPhone);
}

async function callUser() {
  const yourPhone = document.getElementById('your-phone').value;
  if (!yourPhone) return;
  
  // Call using Vapi
  console.log('Calling user at', yourPhone);
}

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    currentUser = session.user;
    loadUserSettings();
    showMainApp();
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    if (isMonitoring) stopMonitoring();
    showAuth();
  }
});
