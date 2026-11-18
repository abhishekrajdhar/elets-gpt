-- Runs once when the database volume is first created.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Test database used by the backend test-suite.
SELECT 'CREATE DATABASE eletsgpt_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'eletsgpt_test')\gexec
