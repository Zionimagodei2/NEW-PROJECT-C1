-- ==========================================================
-- SUPABASE SECURITY HARDENING: SHIPMENTS TABLE
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ==========================================================

-- 1. Enable Row Level Security
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

-- 2. Allow PUBLIC (Anonymous) to READ shipments
-- This allows customers to track their items.
CREATE POLICY "Allow public tracking access" 
ON public.shipments FOR SELECT 
USING (true);

-- 3. Restrict INSERT/UPDATE/DELETE (Admin Operations)
-- By default, this will block unauthorized edits.
-- To allow your Admin Portal to work, choose ONE of these options:

-- OPTION A: Secure (Recommended)
-- Only allow edits from the Supabase Dashboard or authenticated users.
-- Current Admin Portal (Static) will need Supabase Auth setup to use this.
-- CREATE POLICY "Deny all public writes" ON public.shipments FOR ALL USING (auth.role() = 'authenticated');

-- OPTION B: Simple (Current Setup Compatibility)
-- Allows the Admin Portal (using ANON key) to continue working.
-- WARNING: This is less secure as anyone with the ANON key can technically attempt writes.
CREATE POLICY "Allow anon writes for easy management" 
ON public.shipments FOR ALL 
USING (true)
WITH CHECK (true);

-- RECOMMENDATION: 
-- Use Option B for testing, then switch to Option A and set up 
-- "Supabase Auth" in your dashboard for real-world production security.
