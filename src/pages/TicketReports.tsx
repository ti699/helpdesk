import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Download,
  FileText,
  Loader2,
  Star,
  Ticket,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AccountMenu } from '@/components/AccountMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { StatusMultiSelect } from '@/components/reports/StatusMultiSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';
type TicketType = 'TI' | 'Manutenção predial';
type RiskLevel = 'normal' | 'warning' | 'critical' | 'resolved';

interface ReportTicket {
  id: string;
  protocolo: string;
  titulo: string;
  status: TicketStatus | null;
  prioridade: string | null;
  setor: string | null;
  tipo: string | null;
  categoria: string | null;
  solicitante_id: string | null;
  agente_id: string | null;
  created_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  service_started_at: string | null;
  service_finished_at: string | null;
  solicitante_nome: string;
  solicitante_funcao: string;
  agente_nome: string;
  executor_names: string;
  executor_specialties: string;
  executor_ids: string[];
  executor_details: ServiceExecutorRow[];
  feedback_nota: number | null;
}

interface ProfileRow {
  id: string;
  nome: string | null;
  funcao: string | null;
}

interface FeedbackRow {
  ticket_id: string;
  nota_satisfacao: number | null;
}

interface ServiceExecutorRow {
  id: string;
  name: string;
  specialty: string;
  area: string | null;
}

interface ServiceSessionRow {
  id: string;
  ticket_id: string;
  started_at: string;
  finished_at: string | null;
}

interface ServiceSessionExecutorRow {
  session_id: string;
  executor_id: string;
}

interface ExecutorProductivityRow {
  id: string;
  name: string;
  specialty: string;
  area: string;
  totalTickets: number;
  completedTickets: number;
  inProgressTickets: number;
  avgExecutionMs: number | null;
  totalExecutionMs: number | null;
  avgWaitingMs: number | null;
  avgResolutionMs: number | null;
  slaPercent: number;
}

const unresolvedStatuses: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_resposta'];

const statusLabels: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em atendimento',
  aguardando_resposta: 'Aguardando resposta',
  resolvido: 'Resolvido',
  fechado: 'Fechado',
};

const priorityLabels: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  média: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
  crítica: 'Crítica',
};

const riskColors: Record<RiskLevel, string> = {
  normal: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
  critical: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300',
  resolved: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
};

const statusOptions = Object.keys(statusLabels) as TicketStatus[];

const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) return 'Sem dados';
  const totalMinutes = Math.max(1, Math.floor(durationMs / 60000));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (totalHours < 1) return `${totalMinutes}min`;
  if (days < 1) return `${totalHours}h`;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
};

const getDurationMs = (start?: string | null, end?: string | null) => {
  if (!start) return null;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return null;
  return endTime - startTime;
};

