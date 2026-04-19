import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ==========================================
// CRITICAL: PASTE YOUR SUPABASE KEYS HERE
// (Must match the keys you put in the admin panel)
// ==========================================

const SUPABASE_URL = 'https://nduulkoebkldqjzzpelq.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdXVsa29lYmtsZHFqenpwZWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMTA5NzUsImV4cCI6MjA5MTU4Njk3NX0.mxHVkDIF2ebZI43EpxxduySaXZdOlYe8Bb7Wf_OKPKQ';

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;
