-- Enable RLS on user_settings table
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policy to allow reading all user_settings (needed for extension)
CREATE POLICY "Allow read for all authenticated users"
ON user_settings
FOR SELECT
TO authenticated
USING (true);

-- Policy to allow reading user_settings with anon key (for extension)
-- This is less secure but needed for the extension to work
CREATE POLICY "Allow anon read"
ON user_settings
FOR SELECT
TO anon
USING (true);

-- Policy to allow users to update their own settings
CREATE POLICY "Users can update own settings"
ON user_settings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to insert their own settings
CREATE POLICY "Users can insert own settings"
ON user_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy to allow users to delete their own settings
CREATE POLICY "Users can delete own settings"
ON user_settings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
