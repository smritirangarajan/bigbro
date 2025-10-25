# Productivity Monitor Web App

A web application for monitoring productivity with Supabase authentication and real-time monitoring.

## Setup Instructions

### 1. Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Get your project URL and anon key from Settings > API
3. Create a table in SQL Editor:

```sql
-- Create user_settings table
CREATE TABLE user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  mom_phone TEXT,
  your_phone TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for users to read/write their own settings
CREATE POLICY "Users can read their own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);
```

### 2. Update Configuration

Edit `config.js` and add your Supabase credentials:

```javascript
export const SUPABASE_URL = 'YOUR_SUPABASE_URL';
export const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
```

### 3. Install Dependencies

```bash
npm install @supabase/supabase-js
```

### 4. Run the App

Open `index.html` in a browser or use a local server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js
npx serve
```

Then visit `http://localhost:8000`

## Features

- ✅ User authentication (sign up / log in)
- ✅ Save phone numbers in database
- ✅ Task monitoring
- ✅ Webcam detection (coming soon)
- ✅ Strike system
- ✅ Floating overlay during monitoring
- ✅ Vapi integration for phone calls

## Next Steps

1. Add `styles.css` with the styling
2. Add `app.js` with the main application logic
3. Add `config.js` with Supabase configuration
4. Implement webcam monitoring
5. Add Vapi integration
