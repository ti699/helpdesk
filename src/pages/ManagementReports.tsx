import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ArrowLeft, Clock, Download, FileText, Loader2, Star, Ticket, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AccountMenu } from '@/components/AccountMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { RankingBlock } from '@/components/reports/RankingBlock';
import { SlimMetricCard } from '@/components/reports/SlimMetricCard';
import { StatusMultiSelect } from '@/components/reports/StatusMultiSelect';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  chunk,
  countByGeneric,
  formatDuration,
  formatPriority,
  getDurationMs,
  isValidDateInput,
  normalizePriority,
  riskColors,
  sanitizeReportText,
  statusLabels,
  statusOptions,
  truncateReportText,
  unresolvedStatuses,
  type RiskLevel,
  type TicketStatus,
  type TicketType,
} from '@/lib/reporting';

interface ManagementReportTicket {
  id: string;
  protocolo: string;
  titulo: string;
  status: TicketStatus | null;
  tipo: string | null;
  categoria: string | null;
  prioridade: string | null;
  setor: string | null;
  solicitante_id: string | null;
  agente_id: string | null;
  solicitante_nome: string;
  solicitante_funcao: string;
  agente_nome: string;
  created_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  service_started_at: string | null;
  service_finished_at: string | null;
  executor_names: string;
  executor_specialties: string;
  executor_ids: string[];
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
  area: string;
}

interface ServiceSessionRow {
  id: string;
  ticket_id: string;
  started_at: string | null;
  finished_at: string | null;
}

interface ServiceSessionExecutorRow {
  session_id: string;
  executor_id: string;
}

