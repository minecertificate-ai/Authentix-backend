-- ============================================
-- COMPLETE DATABASE SCHEMA QUERIES
-- Run these in Supabase SQL Editor to get:
-- - All columns with exact data types
-- - All indexes
-- - All foreign keys
-- - All RLS policies
-- - All functions
-- ============================================

-- 1. Get all columns for all tables
SELECT 
  table_name,
  column_name,
  data_type,
  udt_name as postgres_type,
  is_nullable,
  column_default,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY table_name, ordinal_position;

-- 2. Get all indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY tablename, indexname;

-- 3. Get all foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name,
  rc.update_rule,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY tc.table_name, kcu.column_name;

-- 4. Get all RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY tablename, policyname;

-- 5. Get all functions
SELECT
  routine_schema,
  routine_name,
  routine_type,
  data_type as return_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 6. Get all primary keys
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY tc.table_name, kcu.ordinal_position;

-- 7. Get all unique constraints
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY tc.table_name, kcu.column_name;

-- 8. Get all check constraints
SELECT
  tc.table_name,
  cc.check_clause,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.check_constraints AS cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.constraint_type = 'CHECK'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'users', 'companies', 'certificate_templates', 'certificate_categories',
    'certificates', 'import_jobs', 'import_data_rows', 'billing_profiles',
    'invoices', 'invoice_line_items', 'verification_logs', 'razorpay_events'
  )
ORDER BY tc.table_name;
