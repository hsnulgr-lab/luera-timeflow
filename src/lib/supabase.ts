import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!envSupabaseUrl || !supabaseAnonKey) {
    console.error('⚠️ Missing Supabase credentials. Check .env file.');
    console.error('VITE_SUPABASE_URL:', envSupabaseUrl ? '✓' : '✗');
    console.error('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓' : '✗');
}

// In development, use Vite proxy to bypass CORS
// In production, use the actual Supabase URL
const supabaseUrl = import.meta.env.DEV
    ? `${window.location.origin}/api/supabase`
    : envSupabaseUrl;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
