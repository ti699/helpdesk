export type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';
export type TicketType = 'TI' | 'Manutenção predial';
export type RiskLevel = 'normal' | 'warning' | 'critical' | 'resolved';

export interface ReportRankRow {
  label: string;
  count: number;
  percent: number;
}

export const unresolvedStatuses: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_resposta'];

export const statusLabels: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em atendimento',
  aguardando_resposta: 'Aguardando resposta',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

export const statusOptions = Object.keys(statusLabels) as TicketStatus[];

export const priorityLabels: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  média: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
  crítica: 'Crítica',
};

export const riskColors: Record<RiskLevel, string> = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
  resolved: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
};

export const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) return 'Sem dados';

  const totalMinutes = Math.max(1, Math.floor(durationMs / 60000));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (totalHours < 1) return `${totalMinutes}min`;
  if (days < 1) return `${totalHours}h`;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
};

export const getDurationMs = (start?: string | null, end?: string | null) => {
  if (!start) return null;

  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();

  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
    return null;
  }

  return endTime - startTime;
};

export const normalizePriority = (priority?: string | null) => (
  (priority || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
);

export const formatPriority = (priority?: string | null) => (
  priorityLabels[(priority || '').toLowerCase()] || priority || 'Não informada'
);

export const isValidDateInput = (value: string) => (
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
);

export const sanitizeReportText = (value: unknown, fallback = 'Não informado') => {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text || fallback;
};

export const truncateReportText = (value: unknown, max = 90, fallback = 'Não informado') => {
  const text = sanitizeReportText(value, fallback);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
};

export const countByGeneric = <T,>(
  items: T[],
  getKey: (item: T) => string | null | undefined,
  limit = 8,
): ReportRankRow[] => {
  const counts = new Map<string, number>();

  items.forEach((item) => {
    const key = sanitizeReportText(getKey(item));
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({
      label,
      count,
      percent: items.length ? Math.round((count / items.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

export const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};
