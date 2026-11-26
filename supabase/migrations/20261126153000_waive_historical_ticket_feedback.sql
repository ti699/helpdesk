INSERT INTO public.feedbacks (
  ticket_id,
  avaliador_id,
  nota_satisfacao,
  eficacia_solucao,
  comentarios
)
SELECT
  t.id,
  t.solicitante_id,
  NULL,
  NULL,
  'Avaliação dispensada por migração para chamado encerrado até 2026-11-26.'
FROM public.tickets AS t
WHERE (
  (
    t.status = 'fechado'
    AND COALESCE(t.closed_at, t.updated_at, t.created_at)
      < TIMESTAMPTZ '2026-11-27 00:00:00-03'
  )
  OR t.protocolo IN (
    'TKT-788698',
    'TKT-803790',
    'TKT-185141',
    'TKT-719150',
    'TKT-339536',
    'TKT-740448',
    'TKT-223163'
  )
)
AND NOT EXISTS (
  SELECT 1
  FROM public.feedbacks AS f
  WHERE f.ticket_id = t.id
)
ON CONFLICT (ticket_id) DO NOTHING;
