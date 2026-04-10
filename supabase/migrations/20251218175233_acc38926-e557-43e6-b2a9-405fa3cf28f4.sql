-- Add agente_manutencao to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'agente_manutencao';

-- Add new columns to tickets table
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'TI',
ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'Outros',
ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES auth.users(id);