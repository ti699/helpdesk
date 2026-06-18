import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AccountMenu } from '@/components/AccountMenu';
import { 
  Ticket, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  User,
  Loader2,
  Star,
  Settings,
  Monitor,
  Wrench,
  Plus,
  BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { BulkActions } from '@/components/tickets/BulkActions';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';
type TicketStatsQuery = ReturnType<ReturnType<typeof supabase.from>['select']>;

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: string;
  setor: string | null;
  tipo: string | null;
  categoria: string | null;
  created_at: string;
  resolved_at: string | null;
  solicitante: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white', icon: <AlertCircle className="h-4 w-4" /> },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white', icon: <Clock className="h-4 w-4" /> },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-status-waiting text-white', icon: <Clock className="h-4 w-4" /> },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
};

const priorityColors: Record<string, string> = {
  baixa: 'bg-priority-low text-white',
  media: 'bg-priority-medium text-white',
  alta: 'bg-priority-high text-white',
  critica: 'bg-priority-critical text-white',
};

const unresolvedStatuses: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_resposta'];

const getDurationMs = (start?: string | null, end?: string | null) => {
  if (!start) return null;

  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();

  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
    return null;
  }

  return endTime - startTime;
};

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

const getResolutionMetricLabel = (ticket: Pick<TicketData, 'status' | 'created_at' | 'resolved_at'>) => {
  if (unresolvedStatuses.includes(ticket.status)) {
    return `Sem resolução há ${formatDuration(getDurationMs(ticket.created_at))}`;
  }

  if (ticket.resolved_at) {
    return `Resolvido em ${formatDuration(getDurationMs(ticket.created_at, ticket.resolved_at))}`;
  }

  return 'Sem dados';
};

const getUnresolvedBadgeClass = (ticket: Pick<TicketData, 'tipo' | 'created_at'>) => {
  const durationMs = getDurationMs(ticket.created_at) || 0;
  const hours = durationMs / 3600000;
  const warningAfter = ticket.tipo === 'Manutenção predial' ? 72 : 24;
  const criticalAfter = ticket.tipo === 'Manutenção predial' ? 96 : 48;

  if (hours >= criticalAfter) return 'border-red-500 bg-red-500 text-white';
  if (hours >= warningAfter) return 'border-amber-500 bg-amber-500 text-white';
  return 'border-emerald-600 bg-emerald-600 text-white';
};

