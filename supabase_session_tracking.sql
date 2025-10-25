-- Create a session tracking table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Enable RLS
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to read their own session status
CREATE POLICY "Users can read own session"
ON user_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy to allow anon users (extension) to read session status
CREATE POLICY "Anon can read session status"
ON user_sessions
FOR SELECT
TO anon
USING (true);

-- Policy to allow users to update their own session
CREATE POLICY "Users can update own session"
ON user_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to insert their own session
CREATE POLICY "Users can insert own session"
ON user_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to update is_active status
CREATE OR REPLACE FUNCTION update_session_status(is_active_val BOOLEAN)
RETURNS void AS $$
BEGIN
  INSERT INTO user_sessions (user_id, is_active, created_at, updated_at)
  VALUES ((SELECT auth.uid()), is_active_val, NOW(), NOW())
  ON CONFLICT (user_id) DO UPDATE SET 
    is_active = is_active_val,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_session_status(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION update_session_status(BOOLEAN) TO anon;
