-- Function to increment strikes
CREATE OR REPLACE FUNCTION increment_strikes()
RETURNS void AS $$
BEGIN
  UPDATE user_settings
  SET total_strikes = COALESCE(total_strikes, 0) + 1
  WHERE user_id = (SELECT auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment calls
CREATE OR REPLACE FUNCTION increment_calls()
RETURNS void AS $$
BEGIN
  UPDATE user_settings
  SET total_calls = COALESCE(total_calls, 0) + 1
  WHERE user_id = (SELECT auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_strikes() TO authenticated;
GRANT EXECUTE ON FUNCTION increment_calls() TO authenticated;
