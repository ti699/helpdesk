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
  solicitante_nome: string;
  solicitante_funcao: string;
  created_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
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
    return `Resolvido em ${formatDuration(getDurationMs(ticket.created_at, ticket.resolved_at || ticket.closed_at))}`;
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
  const [tipoFilter, setTipoFilter] = useState(() => searchParams.get('tipo') || 'all');
  const [requesterFilter, setRequesterFilter] = useState(() => searchParams.get('requester') || 'all');
  const [functionFilter, setFunctionFilter] = useState(() => searchParams.get('funcao') || 'all');
  const [statusFilters, setStatusFilters] = useState<TicketStatus[]>(() => (
    (searchParams.get('status') || '')
      .split(',')
      .filter((status): status is TicketStatus => statusOptions.includes(status as TicketStatus))
  ));
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const hasReportAccess = role === 'admin' || managementReportAccess;
  const periodValidation = useMemo(() => {
    if (!periodoInicio || !periodoFim) return { valid: false, message: 'Informe data inicial e final.' };
    if (!isValidDateInput(periodoInicio) || !isValidDateInput(periodoFim)) return { valid: false, message: 'Informe datas válidas.' };
    if (new Date(`${periodoInicio}T00:00:00`) > new Date(`${periodoFim}T00:00:00`)) {
      return { valid: false, message: 'A data inicial não pode ser maior que a data final.' };
    }
    return { valid: true, message: '' };
  }, [periodoInicio, periodoFim]);

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
  }, [user, hasReportAccess, periodoInicio, periodoFim, tipoFilter, statusFilters.join(','), requesterFilter, functionFilter]);

  const fetchAllTickets = async () => {
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    while (true) {
      let query = supabase
        .from('tickets')
        .select('id, protocolo, titulo, status, tipo, categoria, prioridade, setor, solicitante_id, created_at, resolved_at, closed_at')
        .gte('created_at', periodoInicio)
        .lte('created_at', `${periodoFim}T23:59:59`)
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (tipoFilter !== 'all') query = query.eq('tipo', tipoFilter);
      if (statusFilters.length > 0) query = query.in('status', statusFilters);

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
      const requesterIds = [...new Set(ticketRows.map((ticket) => ticket.solicitante_id).filter(Boolean))] as string[];
      let profiles: ProfileRow[] = [];
      let feedbacks: FeedbackRow[] = [];

      for (const ids of chunk(requesterIds, 500)) {
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

      const profilesById = new Map(profiles.map((profile) => [
        profile.id,
        {
          nome: sanitizeReportText(profile.nome),
          funcao: sanitizeReportText(profile.funcao),
        },
      ]));
      const feedbackByTicketId = new Map(feedbacks.map((feedback) => [feedback.ticket_id, feedback.nota_satisfacao || null]));

      const enriched = ticketRows.map((ticket) => {
        const profile = ticket.solicitante_id ? profilesById.get(ticket.solicitante_id) : null;
        return {
          ...ticket,
          solicitante_nome: profile?.nome || 'Não informado',
          solicitante_funcao: profile?.funcao || 'Não informado',
          feedback_nota: feedbackByTicketId.get(ticket.id) || null,
        };
      }) as ManagementReportTicket[];

      setRequesterOptions([...new Map(
        enriched
          .filter((ticket) => ticket.solicitante_id)
          .map((ticket) => [ticket.solicitante_id as string, { id: ticket.solicitante_id as string, nome: ticket.solicitante_nome }]),
      ).values()].sort((a, b) => a.nome.localeCompare(b.nome)));
      setFunctionOptions([...new Set(enriched.map((ticket) => ticket.solicitante_funcao).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b)));

      setTickets(enriched.filter((ticket) => {
        const matchesRequester = requesterFilter === 'all' || ticket.solicitante_id === requesterFilter;
        const matchesFunction = functionFilter === 'all' || ticket.solicitante_funcao === functionFilter;
        return matchesRequester && matchesFunction;
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
      statusRows: countByGeneric(tickets, (ticket) => ticket.status ? statusLabels[ticket.status] : 'Não informado', 10),
      priorityRows: countByGeneric(tickets, (ticket) => formatPriority(ticket.prioridade), 10),
      areaRows: countByGeneric(tickets, (ticket) => ticket.tipo, 10),
      categoryRows: countByGeneric(tickets, (ticket) => ticket.categoria),
      sectorRows: countByGeneric(tickets, (ticket) => ticket.setor),
      requesterRows: countByGeneric(tickets, (ticket) => ticket.solicitante_nome),
      oldestUnresolved: riskItems
        .filter((item) => item.ticket.status && unresolvedStatuses.includes(item.ticket.status))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 8),
    };
  }, [tickets]);

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
    doc.text(`Período: ${format(new Date(`${periodoInicio}T00:00:00`), 'dd/MM/yyyy')} até ${format(new Date(`${periodoFim}T00:00:00`), 'dd/MM/yyyy')}`, marginX, 38);
    doc.text(`Solicitante: ${requesterFilter === 'all' ? 'Todos' : requesterOptions.find((option) => option.id === requesterFilter)?.nome || 'Selecionado'} | Função: ${functionFilter === 'all' ? 'Todas' : functionFilter}`, marginX, 44);

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
      const y = 54;
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
      startY: 84,
      head: [['Indicador complementar', 'Valor']],
      body: [
        ['Abertos', stats.abertos],
        ['Em atendimento', stats.emAtendimento],
        ['Aguardando resposta', stats.aguardando],
        ['Resolvidos', stats.resolvidos],
        ['Fechados', stats.fechados],
        ['Tempo médio TI', formatDuration(stats.mediaTi)],
        ['Tempo médio Manutenção', formatDuration(stats.mediaManutencao)],
      ],
      tableWidth: 82,
      margin: { left: marginX },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [31, 41, 55] },
    });

    autoTable(doc, {
      startY: 84,
      head: [['Status', 'Qtd.', '%']],
      body: stats.statusRows.map((row) => [row.label, row.count, `${row.percent}%`]),
      tableWidth: 60,
      margin: { left: marginX + 90 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    autoTable(doc, {
      startY: 84,
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
      margin: { left: 8, right: 8 },
      head: [['Protocolo', 'Título', 'Área', 'Prioridade', 'Sinalização']],
      body: stats.oldestUnresolved.length
        ? stats.oldestUnresolved.map(({ ticket, risk }) => [
            sanitizeReportText(ticket.protocolo),
            truncateReportText(ticket.titulo, 70),
            sanitizeReportText(ticket.tipo),
            formatPriority(ticket.prioridade),
            getDelayLabel(ticket, risk),
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
    doc.text('Relação detalhada de tickets', marginX, 18);

    autoTable(doc, {
      startY: 26,
      margin: { left: 8, right: 8 },
      head: [['Prot.', 'Título', 'Status', 'Prior.', 'Área', 'Cat.', 'Setor', 'Solic.', 'Função', 'Abert.', 'Tempo', 'Nota', 'Atraso']],
      body: tickets.length
        ? tickets.map((ticket) => {
            const risk = getRiskInfo(ticket);
            return [
              sanitizeReportText(ticket.protocolo),
              truncateReportText(ticket.titulo, 42),
              ticket.status ? statusLabels[ticket.status] : 'Não informado',
              formatPriority(ticket.prioridade),
              sanitizeReportText(ticket.tipo),
              truncateReportText(ticket.categoria, 22),
              truncateReportText(ticket.setor, 22),
              truncateReportText(ticket.solicitante_nome, 28),
              truncateReportText(ticket.solicitante_funcao, 22),
              ticket.created_at ? format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data',
              getTicketTimeLabel(ticket),
              ticket.feedback_nota ? `${ticket.feedback_nota}/5` : '-',
              getDelayLabel(ticket, risk),
            ];
          })
        : [['Sem tickets no filtro atual', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
      styles: {
        fontSize: 5.9,
        cellPadding: { top: 1.2, right: 0.8, bottom: 1.2, left: 0.8 },
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: { fillColor: [196, 24, 31], fontSize: 6, minCellHeight: 7 },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 29 },
        2: { cellWidth: 17 },
        3: { cellWidth: 14 },
        4: { cellWidth: 19 },
        5: { cellWidth: 18 },
        6: { cellWidth: 17 },
        7: { cellWidth: 24 },
        8: { cellWidth: 17 },
        9: { cellWidth: 19 },
        10: { cellWidth: 22 },
        11: { cellWidth: 9 },
        12: { cellWidth: 16 },
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
          <CardContent className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label className="text-xs">Início</Label>
              <Input className="h-9" type="date" value={periodoInicio} onChange={(event) => setPeriodoInicio(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fim</Label>
              <Input className="h-9" type="date" value={periodoFim} onChange={(event) => setPeriodoFim(event.target.value)} />
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

        <section className="grid gap-4 lg:grid-cols-3">
          <RankingBlock title="Distribuição por status" rows={stats.statusRows} />
          <RankingBlock title="Distribuição por prioridade" rows={stats.priorityRows} />
          <RankingBlock title="Comparação por área" rows={stats.areaRows} />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <RankingBlock title="Ranking por categoria" rows={stats.categoryRows} />
          <RankingBlock title="Ranking por setor" rows={stats.sectorRows} />
          <RankingBlock title="Ranking por solicitante" rows={stats.requesterRows} />
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
                  <TableHead>Setor</TableHead>
                  <TableHead>Abertura</TableHead>
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
                      <TableCell>{ticket.setor || 'Não informado'}</TableCell>
                      <TableCell>{ticket.created_at ? format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm') : 'Sem data'}</TableCell>
                      <TableCell>{getTicketTimeLabel(ticket)}</TableCell>
                      <TableCell>{ticket.feedback_nota ? `${ticket.feedback_nota}/5` : '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={riskColors[risk.level]}>{risk.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                }) : (
                  <TableRow>
                    <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
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
