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
    showLanding();
  }
}

function showLanding() {
  document.getElementById('landing-page').style.display = 'flex';
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'none';
}

function showAuth() {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('auth-section').style.display = 'flex';
  document.getElementById('main-section').style.display = 'none';
}

function showMainApp() {
  document.getElementById('landing-page').style.display = 'none';
  document.getElementById('auth-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'block';
}

// Landing page navigation
document.getElementById('get-started-btn')?.addEventListener('click', () => {
  showAuth();
  // Show signup view by default
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('signup-view').style.display = 'block';
});

document.getElementById('get-started-btn-header')?.addEventListener('click', () => {
  showAuth();
  // Show signup view by default
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('signup-view').style.display = 'block';
});

document.getElementById('login-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  showAuth();
  // Show login view
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('signup-view').style.display = 'none';
});

document.getElementById('login-link-header')?.addEventListener('click', (e) => {
  e.preventDefault();
  showAuth();
  // Show login view
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('signup-view').style.display = 'none';
});

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
    .select('mom_phone, your_phone')
    .eq('user_id', currentUser.id)
    .single();
  
  if (data) {
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
    
    // Store user ID in a meta tag so extension can read it
    console.log('Web app - Setting user ID in meta tag. currentUser:', currentUser);
    console.log('Web app - currentUser.id:', currentUser?.id);
    
    if (!currentUser || !currentUser.id) {
      console.error('Web app - ERROR: currentUser or currentUser.id is null/undefined!');
      alert('Error: No user logged in. Please log in first.');
      return;
    }
    
    let userIdMeta = document.querySelector('meta[name="user-id"]');
    if (userIdMeta) {
      userIdMeta.content = currentUser.id;
      console.log('Web app - Updated existing meta tag with user ID:', userIdMeta.content);
    } else {
      userIdMeta = document.createElement('meta');
      userIdMeta.name = 'user-id';
      userIdMeta.content = currentUser.id;
      document.head.appendChild(userIdMeta);
      console.log('Web app - Created new meta tag with user ID:', userIdMeta.content);
    }
    
    // Double-check the meta tag was created
    const verifyMeta = document.querySelector('meta[name="user-id"]');
    console.log('Web app - Verification - Meta tag exists:', !!verifyMeta);
    console.log('Web app - Verification - Meta tag content:', verifyMeta?.content);
    
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
  const startBtn = document.getElementById('start-session-btn');
  
  // Session stopped
  startBtn.style.display = 'inline-block';
  document.getElementById('stop-session-btn').style.display = 'none';
  isSessionActive = false;
  
  // Reset button state in case it was stuck on "Starting..."
  startBtn.textContent = 'Start Session';
  startBtn.disabled = false;
  
  // Remove session state
  localStorage.removeItem('isSessionActive');
  
  // Remove user ID meta tag
  const userIdMeta = document.querySelector('meta[name="user-id"]');
  if (userIdMeta) {
    userIdMeta.remove();
  }
  
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
  showLanding();
  
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
    showLanding();
  }
}); 

// Check if quiz mode is in URL
if (window.location.search.includes('quiz')) {
  console.log('Quiz mode detected in URL');
  
  // Wait for page to load, then check chrome.storage
  window.addEventListener('load', async () => {
    // Access chrome.storage from web page using chrome.runtime
    if (chrome && chrome.runtime) {
      try {
        const extensionId = await getExtensionId();
        console.log('Extension ID:', extensionId);
        
        // Get quiz questions from extension storage
        const message = { action: 'getQuizQuestions' };
        
        chrome.runtime.sendMessage(extensionId, message, (response) => {
          if (response && response.questions) {
            console.log('Got quiz questions:', response.questions);
            displayQuiz(response.questions);
          } else {
            console.log('No quiz questions found');
          }
        });
      } catch (error) {
        console.error('Error getting quiz:', error);
      }
    }
  });
}

function getExtensionId() {
  return new Promise((resolve) => {
    // Try to find the extension ID
    chrome.management.getAll((extensions) => {
      const extension = extensions.find(ext => ext.name === 'BigBro');
      if (extension) {
        resolve(extension.id);
      } else {
        resolve(null);
      }
    });
  });
}

function displayQuiz(questions) {
  const quizSection = document.getElementById('quiz-section');
  const quizContent = document.getElementById('quiz-content');
  
  if (!quizSection || !quizContent) return;
  
  // Show quiz section
  quizSection.style.display = 'block';
  
  // Create quiz HTML
  let quizHTML = '<button id="start-quiz-btn" class="btn btn-primary">Start Quiz</button>';
  quizHTML += '<div id="quiz-questions"></div>';
  quizContent.innerHTML = quizHTML;
  
  document.getElementById('start-quiz-btn').addEventListener('click', () => {
    startQuiz(questions);
  });
}

let currentQuestionIndex = 0;

function startQuiz(questions) {
  document.getElementById('start-quiz-btn').style.display = 'none';
  showQuestion(questions, 0);
}

function showQuestion(questions, index) {
  if (index >= questions.length) {
    // Quiz complete
    document.getElementById('quiz-questions').innerHTML = '<h3>Quiz Complete!</h3>';
    return;
  }
  
  const question = questions[index];
  const questionDiv = document.createElement('div');
  questionDiv.className = 'question-card';
  
  let questionHTML = `<h3>Question ${index + 1}: ${question.question}</h3>`;
  
  if (question.type === 'multiple_choice') {
    question.options.forEach((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      questionHTML += `<button class="answer-btn" data-answer="${letter}">${letter}. ${opt}</button>`;
    });
  } else {
    questionHTML += '<button class="answer-btn" data-answer="true">True</button>';
    questionHTML += '<button class="answer-btn" data-answer="false">False</button>';
  }
  
  questionHTML += `<p id="timer-${index}">Time: 30s</p>`;
  
  questionDiv.innerHTML = questionHTML;
  document.getElementById('quiz-questions').appendChild(questionDiv);
  
  // Start timer
  let timeLeft = 30;
  const timerInterval = setInterval(() => {
    timeLeft--;
    const timerEl = document.getElementById(`timer-${index}`);
    if (timerEl) {
      timerEl.textContent = `Time: ${timeLeft}s`;
    }
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      // Time's up, show result
      showResult(questions, index, null);
      setTimeout(() => showQuestion(questions, index + 1), 2000);
    }
  }, 1000);
  
  // Add click handlers
  const answerBtns = questionDiv.querySelectorAll('.answer-btn');
  answerBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      clearInterval(timerInterval);
      const userAnswer = btn.dataset.answer;
      showResult(questions, index, userAnswer);
      
      // Move to next question after 2 seconds
      setTimeout(() => showQuestion(questions, index + 1), 2000);
    });
  });
}

function showResult(questions, index, userAnswer) {
  const question = questions[index];
  const isCorrect = userAnswer && userAnswer.toUpperCase() === question.correct.toUpperCase();
  
  const resultDiv = document.createElement('div');
  resultDiv.className = isCorrect ? 'result-correct' : 'result-incorrect';
  resultDiv.textContent = isCorrect ? '✅ CORRECT!' : `❌ INCORRECT. Correct answer: ${question.correct}`;
  
  const questionCard = document.querySelectorAll('.question-card')[index];
  questionCard.appendChild(resultDiv);
} 