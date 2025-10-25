// Supabase client configuration
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://wbknkpcbhefcqoinmxgn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_inLrkzoOcVB6lCuGp1KVPQ_my2bSETv';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