export default function Dashboard() {
  const { user, profile, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);


  // HOOKS DE ESTADO
  const [tipoFilter, setTipoFilter] = useState('all');
  const [setorFilter, setSetorFilter] = useState<string>('all');

  // Função para exportar PDF (agora no escopo correto)
  const handleExportPDF = () => {
    console.log('[PDF] Clique no botão Exportar PDF');
    const exportTickets = selectedIds.length > 0
      ? tickets.filter(t => selectedIds.includes(t.id))
      : tickets;
    console.log('[PDF] Tickets para exportar:', exportTickets);
    if (!exportTickets.length) {
      alert('Nenhum ticket para exportar!');
      console.log('[PDF] Nenhum ticket para exportar!');
      return;
    }
    try {
      console.log('[PDF] Iniciando geração do PDF...');
      const doc = new jsPDF();
      const now = new Date();
      const dataHora = now.toLocaleString('pt-BR');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 14;
      const contentWidth = pageWidth - marginX * 2;

      const statusLabel = (status: TicketStatus) => statusConfig[status]?.label || status;
      const priorityLabel = (priority?: string | null) => {
        const labels: Record<string, string> = {
          baixa: 'Baixa',
          media: 'Média',
          média: 'Média',
          alta: 'Alta',
          critica: 'Crítica',
          crítica: 'Crítica',
        };

        return labels[(priority || '').toLowerCase()] || priority || 'Não informada';
      };

      const normalizePriority = (priority?: string | null) => (
        (priority || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      );

      const getRiskInfo = (ticket: TicketData) => {
        if (ticket.status === 'resolvido' || ticket.status === 'fechado') {
          return {
            label: ticket.status === 'fechado' ? 'Fechado' : 'Resolvido',
            level: 'resolved',
            color: [34, 197, 94] as [number, number, number],
          };
        }

        const durationMs = getDurationMs(ticket.created_at) || 0;
        const hours = durationMs / 3600000;
        const warningAfter = ticket.tipo === 'Manutenção predial' ? 72 : 24;
        const criticalAfter = ticket.tipo === 'Manutenção predial' ? 96 : 48;

        if (hours >= criticalAfter) {
          return {
            label: `Crítico: sem resolução há ${formatDuration(durationMs)}`,
            level: 'critical',
            color: [239, 68, 68] as [number, number, number],
          };
        }

        if (hours >= warningAfter) {
          return {
            label: `Atenção: sem resolução há ${formatDuration(durationMs)}`,
            level: 'warning',
            color: [245, 158, 11] as [number, number, number],
          };
        }

        return {
          label: `No prazo: ${formatDuration(durationMs)}`,
          level: 'normal',
          color: [16, 185, 129] as [number, number, number],
        };
      };

      const countBy = <T,>(items: T[], getKey: (item: T) => string) => (
        items.reduce<Record<string, number>>((acc, item) => {
          const key = getKey(item) || 'Não informado';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {})
      );

      const topRows = (counts: Record<string, number>, limit = 8) => (
        Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([label, total]) => [label, total.toString(), `${Math.round((total / exportTickets.length) * 100)}%`])
      );

      const riskTickets = exportTickets.map(ticket => ({
        ticket,
        risk: getRiskInfo(ticket),
        durationMs: getDurationMs(ticket.created_at) || 0,
      }));

      const delayedTickets = riskTickets.filter(t => t.risk.level === 'warning' || t.risk.level === 'critical');
      const highPriorityOpenTickets = exportTickets.filter(t => {
        const priority = normalizePriority(t.prioridade);
        return unresolvedStatuses.includes(t.status) && (priority === 'alta' || priority === 'critica');
      });

      const summaryCards = [
        { label: 'Total', value: exportTickets.length.toString(), color: [31, 41, 55] as [number, number, number] },
        { label: 'Abertos', value: exportTickets.filter(t => t.status === 'aberto').length.toString(), color: [249, 115, 22] as [number, number, number] },
        { label: 'Em atendimento', value: exportTickets.filter(t => t.status === 'em_andamento').length.toString(), color: [37, 99, 235] as [number, number, number] },
        { label: 'Aguardando', value: exportTickets.filter(t => t.status === 'aguardando_resposta').length.toString(), color: [234, 179, 8] as [number, number, number] },
        { label: 'Resolvidos', value: exportTickets.filter(t => t.status === 'resolvido').length.toString(), color: [22, 163, 74] as [number, number, number] },
        { label: 'Fechados', value: exportTickets.filter(t => t.status === 'fechado').length.toString(), color: [100, 116, 139] as [number, number, number] },
        { label: 'Atrasados', value: delayedTickets.length.toString(), color: [220, 38, 38] as [number, number, number] },
        { label: 'Alta/Crítica abertas', value: highPriorityOpenTickets.length.toString(), color: [239, 68, 68] as [number, number, number] },
        { label: 'Satisfação média', value: `${stats.satisfacaoMedia || 0}/5`, color: [234, 179, 8] as [number, number, number] },
        { label: 'Média TI', value: formatDuration(stats.mediaResolucaoTi), color: [37, 99, 235] as [number, number, number] },
        { label: 'Média Manutenção', value: formatDuration(stats.mediaResolucaoManutencao), color: [16, 185, 129] as [number, number, number] },
      ];

      const filtrosResumo: string[] = [];
      if (statusFilter.length > 0) filtrosResumo.push(`Status: ${statusFilter.map(status => statusLabel(status as TicketStatus)).join(', ')}`);
      if (tipoFilter !== 'all') filtrosResumo.push(`Tipo: ${tipoFilter}`);
      if (periodoInicio || periodoFim) {
        const inicio = periodoInicio ? new Date(periodoInicio).toLocaleDateString('pt-BR') : '';
        const fim = periodoFim ? new Date(periodoFim).toLocaleDateString('pt-BR') : '';
        filtrosResumo.push(`Período: ${inicio} - ${fim}`);
      }
      if (setorFilter && setorFilter !== 'all') filtrosResumo.push(`Setor: ${setorFilter}`);
      if (ratingMin && ratingMin > 0) filtrosResumo.push(`Avaliação Mínima: ${ratingMin}`);

      doc.setFillColor(210, 32, 39);
      doc.rect(0, 0, pageWidth, 26, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(17);
      doc.setFont('helvetica', 'bold');
      doc.text('Relatório Operacional de Tickets', marginX, 14);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em: ${dataHora}`, marginX, 21);

      doc.setTextColor(17, 24, 39);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(selectedIds.length > 0 ? 'Escopo: tickets selecionados' : 'Escopo: lista filtrada na tela', marginX, 36);
      doc.setFont('helvetica', 'normal');
      const filtersText = filtrosResumo.length ? filtrosResumo.join(' | ') : 'Sem filtros adicionais aplicados';
      const filterLines = doc.splitTextToSize(filtersText, contentWidth);
      doc.text(filterLines, marginX, 42);

      let currentY = 48 + (filterLines.length - 1) * 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Dashboard resumo', marginX, currentY);
      currentY += 6;

      const cardGap = 4;
      const cardWidth = (contentWidth - cardGap * 2) / 3;
      const cardHeight = 20;
      summaryCards.forEach((card, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const x = marginX + col * (cardWidth + cardGap);
        const y = currentY + row * (cardHeight + 4);

        doc.setDrawColor(card.color[0], card.color[1], card.color[2]);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
        doc.setFillColor(card.color[0], card.color[1], card.color[2]);
        doc.rect(x, y, 2.2, cardHeight, 'F');
        doc.setTextColor(75, 85, 99);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(card.label, x + 5, y + 7);
        doc.setTextColor(17, 24, 39);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(card.value, x + 5, y + 16);
      });

      currentY += Math.ceil(summaryCards.length / 3) * (cardHeight + 4) + 4;

      const statusRows = topRows(countBy(exportTickets, t => statusLabel(t.status)), 10);
      const priorityRows = topRows(countBy(exportTickets, t => priorityLabel(t.prioridade)), 10);
      const areaRows = topRows(countBy(exportTickets, t => t.tipo || 'Não informado'), 10);

      autoTable(doc, {
        startY: currentY,
        head: [['Status', 'Qtd.', '%']],
        body: statusRows,
        theme: 'grid',
        tableWidth: 58,
        margin: { left: marginX },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [37, 99, 235] },
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Prioridade', 'Qtd.', '%']],
        body: priorityRows,
        theme: 'grid',
        tableWidth: 58,
        margin: { left: marginX + 64 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [239, 68, 68] },
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Área', 'Qtd.', '%']],
        body: areaRows,
        theme: 'grid',
        tableWidth: 58,
        margin: { left: marginX + 128 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [16, 185, 129] },
      });

      currentY = Math.max(
        (doc as any).lastAutoTable?.finalY || currentY,
        currentY + 34
      ) + 10;

      const topDelayedRows = riskTickets
        .filter(item => unresolvedStatuses.includes(item.ticket.status))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 8)
        .map(({ ticket, risk }) => [
          ticket.protocolo || ticket.id,
          ticket.titulo,
          ticket.tipo || 'Não informado',
          priorityLabel(ticket.prioridade),
          risk.label,
        ]);

      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('Sinalização de problemas', marginX, currentY);
      currentY += 4;

      autoTable(doc, {
        startY: currentY,
        head: [['Protocolo', 'Título', 'Área', 'Prioridade', 'Sinalização']],
        body: topDelayedRows.length ? topDelayedRows : [['-', 'Nenhum ticket sem resolução encontrado no filtro atual', '-', '-', '-']],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [220, 38, 38] },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 58 },
          2: { cellWidth: 30 },
          3: { cellWidth: 24 },
          4: { cellWidth: 52 },
        },
      });

      currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 10;

      const categoryRows = topRows(countBy(exportTickets, t => t.categoria || 'Não informado'), 8);
      const sectorRows = topRows(countBy(exportTickets, t => t.setor || 'Não informado'), 8);
      const requesterRows = topRows(countBy(exportTickets, t => t.solicitante?.nome || 'Não informado'), 8);

      const ensurePageSpace = (requiredHeight: number) => {
        if (currentY + requiredHeight > pageHeight - 20) {
          doc.addPage();
          currentY = 18;
        }
      };

      ensurePageSpace(70);
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('Distribuições e rankings', marginX, currentY);
      currentY += 4;

      autoTable(doc, {
        startY: currentY,
        head: [['Categoria', 'Qtd.', '%']],
        body: categoryRows,
        theme: 'grid',
        tableWidth: 58,
        margin: { left: marginX },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [31, 41, 55] },
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Setor', 'Qtd.', '%']],
        body: sectorRows,
        theme: 'grid',
        tableWidth: 58,
        margin: { left: marginX + 64 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [31, 41, 55] },
      });

      autoTable(doc, {
        startY: currentY,
        head: [['Solicitante', 'Qtd.', '%']],
        body: requesterRows,
        theme: 'grid',
        tableWidth: 58,
        margin: { left: marginX + 128 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [31, 41, 55] },
      });

      currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 10;

      ensurePageSpace(45);
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('Tickets detalhados', marginX, currentY);
      currentY += 4;

      autoTable(doc, {
        startY: currentY,
        head: [[
          'Protocolo',
          'Título',
          'Status',
          'Prioridade',
          'Área',
          'Categoria',
          'Setor',
          'Solicitante',
          'Abertura',
          'Tempo',
          'Sinalização',
        ]],
        body: exportTickets.map(t => {
          const risk = getRiskInfo(t);
          return [
            t.protocolo || t.id,
            t.titulo,
            statusLabel(t.status),
            priorityLabel(t.prioridade),
            t.tipo || 'Não informado',
            t.categoria || 'Não informado',
            t.setor || 'Não informado',
            t.solicitante?.nome || 'Não informado',
            t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
            getResolutionMetricLabel(t),
            risk.label,
          ];
        }),
        styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
        headStyles: { fillColor: [41, 128, 185], fontSize: 7 },
        columnStyles: {
          0: { cellWidth: 19 },
          1: { cellWidth: 32 },
          2: { cellWidth: 18 },
          3: { cellWidth: 17 },
          4: { cellWidth: 21 },
          5: { cellWidth: 22 },
          6: { cellWidth: 20 },
          7: { cellWidth: 27 },
          8: { cellWidth: 20 },
          9: { cellWidth: 24 },
          10: { cellWidth: 32 },
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const ticket = exportTickets[data.row.index];
          if (!ticket) return;

          if (data.column.index === 2) {
            const colors: Record<TicketStatus, [number, number, number]> = {
              aberto: [249, 115, 22],
              em_andamento: [37, 99, 235],
              aguardando_resposta: [234, 179, 8],
              resolvido: [22, 163, 74],
              fechado: [100, 116, 139],
            };
            data.cell.styles.textColor = colors[ticket.status];
            data.cell.styles.fontStyle = 'bold';
          }

          if (data.column.index === 10) {
            const risk = getRiskInfo(ticket);
            data.cell.styles.textColor = risk.color;
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      const pageCount = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Página ${pageNumber} de ${pageCount}`,
          pageWidth - marginX,
          pageHeight - 8,
          { align: 'right' }
        );
        doc.text('Help Desk - Grupo Astrotur', marginX, pageHeight - 8);
      }

      console.log('[PDF] Relatório operacional adicionado');
      const pad = (n: number) => n.toString().padStart(2, '0');
      const fileName = `relatorio-tickets-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.pdf`;
      doc.save(fileName);
      console.log('[PDF] PDF salvo:', fileName);
    } catch (e) {
      alert('Erro ao exportar PDF: ' + e);
      console.error('[PDF] Erro ao exportar:', e);
    }
  };
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [ratingMin, setRatingMin] = useState<number | undefined>(undefined);
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  const [stats, setStats] = useState({
    novosHoje: 0,
    emAtendimento: 0,
    resolvidos: 0,
    satisfacaoMedia: 0,
    mediaResolucaoTi: null as number | null,
    mediaResolucaoManutencao: null as number | null,
  });

  // Determine team type based on role
  const getTeamType = () => {
    if (role === 'agente_ti') return 'TI';
    if (role === 'agente_manutencao') return 'Manutenção predial';
    return null; // admin sees all
  };
  
  const teamType = getTeamType();
  const teamLabel = role === 'agente_manutencao' ? 'Manutenção' : role === 'agente_ti' ? 'TI' : 'Administrador';

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role === 'solicitante') {
      navigate('/');
    }
  }, [role, authLoading, navigate]);

  useEffect(() => {
    if (user && (role === 'agente_ti' || role === 'agente_manutencao' || role === 'admin')) {
      fetchTickets();
      fetchStats();
    }
  }, [user, role, statusFilter, tipoFilter, periodoInicio, periodoFim, setorFilter]);

  const fetchTickets = async () => {
    try {
      let query = supabase
        .from('tickets')
        .select(`
          id,
          protocolo,
          titulo,
          status,
          prioridade,
          setor,
          tipo,
          categoria,
          created_at,
          resolved_at,
          solicitante_id
        `)
        .order('created_at', { ascending: false });

      // Filter by team type for non-admin roles
      if (teamType) {
        query = query.eq('tipo', teamType);
      } else if (tipoFilter !== 'all') {
        // Admin can filter by type
        query = query.eq('tipo', tipoFilter);
      }

      if (statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }
      
      if (periodoInicio) {
        query = query.gte('created_at', periodoInicio);
      }
      
      if (periodoFim) {
        query = query.lte('created_at', periodoFim + 'T23:59:59');
      }
      
      if (setorFilter !== 'all') {
        query = query.eq('setor', setorFilter);
      }

      const { data: ticketsData, error } = await query.limit(100);

      if (error) throw error;

      // Fetch solicitante profiles separately
      const solicitanteIds = [...new Set(ticketsData?.map(t => t.solicitante_id).filter(Boolean))];
      
      const profilesMap: Record<string, { id: string; nome: string; foto_perfil: string | null }> = {};
      
      if (solicitanteIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nome, foto_perfil')
          .in('id', solicitanteIds);
        
        profilesData?.forEach(p => {
          profilesMap[p.id] = p;
        });
      }

      const ticketsWithSolicitante = ticketsData?.map(t => ({
        ...t,
        solicitante: t.solicitante_id ? profilesMap[t.solicitante_id] || null : null,
      }));

      setTickets(ticketsWithSolicitante as unknown as TicketData[]);
      setSelectedIds([]);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Helper to apply current filters to a base query.
      // Adiciona parâmetro ignoreStatusFilter para ignorar o filtro de status dos cards de estatísticas
      const applyFilters = (baseQuery: TicketStatsQuery, overrideStatusList?: string[], useUpdatedAtForPeriod = false, ignoreStatusFilter = false) => {
        // team/type scoping
        if (teamType) {
          baseQuery = baseQuery.eq('tipo', teamType);
        } else if (tipoFilter !== 'all') {
          baseQuery = baseQuery.eq('tipo', tipoFilter);
        }

        // status: múltipla seleção
        if (!ignoreStatusFilter && statusFilter.length > 0) {
          baseQuery = baseQuery.in('status', statusFilter);
        } else if (overrideStatusList && overrideStatusList.length > 0) {
          baseQuery = baseQuery.in('status', overrideStatusList);
        }

        // setor
        if (setorFilter && setorFilter !== 'all') {
          baseQuery = baseQuery.eq('setor', setorFilter);
        }

        // period filters (created_at by default, optionally use updated_at)
        if (periodoInicio) {
          const field = useUpdatedAtForPeriod ? 'updated_at' : 'created_at';
          baseQuery = baseQuery.gte(field, periodoInicio);
        }
        if (periodoFim) {
          const field = useUpdatedAtForPeriod ? 'updated_at' : 'created_at';
          baseQuery = baseQuery.lte(field, periodoFim + 'T23:59:59');
        }

        return baseQuery;
      };

      // New tickets: if a period is provided use it, otherwise default to today
      let novosBase = supabase.from('tickets').select('*', { count: 'exact', head: true });
      if (periodoInicio || periodoFim) {
        novosBase = applyFilters(novosBase, undefined, false, true);
      } else {
        novosBase = novosBase.gte('created_at', today.toISOString());
        novosBase = applyFilters(novosBase, undefined, false, true);
      }
      const { count: novosHoje } = await novosBase;

      // In progress: sempre filtra apenas pelos status em_andamento e aguardando_resposta
      let emAtendimentoBase = supabase.from('tickets').select('*', { count: 'exact', head: true });
      emAtendimentoBase = applyFilters(emAtendimentoBase, ['em_andamento', 'aguardando_resposta'], false, true);
      const { count: emAtendimento } = await emAtendimentoBase;

      // Resolved: sempre filtra apenas pelos status resolvido e fechado
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      let resolvidosBase = supabase.from('tickets').select('*', { count: 'exact', head: true });
      if (periodoInicio || periodoFim) {
        resolvidosBase = applyFilters(resolvidosBase, ['resolvido', 'fechado'], true, true);
      } else {
        resolvidosBase = resolvidosBase.in('status', ['resolvido', 'fechado']).gte('updated_at', firstDayOfMonth.toISOString());
        resolvidosBase = applyFilters(resolvidosBase, undefined, true, true);
      }
      const { count: resolvidos } = await resolvidosBase;

      // Average satisfaction: respect period if provided, otherwise use month
      let feedbacksQuery = supabase.from('feedbacks').select('nota_satisfacao');
      if (periodoInicio) {
        feedbacksQuery = feedbacksQuery.gte('created_at', periodoInicio);
      } else if (firstDayOfMonth) {
        feedbacksQuery = feedbacksQuery.gte('created_at', firstDayOfMonth.toISOString());
      }
      if (periodoFim) {
        feedbacksQuery = feedbacksQuery.lte('created_at', periodoFim ? periodoFim + 'T23:59:59' : undefined);
      }
      const { data: feedbacks } = await feedbacksQuery;

      const satisfacaoMedia = feedbacks && feedbacks.length > 0
        ? feedbacks.reduce((acc, f) => acc + (f.nota_satisfacao || 0), 0) / feedbacks.length
        : 0;

      const fetchAverageResolution = async (ticketType: 'TI' | 'Manutenção predial') => {
        if (teamType && teamType !== ticketType) return null;
        if (!teamType && tipoFilter !== 'all' && tipoFilter !== ticketType) return null;

        let resolutionQuery = supabase
          .from('tickets')
          .select('created_at, resolved_at')
          .eq('tipo', ticketType)
          .in('status', ['resolvido', 'fechado'])
          .not('resolved_at', 'is', null);

        if (setorFilter && setorFilter !== 'all') {
          resolutionQuery = resolutionQuery.eq('setor', setorFilter);
        }

        if (periodoInicio) {
          resolutionQuery = resolutionQuery.gte('resolved_at', periodoInicio);
        } else {
          resolutionQuery = resolutionQuery.gte('resolved_at', firstDayOfMonth.toISOString());
        }

        if (periodoFim) {
          resolutionQuery = resolutionQuery.lte('resolved_at', periodoFim + 'T23:59:59');
        }

        const { data, error } = await resolutionQuery.limit(1000);
        if (error || !data?.length) return null;

        const durations = data
          .map((ticket) => getDurationMs(ticket.created_at, ticket.resolved_at))
          .filter((duration): duration is number => duration !== null);

        if (!durations.length) return null;

        return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      };

      const [mediaResolucaoTi, mediaResolucaoManutencao] = await Promise.all([
        fetchAverageResolution('TI'),
        fetchAverageResolution('Manutenção predial'),
      ]);

      setStats({
        novosHoje: novosHoje || 0,
        emAtendimento: emAtendimento || 0,
        resolvidos: resolvidos || 0,
        satisfacaoMedia: Math.round(satisfacaoMedia * 10) / 10,
        mediaResolucaoTi,
        mediaResolucaoManutencao,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };
  
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };
  
  const handleSelectAll = () => {
    setSelectedIds(tickets.map(t => t.id));
  };
  
  const handleDeselectAll = () => {
    setSelectedIds([]);
  };
  
  const handleDelete = async () => {
    if (role !== 'admin') {
      toast({
        title: 'Permissão negada',
        description: 'Apenas administradores podem excluir tickets.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .in('id', selectedIds);

      if (error) throw error;

      toast({
        title: 'Tickets excluídos',
        description: `${selectedIds.length} ticket(s) excluído(s) com sucesso`,
      });

      fetchTickets();
      fetchStats();
    } catch (error) {
      console.error('Error deleting tickets:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir os tickets',
        variant: 'destructive',
      });
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <img 
              src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" 
              alt="Grupo Astrotur" 
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">Ticket TI</h1>
              <p className="text-xs text-muted-foreground">Painel do Agente</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4">
            <Badge variant="outline" className="hidden sm:flex gap-1 text-xs">
              {role === 'agente_manutencao' ? (
                <Wrench className="h-3 w-3" />
              ) : role === 'agente_ti' ? (
                <Monitor className="h-3 w-3" />
              ) : null}
              {teamLabel}
            </Badge>
            {role === 'admin' && (
              <>
                <Link to="/gestao">
                  <Button variant="outline" size="sm" className="hidden sm:flex h-8">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    Alta Gestão
                  </Button>
                  <Button variant="outline" size="icon" className="sm:hidden h-8 w-8">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/admin">
                  <Button variant="outline" size="sm" className="hidden sm:flex h-8">
                    <Settings className="mr-2 h-4 w-4" />
                    Admin
                  </Button>
                  <Button variant="outline" size="icon" className="sm:hidden h-8 w-8">
                    <Settings className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
            <ThemeToggle />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-3 sm:px-4 py-4 sm:py-6">
        {/* Stats Cards */}
        <div className="mb-4 sm:mb-6 grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-6">
          <Card className="border-l-4 border-l-status-open">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Abertos</CardDescription>
              <Ticket className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="text-xl sm:text-3xl font-bold">{stats.novosHoje}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-status-in-progress">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Em Atendimento</CardDescription>
              <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="text-xl sm:text-3xl font-bold">{stats.emAtendimento}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-status-resolved">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Resolvidos</CardDescription>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="text-xl sm:text-3xl font-bold">{stats.resolvidos}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-yellow-400 col-span-2 lg:col-span-1">
            <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Satisfação Média</CardDescription>
              <Star className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-3xl font-bold">{stats.satisfacaoMedia}</span>
                <span className="text-xs sm:text-base text-muted-foreground">/5</span>
              </div>
            </CardContent>
          </Card>
          {(role === 'agente_ti' || role === 'admin') && (
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
                <CardDescription className="text-xs sm:text-sm">
                  {role === 'admin' ? 'Média TI' : 'Média Resolução'}
                </CardDescription>
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="text-xl sm:text-3xl font-bold">{formatDuration(stats.mediaResolucaoTi)}</div>
                <p className="mt-1 text-xs text-muted-foreground">resolução</p>
              </CardContent>
            </Card>
          )}
          {(role === 'agente_manutencao' || role === 'admin') && (
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
                <CardDescription className="text-xs sm:text-sm">
                  {role === 'admin' ? 'Média Manutenção' : 'Média Resolução'}
                </CardDescription>
                <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="text-xl sm:text-3xl font-bold">{formatDuration(stats.mediaResolucaoManutencao)}</div>
                <p className="mt-1 text-xs text-muted-foreground">resolução</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tickets List */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-6 py-3 sm:py-4">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl">Tickets</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Gerencie as solicitações de suporte</CardDescription>
            </div>
            <div className="w-full sm:w-auto overflow-x-auto">
              <TicketFilters
                statusFilter={statusFilter}
                onStatusChange={setStatusFilter}
                tipoFilter={tipoFilter}
                onTipoChange={setTipoFilter}
                periodoInicio={periodoInicio}
                onPeriodoInicioChange={setPeriodoInicio}
                periodoFim={periodoFim}
                onPeriodoFimChange={setPeriodoFim}
                setorFilter={setorFilter}
                onSetorChange={setSetorFilter}
                ratingMin={ratingMin}
                onRatingMinChange={setRatingMin}
                showTipoFilter={role === 'admin'} // Only admin can filter by type
                showAdvancedFilters={true}
                onExportPDF={handleExportPDF}
              />
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="mb-3 sm:mb-4">
                <BulkActions
                  selectedIds={selectedIds}
                  totalCount={tickets.length}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  onDelete={handleDelete}
                  isAllSelected={selectedIds.length === tickets.length}
                  allowDelete={role === 'admin'}
                />
              </div>
            )}
            
            {loading ? (
              <div className="space-y-3 sm:space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-3 sm:gap-4">
                    <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded flex-shrink-0" />
                    <div className="flex-1 space-y-2 min-w-0">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-8 sm:py-12 text-center">
                <Ticket className="mx-auto h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground/50" />
                <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-medium">Nenhum ticket encontrado</h3>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground px-2">
                  Não há tickets com o filtro selecionado
                </p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="flex items-start sm:items-center gap-2 sm:gap-4 rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedIds.includes(ticket.id)}
                      onCheckedChange={() => toggleSelection(ticket.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 sm:mt-0 flex-shrink-0"
                    />
                    <Link
                      to={`/workspace/${ticket.id}`}
                      className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0"
                    >
                      <Avatar className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                        <AvatarImage src={ticket.solicitante?.foto_perfil || undefined} />
                        <AvatarFallback className="bg-muted text-xs">
                          {ticket.solicitante?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                            {ticket.protocolo}
                          </span>
                          <Badge className={`${statusConfig[ticket.status].color} text-xs flex-shrink-0`}>
                            {statusConfig[ticket.status].label}
                          </Badge>
                          <Badge className={`${priorityColors[ticket.prioridade]} text-xs flex-shrink-0`}>
                            {ticket.prioridade.charAt(0).toUpperCase() + ticket.prioridade.slice(1)}
                          </Badge>
                          {ticket.tipo && (
                            <Badge variant="outline" className="text-xs hidden sm:flex flex-shrink-0">
                              {ticket.tipo === 'Manutenção predial' ? (
                                <><Wrench className="mr-1 h-3 w-3" />Manutenção</>
                              ) : (
                                <><Monitor className="mr-1 h-3 w-3" />{ticket.tipo}</>
                              )}
                            </Badge>
                          )}
                          {unresolvedStatuses.includes(ticket.status) && (
                            <Badge className={`${getUnresolvedBadgeClass(ticket)} text-xs flex-shrink-0`}>
                              {getResolutionMetricLabel(ticket)}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 font-medium text-sm line-clamp-1">{ticket.titulo}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1 sm:gap-2 text-xs text-muted-foreground">
                          <span className="line-clamp-1">{ticket.solicitante?.nome || 'Usuário'}</span>
                          {ticket.categoria && <span className="hidden xs:inline">• {ticket.categoria}</span>}
                          {ticket.setor && <span className="hidden sm:inline">• {ticket.setor}</span>}
                          <span className="hidden xs:inline">• {format(new Date(ticket.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</span>
                          <span className="xs:hidden">{format(new Date(ticket.created_at), "dd/MM", { locale: ptBR })}</span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      {/* Floating Action Button for agents */}
      <Link
        to="/novo-ticket"
        className="fixed bottom-6 right-4 sm:right-6 z-50"
      >
        <Button 
          size="lg" 
          className="h-12 sm:h-14 gap-2 rounded-full px-4 sm:px-6 shadow-lg transition-transform hover:scale-105 text-sm sm:text-base"
        >
          <Plus className="h-5 w-5 flex-shrink-0" />
          <span className="hidden sm:inline">Novo Ticket</span>
        </Button>
      </Link>
    </div>
  );
}