const normalizePriority = (priority?: string | null) => (
  (priority || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
);

const formatPriority = (priority?: string | null) => priorityLabels[(priority || '').toLowerCase()] || priority || 'Não informada';

const isValidDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

const sanitizeReportText = (value: unknown, fallback = 'Não informado') => {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text || fallback;
};

const truncateReportText = (value: unknown, max = 90, fallback = 'Não informado') => {
  const text = sanitizeReportText(value, fallback);
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
};

const getRiskInfo = (ticket: ReportTicket) => {
  if (ticket.status === 'resolvido' || ticket.status === 'fechado') {
    return {
      level: 'resolved' as RiskLevel,
      label: ticket.status === 'fechado' ? 'Fechado' : 'Resolvido',
      pdfColor: [100, 116, 139] as [number, number, number],
    };
  }

  const duration = getDurationMs(ticket.created_at) || 0;
  const hours = duration / 3600000;
  const warningAfter = ticket.tipo === 'Manutenção predial' ? 72 : 24;
  const criticalAfter = ticket.tipo === 'Manutenção predial' ? 96 : 48;

  if (hours >= criticalAfter) {
    return {
      level: 'critical' as RiskLevel,
      label: `Crítico há ${formatDuration(duration)}`,
      pdfColor: [220, 38, 38] as [number, number, number],
    };
  }

  if (hours >= warningAfter) {
    return {
      level: 'warning' as RiskLevel,
      label: `Atenção há ${formatDuration(duration)}`,
      pdfColor: [217, 119, 6] as [number, number, number],
    };
  }

  return {
    level: 'normal' as RiskLevel,
    label: `No prazo há ${formatDuration(duration)}`,
    pdfColor: [5, 150, 105] as [number, number, number],
  };
};

const getTicketTimeLabel = (ticket: ReportTicket) => {
  if (ticket.status === 'resolvido' || ticket.status === 'fechado') {
    return `Concluído em ${formatDuration(getDurationMs(ticket.created_at, ticket.service_finished_at || ticket.resolved_at || ticket.closed_at))}`;
  }

  return `Sem resolução há ${formatDuration(getDurationMs(ticket.created_at))}`;
};

const getDelayLabel = (ticket: ReportTicket, risk: ReturnType<typeof getRiskInfo>) => {
  if (ticket.status === 'fechado') return 'Fechado';
  if (ticket.status === 'resolvido') return 'Resolvido';
  if (risk.level === 'normal') return 'No prazo';
  return formatDuration(getDurationMs(ticket.created_at));
};

const averageResolution = (tickets: ReportTicket[], type: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === type && ticket.resolved_at)
    .map((ticket) => getDurationMs(ticket.created_at, ticket.resolved_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const averageExecution = (tickets: ReportTicket[], type: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === type && ticket.service_started_at && ticket.service_finished_at)
    .map((ticket) => getDurationMs(ticket.service_started_at, ticket.service_finished_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const averageWaiting = (tickets: ReportTicket[], type: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === type && ticket.service_started_at)
    .map((ticket) => getDurationMs(ticket.created_at, ticket.service_started_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const hoursToMs = (value: string) => {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric * 3600000 : null;
};

const countBy = (tickets: ReportTicket[], getKey: (ticket: ReportTicket) => string | null | undefined, limit = 8) => {
  const counts = new Map<string, number>();
  tickets.forEach((ticket) => {
    const key = getKey(ticket) || 'Não informado';
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count, percent: tickets.length ? Math.round((count / tickets.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
};

const chunk = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const getResolutionEndDate = (ticket: ReportTicket) => ticket.service_finished_at || ticket.resolved_at || ticket.closed_at;

const average = (durations: number[]) => (
  durations.length ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : null
);

const buildExecutorProductivity = (tickets: ReportTicket[]): ExecutorProductivityRow[] => {
  const rows = new Map<string, {
    id: string;
    name: string;
    specialty: string;
    area: string;
    totalTickets: number;
    completedTickets: number;
    inProgressTickets: number;
    slaOk: number;
    executionDurations: number[];
    waitingDurations: number[];
    resolutionDurations: number[];
  }>();

  tickets.forEach((ticket) => {
    if (!ticket.executor_details.length) return;

    ticket.executor_details.forEach((executor) => {
      const current = rows.get(executor.id) || {
        id: executor.id,
        name: executor.name,
        specialty: executor.specialty || 'Não informado',
        area: executor.area || 'Não informado',
        totalTickets: 0,
        completedTickets: 0,
        inProgressTickets: 0,
        slaOk: 0,
        executionDurations: [],
        waitingDurations: [],
        resolutionDurations: [],
      };

      current.totalTickets += 1;
      if (ticket.status === 'resolvido' || ticket.status === 'fechado') current.completedTickets += 1;
      if (ticket.status && unresolvedStatuses.includes(ticket.status)) current.inProgressTickets += 1;
      if (getRiskInfo(ticket).level !== 'warning' && getRiskInfo(ticket).level !== 'critical') current.slaOk += 1;

      const executionMs = getDurationMs(ticket.service_started_at, ticket.service_finished_at);
      const waitingMs = getDurationMs(ticket.created_at, ticket.service_started_at);
      const resolutionMs = getDurationMs(ticket.created_at, getResolutionEndDate(ticket));
      if (executionMs !== null && ticket.service_finished_at) current.executionDurations.push(executionMs);
      if (waitingMs !== null) current.waitingDurations.push(waitingMs);
      if (resolutionMs !== null) current.resolutionDurations.push(resolutionMs);

      rows.set(executor.id, current);
    });
  });

  return [...rows.values()]
    .map((row) => {
      const totalExecutionMs = row.executionDurations.length
        ? row.executionDurations.reduce((sum, duration) => sum + duration, 0)
        : null;

      return {
        id: row.id,
        name: row.name,
        specialty: row.specialty,
        area: row.area,
        totalTickets: row.totalTickets,
        completedTickets: row.completedTickets,
        inProgressTickets: row.inProgressTickets,
        avgExecutionMs: average(row.executionDurations),
        totalExecutionMs,
        avgWaitingMs: average(row.waitingDurations),
        avgResolutionMs: average(row.resolutionDurations),
        slaPercent: row.totalTickets ? Math.round((row.slaOk / row.totalTickets) * 100) : 0,
      };
    })
    .sort((a, b) => b.totalTickets - a.totalTickets || a.name.localeCompare(b.name));
};

function MetricCard({
  title,
  value,
  description,
  icon,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  description?: string;
  icon: ReactNode;
  tone?: 'default' | 'blue' | 'green' | 'warning' | 'danger' | 'muted';
}) {
  const tones = {
    default: 'border-l-slate-500',
    blue: 'border-l-blue-500',
    green: 'border-l-emerald-500',
    warning: 'border-l-amber-500',
    danger: 'border-l-red-500',
    muted: 'border-l-slate-400',
  };

  return (
    <Card className={`border-l-[3px] ${tones[tone]} shadow-sm`}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 px-3 pb-1.5 pt-3">
        <CardDescription className="truncate text-[11px] font-medium uppercase tracking-wide">{title}</CardDescription>
        <span className="text-muted-foreground [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        <div className="truncate text-xl font-bold leading-tight sm:text-2xl">{value}</div>
        {description && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
}

function RankingBlock({ title, rows }: { title: string; rows: Array<{ label: string; count: number; percent: number }> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? rows.map((row) => (
          <div key={row.label} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{row.label}</span>
              <span className="text-muted-foreground">{row.count}</span>
            </div>
            <Progress value={row.percent} className="h-2" />
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function TicketReports() {
  const { user, role, managementReportAccess, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ReportTicket[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const param = searchParams.get('periodoInicio');
    if (param) return param;
    const now = new Date();
    return format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [periodoFim, setPeriodoFim] = useState(() => searchParams.get('periodoFim') || format(new Date(), 'yyyy-MM-dd'));
  const [fechadoInicio, setFechadoInicio] = useState(() => searchParams.get('fechadoInicio') || '');
  const [fechadoFim, setFechadoFim] = useState(() => searchParams.get('fechadoFim') || '');
  const [servicoInicioDe, setServicoInicioDe] = useState(() => searchParams.get('servicoInicioDe') || '');
  const [servicoInicioAte, setServicoInicioAte] = useState(() => searchParams.get('servicoInicioAte') || '');
  const [servicoFimDe, setServicoFimDe] = useState(() => searchParams.get('servicoFimDe') || '');
  const [servicoFimAte, setServicoFimAte] = useState(() => searchParams.get('servicoFimAte') || '');
  const [executorFilter, setExecutorFilter] = useState(() => searchParams.get('executor') || 'all');
  const [executorFuncaoFilter, setExecutorFuncaoFilter] = useState(() => searchParams.get('executorFuncao') || 'all');
  const [tempoExecucaoMin, setTempoExecucaoMin] = useState(() => searchParams.get('tempoExecucaoMin') || '');
  const [tempoExecucaoMax, setTempoExecucaoMax] = useState(() => searchParams.get('tempoExecucaoMax') || '');
  const [tempoResolucaoMin, setTempoResolucaoMin] = useState(() => searchParams.get('tempoResolucaoMin') || '');
  const [tempoResolucaoMax, setTempoResolucaoMax] = useState(() => searchParams.get('tempoResolucaoMax') || '');
  const [tipoFilter, setTipoFilter] = useState(() => searchParams.get('tipo') || 'all');
  const [setorFilter, setSetorFilter] = useState(() => searchParams.get('setor') || 'all');
  const [executorOptions, setExecutorOptions] = useState<ServiceExecutorRow[]>([]);
  const [statusFilters, setStatusFilters] = useState<TicketStatus[]>(() => (
    (searchParams.get('status') || '')
      .split(',')
      .filter((status): status is TicketStatus => statusOptions.includes(status as TicketStatus))
  ));
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const hasReportAccess = role === 'admin' || managementReportAccess || role === 'agente_ti' || role === 'agente_manutencao';
  const canViewAllSystem = role === 'admin' || managementReportAccess;
  const forcedTeamType = role === 'agente_ti' && !canViewAllSystem
    ? 'TI'
    : role === 'agente_manutencao' && !canViewAllSystem
      ? 'Manutenção predial'
      : null;

  const periodValidation = useMemo(() => {
    if (!periodoInicio || !periodoFim) return { valid: false, message: 'Informe data inicial e final.' };
    if (!isValidDateInput(periodoInicio) || !isValidDateInput(periodoFim)) return { valid: false, message: 'Informe datas válidas.' };
    if (new Date(`${periodoInicio}T00:00:00`) > new Date(`${periodoFim}T00:00:00`)) {
      return { valid: false, message: 'A data inicial não pode ser maior que a data final.' };
    }
    if ((fechadoInicio && !isValidDateInput(fechadoInicio)) || (fechadoFim && !isValidDateInput(fechadoFim))) {
      return { valid: false, message: 'Informe datas de fechamento válidas.' };
    }
    if (fechadoInicio && fechadoFim && new Date(`${fechadoInicio}T00:00:00`) > new Date(`${fechadoFim}T00:00:00`)) {
      return { valid: false, message: 'A data inicial de fechamento não pode ser maior que a data final.' };
    }
    if ((servicoInicioDe && !isValidDateInput(servicoInicioDe)) || (servicoInicioAte && !isValidDateInput(servicoInicioAte))) {
      return { valid: false, message: 'Informe datas válidas para início do serviço.' };
    }
    if (servicoInicioDe && servicoInicioAte && new Date(`${servicoInicioDe}T00:00:00`) > new Date(`${servicoInicioAte}T00:00:00`)) {
      return { valid: false, message: 'A data inicial do serviço não pode ser maior que a final.' };
    }
    if ((servicoFimDe && !isValidDateInput(servicoFimDe)) || (servicoFimAte && !isValidDateInput(servicoFimAte))) {
      return { valid: false, message: 'Informe datas válidas para fim do serviço.' };
    }
    if (servicoFimDe && servicoFimAte && new Date(`${servicoFimDe}T00:00:00`) > new Date(`${servicoFimAte}T00:00:00`)) {
      return { valid: false, message: 'A data final inicial do serviço não pode ser maior que a data final.' };
    }
    const numericFilters = [
      ['tempo mínimo de execução', tempoExecucaoMin],
      ['tempo máximo de execução', tempoExecucaoMax],
      ['tempo mínimo de resolução', tempoResolucaoMin],
      ['tempo máximo de resolução', tempoResolucaoMax],
    ];
    const invalidNumeric = numericFilters.find(([, value]) => value && hoursToMs(value) === null);
    if (invalidNumeric) return { valid: false, message: `Informe um ${invalidNumeric[0]} válido.` };
    return { valid: true, message: '' };
  }, [
    periodoInicio,
    periodoFim,
    fechadoInicio,
    fechadoFim,
    servicoInicioDe,
    servicoInicioAte,
    servicoFimDe,
    servicoFimAte,
    tempoExecucaoMin,
    tempoExecucaoMax,
    tempoResolucaoMin,
    tempoResolucaoMax,
  ]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role && !hasReportAccess) {
      navigate(role === 'solicitante' ? '/' : '/dashboard');
    }
  }, [authLoading, role, hasReportAccess, navigate]);

  useEffect(() => {
    if (user && hasReportAccess) {
      fetchReportData();
    }
  }, [
    user,
    hasReportAccess,
    periodoInicio,
    periodoFim,
    fechadoInicio,
    fechadoFim,
    servicoInicioDe,
    servicoInicioAte,
    servicoFimDe,
    servicoFimAte,
    tipoFilter,
    setorFilter,
    statusFilters.join(','),
    executorFilter,
    executorFuncaoFilter,
    tempoExecucaoMin,
    tempoExecucaoMax,
    tempoResolucaoMin,
    tempoResolucaoMax,
  ]);

  const fetchAllTickets = async () => {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
      let query = supabase
        .from('tickets')
        .select('id, protocolo, titulo, status, prioridade, setor, tipo, categoria, solicitante_id, agente_id, created_at, resolved_at, closed_at, service_started_at, service_finished_at')
        .gte('created_at', periodoInicio)
        .lte('created_at', `${periodoFim}T23:59:59`)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (forcedTeamType) {
        query = query.eq('tipo', forcedTeamType);
      } else if (tipoFilter !== 'all') {
        query = query.eq('tipo', tipoFilter);
      }

      if (setorFilter !== 'all') {
        query = query.eq('setor', setorFilter);
      }

      if (statusFilters.length > 0) {
        query = query.in('status', statusFilters);
      }

      if (fechadoInicio) {
        query = query.gte('closed_at', fechadoInicio);
      }

      if (fechadoFim) {
        query = query.lte('closed_at', `${fechadoFim}T23:59:59`);
      }

      if (servicoInicioDe) {
        query = query.gte('service_started_at', servicoInicioDe);
      }

      if (servicoInicioAte) {
        query = query.lte('service_started_at', `${servicoInicioAte}T23:59:59`);
      }

      if (servicoFimDe) {
        query = query.gte('service_finished_at', servicoFimDe);
      }

      if (servicoFimAte) {
        query = query.lte('service_finished_at', `${servicoFimAte}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];
      allRows = [...allRows, ...rows];
      if (rows.length < pageSize) break;
      from += pageSize;
    }

    return allRows;
  };

  const fetchReportData = async () => {
    if (!periodValidation.valid) {
      setTickets([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const ticketRows = await fetchAllTickets();
      const ticketIds = ticketRows.map((ticket) => ticket.id);
      const profileIds = [...new Set(ticketRows.flatMap((ticket) => [ticket.solicitante_id, ticket.agente_id]).filter(Boolean))] as string[];

      let profiles: ProfileRow[] = [];
      let feedbacks: FeedbackRow[] = [];
      let serviceSessions: ServiceSessionRow[] = [];
      let sessionExecutorLinks: ServiceSessionExecutorRow[] = [];
      let linkedServiceExecutors: ServiceExecutorRow[] = [];
      let serviceExecutors: ServiceExecutorRow[] = [];

      for (const ids of chunk(profileIds, 500)) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nome, funcao')
          .in('id', ids);

        if (error) throw error;
        profiles = [...profiles, ...((data || []) as ProfileRow[])];
      }

      for (const ids of chunk(ticketIds, 500)) {
        const { data, error } = await supabase
          .from('feedbacks')
          .select('ticket_id, nota_satisfacao')
          .in('ticket_id', ids);

        if (error) throw error;
        feedbacks = [...feedbacks, ...((data || []) as FeedbackRow[])];
      }

      for (const ids of chunk(ticketIds, 500)) {
        const { data, error } = await supabase
          .from('ticket_service_sessions')
          .select('id, ticket_id, started_at, finished_at')
          .in('ticket_id', ids);

        if (error) throw error;
        serviceSessions = [...serviceSessions, ...((data || []) as ServiceSessionRow[])];
      }

      const sessionIds = serviceSessions.map((session) => session.id);
      for (const ids of chunk(sessionIds, 500)) {
        const { data, error } = await supabase
          .from('ticket_service_session_executors')
          .select('session_id, executor_id')
          .in('session_id', ids);

        if (error) throw error;
        sessionExecutorLinks = [...sessionExecutorLinks, ...((data || []) as ServiceSessionExecutorRow[])];
      }

      const executorIds = [...new Set(sessionExecutorLinks.map((link) => link.executor_id))];
      for (const ids of chunk(executorIds, 500)) {
        const { data, error } = await supabase
          .from('service_executors')
          .select('id, name, specialty, area')
          .in('id', ids);

        if (error) throw error;
        linkedServiceExecutors = [...linkedServiceExecutors, ...((data || []) as ServiceExecutorRow[])];
      }

      let executorOptionsQuery = supabase
        .from('service_executors')
        .select('id, name, specialty, area')
        .eq('active', true)
        .order('name', { ascending: true });

      if (forcedTeamType) {
        executorOptionsQuery = executorOptionsQuery.eq('area', forcedTeamType);
      } else if (tipoFilter !== 'all') {
        executorOptionsQuery = executorOptionsQuery.eq('area', tipoFilter);
      }

      const { data: allExecutorOptions, error: executorOptionsError } = await executorOptionsQuery;
      if (executorOptionsError) throw executorOptionsError;
      serviceExecutors = (allExecutorOptions || []) as ServiceExecutorRow[];
      setExecutorOptions(serviceExecutors);

      const profilesById = new Map(profiles.map((profile) => [
        profile.id,
        {
          nome: profile.nome || 'Não informado',
          funcao: profile.funcao || 'Não informado',
        },
      ]));
      const feedbackByTicketId = new Map(feedbacks.map((feedback) => [feedback.ticket_id, feedback.nota_satisfacao || null]));
      const executorsById = new Map([...linkedServiceExecutors, ...serviceExecutors].map((executor) => [executor.id, executor]));
      const sessionIdsByTicketId = new Map<string, string[]>();
      serviceSessions.forEach((session) => {
        const current = sessionIdsByTicketId.get(session.ticket_id) || [];
        sessionIdsByTicketId.set(session.ticket_id, [...current, session.id]);
      });
      const executorIdsBySessionId = new Map<string, string[]>();
      sessionExecutorLinks.forEach((link) => {
        const current = executorIdsBySessionId.get(link.session_id) || [];
        executorIdsBySessionId.set(link.session_id, [...current, link.executor_id]);
      });

      const enrichedTickets = ticketRows.map((ticket) => {
        const profile = ticket.solicitante_id ? profilesById.get(ticket.solicitante_id) : null;
        const ticketExecutorIds = [...new Set((sessionIdsByTicketId.get(ticket.id) || []).flatMap((sessionId) => executorIdsBySessionId.get(sessionId) || []))];
        const ticketExecutors = ticketExecutorIds
          .map((executorId) => executorsById.get(executorId))
          .filter(Boolean) as ServiceExecutorRow[];

        return {
          ...ticket,
          solicitante_nome: profile?.nome || 'Não informado',
          solicitante_funcao: profile?.funcao || 'Não informado',
          agente_nome: ticket.agente_id ? profilesById.get(ticket.agente_id)?.nome || 'Não informado' : 'Não atribuído',
          executor_names: ticketExecutors.map((executor) => executor.name).join(', ') || 'Não informado',
          executor_specialties: [...new Set(ticketExecutors.map((executor) => executor.specialty))].join(', ') || 'Não informado',
          executor_ids: ticketExecutorIds,
          executor_details: ticketExecutors,
          feedback_nota: feedbackByTicketId.get(ticket.id) || null,
        };
      }) as ReportTicket[];

      const executionMinMs = hoursToMs(tempoExecucaoMin);
      const executionMaxMs = hoursToMs(tempoExecucaoMax);
      const resolutionMinMs = hoursToMs(tempoResolucaoMin);
      const resolutionMaxMs = hoursToMs(tempoResolucaoMax);

      const filteredTickets = enrichedTickets.filter((ticket) => {
        if (executorFilter !== 'all' && !ticket.executor_ids.includes(executorFilter)) return false;
        if (executorFuncaoFilter !== 'all' && ticket.executor_specialties !== executorFuncaoFilter && !ticket.executor_specialties.split(', ').includes(executorFuncaoFilter)) return false;

        const executionMs = getDurationMs(ticket.service_started_at, ticket.service_finished_at);
        if (executionMinMs !== null && (executionMs === null || executionMs < executionMinMs)) return false;
        if (executionMaxMs !== null && (executionMs === null || executionMs > executionMaxMs)) return false;

        const resolutionMs = getDurationMs(ticket.created_at, ticket.service_finished_at || ticket.resolved_at || ticket.closed_at);
        if (resolutionMinMs !== null && (resolutionMs === null || resolutionMs < resolutionMinMs)) return false;
        if (resolutionMaxMs !== null && (resolutionMs === null || resolutionMs > resolutionMaxMs)) return false;

        return true;
      });

      setTickets(filteredTickets);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Erro ao gerar relatório de tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = tickets.length;
    const unresolved = tickets.filter((ticket) => ticket.status && unresolvedStatuses.includes(ticket.status));
    const riskItems = tickets.map((ticket) => ({ ticket, risk: getRiskInfo(ticket), durationMs: getDurationMs(ticket.created_at) || 0 }));
    const delayed = riskItems.filter((item) => item.risk.level === 'warning' || item.risk.level === 'critical');
    const critical = riskItems.filter((item) => item.risk.level === 'critical');
    const highPriorityOpen = tickets.filter((ticket) => {
      const priority = normalizePriority(ticket.prioridade);
      return ticket.status && unresolvedStatuses.includes(ticket.status) && (priority === 'alta' || priority === 'critica');
    });
    const ratings = tickets.map((ticket) => ticket.feedback_nota || 0).filter(Boolean);
    const satisfaction = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
    const productivityRows = buildExecutorProductivity(tickets);
    const completedServices = tickets.filter((ticket) => ticket.service_started_at && ticket.service_finished_at).length;

    return {
      total,
      abertos: tickets.filter((ticket) => ticket.status === 'aberto').length,
      emAtendimento: tickets.filter((ticket) => ticket.status === 'em_andamento').length,
      aguardando: tickets.filter((ticket) => ticket.status === 'aguardando_resposta').length,
      resolvidosFechados: tickets.filter((ticket) => ticket.status === 'resolvido' || ticket.status === 'fechado').length,
      unresolved: unresolved.length,
      delayed: delayed.length,
      critical: critical.length,
      highPriorityOpen: highPriorityOpen.length,
      satisfaction: Math.round(satisfaction * 10) / 10,
      mediaTi: averageResolution(tickets, 'TI'),
      mediaManutencao: averageResolution(tickets, 'Manutenção predial'),
      execucaoTi: averageExecution(tickets, 'TI'),
      execucaoManutencao: averageExecution(tickets, 'Manutenção predial'),
      esperaTi: averageWaiting(tickets, 'TI'),
      esperaManutencao: averageWaiting(tickets, 'Manutenção predial'),
      insideSlaPercent: total ? Math.round(((total - delayed.length) / total) * 100) : 0,
      statusRows: countBy(tickets, (ticket) => ticket.status ? statusLabels[ticket.status] : 'Não informado', 10),
      priorityRows: countBy(tickets, (ticket) => formatPriority(ticket.prioridade), 10),
      areaRows: countBy(tickets, (ticket) => ticket.tipo, 10),
      categoryRows: countBy(tickets, (ticket) => ticket.categoria),
      sectorRows: countBy(tickets, (ticket) => ticket.setor),
      requesterRows: countBy(tickets, (ticket) => ticket.solicitante_nome),
      executorRows: productivityRows.slice(0, 10).map((row) => ({
        label: row.name,
        count: row.totalTickets,
        percent: tickets.length ? Math.round((row.totalTickets / tickets.length) * 100) : 0,
      })),
      productivityRows,
      completedServices,
      oldestUnresolved: riskItems
        .filter((item) => item.ticket.status && unresolvedStatuses.includes(item.ticket.status))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 8),
    };
  }, [tickets]);

  const executorSpecialtyOptions = useMemo(
    () => [...new Set(executorOptions.map((executor) => executor.specialty).filter(Boolean))].sort(),
    [executorOptions],
  );

  const clearFilters = () => {
    const now = new Date();
    setPeriodoInicio(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'));
    setPeriodoFim(format(now, 'yyyy-MM-dd'));
    setFechadoInicio('');
    setFechadoFim('');
    setServicoInicioDe('');
    setServicoInicioAte('');
    setServicoFimDe('');
    setServicoFimAte('');
    setTipoFilter('all');
    setSetorFilter('all');
    setExecutorFilter('all');
    setExecutorFuncaoFilter('all');
    setTempoExecucaoMin('');
    setTempoExecucaoMax('');
    setTempoResolucaoMin('');
    setTempoResolucaoMax('');
    setStatusFilters([]);
  };

  const exportPDF = () => {
    if (!periodValidation.valid) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const areaLabel = forcedTeamType || (tipoFilter === 'all' ? 'Todo o sistema' : tipoFilter);
    const statusLabel = statusFilters.length ? statusFilters.map((status) => statusLabels[status]).join(', ') : 'Todos';

    doc.setFillColor(196, 24, 31);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Relatório Operacional de Tickets', marginX, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em ${generatedAt} | Área: ${areaLabel} | Status: ${statusLabel}`, marginX, 22);

    doc.setTextColor(17, 24, 39);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const fechamentoLabel = fechadoInicio || fechadoFim
      ? `Fechamento: ${fechadoInicio ? format(new Date(`${fechadoInicio}T00:00:00`), 'dd/MM/yyyy') : 'início'} até ${fechadoFim ? format(new Date(`${fechadoFim}T00:00:00`), 'dd/MM/yyyy') : 'hoje'}`
      : 'Fechamento: não filtrado';
    doc.text(`Período: ${format(new Date(`${periodoInicio}T00:00:00`), 'dd/MM/yyyy')} até ${format(new Date(`${periodoFim}T00:00:00`), 'dd/MM/yyyy')}`, marginX, 38);
    doc.text(fechamentoLabel, marginX, 44);
    doc.text(`Setor: ${setorFilter === 'all' ? 'Todos' : setorFilter} | Total considerado: ${stats.total}`, marginX, 50);

    const summary = [
      ['Total', stats.total, [31, 41, 55]],
      ['Abertos', stats.abertos, [249, 115, 22]],
      ['Em atendimento', stats.emAtendimento, [37, 99, 235]],
      ['Aguardando', stats.aguardando, [217, 119, 6]],
      ['Resolvidos/fechados', stats.resolvidosFechados, [22, 163, 74]],
      ['Atrasados', stats.delayed, [220, 38, 38]],
    ] as Array<[string, string | number, [number, number, number]]>;

    const cardWidth = (pageWidth - marginX * 2 - 10) / 6;
    summary.forEach(([label, value, color], index) => {
      const x = marginX + index * (cardWidth + 2);
      const y = 60;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, cardWidth, 24, 2, 2, 'FD');
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x, y, cardWidth, 3, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8);
      doc.text(label, x + 3, y + 10, { maxWidth: cardWidth - 6 });
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value), x + 3, y + 20);
      doc.setFont('helvetica', 'normal');
    });

    autoTable(doc, {
      startY: 94,
      head: [['Indicador complementar', 'Valor']],
      body: [
        ['Alta/Crítica abertas', stats.highPriorityOpen],
        ['Críticos por SLA', stats.critical],
        ['Dentro do SLA', `${stats.insideSlaPercent}%`],
        ['Satisfação média', `${stats.satisfaction || 0}/5`],
        ['Resolução média TI', formatDuration(stats.mediaTi)],
        ['Resolução média Manutenção', formatDuration(stats.mediaManutencao)],
        ['Execução média TI', formatDuration(stats.execucaoTi)],
        ['Execução média Manutenção', formatDuration(stats.execucaoManutencao)],
        ['Espera média TI', formatDuration(stats.esperaTi)],
        ['Espera média Manutenção', formatDuration(stats.esperaManutencao)],
      ],
      tableWidth: 82,
      margin: { left: marginX },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    autoTable(doc, {
      startY: 94,
      head: [['Status', 'Qtd.', '%']],
      body: stats.statusRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 60,
      margin: { left: marginX + 90 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    autoTable(doc, {
      startY: 94,
      head: [['Prioridade', 'Qtd.', '%']],
      body: stats.priorityRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 60,
      margin: { left: marginX + 156 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38] },
    });

    autoTable(doc, {
      startY: 94,
      head: [['Área', 'Qtd.', '%']],
      body: stats.areaRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 58,
      margin: { left: marginX + 222 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [22, 163, 74] },
    });

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.text('Sinalizações e rankings', marginX, 18);

    autoTable(doc, {
      startY: 26,
      head: [['Protocolo', 'Título', 'Área', 'Prioridade', 'Sinalização']],
      body: stats.oldestUnresolved.length
        ? stats.oldestUnresolved.map(({ ticket, risk }) => [
            ticket.protocolo,
            ticket.titulo,
            ticket.tipo || 'Não informado',
            formatPriority(ticket.prioridade),
            risk.label,
          ])
        : [['-', 'Nenhum ticket sem resolução no filtro atual', '-', '-', '-']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { cellWidth: 80 }, 4: { cellWidth: 55 } },
    });

    const afterIssuesY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 84;
    autoTable(doc, {
      startY: afterIssuesY + 8,
      head: [['Categoria', 'Qtd.', '%']],
      body: stats.categoryRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 82,
      margin: { left: marginX },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85] },
    });

    autoTable(doc, {
      startY: afterIssuesY + 8,
      head: [['Setor', 'Qtd.', '%']],
      body: stats.sectorRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 82,
      margin: { left: marginX + 92 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85] },
    });

    autoTable(doc, {
      startY: afterIssuesY + 8,
      head: [['Solicitante', 'Qtd.', '%']],
      body: stats.requesterRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 82,
      margin: { left: marginX + 184 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [51, 65, 85] },
    });

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.text('Produtividade por Executor', marginX, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Relatório considerando ${stats.total} tickets, ${stats.productivityRows.length} executor(es) e ${stats.completedServices} serviço(s) concluído(s).`,
      marginX,
      25,
    );

    autoTable(doc, {
      startY: 32,
      margin: { left: 8, right: 8 },
      head: [['Executor', 'Função', 'Área', 'Tickets', 'Concl.', 'Andam.', 'Exec. média', 'Exec. total', 'Espera', 'Resolução', 'SLA']],
      body: stats.productivityRows.length
        ? stats.productivityRows.map((row) => [
            truncateReportText(row.name, 36),
            truncateReportText(row.specialty, 28),
            truncateReportText(row.area, 22),
            row.totalTickets,
            row.completedTickets,
            row.inProgressTickets,
            formatDuration(row.avgExecutionMs),
            formatDuration(row.totalExecutionMs),
            formatDuration(row.avgWaitingMs),
            formatDuration(row.avgResolutionMs),
            `${row.slaPercent}%`,
          ])
        : [['Nenhum serviço com executor registrado para os filtros selecionados', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: [15, 118, 110], fontSize: 7.2 },
      columnStyles: {
        0: { cellWidth: 37 },
        1: { cellWidth: 27 },
        2: { cellWidth: 22 },
        3: { cellWidth: 14 },
        4: { cellWidth: 14 },
        5: { cellWidth: 14 },
        6: { cellWidth: 24 },
        7: { cellWidth: 24 },
        8: { cellWidth: 24 },
        9: { cellWidth: 24 },
        10: { cellWidth: 14 },
      },
    });

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.text('Relação detalhada de tickets', marginX, 18);

    autoTable(doc, {
      startY: 26,
      margin: { left: 8, right: 8 },
      head: [['Prot.', 'Título', 'Status', 'Prior.', 'Área', 'Setor', 'Solic./Agente', 'Executor', 'Abertura', 'Serviço', 'Exec.', 'Resolução', 'SLA']],
      body: tickets.length
        ? tickets.map((ticket) => {
            const risk = getRiskInfo(ticket);
            const serviceLabel = `${ticket.service_started_at ? format(new Date(ticket.service_started_at), 'dd/MM HH:mm') : '-'} > ${ticket.service_finished_at ? format(new Date(ticket.service_finished_at), 'dd/MM HH:mm') : '-'}`;
            return [
              sanitizeReportText(ticket.protocolo),
              truncateReportText(ticket.titulo, 48),
              ticket.status ? statusLabels[ticket.status] : 'Não informado',
              formatPriority(ticket.prioridade),
              sanitizeReportText(ticket.tipo),
              truncateReportText(ticket.setor, 25),
              truncateReportText(`${ticket.solicitante_nome} / ${ticket.agente_nome}`, 34),
              truncateReportText(ticket.executor_names, 34),
              ticket.created_at ? format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data',
              serviceLabel,
              formatDuration(getDurationMs(ticket.service_started_at, ticket.service_finished_at)),
              formatDuration(getDurationMs(ticket.created_at, ticket.service_finished_at || ticket.resolved_at || ticket.closed_at)),
              getDelayLabel(ticket, risk),
            ];
          })
        : [['Sem tickets no filtro atual', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
      styles: {
        fontSize: 5.8,
        cellPadding: { top: 1.2, right: 0.8, bottom: 1.2, left: 0.8 },
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: { fillColor: [196, 24, 31], fontSize: 5.9, minCellHeight: 6 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 29 },
        2: { cellWidth: 17 },
        3: { cellWidth: 14 },
        4: { cellWidth: 18 },
        5: { cellWidth: 17 },
        6: { cellWidth: 24 },
        7: { cellWidth: 25 },
        8: { cellWidth: 20 },
        9: { cellWidth: 26 },
        10: { cellWidth: 16 },
        11: { cellWidth: 17 },
        12: { cellWidth: 18 },
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 12) return;
        const ticket = tickets[data.row.index];
        if (!ticket) return;
        const risk = getRiskInfo(ticket);
        data.cell.styles.textColor = risk.pdfColor;
        data.cell.styles.fontStyle = 'bold';
      },
    });

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('Help Desk - Grupo Astrotur', marginX, pageHeight - 8);
      doc.text(`Página ${page} de ${pageCount}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    }

    doc.save(`relatorio-operacional-tickets-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`);
  };

  if (authLoading || (loading && !hasLoadedOnce)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasReportAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <img
              src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png"
              alt="Grupo Astrotur"
              className="h-8 object-contain sm:h-10"
            />
            <div className="hidden sm:block">
              <h1 className="text-lg font-semibold">Relatório de Tickets</h1>
              <p className="text-xs text-muted-foreground">Prévia operacional antes da exportação</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:flex">
              {canViewAllSystem ? 'Todo o sistema' : forcedTeamType === 'Manutenção predial' ? 'Manutenção' : 'TI'}
            </Badge>
            <Button size="sm" onClick={exportPDF} disabled={!periodValidation.valid || loading}>
              <Download className="mr-2 h-4 w-4" />
              Exportar PDF
            </Button>
            <ThemeToggle />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container space-y-4 px-3 py-3 sm:px-4 sm:py-4">
        <Card>
          <CardHeader className="px-4 pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Parâmetros do relatório
            </CardTitle>
            <CardDescription className="text-xs">
              Relatório considerando {stats.total} ticket(s), {stats.productivityRows.length} executor(es) e {stats.completedServices} serviço(s) concluído(s).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Abertura início</Label>
              <Input className="h-9" type="date" value={periodoInicio} onChange={(event) => setPeriodoInicio(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Abertura fim</Label>
              <Input className="h-9" type="date" value={periodoFim} onChange={(event) => setPeriodoFim(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fechado de</Label>
              <Input className="h-9" type="date" value={fechadoInicio} onChange={(event) => setFechadoInicio(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fechado até</Label>
              <Input className="h-9" type="date" value={fechadoFim} onChange={(event) => setFechadoFim(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Início serviço de</Label>
              <Input className="h-9" type="date" value={servicoInicioDe} onChange={(event) => setServicoInicioDe(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Início serviço até</Label>
              <Input className="h-9" type="date" value={servicoInicioAte} onChange={(event) => setServicoInicioAte(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fim serviço de</Label>
              <Input className="h-9" type="date" value={servicoFimDe} onChange={(event) => setServicoFimDe(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fim serviço até</Label>
              <Input className="h-9" type="date" value={servicoFimAte} onChange={(event) => setServicoFimAte(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Área</Label>
              <Select value={forcedTeamType || tipoFilter} onValueChange={setTipoFilter} disabled={!!forcedTeamType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todo o sistema</SelectItem>
                  <SelectItem value="TI">TI</SelectItem>
                  <SelectItem value="Manutenção predial">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Setor</Label>
              <Input className="h-9" value={setorFilter === 'all' ? '' : setorFilter} onChange={(event) => setSetorFilter(event.target.value || 'all')} placeholder="Todos" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Executor</Label>
              <Select value={executorFilter} onValueChange={setExecutorFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {executorOptions.map((executor) => (
                    <SelectItem key={executor.id} value={executor.id}>{executor.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Função executor</Label>
              <Select value={executorFuncaoFilter} onValueChange={setExecutorFuncaoFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {executorSpecialtyOptions.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>{specialty}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Execução mín. (h)</Label>
              <Input className="h-9" type="number" min="0" value={tempoExecucaoMin} onChange={(event) => setTempoExecucaoMin(event.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Execução máx. (h)</Label>
              <Input className="h-9" type="number" min="0" value={tempoExecucaoMax} onChange={(event) => setTempoExecucaoMax(event.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resolução mín. (h)</Label>
              <Input className="h-9" type="number" min="0" value={tempoResolucaoMin} onChange={(event) => setTempoResolucaoMin(event.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Resolução máx. (h)</Label>
              <Input className="h-9" type="number" min="0" value={tempoResolucaoMax} onChange={(event) => setTempoResolucaoMax(event.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Status</Label>
              <StatusMultiSelect
                options={statusOptions.map((status) => ({ value: status, label: statusLabels[status] }))}
                value={statusFilters}
                onChange={setStatusFilters}
                triggerClassName="h-9"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" className="h-9 w-full" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </div>
            {!periodValidation.valid && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200 sm:col-span-2 lg:col-span-6">
                {periodValidation.message}
              </div>
            )}
            {loading && hasLoadedOnce && periodValidation.valid && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground sm:col-span-2 lg:col-span-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando relatório...
              </div>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard title="Total" value={stats.total} description="tickets no filtro" icon={<Ticket className="h-4 w-4" />} />
          <MetricCard title="Abertos" value={stats.abertos} description="ainda não iniciados" icon={<Ticket className="h-4 w-4" />} tone="warning" />
          <MetricCard title="Em atendimento" value={stats.emAtendimento} description="em execução" icon={<Clock className="h-4 w-4" />} tone="blue" />
          <MetricCard title="Aguardando" value={stats.aguardando} description="dependem de retorno" icon={<Clock className="h-4 w-4" />} tone="warning" />
          <MetricCard title="Resolvidos/fechados" value={stats.resolvidosFechados} description="tratados" icon={<Ticket className="h-4 w-4" />} tone="green" />
          <MetricCard title="Atrasados" value={stats.delayed} description="atenção ou crítico" icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
        </section>

        <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard title="Alta/Crítica abertas" value={stats.highPriorityOpen} icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
          <MetricCard title="Críticos por SLA" value={stats.critical} icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
          <MetricCard title="Dentro do SLA" value={`${stats.insideSlaPercent}%`} icon={<BarChart3 className="h-4 w-4" />} tone="green" />
          <MetricCard title="Satisfação média" value={`${stats.satisfaction || 0}/5`} icon={<Star className="h-4 w-4" />} tone="warning" />
          <MetricCard title="Resolução média" value={`${formatDuration(stats.mediaTi)} / ${formatDuration(stats.mediaManutencao)}`} description="TI / Manutenção" icon={<Clock className="h-4 w-4" />} tone="blue" />
          <MetricCard title="Execução média" value={`${formatDuration(stats.execucaoTi)} / ${formatDuration(stats.execucaoManutencao)}`} description="TI / Manutenção" icon={<Clock className="h-4 w-4" />} tone="blue" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <RankingBlock title="Distribuição por status" rows={stats.statusRows} />
          <RankingBlock title="Distribuição por prioridade" rows={stats.priorityRows} />
          <RankingBlock title="Comparação por área" rows={stats.areaRows} />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <RankingBlock title="Ranking por categoria" rows={stats.categoryRows} />
          <RankingBlock title="Ranking por setor" rows={stats.sectorRows} />
          <RankingBlock title="Ranking por executor" rows={stats.executorRows} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Produtividade por Executor</CardTitle>
            <CardDescription>
              Conta cada participação individual. Se um ticket teve dois executores, cada um recebe uma participação.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Executor</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Tickets</TableHead>
                  <TableHead>Concluídos</TableHead>
                  <TableHead>Em andamento</TableHead>
                  <TableHead>Execução média</TableHead>
                  <TableHead>Execução total</TableHead>
                  <TableHead>Espera média</TableHead>
                  <TableHead>Resolução média</TableHead>
                  <TableHead>SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.productivityRows.length ? stats.productivityRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.specialty}</TableCell>
                    <TableCell>{row.area}</TableCell>
                    <TableCell>{row.totalTickets}</TableCell>
                    <TableCell>{row.completedTickets}</TableCell>
                    <TableCell>{row.inProgressTickets}</TableCell>
                    <TableCell>{formatDuration(row.avgExecutionMs)}</TableCell>
                    <TableCell>{formatDuration(row.totalExecutionMs)}</TableCell>
                    <TableCell>{formatDuration(row.avgWaitingMs)}</TableCell>
                    <TableCell>{formatDuration(row.avgResolutionMs)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={row.slaPercent >= 90 ? riskColors.normal : row.slaPercent >= 70 ? riskColors.warning : riskColors.critical}>
                        {row.slaPercent}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                      Nenhum serviço com executor registrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sinalização de problemas</CardTitle>
            <CardDescription>Tickets sem resolução mais antigos no filtro atual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats.oldestUnresolved.length ? stats.oldestUnresolved.map(({ ticket, risk }) => (
              <div key={ticket.id} className={`rounded-lg border p-3 ${riskColors[risk.level]}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold">{ticket.protocolo} - {ticket.titulo}</p>
                    <p className="text-sm opacity-80">
                      {ticket.tipo || 'Sem área'} • {formatPriority(ticket.prioridade)} • {ticket.solicitante_nome}
                    </p>
                  </div>
                  <Badge variant="outline" className="w-fit bg-background/70">
                    {risk.label}
                  </Badge>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhum ticket sem resolução no filtro atual.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Relação detalhada</CardTitle>
            <CardDescription>{tickets.length} ticket(s) considerados neste relatório.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Executor</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Início serviço</TableHead>
                  <TableHead>Fim serviço</TableHead>
                  <TableHead>Execução</TableHead>
                  <TableHead>Resolução</TableHead>
                  <TableHead>Sinalização</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length ? tickets.map((ticket) => {
                  const risk = getRiskInfo(ticket);
                  return (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">{ticket.protocolo}</TableCell>
                      <TableCell className="min-w-[220px]">{ticket.titulo}</TableCell>
                      <TableCell>{ticket.status ? statusLabels[ticket.status] : 'Não informado'}</TableCell>
                      <TableCell>{formatPriority(ticket.prioridade)}</TableCell>
                      <TableCell>{ticket.tipo || 'Não informado'}</TableCell>
                      <TableCell>{ticket.solicitante_nome}</TableCell>
                      <TableCell>{ticket.agente_nome}</TableCell>
                      <TableCell>{ticket.executor_names}</TableCell>
                      <TableCell>{ticket.created_at ? format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data'}</TableCell>
                      <TableCell>{ticket.service_started_at ? format(new Date(ticket.service_started_at), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                      <TableCell>{ticket.service_finished_at ? format(new Date(ticket.service_finished_at), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                      <TableCell>{formatDuration(getDurationMs(ticket.service_started_at, ticket.service_finished_at))}</TableCell>
                      <TableCell>{getTicketTimeLabel(ticket)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={riskColors[risk.level]}>
                          {risk.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={14} className="py-8 text-center text-muted-foreground">
                      Nenhum ticket encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
