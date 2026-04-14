import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ==========================================
// CRITICAL: PASTE YOUR SUPABASE KEYS HERE
// ==========================================

// 1. Get your URL from Supabase Project Settings -> API -> Project URL
const SUPABASE_URL = 'https://nduulkoebkldqjzzpelq.supabase.co'; 

// 2. Get your ANON KEY from Supabase Project Settings -> API -> Project API Keys (anon public)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kdXVsa29lYmtsZHFqenpwZWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMTA5NzUsImV4cCI6MjA5MTU4Njk3NX0.mxHVkDIF2ebZI43EpxxduySaXZdOlYe8Bb7Wf_OKPKQ';

// ==========================================
// DO NOT EDIT BELOW THIS LINE
// ==========================================

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) 
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

if (!supabase) {
    console.warn("SUPABASE IS NOT CONFIGURED! Map saving and syncing will fail until you provide the API Keys in supabase-config.js");
}
