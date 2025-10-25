// Supabase helper for Chrome Extension
// Note: SUPABASE_URL and SUPABASE_ANON_KEY should be defined in config.js
// which is loaded in popup.html before this script

// Get phone numbers from Supabase
async function getPhoneNumbersFromSupabase() {
  try {
    console.log('Fetching phone numbers from Supabase...');
    
    // Fetch all user settings (we can't filter by user_id without auth token)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/user_settings?select=mom_phone,your_phone,total_strikes,total_calls`, {
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
    console.log('Supabase data:', data);
    console.log('Number of users with settings:', data ? data.length : 0);
    
    if (data && data.length > 0) {
      // Check if ANY user has phone numbers set
      const hasPhoneNumbers = data.some(user => user.mom_phone || user.your_phone);
      console.log('Has phone numbers:', hasPhoneNumbers);
      
      if (hasPhoneNumbers) {
        // Return the first user's phone numbers
        return {
          momPhone: data[0].mom_phone || '',
          yourPhone: data[0].your_phone || ''
        };
      }
    }
    
    console.log('No phone numbers found in Supabase');
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