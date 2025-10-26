-- Function to increment quiz stats in user_settings table
-- This function will be called whenever a user answers a quiz question

CREATE OR REPLACE FUNCTION increment_quiz_stats(
  user_id_param UUID,
  is_correct_param BOOLEAN
)
RETURNS VOID AS $$
BEGIN
  -- Update the user_settings table for the given user_id
  UPDATE user_settings
  SET 
    total_quiz_questions = COALESCE(total_quiz_questions, 0) + 1,
    correct_quiz_answers = COALESCE(correct_quiz_answers, 0) + CASE WHEN is_correct_param THEN 1 ELSE 0 END,
    quiz_accuracy = CASE 
      WHEN (COALESCE(total_quiz_questions, 0) + 1) = 0 THEN 0
      ELSE (COALESCE(correct_quiz_answers, 0) + CASE WHEN is_correct_param THEN 1 ELSE 0 END)::NUMERIC / (COALESCE(total_quiz_questions, 0) + 1)
    END,
    updated_at = NOW()
  WHERE user_id = user_id_param;
  
  -- If the update didn't affect any rows, the user doesn't exist yet
  -- This shouldn't happen in normal flow, but good to handle
  IF NOT FOUND THEN
    RAISE WARNING 'User with id % not found in user_settings', user_id_param;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_quiz_stats(UUID, BOOLEAN) TO authenticated;

-- Comment
COMMENT ON FUNCTION increment_quiz_stats(UUID, BOOLEAN) IS 'Increments the quiz statistics for a user when they answer a quiz question';
