import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AccountMenu } from '@/components/AccountMenu';
import { 
  ArrowLeft, 
  Send, 
  FileText, 
  Play,
  Pause,
  User,
  Loader2,
  Phone,
  Building,
  Mail,
  Settings2,
  CalendarClock,
  CheckCircle2,
  TimerReset,
  UserRoundCog
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getSignedUrl, getSignedUrls } from '@/lib/storage';
import { addTicketMessage, finishTicketService, startTicketService, updateTicketStatus } from '@/lib/ticketActions';

type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';
type TicketPriority = 'baixa' | 'media' | 'alta' | 'critica';

const statusConfig: Record<TicketStatus, { label: string; color: string }> = {
  aberto: { label: 'Aberto', color: 'bg-blue-500 text-white' },
  em_andamento: { label: 'Em Andamento', color: 'bg-yellow-500 text-white' },
  aguardando_resposta: { label: 'Aguardando Resposta', color: 'bg-purple-500 text-white' },
  resolvido: { label: 'Resolvido', color: 'bg-green-500 text-white' },
  fechado: { label: 'Fechado', color: 'bg-gray-500 text-white' },
};

const priorityConfig: Record<TicketPriority, { label: string; color: string }> = {
  baixa: { label: 'Baixa', color: 'bg-green-500 text-white' },
  media: { label: 'Média', color: 'bg-yellow-500 text-white' },
  alta: { label: 'Alta', color: 'bg-orange-500 text-white' },
  critica: { label: 'Crítica', color: 'bg-red-500 text-white' },
};

const isSameCalendarDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const getDayLabel = (date: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameCalendarDay(date, today)) return 'Hoje';
  if (isSameCalendarDay(date, yesterday)) return 'Ontem';
  return format(date, 'dd/MM/yyyy', { locale: ptBR });
};

const toDateTimeLocal = (date = new Date()) => {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const dateTimeLocalToIso = (value: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const getDurationMs = (start?: string | null, end?: string | null) => {
  if (!start || !end) return null;
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) return null;
  return endTime - startTime;
};

const formatDuration = (durationMs: number | null) => {
  if (durationMs === null) return 'Sem dados';
  const totalMinutes = Math.max(1, Math.floor(durationMs / 60000));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (totalHours < 1) return `${totalMinutes}min`;
  if (days < 1) return minutes > 0 ? `${totalHours}h ${minutes}min` : `${totalHours}h`;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
};

// Interface completa
interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: TicketPriority;
  tipo: string | null;
  setor: string | null;
  anexos: {
    imagens: string[];
    arquivos: string[];
    audio: string | null;
  };
  created_at: string;
  service_started_at: string | null;
  service_finished_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  agente_id: string | null;
  solicitante: {
    id: string;
    nome: string;
    email: string;
    telefone: string | null;
    funcao: string | null;
    setor: string | null;
    foto_perfil: string | null;
  } | null;
}

interface ServiceExecutor {
  id: string;
  name: string;
  specialty: string;
  area: string;
  active: boolean;
}

interface ServiceSession {
  id: string;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  executors: ServiceExecutor[];
}

interface Interaction {
  id: string;
  mensagem: string | null;
  tipo: string;
  created_at: string;
  autor_id: string | null; // <--- ADICIONADO AQUI PARA CORRIGIR O ERRO
  autor: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
}

