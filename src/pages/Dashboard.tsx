import { useEffect, useMemo, useState } from 'react';
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
  BarChart3,
  PackageSearch
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import { BulkActions } from '@/components/tickets/BulkActions';
import { AppHeader } from '@/components/AppHeader';
import { TicketSearch } from '@/components/tickets/TicketSearch';
import { matchesTicketSearch } from '@/lib/ticketSearch';

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
  closed_at: string | null;
  service_started_at: string | null;
  service_finished_at: string | null;
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

const isValidDateInput = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());

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
  const { user, role, managementReportAccess, assetAccess, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);


  // HOOKS DE ESTADO
  const [tipoFilter, setTipoFilter] = useState('all');
  const [setorFilter, setSetorFilter] = useState<string>('all');

  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus[]>([]);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [fechadoInicio, setFechadoInicio] = useState('');
  const [fechadoFim, setFechadoFim] = useState('');
  const [ratingMin, setRatingMin] = useState<number | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visibleTickets = useMemo(() => {
    return tickets.filter((ticket) => matchesTicketSearch([
        ticket.protocolo,
        ticket.titulo,
        ticket.solicitante?.nome,
        ticket.setor,
        ticket.categoria,
        ticket.tipo,
        ticket.prioridade,
        ticket.status,
        statusConfig[ticket.status]?.label,
      ], searchQuery));
  }, [searchQuery, tickets]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSelectedIds([]);
  };

  const getClosedPeriodError = () => {
    if ((fechadoInicio && !isValidDateInput(fechadoInicio)) || (fechadoFim && !isValidDateInput(fechadoFim))) {
      return 'Informe datas de fechamento válidas.';
    }

    if (fechadoInicio && fechadoFim && new Date(`${fechadoInicio}T00:00:00`) > new Date(`${fechadoFim}T00:00:00`)) {
      return 'A data inicial de fechamento não pode ser maior que a data final.';
    }

    return '';
  };

  const handleOpenTicketReport = () => {
    const closedPeriodError = getClosedPeriodError();
    if (closedPeriodError) {
      toast({
        title: 'Filtro de fechamento inválido',
        description: closedPeriodError,
        variant: 'destructive',
      });
      return;
    }

    const params = new URLSearchParams();

    if (statusFilter.length > 0) params.set('status', statusFilter.join(','));
    if (tipoFilter !== 'all') params.set('tipo', tipoFilter);
    if (periodoInicio) params.set('periodoInicio', periodoInicio);
    if (periodoFim) params.set('periodoFim', periodoFim);
    if (fechadoInicio) params.set('fechadoInicio', fechadoInicio);
    if (fechadoFim) params.set('fechadoFim', fechadoFim);
    if (setorFilter && setorFilter !== 'all') params.set('setor', setorFilter);

    navigate(`/relatorios/tickets${params.toString() ? `?${params.toString()}` : ''}`);
  };
  
  const [stats, setStats] = useState({
    novosHoje: 0,
    emAtendimento: 0,
    resolvidos: 0,
    satisfacaoMedia: 0,
    mediaResolucaoTi: null as number | null,
    mediaResolucaoManutencao: null as number | null,
    mediaExecucaoTi: null as number | null,
    mediaExecucaoManutencao: null as number | null,
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
      const closedPeriodError = getClosedPeriodError();
      if (closedPeriodError) {
        setTickets([]);
        setLoading(false);
        toast({
          title: 'Filtro de fechamento inválido',
          description: closedPeriodError,
          variant: 'destructive',
        });
        return;
      }

      fetchTickets();
      fetchStats();
    }
  }, [user, role, statusFilter, tipoFilter, periodoInicio, periodoFim, fechadoInicio, fechadoFim, setorFilter]);

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
          closed_at,
          service_started_at,
          service_finished_at,
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

      if (fechadoInicio) {
        query = query.gte('closed_at', fechadoInicio);
      }

      if (fechadoFim) {
        query = query.lte('closed_at', fechadoFim + 'T23:59:59');
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

        if (fechadoInicio) {
          baseQuery = baseQuery.gte('closed_at', fechadoInicio);
        }

        if (fechadoFim) {
          baseQuery = baseQuery.lte('closed_at', fechadoFim + 'T23:59:59');
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
          .select('created_at, resolved_at, closed_at')
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

        if (fechadoInicio) {
          resolutionQuery = resolutionQuery.gte('closed_at', fechadoInicio);
        }

        if (fechadoFim) {
          resolutionQuery = resolutionQuery.lte('closed_at', fechadoFim + 'T23:59:59');
        }

        const { data, error } = await resolutionQuery.limit(1000);
        if (error || !data?.length) return null;

        const durations = data
          .map((ticket) => getDurationMs(ticket.created_at, ticket.resolved_at))
          .filter((duration): duration is number => duration !== null);

        if (!durations.length) return null;

        return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      };

      const fetchAverageExecution = async (ticketType: 'TI' | 'Manutenção predial') => {
        if (teamType && teamType !== ticketType) return null;
        if (!teamType && tipoFilter !== 'all' && tipoFilter !== ticketType) return null;

        let executionQuery = supabase
          .from('tickets')
          .select('service_started_at, service_finished_at, closed_at')
          .eq('tipo', ticketType)
          .not('service_started_at', 'is', null)
          .not('service_finished_at', 'is', null);

        if (setorFilter && setorFilter !== 'all') {
          executionQuery = executionQuery.eq('setor', setorFilter);
        }

        if (periodoInicio) {
          executionQuery = executionQuery.gte('service_finished_at', periodoInicio);
        } else {
          executionQuery = executionQuery.gte('service_finished_at', firstDayOfMonth.toISOString());
        }

        if (periodoFim) {
          executionQuery = executionQuery.lte('service_finished_at', periodoFim + 'T23:59:59');
        }

        if (fechadoInicio) {
          executionQuery = executionQuery.gte('closed_at', fechadoInicio);
        }

        if (fechadoFim) {
          executionQuery = executionQuery.lte('closed_at', fechadoFim + 'T23:59:59');
        }

        const { data, error } = await executionQuery.limit(1000);
        if (error || !data?.length) return null;

        const durations = data
          .map((ticket) => getDurationMs(ticket.service_started_at, ticket.service_finished_at))
          .filter((duration): duration is number => duration !== null);

        if (!durations.length) return null;

        return durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
      };

      const [mediaResolucaoTi, mediaResolucaoManutencao, mediaExecucaoTi, mediaExecucaoManutencao] = await Promise.all([
        fetchAverageResolution('TI'),
        fetchAverageResolution('Manutenção predial'),
        fetchAverageExecution('TI'),
        fetchAverageExecution('Manutenção predial'),
      ]);

      setStats({
        novosHoje: novosHoje || 0,
        emAtendimento: emAtendimento || 0,
        resolvidos: resolvidos || 0,
        satisfacaoMedia: Math.round(satisfacaoMedia * 10) / 10,
        mediaResolucaoTi,
        mediaResolucaoManutencao,
        mediaExecucaoTi,
        mediaExecucaoManutencao,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };
  
  const handleSelectAll = () => {
    setSelectedIds(visibleTickets.map(t => t.id));
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
      <AppHeader title="Painel do Agente" subtitle="Atendimento e acompanhamento operacional" badge={teamLabel} />

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
          <CardHeader className="flex flex-col gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl">Tickets</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {searchQuery
                  ? `${visibleTickets.length} de ${tickets.length} tickets encontrados`
                  : 'Gerencie as solicitações de suporte'}
              </CardDescription>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
              <TicketSearch
                value={searchQuery}
                onChange={handleSearchChange}
                className="w-full lg:max-w-xl"
              />
              <div className="w-full overflow-x-auto lg:w-auto lg:flex-shrink-0">
                <TicketFilters
                  statusFilter={statusFilter}
                  onStatusChange={setStatusFilter}
                  tipoFilter={tipoFilter}
                  onTipoChange={setTipoFilter}
                  periodoInicio={periodoInicio}
                  onPeriodoInicioChange={setPeriodoInicio}
                  periodoFim={periodoFim}
                  onPeriodoFimChange={setPeriodoFim}
                  fechadoInicio={fechadoInicio}
                  onFechadoInicioChange={setFechadoInicio}
                  fechadoFim={fechadoFim}
                  onFechadoFimChange={setFechadoFim}
                  setorFilter={setorFilter}
                  onSetorChange={setSetorFilter}
                  ratingMin={ratingMin}
                  onRatingMinChange={setRatingMin}
                  showTipoFilter={role === 'admin'}
                  showAdvancedFilters={true}
                  onExportPDF={handleOpenTicketReport}
                  exportLabel="Gerar Relatório"
                  exportTitle="Gerar prévia do relatório operacional"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
              <div className="mb-3 sm:mb-4">
                <BulkActions
                  selectedIds={selectedIds}
                  totalCount={visibleTickets.length}
                  onSelectAll={handleSelectAll}
                  onDeselectAll={handleDeselectAll}
                  onDelete={handleDelete}
                  isAllSelected={visibleTickets.length > 0 && selectedIds.length === visibleTickets.length}
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
            ) : visibleTickets.length === 0 ? (
              <div className="py-8 sm:py-12 text-center">
                <Ticket className="mx-auto h-10 sm:h-12 w-10 sm:w-12 text-muted-foreground/50" />
                <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-medium">
                  {searchQuery ? 'Nenhum resultado para esta pesquisa' : 'Nenhum ticket encontrado'}
                </h3>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground px-2">
                  {searchQuery ? 'Tente outro protocolo, título, nome ou termo.' : 'Não há tickets com o filtro selecionado'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {visibleTickets.map((ticket) => (
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
