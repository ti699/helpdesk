-- Adicionar apenas as foreign keys que estão faltando (usando IF NOT EXISTS via DO block)
DO $$ 
BEGIN
  -- FK para agente_id em tickets
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_agente_id_fkey') THEN
    ALTER TABLE public.tickets
      ADD CONSTRAINT tickets_agente_id_fkey 
      FOREIGN KEY (agente_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;

  -- FK para ticket_id em interactions
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_ticket_id_fkey') THEN
    ALTER TABLE public.interactions
      ADD CONSTRAINT interactions_ticket_id_fkey 
      FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;
  END IF;

  -- FK para autor_id em interactions
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'interactions_autor_id_fkey') THEN
    ALTER TABLE public.interactions
      ADD CONSTRAINT interactions_autor_id_fkey 
      FOREIGN KEY (autor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;