export default function TicketWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [serviceExecutors, setServiceExecutors] = useState<ServiceExecutor[]>([]);
  const [serviceSessions, setServiceSessions] = useState<ServiceSession[]>([]);
  const [selectedExecutorIds, setSelectedExecutorIds] = useState<string[]>([]);
  const [serviceStartedAt, setServiceStartedAt] = useState(toDateTimeLocal());
  const [serviceFinishedAt, setServiceFinishedAt] = useState(toDateTimeLocal());
  const [serviceNotes, setServiceNotes] = useState('');
  const [updatingService, setUpdatingService] = useState(false);
  const [signedUrls, setSignedUrls] = useState<{ imagens: any[], arquivos: any[], audio: any }>({ imagens: [], arquivos: [], audio: null });
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchTicket();
      fetchInteractions();
      fetchServiceSessions();
    }
  }, [id]);

  useEffect(() => {
    if (ticket?.tipo) {
      fetchServiceExecutors(ticket.tipo);
    }
  }, [ticket?.tipo]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions]);

  // Carrega URLs assinadas (segurança dos anexos)
  useEffect(() => {
    const loadUrls = async () => {
      if (!ticket?.anexos) return;
      const [imagens, arquivos, audio] = await Promise.all([
        getSignedUrls(ticket.anexos.imagens || []),
        getSignedUrls(ticket.anexos.arquivos || []),
        ticket.anexos.audio ? getSignedUrl(ticket.anexos.audio) : null,
      ]);
      setSignedUrls({ imagens, arquivos, audio });
    };
    loadUrls();
  }, [ticket]);

  // Real-time: Atualiza chat sozinho
  useEffect(() => {
    if (!id) return;
    const channel = supabase.channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions', filter: `ticket_id=eq.${id}` }, 
      () => fetchInteractions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchTicket = async () => {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select(`
          *,
          solicitante:profiles!tickets_solicitante_id_fkey(
            id, nome, email, telefone, funcao, setor, foto_perfil
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setTicket(data as unknown as TicketData);
      if ((data as any).service_started_at) {
        setServiceStartedAt(toDateTimeLocal(new Date((data as any).service_started_at)));
      }
      setServiceFinishedAt(toDateTimeLocal());
    } catch (error) {
      console.error('Erro ao buscar ticket:', error);
      toast({ title: 'Erro ao carregar', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchServiceExecutors = async (area: string) => {
    const { data, error } = await supabase
      .from('service_executors')
      .select('id, name, specialty, area, active')
      .eq('area', area)
      .eq('active', true)
      .order('name', { ascending: true });

    if (!error && data) {
      setServiceExecutors(data as ServiceExecutor[]);
    }
  };

  const fetchServiceSessions = async () => {
    if (!id) return;

    const { data: sessions, error } = await supabase
      .from('ticket_service_sessions')
      .select('id, started_at, finished_at, notes')
      .eq('ticket_id', id)
      .order('started_at', { ascending: false });

    if (error || !sessions?.length) {
      setServiceSessions([]);
      return;
    }

    const sessionIds = sessions.map((session) => session.id);
    const { data: links } = await supabase
      .from('ticket_service_session_executors')
      .select('session_id, executor_id')
      .in('session_id', sessionIds);

    const executorIds = [...new Set((links || []).map((link) => link.executor_id))];
    const { data: executors } = executorIds.length
      ? await supabase
          .from('service_executors')
          .select('id, name, specialty, area, active')
          .in('id', executorIds)
      : { data: [] };

    const executorsById = new Map((executors || []).map((executor) => [executor.id, executor as ServiceExecutor]));
    const executorIdsBySession = new Map<string, string[]>();
    (links || []).forEach((link) => {
      const current = executorIdsBySession.get(link.session_id) || [];
      executorIdsBySession.set(link.session_id, [...current, link.executor_id]);
    });

    setServiceSessions(
      sessions.map((session) => ({
        ...session,
        executors: (executorIdsBySession.get(session.id) || [])
          .map((executorId) => executorsById.get(executorId))
          .filter(Boolean) as ServiceExecutor[],
      }))
    );
  };

  const fetchInteractions = async () => {
    const { data, error } = await supabase
      .from('interactions')
      .select(`
        *,
        autor:profiles!interactions_autor_id_fkey(id, nome, foto_perfil)
      `)
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    if (!error && data) setInteractions(data as any);
  };

  const updateStatus = async (newStatus: TicketStatus) => {
    setUpdatingStatus(true);
    try {
      if (!id) return;

      await updateTicketStatus(id, newStatus);
      
      setTicket(prev => prev ? { ...prev, status: newStatus } : null);
      await Promise.all([fetchTicket(), fetchInteractions(), fetchServiceSessions()]);
      toast({ title: 'Status atualizado!' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const toggleExecutor = (executorId: string) => {
    setSelectedExecutorIds((current) =>
      current.includes(executorId)
        ? current.filter((id) => id !== executorId)
        : [...current, executorId]
    );
  };

  const startService = async () => {
    if (!id) return;
    if (!selectedExecutorIds.length) {
      toast({
        title: 'Executor obrigatório',
        description: 'Selecione ao menos um executor para iniciar o serviço.',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingService(true);
    try {
      await startTicketService(id, {
        executorIds: selectedExecutorIds,
        startedAt: dateTimeLocalToIso(serviceStartedAt),
        notes: serviceNotes,
      });

      setServiceNotes('');
      await Promise.all([fetchTicket(), fetchInteractions(), fetchServiceSessions()]);
      toast({ title: 'Serviço iniciado' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível iniciar o serviço.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingService(false);
    }
  };

  const finishService = async () => {
    if (!id) return;

    setUpdatingService(true);
    try {
      await finishTicketService(id, {
        finishedAt: dateTimeLocalToIso(serviceFinishedAt),
        notes: serviceNotes,
      });

      setServiceNotes('');
      await Promise.all([fetchTicket(), fetchInteractions(), fetchServiceSessions()]);
      toast({ title: 'Serviço encerrado', description: 'O ticket foi marcado como resolvido.' });
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível encerrar o serviço.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingService(false);
    }
  };

  const updatePriority = async (newPriority: TicketPriority) => {
    setUpdatingPriority(true);
    try {
      const { error } = await supabase.from('tickets').update({ prioridade: newPriority }).eq('id', id);
      if (error) throw error;
      setTicket(prev => prev ? { ...prev, prioridade: newPriority } : null);
      toast({ title: 'Prioridade atualizada!' });
    } catch (error) {
      toast({ title: 'Erro', variant: 'destructive' });
    } finally {
      setUpdatingPriority(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !ticket) return;
    setSending(true);
    try {
      const messageToSend = newMessage.trim();

      await addTicketMessage(id!, messageToSend);

      setNewMessage('');
      fetchInteractions();
    } catch (error) {
      toast({ title: 'Erro ao enviar', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;
  if (!ticket) return <div className="p-8 text-center">Ticket não encontrado</div>;

  const hasAttachments = signedUrls.imagens.some(Boolean) || signedUrls.arquivos.some(Boolean) || signedUrls.audio;
  const openServiceSession = serviceSessions.find((session) => !session.finished_at);
  const canStartService = !openServiceSession && ticket.status !== 'resolvido' && ticket.status !== 'fechado';
  const canFinishService = !!openServiceSession && ticket.status !== 'fechado';
  const serviceWaitingTime = ticket.service_started_at
    ? formatDuration(getDurationMs(ticket.created_at, ticket.service_started_at))
    : formatDuration(getDurationMs(ticket.created_at, new Date().toISOString()));
  const serviceExecutionTime = ticket.service_started_at && ticket.service_finished_at
    ? formatDuration(getDurationMs(ticket.service_started_at, ticket.service_finished_at))
    : openServiceSession
      ? formatDuration(getDurationMs(openServiceSession.started_at, new Date().toISOString()))
      : 'Sem dados';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-4">
          <Link to="/dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
          <div className="flex-1">
             <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{ticket.protocolo}</span>
             </div>
             <h1 className="truncate text-lg font-semibold">{ticket.titulo}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Menu Mobile */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden">
                  <Settings2 className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right">
                 <SheetHeader><SheetTitle>Gerenciar</SheetTitle></SheetHeader>
                 {/* Conteúdo mobile do status/prioridade aqui se quiser duplicar */}
                <div className="mt-4 space-y-4">
                  <div className="space-y-1">
                  <label className="text-xs font-medium">Status</label>
                  <Select 
                    value={ticket.status} 
                    onValueChange={(v) => updateStatus(v as TicketStatus)} 
                    disabled={updatingStatus}
                  >
                    {/* CORREÇÃO: Forçando cores escuras explicitamente */}
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    
                    <SelectContent className="bg-white text-black dark:bg-slate-950 dark:text-white dark:border-slate-800">
                      <SelectItem value="aberto">Aberto</SelectItem>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="aguardando_resposta">Aguardando Resposta</SelectItem>
                      <SelectItem value="resolvido">Resolvido</SelectItem>
                      <SelectItem value="fechado">Fechado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                 </div>
              </SheetContent>
            </Sheet>
            <ThemeToggle />
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="container flex flex-1 gap-4 py-4 h-[calc(100vh-4rem)]">
        {/* ÁREA PRINCIPAL (Esquerda) */}
        <div className="flex flex-1 flex-col gap-4 overflow-hidden">
          
          {/* Cartão de Descrição */}
          <Card className="flex-shrink-0 max-h-[30vh] overflow-y-auto">
            <CardHeader className="py-3"><CardTitle className="text-base">Descrição</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">{ticket.descricao}</p>
              {hasAttachments && (
                <div className="flex gap-2 flex-wrap">
                   {signedUrls.imagens.map((url, i) => (
                     <a key={i} href={url} target="_blank" className="block h-16 w-16 border rounded overflow-hidden">
                       <img src={url} className="w-full h-full object-cover" />
                     </a>
                   ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chat */}
          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="py-3 border-b"><CardTitle className="text-base">Conversa</CardTitle></CardHeader>
            <CardContent className="flex flex-1 flex-col p-0 overflow-hidden">
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {interactions.map((interaction, index) => {
                  const interactionDate = new Date(interaction.created_at);
                  const previousInteraction = interactions[index - 1];
                  const shouldShowDateSeparator =
                    !previousInteraction ||
                    !isSameCalendarDay(interactionDate, new Date(previousInteraction.created_at));
                  const isOwnMessage = interaction.autor_id === user?.id;
                  const isStatusEvent = interaction.tipo === 'mudanca_status';

                  return (
                    <div key={interaction.id} className="space-y-3">
                      {shouldShowDateSeparator && (
                        <div className="flex justify-center">
                          <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">
                            {getDayLabel(interactionDate)}
                          </span>
                        </div>
                      )}

                      {isStatusEvent ? (
                        <div className="flex justify-center">
                          <div className="max-w-[92%] rounded-full border bg-background px-3 py-1 text-center text-xs text-muted-foreground shadow-sm">
                            <span className="font-medium">{interaction.autor?.nome || 'Sistema'}</span>
                            <span> • {interaction.mensagem}</span>
                            <span> • {format(interactionDate, 'HH:mm', { locale: ptBR })}</span>
                          </div>
                        </div>
                      ) : (
                        <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                              isOwnMessage ? 'bg-primary text-primary-foreground' : 'bg-muted'
                            }`}
                          >
                            <p className="mb-1 text-xs font-bold opacity-75">{interaction.autor?.nome}</p>
                            <p className="whitespace-pre-wrap break-words text-sm">{interaction.mensagem}</p>
                            <p className="mt-1 text-right text-[10px] opacity-70">
                              {format(interactionDate, 'HH:mm', { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              {ticket.status !== 'fechado' && (
                 <div className="p-3 border-t flex gap-2">
                    <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Digite..." onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                    <Button size="icon" onClick={sendMessage} disabled={sending}><Send className="h-4 w-4" /></Button>
                 </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* BARRA LATERAL (Direita) */}
        <div className="hidden w-80 flex-col gap-4 md:flex overflow-y-auto">
           {/* Card de Status */}
           <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Status & Prioridade</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                 <div className="space-y-1">
                    <label className="text-xs font-medium">Status</label>
                    <Select value={ticket.status} onValueChange={(v) => updateStatus(v as TicketStatus)} disabled={updatingStatus}>
                       <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                       <SelectContent>
                          <SelectItem value="aberto">Aberto</SelectItem>
                          <SelectItem value="em_andamento">Em Andamento</SelectItem>
                          <SelectItem value="aguardando_resposta">Aguardando Resposta</SelectItem>
                          <SelectItem value="resolvido">Resolvido</SelectItem>
                          <SelectItem value="fechado">Fechado</SelectItem>
                       </SelectContent>
                    </Select>
                 </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Prioridade</label>
                  <Select 
                    value={ticket.prioridade} 
                    onValueChange={(v) => updatePriority(v as TicketPriority)} 
                    disabled={updatingPriority}
                  >
                    {/* CORREÇÃO: Mesma estratégia aqui */}
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    
                    <SelectContent className="bg-white text-black dark:bg-slate-950 dark:text-white dark:border-slate-800">
                      <SelectItem value="baixa">Baixa</SelectItem>
                      <SelectItem value="media">Média</SelectItem>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="critica">Crítica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
           </Card>

           <Card>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <UserRoundCog className="h-4 w-4" />
                  Execução do Serviço
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 rounded-md border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Aguardou atendimento</span>
                    <strong>{serviceWaitingTime}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Tempo de execução</span>
                    <strong>{serviceExecutionTime}</strong>
                  </div>
                  {ticket.service_started_at && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Início</span>
                      <strong>{format(new Date(ticket.service_started_at), 'dd/MM HH:mm', { locale: ptBR })}</strong>
                    </div>
                  )}
                  {ticket.service_finished_at && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Fim</span>
                      <strong>{format(new Date(ticket.service_finished_at), 'dd/MM HH:mm', { locale: ptBR })}</strong>
                    </div>
                  )}
                </div>

                {canStartService && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Executor(es)</Label>
                      <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border p-2">
                        {serviceExecutors.length ? serviceExecutors.map((executor) => (
                          <label key={executor.id} className="flex cursor-pointer items-start gap-2 rounded p-1 hover:bg-muted">
                            <Checkbox
                              checked={selectedExecutorIds.includes(executor.id)}
                              onCheckedChange={() => toggleExecutor(executor.id)}
                            />
                            <span className="text-xs leading-tight">
                              <strong className="block">{executor.name}</strong>
                              <span className="text-muted-foreground">{executor.specialty}</span>
                            </span>
                          </label>
                        )) : (
                          <p className="text-xs text-muted-foreground">
                            Nenhum executor ativo cadastrado para esta área.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data/hora inicial</Label>
                      <Input type="datetime-local" value={serviceStartedAt} onChange={(event) => setServiceStartedAt(event.target.value)} />
                    </div>
                  </div>
                )}

                {canFinishService && (
                  <div className="space-y-3">
                    <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-200">
                      <p className="font-semibold">Serviço em andamento</p>
                      <p>Iniciado em {format(new Date(openServiceSession.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                      <p>
                        Executor(es): {openServiceSession.executors.map((executor) => executor.name).join(', ') || 'Não informado'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data/hora final</Label>
                      <Input type="datetime-local" value={serviceFinishedAt} onChange={(event) => setServiceFinishedAt(event.target.value)} />
                    </div>
                  </div>
                )}

                {(canStartService || canFinishService) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Observação</Label>
                    <Textarea
                      value={serviceNotes}
                      onChange={(event) => setServiceNotes(event.target.value)}
                      placeholder="Opcional"
                      className="min-h-20 text-xs"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {canStartService && (
                    <Button onClick={startService} disabled={updatingService || !serviceExecutors.length} className="w-full">
                      {updatingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
                      Iniciar serviço
                    </Button>
                  )}
                  {canFinishService && (
                    <Button onClick={finishService} disabled={updatingService} className="w-full">
                      {updatingService ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                      Encerrar serviço
                    </Button>
                  )}
                </div>

                {serviceSessions.length > 0 && (
                  <div className="space-y-2 border-t pt-3">
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      <TimerReset className="h-3.5 w-3.5" />
                      Ciclos registrados
                    </p>
                    <div className="space-y-2">
                      {serviceSessions.slice(0, 4).map((session) => (
                        <div key={session.id} className="rounded-md border p-2 text-xs">
                          <p className="font-medium">
                            {format(new Date(session.started_at), 'dd/MM HH:mm', { locale: ptBR })}
                            {' '}até{' '}
                            {session.finished_at ? format(new Date(session.finished_at), 'dd/MM HH:mm', { locale: ptBR }) : 'em andamento'}
                          </p>
                          <p className="text-muted-foreground">
                            {session.executors.map((executor) => `${executor.name} (${executor.specialty})`).join(', ') || 'Executor não informado'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
           </Card>

           {/* Card Solicitante */}
           <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Solicitante</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-3">
                 <Avatar>
                    <AvatarImage src={ticket.solicitante?.foto_perfil || undefined} />
                    <AvatarFallback>{ticket.solicitante?.nome?.[0] || 'U'}</AvatarFallback>
                 </Avatar>
                 <div>
                    <p className="text-sm font-medium">{ticket.solicitante?.nome}</p>
                    <p className="text-xs text-muted-foreground">{ticket.solicitante?.email}</p>
                    <p className="text-xs text-muted-foreground">{ticket.solicitante?.setor}</p>
                 </div>
              </CardContent>
           </Card>
        </div>
      </main>
    </div>
  );
}
