import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import { 
  Plus, 
  Ticket, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  User,
  Loader2,
  Monitor,
  Wrench
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TicketFilters } from '@/components/tickets/TicketFilters';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BulkActions } from '@/components/tickets/BulkActions';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: string;
  tipo: string | null;
  categoria: string | null;
  created_at: string;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white', icon: <AlertCircle className="h-4 w-4" /> },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white', icon: <Clock className="h-4 w-4" /> },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-status-waiting text-white', icon: <Clock className="h-4 w-4" /> },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function Index() {
  const { user, profile, role, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<TicketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    abertos: 0,
    emAndamento: 0,
    resolvidos: 0,
  });
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<TicketStatus[]>([]);
  const [tipoFilter, setTipoFilter] = useState('all');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  
  // Selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role) {
      if (role === 'agente_ti' || role === 'agente_manutencao' || role === 'admin') {
        navigate('/dashboard');
      }
    }
  }, [role, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, statusFilter, tipoFilter, periodoInicio, periodoFim]);

  const fetchTickets = async () => {
    try {
      let query = supabase
        .from('tickets')
        .select('id, protocolo, titulo, status, prioridade, tipo, categoria, created_at')
        .eq('solicitante_id', user?.id)
        .order('created_at', { ascending: false });

      if (statusFilter.length > 0) {
        query = query.in('status', statusFilter);
      }
      
      if (tipoFilter !== 'all') {
        query = query.eq('tipo', tipoFilter);
      }
      
      if (periodoInicio) {
        query = query.gte('created_at', periodoInicio);
      }
      
      if (periodoFim) {
        query = query.lte('created_at', periodoFim + 'T23:59:59');
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      const ticketsData = (data || []) as TicketData[];
      setTickets(ticketsData);

      // Calculate stats
      const abertos = ticketsData.filter(t => t.status === 'aberto').length;
      const emAndamento = ticketsData.filter(t => ['em_andamento', 'aguardando_resposta'].includes(t.status)).length;
      const resolvidos = ticketsData.filter(t => ['resolvido', 'fechado'].includes(t.status)).length;
      setStats({ abertos, emAndamento, resolvidos });
      
      // Clear selections
      setSelectedIds([]);
    } catch (error) {
      console.error('Error fetching tickets:', error);
    } finally {
      setLoading(false);
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

  // Função para exportar PDF
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
      doc.setFontSize(16);
      doc.text('Relatório de Tickets', 14, 16);
      doc.setFontSize(10);
      const now = new Date();
      const dataHora = now.toLocaleString('pt-BR');
      doc.text(`Gerado em: ${dataHora}`, 14, 22);
      let filtrosResumo = [];
      if (statusFilter.length > 0) filtrosResumo.push(`Status: ${statusFilter.join(', ')}`);
      if (tipoFilter !== 'all') filtrosResumo.push(`Tipo: ${tipoFilter}`);
      if (periodoInicio || periodoFim) {
        const inicio = periodoInicio ? new Date(periodoInicio).toLocaleDateString('pt-BR') : '';
        const fim = periodoFim ? new Date(periodoFim).toLocaleDateString('pt-BR') : '';
        filtrosResumo.push(`Período: ${inicio} - ${fim}`);
      }
      doc.text(filtrosResumo.join(' | '), 14, 28);
      console.log('[PDF] Cabeçalho e filtros adicionados');
      autoTable(doc, {
        startY: 34,
        head: [[
          'ID',
          'Título',
          'Status',
          'Tipo',
          'Setor',
          'Data de Abertura',
          'Responsável',
        ]],
        body: exportTickets.map(t => [
          t.protocolo || t.id,
          t.titulo,
          t.status,
          t.tipo || '',
          t.categoria || '',
          t.created_at ? new Date(t.created_at).toLocaleDateString('pt-BR') : '',
          profile?.nome || 'Usuário',
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [41, 128, 185] },
      });
      console.log('[PDF] Tabela adicionada');
      const pad = (n) => n.toString().padStart(2, '0');
      const fileName = `relatorio-tickets-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}.pdf`;
      doc.save(fileName);
      alert('PDF gerado! Verifique sua pasta de downloads ou pop-up.');
      console.log('[PDF] PDF salvo:', fileName);
    } catch (e) {
      alert('Erro ao exportar PDF: ' + e);
      console.error('[PDF] Erro ao exportar:', e);
    }
  };

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
              <p className="text-xs text-muted-foreground">Help Desk</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4">
            <ThemeToggle />
            <NotificationBell />
            <div className="flex items-center gap-1 sm:gap-2">
              <Avatar className="h-7 sm:h-8 w-7 sm:w-8">
                <AvatarImage src={profile?.foto_perfil || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {profile?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:block truncate">
                <p className="text-xs sm:text-sm font-medium truncate">{profile?.nome || 'Usuário'}</p>
                <p className="text-xs text-muted-foreground truncate">{profile?.setor || ''}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-3 sm:px-4 py-4 sm:py-6">
        {/* Stats Cards */}
        <div className="mb-4 sm:mb-6 grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3">
          <Card className="border-l-4 border-l-status-open">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Tickets Abertos</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl">{stats.abertos}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-status-in-progress">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Em Andamento</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl">{stats.emAndamento}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-l-4 border-l-status-resolved col-span-2 sm:col-span-1">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-4">
              <CardDescription className="text-xs sm:text-sm">Resolvidos</CardDescription>
              <CardTitle className="text-2xl sm:text-3xl">{stats.resolvidos}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tickets List */}
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-6 py-3 sm:py-4">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl">Meus Tickets</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Suas solicitações recentes</CardDescription>
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
                showTipoFilter={true}
                showAdvancedFilters={false}
                onExportPDF={handleExportPDF}
                disableExportPDF={tickets.length === 0}
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
                />
              </div>
            )}
            
            {loading ? (
              <div className="space-y-3 sm:space-y-4">
                {[1, 2, 3].map((i) => (
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
                <h3 className="mt-3 sm:mt-4 text-base sm:text-lg font-medium">Nenhum ticket ainda</h3>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-muted-foreground px-2">
                  Clique no botão abaixo para abrir sua primeira solicitação
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
                      to={`/ticket/${ticket.id}`}
                      className="flex flex-1 flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0"
                    >
                      <div className="flex h-9 sm:h-10 w-9 sm:w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                        {ticket.tipo === 'Manutenção predial' ? (
                          <Wrench className="h-4 sm:h-5 w-4 sm:w-5 text-primary" />
                        ) : (
                          <Monitor className="h-4 sm:h-5 w-4 sm:w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
                            {ticket.protocolo}
                          </span>
                          <Badge className={`${statusConfig[ticket.status].color} text-xs flex-shrink-0`}>
                            {statusConfig[ticket.status].icon}
                            <span className="ml-1 hidden xs:inline">{statusConfig[ticket.status].label}</span>
                          </Badge>
                          {ticket.tipo && (
                            <Badge variant="outline" className="text-xs hidden sm:flex flex-shrink-0">
                              {ticket.tipo === 'Manutenção predial' ? 'Manutenção' : ticket.tipo}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 font-medium text-sm line-clamp-1">{ticket.titulo}</p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {ticket.categoria && `${ticket.categoria} • `}
                          {format(new Date(ticket.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Floating Action Button */}
      <Link
        to="/novo-ticket"
        className="fixed bottom-6 right-4 sm:right-6 z-50"
      >
        <Button 
          size="lg" 
          className="h-12 sm:h-14 gap-2 rounded-full px-4 sm:px-6 shadow-lg transition-transform hover:scale-105 text-sm sm:text-base"
        >
          <Plus className="h-5 w-5 flex-shrink-0" />
          <span className="hidden sm:inline">Solicitar Suporte</span>
        </Button>
      </Link>
    </div>
  );
}
