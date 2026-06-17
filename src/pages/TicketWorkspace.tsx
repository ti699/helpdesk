import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Settings2
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getSignedUrl, getSignedUrls } from '@/lib/storage';
import { addTicketMessage, updateTicketStatus } from '@/lib/ticketActions';

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
  const [signedUrls, setSignedUrls] = useState<{ imagens: any[], arquivos: any[], audio: any }>({ imagens: [], arquivos: [], audio: null });
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchTicket();
      fetchInteractions();
    }
  }, [id]);

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
    } catch (error) {
      console.error('Erro ao buscar ticket:', error);
      toast({ title: 'Erro ao carregar', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
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
      fetchInteractions();
      toast({ title: 'Status atualizado!' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
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
