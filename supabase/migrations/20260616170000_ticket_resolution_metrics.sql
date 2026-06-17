ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

UPDATE public.tickets
SET resolved_at = COALESCE(closed_at, updated_at, created_at)
WHERE status IN ('resolvido', 'fechado')
  AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_tipo_resolved_at
ON public.tickets (tipo, resolved_at)
WHERE resolved_at IS NOT NULL;
