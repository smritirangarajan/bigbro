// Web App - Dashboard
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;
let webcamStream = null;
let isSessionActive = false;

// Initialize
checkSession();

// Authentication
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session) {
    currentUser = session.user;
    document.getElementById('user-email').textContent = session.user.email;
    await loadDashboard();
    showMainApp();
  } else {
    showAuth();
  }
}

function showAuth() {
  document.getElementById('auth-section').style.display = 'flex';
  document.getElementById('main-section').style.display = 'none';
}

function showMainApp() {
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'block';
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
    console.error('Signup error:', error);
    showMessage(error.message, 'error');
  } else {
    console.log('Signup successful, user:', data.user);
    
    // Create initial user_settings record
    if (data.user) {
      console.log('Creating user_settings for user:', data.user.id);
      const { error: settingsError, data: settingsData } = await supabase
        .from('user_settings')
        .insert({
          user_id: data.user.id,
          mom_phone: null,
          your_phone: null,
          total_strikes: 0,
          total_calls: 0
        })
        .select();
      
      if (settingsError) {
        console.error('Error creating user_settings:', settingsError);
      } else {
        console.log('User settings created successfully:', settingsData);
      }
    }
    
    showMessage('Account created! Please log in.', 'success');
    setTimeout(() => {
      document.getElementById('signup-view').style.display = 'none';
      document.getElementById('login-view').style.display = 'block';
    }, 1500);
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
    document.getElementById('user-email').textContent = data.user.email;
    await loadDashboard();
    showMainApp();
  }
});

function showMessage(text, type) {
  const msg = document.getElementById('auth-message');
  msg.textContent = text;
  msg.className = `message active ${type}`;
  setTimeout(() => msg.className = 'message', 5000);
}

// Load dashboard stats
async function loadDashboard() {
  if (!currentUser) return;
  
  const { data } = await supabase
    .from('user_settings')
    .select('total_strikes, total_calls, mom_phone, your_phone')
    .eq('user_id', currentUser.id)
    .single();
  
  if (data) {
    document.getElementById('total-strikes').textContent = data.total_strikes || 0;
    document.getElementById('total-calls').textContent = data.total_calls || 0;
    
    // Load phone numbers into settings
    document.getElementById('mom-phone').value = data.mom_phone || '';
    document.getElementById('your-phone').value = data.your_phone || '';
  }
}

// Settings modal
document.getElementById('settings-btn')?.addEventListener('click', () => {
  document.getElementById('settings-modal').style.display = 'block';
});

document.querySelector('.close-modal')?.addEventListener('click', () => {
  document.getElementById('settings-modal').style.display = 'none';
});

document.getElementById('save-settings-btn')?.addEventListener('click', async () => {
  const momPhone = document.getElementById('mom-phone').value;
  const yourPhone = document.getElementById('your-phone').value;
  
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: currentUser.id,
      mom_phone: momPhone || null,
      your_phone: yourPhone || null
    }, {
      onConflict: 'user_id'
    });
  
  if (error) {
    alert('Error: ' + error.message);
  } else {
    alert('Settings saved!');
    document.getElementById('settings-modal').style.display = 'none';
    await loadDashboard();
  }
});

// Session control - just tracks session state, doesn't use webcam
// Function to check if vision server is running
async function checkVisionServer() {
  try {
    const response = await fetch('http://localhost:8080/status');
    return response.ok;
  } catch (error) {
    return false;
  }
}

document.getElementById('start-session-btn')?.addEventListener('click', async () => {
  // Show loading state
  const startBtn = document.getElementById('start-session-btn');
  const originalText = startBtn.textContent;
  startBtn.textContent = 'Starting...';
  startBtn.disabled = true;
  
  try {
    // Check if vision server is running
    const serverRunning = await checkVisionServer();
    if (!serverRunning) {
      throw new Error('Vision server is not running. Please start it first by running: cd vision && source venv/bin/activate && python ../vision_server.py');
    }
    
    // Session started - hide/show buttons
    startBtn.style.display = 'none';
    document.getElementById('stop-session-btn').style.display = 'inline-block';
    isSessionActive = true;
    
    // Store session state for extension
    localStorage.setItem('isSessionActive', 'true');
    
    // Start vision monitor
    try {
      await fetch('http://localhost:8080/start_session', { method: 'POST' });
    } catch (error) {
      console.error('Error starting vision monitor:', error);
    }
    
    // Update session status in Supabase
    const { error } = await supabase.rpc('update_session_status', { is_active_val: true });
    if (error) {
      console.error('Error updating session status:', error);
    }
    
    alert('Session started! The vision monitor is now active.');
  } catch (error) {
    console.error('Error starting session:', error);
    alert(`Failed to start session: ${error.message}`);
    
    // Reset button state
    startBtn.textContent = originalText;
    startBtn.disabled = false;
  }
});

document.getElementById('stop-session-btn')?.addEventListener('click', async () => {
  // Session stopped
  document.getElementById('start-session-btn').style.display = 'inline-block';
  document.getElementById('stop-session-btn').style.display = 'none';
  isSessionActive = false;
  
  // Remove session state
  localStorage.removeItem('isSessionActive');
  
  // Stop vision monitor
  try {
    await fetch('http://localhost:8080/stop_session', { method: 'POST' });
  } catch (error) {
    console.error('Error stopping vision monitor:', error);
  }
  
  // Update session status in Supabase
  const { error } = await supabase.rpc('update_session_status', { is_active_val: false });
  if (error) {
    console.error('Error updating session status:', error);
  }
  
  alert('Session stopped.');
});



// Logout
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  console.log('Logout button clicked');
  // Stop webcam if active
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  
  // Clear all Supabase auth sessions
  const { error } = await supabase.auth.signOut();
  
  if (error) {
    console.error('Logout error:', error);
  } else {
    console.log('Successfully logged out');
  }
  
  // Also clear local storage
  localStorage.clear();
  sessionStorage.clear();
  
  currentUser = null;
  showAuth();
  
  // Force reload to clear any cached state
  window.location.reload();
});

// Listen for auth changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN') {
    currentUser = session.user;
    document.getElementById('user-email').textContent = session.user.email;
    loadDashboard();
    showMainApp();
  } else if (event === 'SIGNED_OUT') {
    currentUser = null;
    showAuth();
  }
}); 