const getRiskInfo = (ticket: ManagementReportTicket) => {
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

const getTicketTimeLabel = (ticket: ManagementReportTicket) => {
  if (ticket.status === 'resolvido' || ticket.status === 'fechado') {
    return `Concluído em ${formatDuration(getDurationMs(ticket.created_at, ticket.service_finished_at || ticket.resolved_at || ticket.closed_at))}`;
  }

  return `Sem resolução há ${formatDuration(getDurationMs(ticket.created_at))}`;
};

const getDelayLabel = (ticket: ManagementReportTicket, risk: ReturnType<typeof getRiskInfo>) => {
  if (ticket.status === 'fechado') return 'Fechado';
  if (ticket.status === 'resolvido') return 'Resolvido';
  if (risk.level === 'normal') return 'No prazo';
  return formatDuration(getDurationMs(ticket.created_at));
};

const averageResolution = (tickets: ManagementReportTicket[], type: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === type && ticket.resolved_at)
    .map((ticket) => getDurationMs(ticket.created_at, ticket.resolved_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const averageExecution = (tickets: ManagementReportTicket[], type: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === type && ticket.service_started_at && ticket.service_finished_at)
    .map((ticket) => getDurationMs(ticket.service_started_at, ticket.service_finished_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const averageWaiting = (tickets: ManagementReportTicket[], type: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === type && ticket.service_started_at)
    .map((ticket) => getDurationMs(ticket.created_at, ticket.service_started_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const hoursToMs = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed * 3600000;
};

export default function ManagementReports() {
  const { user, role, managementReportAccess, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ManagementReportTicket[]>([]);
  const [requesterOptions, setRequesterOptions] = useState<Array<{ id: string; nome: string }>>([]);
  const [functionOptions, setFunctionOptions] = useState<string[]>([]);
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
  const [tipoFilter, setTipoFilter] = useState(() => searchParams.get('tipo') || 'all');
  const [requesterFilter, setRequesterFilter] = useState(() => searchParams.get('requester') || 'all');
  const [functionFilter, setFunctionFilter] = useState(() => searchParams.get('funcao') || 'all');
  const [executorFilter, setExecutorFilter] = useState(() => searchParams.get('executor') || 'all');
  const [executorFuncaoFilter, setExecutorFuncaoFilter] = useState(() => searchParams.get('executorFuncao') || 'all');
  const [tempoExecucaoMin, setTempoExecucaoMin] = useState(() => searchParams.get('tempoExecucaoMin') || '');
  const [tempoExecucaoMax, setTempoExecucaoMax] = useState(() => searchParams.get('tempoExecucaoMax') || '');
  const [tempoResolucaoMin, setTempoResolucaoMin] = useState(() => searchParams.get('tempoResolucaoMin') || '');
  const [tempoResolucaoMax, setTempoResolucaoMax] = useState(() => searchParams.get('tempoResolucaoMax') || '');
  const [statusFilters, setStatusFilters] = useState<TicketStatus[]>(() => (
    (searchParams.get('status') || '')
      .split(',')
      .filter((status): status is TicketStatus => statusOptions.includes(status as TicketStatus))
  ));
  const [executorOptions, setExecutorOptions] = useState<ServiceExecutorRow[]>([]);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const hasReportAccess = role === 'admin' || managementReportAccess;
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
      return { valid: false, message: 'Informe datas de início do serviço válidas.' };
    }
    if (servicoInicioDe && servicoInicioAte && new Date(`${servicoInicioDe}T00:00:00`) > new Date(`${servicoInicioAte}T00:00:00`)) {
      return { valid: false, message: 'A data inicial do serviço não pode ser maior que a data final.' };
    }
    if ((servicoFimDe && !isValidDateInput(servicoFimDe)) || (servicoFimAte && !isValidDateInput(servicoFimAte))) {
      return { valid: false, message: 'Informe datas de fim do serviço válidas.' };
    }
    if (servicoFimDe && servicoFimAte && new Date(`${servicoFimDe}T00:00:00`) > new Date(`${servicoFimAte}T00:00:00`)) {
      return { valid: false, message: 'A data inicial de fim do serviço não pode ser maior que a data final.' };
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
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role && !hasReportAccess) navigate(role === 'solicitante' ? '/' : '/dashboard');
  }, [role, hasReportAccess, authLoading, navigate]);

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
    statusFilters.join(','),
    requesterFilter,
    functionFilter,
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
        .select('id, protocolo, titulo, status, tipo, categoria, prioridade, setor, solicitante_id, agente_id, created_at, resolved_at, closed_at, service_started_at, service_finished_at')
        .gte('created_at', periodoInicio)
        .lte('created_at', `${periodoFim}T23:59:59`)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (tipoFilter !== 'all') query = query.eq('tipo', tipoFilter);
      if (statusFilters.length > 0) query = query.in('status', statusFilters);
      if (fechadoInicio) query = query.gte('closed_at', fechadoInicio);
      if (fechadoFim) query = query.lte('closed_at', `${fechadoFim}T23:59:59`);
      if (servicoInicioDe) query = query.gte('service_started_at', servicoInicioDe);
      if (servicoInicioAte) query = query.lte('service_started_at', `${servicoInicioAte}T23:59:59`);
      if (servicoFimDe) query = query.gte('service_finished_at', servicoFimDe);
      if (servicoFimAte) query = query.lte('service_finished_at', `${servicoFimAte}T23:59:59`);

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
        serviceExecutors = [...serviceExecutors, ...((data || []) as ServiceExecutorRow[])];
      }

      const profilesById = new Map(profiles.map((profile) => [
        profile.id,
        {
          nome: sanitizeReportText(profile.nome),
          funcao: sanitizeReportText(profile.funcao),
        },
      ]));
      const feedbackByTicketId = new Map(feedbacks.map((feedback) => [feedback.ticket_id, feedback.nota_satisfacao || null]));
      const executorsById = new Map(serviceExecutors.map((executor) => [executor.id, executor]));
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

      const enriched = ticketRows.map((ticket) => {
        const profile = ticket.solicitante_id ? profilesById.get(ticket.solicitante_id) : null;
        const ticketExecutorIds = [...new Set((sessionIdsByTicketId.get(ticket.id) || []).flatMap((sessionId) => executorIdsBySessionId.get(sessionId) || []))];
        const ticketExecutors = ticketExecutorIds
          .map((executorId) => executorsById.get(executorId))
          .filter((executor): executor is ServiceExecutorRow => Boolean(executor));

        return {
          ...ticket,
          solicitante_nome: profile?.nome || 'Não informado',
          solicitante_funcao: profile?.funcao || 'Não informado',
          agente_nome: ticket.agente_id ? profilesById.get(ticket.agente_id)?.nome || 'Não informado' : 'Não atribuído',
          executor_names: ticketExecutors.map((executor) => executor.name).join(', ') || 'Não informado',
          executor_specialties: [...new Set(ticketExecutors.map((executor) => executor.specialty))].join(', ') || 'Não informado',
          executor_ids: ticketExecutorIds,
          feedback_nota: feedbackByTicketId.get(ticket.id) || null,
        };
      }) as ManagementReportTicket[];

      const executionMinMs = hoursToMs(tempoExecucaoMin);
      const executionMaxMs = hoursToMs(tempoExecucaoMax);
      const resolutionMinMs = hoursToMs(tempoResolucaoMin);
      const resolutionMaxMs = hoursToMs(tempoResolucaoMax);

      setRequesterOptions([...new Map(
        enriched
          .filter((ticket) => ticket.solicitante_id)
          .map((ticket) => [ticket.solicitante_id as string, { id: ticket.solicitante_id as string, nome: ticket.solicitante_nome }]),
      ).values()].sort((a, b) => a.nome.localeCompare(b.nome)));
      setFunctionOptions([...new Set(enriched.map((ticket) => ticket.solicitante_funcao).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)));
      setExecutorOptions([...new Map(serviceExecutors.map((executor) => [executor.id, executor])).values()]
        .sort((a, b) => a.name.localeCompare(b.name)));

      setTickets(enriched.filter((ticket) => {
        if (requesterFilter !== 'all' && ticket.solicitante_id !== requesterFilter) return false;
        if (functionFilter !== 'all' && ticket.solicitante_funcao !== functionFilter) return false;
        if (executorFilter !== 'all' && !ticket.executor_ids.includes(executorFilter)) return false;
        if (executorFuncaoFilter !== 'all' && !ticket.executor_specialties.split(', ').includes(executorFuncaoFilter)) return false;

        const executionMs = getDurationMs(ticket.service_started_at, ticket.service_finished_at);
        const resolutionMs = getDurationMs(ticket.created_at, ticket.service_finished_at || ticket.resolved_at || ticket.closed_at);
        if (executionMinMs !== null && (executionMs === null || executionMs < executionMinMs)) return false;
        if (executionMaxMs !== null && (executionMs === null || executionMs > executionMaxMs)) return false;
        if (resolutionMinMs !== null && (resolutionMs === null || resolutionMs < resolutionMinMs)) return false;
        if (resolutionMaxMs !== null && (resolutionMs === null || resolutionMs > resolutionMaxMs)) return false;

        return true;
      }));
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Erro ao gerar relatório de alta gestão:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = tickets.length;
    const riskItems = tickets.map((ticket) => ({ ticket, risk: getRiskInfo(ticket), durationMs: getDurationMs(ticket.created_at) || 0 }));
    const delayed = riskItems.filter((item) => item.risk.level === 'warning' || item.risk.level === 'critical');
    const critical = riskItems.filter((item) => item.risk.level === 'critical');
    const highPriorityOpen = tickets.filter((ticket) => {
      const priority = normalizePriority(ticket.prioridade);
      return ticket.status && unresolvedStatuses.includes(ticket.status) && (priority === 'alta' || priority === 'critica');
    });
    const ratings = tickets.map((ticket) => ticket.feedback_nota || 0).filter(Boolean);
    const satisfaction = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;

    return {
      total,
      abertos: tickets.filter((ticket) => ticket.status === 'aberto').length,
      emAtendimento: tickets.filter((ticket) => ticket.status === 'em_andamento').length,
      aguardando: tickets.filter((ticket) => ticket.status === 'aguardando_resposta').length,
      resolvidos: tickets.filter((ticket) => ticket.status === 'resolvido').length,
      fechados: tickets.filter((ticket) => ticket.status === 'fechado').length,
      semResolucao: tickets.filter((ticket) => ticket.status && unresolvedStatuses.includes(ticket.status)).length,
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
      statusRows: countByGeneric(tickets, (ticket) => ticket.status ? statusLabels[ticket.status] : 'Não informado', 10),
      priorityRows: countByGeneric(tickets, (ticket) => formatPriority(ticket.prioridade), 10),
      areaRows: countByGeneric(tickets, (ticket) => ticket.tipo, 10),
      categoryRows: countByGeneric(tickets, (ticket) => ticket.categoria),
      sectorRows: countByGeneric(tickets, (ticket) => ticket.setor),
      requesterRows: countByGeneric(tickets, (ticket) => ticket.solicitante_nome),
      executorRows: countByGeneric(tickets, (ticket) => ticket.executor_names, 10),
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

  const exportPDF = () => {
    if (!periodValidation.valid) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const areaLabel = tipoFilter === 'all' ? 'Todas' : tipoFilter === 'Manutenção predial' ? 'Manutenção' : tipoFilter;
    const statusLabel = statusFilters.length ? statusFilters.map((status) => statusLabels[status]).join(', ') : 'Todos';

    doc.setFillColor(196, 24, 31);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Relatório Alta Gestão - Help Desk Astrotur', marginX, 14);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Emitido em ${generatedAt} | Área: ${areaLabel} | Status: ${statusLabel}`, marginX, 22);

    doc.setTextColor(17, 24, 39);
    doc.setFontSize(10);
    const fechamentoLabel = fechadoInicio || fechadoFim
      ? `Fechamento: ${fechadoInicio ? format(new Date(`${fechadoInicio}T00:00:00`), 'dd/MM/yyyy') : 'início'} até ${fechadoFim ? format(new Date(`${fechadoFim}T00:00:00`), 'dd/MM/yyyy') : 'hoje'}`
      : 'Fechamento: não filtrado';
    const servicoLabel = servicoInicioDe || servicoInicioAte || servicoFimDe || servicoFimAte
      ? `Serviço: início ${servicoInicioDe || 'livre'} até ${servicoInicioAte || 'livre'} | fim ${servicoFimDe || 'livre'} até ${servicoFimAte || 'livre'}`
      : 'Serviço: não filtrado';
    doc.text(`Período: ${format(new Date(`${periodoInicio}T00:00:00`), 'dd/MM/yyyy')} até ${format(new Date(`${periodoFim}T00:00:00`), 'dd/MM/yyyy')}`, marginX, 38);
    doc.text(fechamentoLabel, marginX, 44);
    doc.text(servicoLabel, marginX, 50);
    doc.text(`Solicitante: ${requesterFilter === 'all' ? 'Todos' : requesterOptions.find((option) => option.id === requesterFilter)?.nome || 'Selecionado'} | Função: ${functionFilter === 'all' ? 'Todas' : functionFilter}`, marginX, 56);

    const summary = [
      ['Tickets', stats.total, [31, 41, 55]],
      ['Sem resolução', stats.semResolucao, [37, 99, 235]],
      ['Atrasados', stats.delayed, [220, 38, 38]],
      ['Alta/Crítica', stats.highPriorityOpen, [239, 68, 68]],
      ['Satisfação', `${stats.satisfaction || 0}/5`, [217, 119, 6]],
      ['Críticos SLA', stats.critical, [185, 28, 28]],
    ] as Array<[string, string | number, [number, number, number]]>;

    const cardWidth = (pageWidth - marginX * 2 - 10) / 6;
    summary.forEach(([label, value, color], index) => {
      const x = marginX + index * (cardWidth + 2);
      const y = 60;
      doc.setDrawColor(226, 232, 240);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, cardWidth, 22, 2, 2, 'FD');
      doc.setFillColor(color[0], color[1], color[2]);
      doc.rect(x, y, cardWidth, 2.6, 'F');
      doc.setTextColor(71, 85, 105);
      doc.setFontSize(8);
      doc.text(label, x + 3, y + 9, { maxWidth: cardWidth - 6 });
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(String(value), x + 3, y + 18);
      doc.setFont('helvetica', 'normal');
    });

    autoTable(doc, {
      startY: 90,
      head: [['Indicador complementar', 'Valor']],
      body: [
        ['Abertos', stats.abertos],
        ['Em atendimento', stats.emAtendimento],
        ['Aguardando resposta', stats.aguardando],
        ['Resolvidos', stats.resolvidos],
        ['Fechados', stats.fechados],
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
      startY: 90,
      head: [['Status', 'Qtd.', '%']],
      body: stats.statusRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 60,
      margin: { left: marginX + 90 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    autoTable(doc, {
      startY: 90,
      head: [['Área', 'Qtd.', '%']],
      body: stats.areaRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 60,
      margin: { left: marginX + 156 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [22, 163, 74] },
    });

    autoTable(doc, {
      startY: 84,
      head: [['Prioridade', 'Qtd.', '%']],
      body: stats.priorityRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 58,
      margin: { left: marginX + 222 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38] },
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
            sanitizeReportText(ticket.protocolo),
            truncateReportText(ticket.titulo, 70),
            sanitizeReportText(ticket.tipo),
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

    const afterRankingY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || afterIssuesY + 60;
    autoTable(doc, {
      startY: afterRankingY + 8,
      head: [['Executor', 'Qtd.', '%']],
      body: stats.executorRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 120,
      margin: { left: marginX },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [15, 118, 110] },
    });

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.setFontSize(14);
    doc.text('Relação detalhada de tickets', marginX, 18);

    autoTable(doc, {
      startY: 26,
      margin: { left: 6, right: 6 },
      head: [['Prot.', 'Título', 'Status', 'Prior.', 'Área', 'Setor', 'Solic./Agente', 'Executor', 'Abert.', 'Serviço', 'Exec.', 'Resol.', 'SLA']],
      body: tickets.length
        ? tickets.map((ticket) => {
            const risk = getRiskInfo(ticket);
            const serviceLabel = `${ticket.service_started_at ? format(new Date(ticket.service_started_at), 'dd/MM HH:mm') : '-'} > ${ticket.service_finished_at ? format(new Date(ticket.service_finished_at), 'dd/MM HH:mm') : '-'}`;
            return [
              sanitizeReportText(ticket.protocolo),
              truncateReportText(ticket.titulo, 34),
              ticket.status ? statusLabels[ticket.status] : 'Não informado',
              formatPriority(ticket.prioridade),
              sanitizeReportText(ticket.tipo),
              truncateReportText(ticket.setor, 22),
              truncateReportText(`${ticket.solicitante_nome} / ${ticket.agente_nome}`, 24),
              truncateReportText(ticket.executor_names, 26),
              ticket.created_at ? format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data',
              serviceLabel,
              formatDuration(getDurationMs(ticket.service_started_at, ticket.service_finished_at)),
              getTicketTimeLabel(ticket).replace('Sem resolução há ', '').replace('Concluído em ', ''),
              risk.label,
            ];
          })
        : [['Sem tickets no filtro atual', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
      styles: {
        fontSize: 5.6,
        cellPadding: { top: 1, right: 0.7, bottom: 1, left: 0.7 },
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: { fillColor: [196, 24, 31], fontSize: 6, minCellHeight: 7 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 30 },
        2: { cellWidth: 17 },
        3: { cellWidth: 14 },
        4: { cellWidth: 19 },
        5: { cellWidth: 17 },
        6: { cellWidth: 23 },
        7: { cellWidth: 24 },
        8: { cellWidth: 20 },
        9: { cellWidth: 26 },
        10: { cellWidth: 15 },
        11: { cellWidth: 15 },
        12: { cellWidth: 21 },
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

    doc.save(`relatorio-alta-gestao-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`);
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
            <Link to="/gestao">
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
              <h1 className="text-lg font-semibold">Relatório Alta Gestão</h1>
              <p className="text-xs text-muted-foreground">Prévia executiva antes da exportação</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:flex bg-primary/10 text-primary border-primary/20">
              {role === 'admin' ? 'Administrador' : 'Alta Gestão'}
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
              O PDF usa exatamente os filtros e indicadores exibidos nesta prévia.
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
              <Label className="text-xs">Serviço início de</Label>
              <Input className="h-9" type="date" value={servicoInicioDe} onChange={(event) => setServicoInicioDe(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Serviço início até</Label>
              <Input className="h-9" type="date" value={servicoInicioAte} onChange={(event) => setServicoInicioAte(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Serviço fim de</Label>
              <Input className="h-9" type="date" value={servicoFimDe} onChange={(event) => setServicoFimDe(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Serviço fim até</Label>
              <Input className="h-9" type="date" value={servicoFimAte} onChange={(event) => setServicoFimAte(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Área</Label>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="TI">TI</SelectItem>
                  <SelectItem value="Manutenção predial">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <StatusMultiSelect
                options={statusOptions.map((status) => ({ value: status, label: statusLabels[status] }))}
                value={statusFilters}
                onChange={setStatusFilters}
                triggerClassName="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Solicitante</Label>
              <Select value={requesterFilter} onValueChange={setRequesterFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {requesterOptions.map((requester) => (
                    <SelectItem key={requester.id} value={requester.id}>{requester.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Função</Label>
              <Select value={functionFilter} onValueChange={setFunctionFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {functionOptions.map((funcao) => (
                    <SelectItem key={funcao} value={funcao}>{funcao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            {!periodValidation.valid && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200 sm:col-span-2 lg:col-span-4 xl:col-span-6">
                {periodValidation.message}
              </div>
            )}
            {loading && hasLoadedOnce && periodValidation.valid && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground sm:col-span-2 lg:col-span-4 xl:col-span-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                Atualizando relatório...
              </div>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <SlimMetricCard title="Tickets" value={stats.total} description="no período" icon={<Ticket className="h-4 w-4" />} />
          <SlimMetricCard title="Sem resolução" value={stats.semResolucao} icon={<Clock className="h-4 w-4" />} tone="blue" />
          <SlimMetricCard title="Atrasados" value={stats.delayed} icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
          <SlimMetricCard title="Alta/Crítica" value={stats.highPriorityOpen} description="abertas" icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
          <SlimMetricCard title="Satisfação" value={`${stats.satisfaction || 0}/5`} icon={<Star className="h-4 w-4" />} tone="warning" />
          <SlimMetricCard title="Críticos SLA" value={stats.critical} icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
        </section>

        <section className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <SlimMetricCard title="Abertos" value={stats.abertos} icon={<Ticket className="h-4 w-4" />} tone="warning" />
          <SlimMetricCard title="Em atendimento" value={stats.emAtendimento} icon={<Clock className="h-4 w-4" />} tone="blue" />
          <SlimMetricCard title="Aguardando" value={stats.aguardando} icon={<Clock className="h-4 w-4" />} tone="warning" />
          <SlimMetricCard title="Resolvidos" value={stats.resolvidos} icon={<Ticket className="h-4 w-4" />} tone="green" />
          <SlimMetricCard title="Fechados" value={stats.fechados} icon={<Ticket className="h-4 w-4" />} tone="muted" />
          <SlimMetricCard title="Médias" value={`${formatDuration(stats.mediaTi)} / ${formatDuration(stats.mediaManutencao)}`} description="TI / Manutenção" icon={<Clock className="h-4 w-4" />} tone="blue" />
        </section>

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SlimMetricCard title="Execução TI" value={formatDuration(stats.execucaoTi)} icon={<Clock className="h-4 w-4" />} tone="blue" />
          <SlimMetricCard title="Execução Manutenção" value={formatDuration(stats.execucaoManutencao)} icon={<Clock className="h-4 w-4" />} tone="green" />
          <SlimMetricCard title="Espera TI" value={formatDuration(stats.esperaTi)} description="até iniciar serviço" icon={<Clock className="h-4 w-4" />} tone="blue" />
          <SlimMetricCard title="Espera Manutenção" value={formatDuration(stats.esperaManutencao)} description="até iniciar serviço" icon={<Clock className="h-4 w-4" />} tone="green" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <RankingBlock title="Distribuição por status" rows={stats.statusRows} />
          <RankingBlock title="Distribuição por prioridade" rows={stats.priorityRows} />
          <RankingBlock title="Comparação por área" rows={stats.areaRows} />
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <RankingBlock title="Ranking por categoria" rows={stats.categoryRows} />
          <RankingBlock title="Ranking por setor" rows={stats.sectorRows} />
          <RankingBlock title="Ranking por solicitante" rows={stats.requesterRows} />
          <RankingBlock title="Ranking por executor" rows={stats.executorRows} />
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Sinalização executiva</CardTitle>
            <CardDescription>Tickets sem resolução mais antigos dentro dos filtros aplicados.</CardDescription>
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
                  <Badge variant="outline" className="w-fit bg-background/70">{risk.label}</Badge>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">Nenhum ticket sem resolução no filtro atual.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets do período filtrado</CardTitle>
            <CardDescription>{tickets.length} ticket(s) considerados neste relatório.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Protocolo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Executor</TableHead>
                  <TableHead>Setor</TableHead>
                  <TableHead>Abertura</TableHead>
                  <TableHead>Início serviço</TableHead>
                  <TableHead>Fim serviço</TableHead>
                  <TableHead>Execução</TableHead>
                  <TableHead>Tempo</TableHead>
                  <TableHead>Nota</TableHead>
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
                      <TableCell>{ticket.tipo || 'Não informado'}</TableCell>
                      <TableCell>{ticket.status ? statusLabels[ticket.status] : 'Não informado'}</TableCell>
                      <TableCell>{formatPriority(ticket.prioridade)}</TableCell>
                      <TableCell>{ticket.solicitante_nome}</TableCell>
                      <TableCell>{ticket.solicitante_funcao}</TableCell>
                      <TableCell>{ticket.agente_nome}</TableCell>
                      <TableCell>{ticket.executor_names}</TableCell>
                      <TableCell>{ticket.setor || 'Não informado'}</TableCell>
                      <TableCell>{ticket.created_at ? format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data'}</TableCell>
                      <TableCell>{ticket.service_started_at ? format(new Date(ticket.service_started_at), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                      <TableCell>{ticket.service_finished_at ? format(new Date(ticket.service_finished_at), 'dd/MM/yyyy HH:mm') : '-'}</TableCell>
                      <TableCell>{formatDuration(getDurationMs(ticket.service_started_at, ticket.service_finished_at))}</TableCell>
                      <TableCell>{getTicketTimeLabel(ticket)}</TableCell>
                      <TableCell>{ticket.feedback_nota ? `${ticket.feedback_nota}/5` : '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={riskColors[risk.level]}>{risk.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={17} className="py-8 text-center text-muted-foreground">
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
