// Supabase helper for Chrome Extension
// Note: SUPABASE_URL and SUPABASE_ANON_KEY should be defined in config.js
// which is loaded in popup.html before this script

// Get phone numbers from Supabase
async function getPhoneNumbersFromSupabase() {
  try {
    console.log('Fetching phone numbers from Supabase...');
    
    // Get user_id from the web app's meta tag
    const userId = await getUserIdFromContentScript();
    console.log('Current user ID:', userId);
    
    if (!userId) {
      console.error('No user ID found');
      return { momPhone: '', yourPhone: '' };
    }
    
    // Fetch user settings for the logged-in user
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?select=mom_phone,your_phone,total_strikes,total_calls&user_id=eq.${userId}`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Supabase response not ok:', response.status);
      return { momPhone: '', yourPhone: '' };
    }
    
    const data = await response.json();
    console.log('Supabase data for user:', data);
    
    if (data && data.length > 0) {
      // Return the logged-in user's phone numbers
      return {
        momPhone: data[0].mom_phone || '',
        yourPhone: data[0].your_phone || ''
      };
    }
    
    console.log('No phone numbers found in Supabase for user');
    return { momPhone: '', yourPhone: '' };
  } catch (error) {
    console.error('Error fetching phone numbers from Supabase:', error);
    return { momPhone: '', yourPhone: '' };
  }
}

// Update total strikes in Supabase using RPC function
async function incrementStrikes() {
  try {
    console.log('Incrementing strikes in Supabase...');
    
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_strikes`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Strikes incremented');
  } catch (error) {
    console.error('Error updating strikes:', error);
  }
}

// Update total calls in Supabase using RPC function
async function incrementCalls() {
  try {
    console.log('Incrementing calls in Supabase...');
    
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_calls`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Calls incremented');
  } catch (error) {
    console.error('Error updating calls:', error);
  }
}

// Check if session is active in Supabase
async function checkSessionActive() {
  try {
    console.log('Checking session status from Supabase...');
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_sessions?select=is_active`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Supabase response not ok:', response.status);
      return false;
    }
    
    const data = await response.json();
    console.log('Session data:', data);
    
    if (data && data.length > 0) {
      // Check if any user has an active session
      const hasActiveSession = data.some(session => session.is_active === true);
      console.log('Has active session:', hasActiveSession);
      return hasActiveSession;
    }
    
    console.log('No active sessions found');
    return false;
  } catch (error) {
    console.error('Error checking session status:', error);
    return false;
  }
} 

// Get user ID from active session in Supabase
async function getUserIdFromContentScript() {
  try {
    console.log('Extension - Fetching user ID from Supabase active session...');
    
    // Query Supabase for the user with an active session
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_sessions?select=user_id&is_active=eq.true&limit=1`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Extension - Supabase response not ok:', response.status);
      return null;
    }
    
    const data = await response.json();
    console.log('Extension - Active session data:', data);
    
    if (data && data.length > 0 && data[0].user_id) {
      const userId = data[0].user_id;
      console.log('Extension - Got user ID from active session:', userId);
      return userId;
    }
    
    console.log('Extension - No active session found');
    return null;
  } catch (error) {
    console.error('Extension - Error getting user ID from Supabase:', error);
    return null;
  }
} 