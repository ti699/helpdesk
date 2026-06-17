import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, BarChart3, Clock, Download, Loader2, Star, Ticket, TriangleAlert } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AccountMenu } from '@/components/AccountMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
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

interface ManagementTicket {
  id: string;
  status: TicketStatus | null;
  tipo: string | null;
  categoria: string | null;
  setor: string | null;
  created_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
}

interface FeedbackRow {
  nota_satisfacao: number | null;
}

const unresolvedStatuses: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_resposta'];

const getDurationMs = (start?: string | null, end?: string | null) => {
  if (!start) return null;
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return null;
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

const isTicketOverdue = (ticket: ManagementTicket) => {
  if (!ticket.status || !unresolvedStatuses.includes(ticket.status)) return false;
  const duration = getDurationMs(ticket.created_at) || 0;
  const hours = duration / 3600000;
  return ticket.tipo === 'Manutenção predial' ? hours >= 96 : hours >= 48;
};

const averageResolution = (tickets: ManagementTicket[], ticketType: TicketType) => {
  const durations = tickets
    .filter((ticket) => ticket.tipo === ticketType && ticket.resolved_at)
    .map((ticket) => getDurationMs(ticket.created_at, ticket.resolved_at))
    .filter((duration): duration is number => duration !== null);

  if (!durations.length) return null;
  return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
};

const countBy = (tickets: ManagementTicket[], key: 'categoria' | 'setor') => {
  const map = new Map<string, number>();
  tickets.forEach((ticket) => {
    const label = ticket[key] || 'Não informado';
    map.set(label, (map.get(label) || 0) + 1);
  });

  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
};

export default function ExecutiveDashboard() {
  const { user, role, managementReportAccess, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<ManagementTicket[]>([]);
  const [feedbacks, setFeedbacks] = useState<FeedbackRow[]>([]);
  const [tipoFilter, setTipoFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodoInicio, setPeriodoInicio] = useState(() => {
    const now = new Date();
    return format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  });
  const [periodoFim, setPeriodoFim] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const hasExecutiveAccess = role === 'admin' || managementReportAccess;

  useEffect(() => {
    if (!authLoading && role && !hasExecutiveAccess) {
      navigate('/dashboard');
    }
  }, [role, hasExecutiveAccess, authLoading, navigate]);

  useEffect(() => {
    if (user && hasExecutiveAccess) {
      fetchManagementData();
    }
  }, [user, hasExecutiveAccess, tipoFilter, statusFilter, periodoInicio, periodoFim]);

  const fetchManagementData = async () => {
    setLoading(true);
    try {
      let ticketQuery = supabase
        .from('tickets')
        .select('id, status, tipo, categoria, setor, created_at, resolved_at, closed_at')
        .gte('created_at', periodoInicio)
        .lte('created_at', periodoFim + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (tipoFilter !== 'all') {
        ticketQuery = ticketQuery.eq('tipo', tipoFilter);
      }

      if (statusFilter !== 'all') {
        ticketQuery = ticketQuery.eq('status', statusFilter);
      }

      const [{ data: ticketData, error: ticketError }, { data: feedbackData, error: feedbackError }] = await Promise.all([
        ticketQuery,
        supabase
          .from('feedbacks')
          .select('nota_satisfacao')
          .gte('created_at', periodoInicio)
          .lte('created_at', periodoFim + 'T23:59:59')
          .limit(2000),
      ]);

      if (ticketError) throw ticketError;
      if (feedbackError) throw feedbackError;

      setTickets((ticketData || []) as ManagementTicket[]);
      setFeedbacks((feedbackData || []) as FeedbackRow[]);
    } catch (error) {
      console.error('Erro ao carregar dashboard executivo:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const total = tickets.length;
    const abertos = tickets.filter((ticket) => ticket.status === 'aberto').length;
    const emAtendimento = tickets.filter((ticket) => ticket.status === 'em_andamento' || ticket.status === 'aguardando_resposta').length;
    const resolvidos = tickets.filter((ticket) => ticket.status === 'resolvido').length;
    const fechados = tickets.filter((ticket) => ticket.status === 'fechado').length;
    const semResolucao = tickets.filter((ticket) => ticket.status && unresolvedStatuses.includes(ticket.status)).length;
    const atrasados = tickets.filter(isTicketOverdue).length;
    const notas = feedbacks.map((feedback) => feedback.nota_satisfacao || 0).filter(Boolean);
    const satisfacaoMedia = notas.length ? notas.reduce((sum, nota) => sum + nota, 0) / notas.length : 0;

    return {
      total,
      abertos,
      emAtendimento,
      resolvidos,
      fechados,
      semResolucao,
      atrasados,
      satisfacaoMedia: Math.round(satisfacaoMedia * 10) / 10,
      mediaTi: averageResolution(tickets, 'TI'),
      mediaManutencao: averageResolution(tickets, 'Manutenção predial'),
      categorias: countBy(tickets, 'categoria'),
      setores: countBy(tickets, 'setor'),
    };
  }, [tickets, feedbacks]);

  const areaData = [
    {
      area: 'TI',
      total: tickets.filter((ticket) => ticket.tipo === 'TI').length,
      atrasados: tickets.filter((ticket) => ticket.tipo === 'TI' && isTicketOverdue(ticket)).length,
    },
    {
      area: 'Manutenção',
      total: tickets.filter((ticket) => ticket.tipo === 'Manutenção predial').length,
      atrasados: tickets.filter((ticket) => ticket.tipo === 'Manutenção predial' && isTicketOverdue(ticket)).length,
    },
  ];

  const handleExportPDF = () => {
    const doc = new jsPDF();
    const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const areaLabel = tipoFilter === 'all' ? 'Todas' : tipoFilter === 'Manutenção predial' ? 'Manutenção' : tipoFilter;
    const statusLabel = statusFilter === 'all' ? 'Todos' : statusFilter.replaceAll('_', ' ');

    doc.setFontSize(16);
    doc.text('Relatório Alta Gestão - Help Desk Astrotur', 14, 18);
    doc.setFontSize(10);
    doc.text(`Emitido em ${generatedAt}`, 14, 26);
    doc.text(`Período: ${format(new Date(periodoInicio), 'dd/MM/yyyy')} até ${format(new Date(periodoFim), 'dd/MM/yyyy')}`, 14, 32);
    doc.text(`Área: ${areaLabel} | Status: ${statusLabel}`, 14, 38);

    autoTable(doc, {
      startY: 46,
      head: [['Indicador', 'Valor']],
      body: [
        ['Total de tickets', stats.total],
        ['Abertos', stats.abertos],
        ['Em atendimento', stats.emAtendimento],
        ['Resolvidos', stats.resolvidos],
        ['Fechados', stats.fechados],
        ['Sem resolução', stats.semResolucao],
        ['Atrasados', stats.atrasados],
        ['Satisfação média', `${stats.satisfacaoMedia || 0}/5`],
        ['Tempo médio TI', formatDuration(stats.mediaTi)],
        ['Tempo médio Manutenção', formatDuration(stats.mediaManutencao)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [211, 47, 47] },
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY
        ? (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
        : 120,
      head: [['Área', 'Total', 'Atrasados']],
      body: areaData.map((area) => [area.area, area.total, area.atrasados]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [37, 99, 235] },
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10,
      head: [['Ranking por categoria', 'Quantidade']],
      body: stats.categorias.length
        ? stats.categorias.map((row) => [row.label, row.count])
        : [['Sem dados no período', 0]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [51, 65, 85] },
    });

    autoTable(doc, {
      startY: (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10,
      head: [['Ranking por setor solicitante', 'Quantidade']],
      body: stats.setores.length
        ? stats.setores.map((row) => [row.label, row.count])
        : [['Sem dados no período', 0]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [51, 65, 85] },
    });

    doc.save(`relatorio-alta-gestao-${format(new Date(), 'yyyy-MM-dd-HHmm')}.pdf`);
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasExecutiveAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <img
              src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png"
              alt="Grupo Astrotur"
              className="h-8 sm:h-10 object-contain"
            />
            <div className="hidden sm:block min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold truncate">Alta Gestão</h1>
              <p className="text-xs text-muted-foreground">Indicadores executivos de suporte</p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            <Badge variant="outline" className="hidden sm:flex bg-primary/10 text-primary border-primary/20">
              {role === 'admin' ? 'Administrador' : 'Alta Gestão'}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="hidden sm:flex">
              <Download className="mr-2 h-4 w-4" />
              Exportar PDF
            </Button>
            <ThemeToggle />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Filtros executivos
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="sm:hidden">
                <Download className="mr-2 h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
            <CardDescription>Indicadores calculados pelo período de abertura dos tickets.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="date" value={periodoInicio} onChange={(event) => setPeriodoInicio(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="date" value={periodoFim} onChange={(event) => setPeriodoFim(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Área</Label>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="TI">TI</SelectItem>
                  <SelectItem value="Manutenção predial">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="em_andamento">Em andamento</SelectItem>
                  <SelectItem value="aguardando_resposta">Aguardando resposta</SelectItem>
                  <SelectItem value="resolvido">Resolvido</SelectItem>
                  <SelectItem value="fechado">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Tickets no período" value={stats.total} icon={<Ticket className="h-4 w-4" />} />
          <MetricCard title="Sem resolução" value={stats.semResolucao} icon={<Clock className="h-4 w-4" />} />
          <MetricCard title="Atrasados" value={stats.atrasados} icon={<TriangleAlert className="h-4 w-4" />} tone="danger" />
          <MetricCard title="Satisfação média" value={`${stats.satisfacaoMedia || '0'}/5`} icon={<Star className="h-4 w-4" />} tone="warning" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="Abertos" value={stats.abertos} icon={<Ticket className="h-4 w-4" />} />
          <MetricCard title="Em atendimento" value={stats.emAtendimento} icon={<Clock className="h-4 w-4" />} />
          <MetricCard title="Resolvidos" value={stats.resolvidos} icon={<Ticket className="h-4 w-4" />} />
          <MetricCard title="Fechados" value={stats.fechados} icon={<Ticket className="h-4 w-4" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Tempo médio de resolução</CardTitle>
              <CardDescription>Baseado em `resolved_at - created_at`.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">TI</p>
                <p className="mt-2 text-3xl font-bold">{formatDuration(stats.mediaTi)}</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-sm text-muted-foreground">Manutenção</p>
                <p className="mt-2 text-3xl font-bold">{formatDuration(stats.mediaManutencao)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comparação por área</CardTitle>
              <CardDescription>Volume total e chamados atrasados.</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={areaData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="area" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#2563eb" name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="atrasados" fill="#dc2626" name="Atrasados" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <RankingTable title="Categorias com mais chamados" rows={stats.categorias} total={stats.total} />
          <RankingTable title="Setores solicitantes" rows={stats.setores} total={stats.total} />
        </div>

        <p className="text-xs text-muted-foreground">
          Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
        </p>
      </main>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  tone?: 'default' | 'danger' | 'warning';
}) {
  const toneClass = tone === 'danger' ? 'border-l-red-500' : tone === 'warning' ? 'border-l-yellow-500' : 'border-l-primary';

  return (
    <Card className={`border-l-4 ${toneClass}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{title}</CardDescription>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RankingTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<{ label: string; count: number }>;
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Top ocorrências no período filtrado.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="w-24 text-right">Qtd.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Sem dados no período
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell>
                    <div className="space-y-2">
                      <span className="font-medium">{row.label}</span>
                      <Progress value={total > 0 ? (row.count / total) * 100 : 0} className="h-2" />
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{row.count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
