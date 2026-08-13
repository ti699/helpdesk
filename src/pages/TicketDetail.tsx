import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Star,
  FileDown
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getSignedUrl, getSignedUrls } from '@/lib/storage';
import { addTicketMessage, reopenTicketFromFeedback } from '@/lib/ticketActions';





type TicketStatus = 'aberto' | 'em_andamento' | 'aguardando_resposta' | 'resolvido' | 'fechado';

interface TicketData {
  id: string;
  protocolo: string;
  titulo: string;
  descricao: string;
  status: TicketStatus;
  prioridade: string;
  setor: string | null;
  tipo: string | null;
  categoria: string | null;
  anexos: {
    imagens: string[];
    arquivos: string[];
    audio: string | null;
  };
  created_at: string;
  solicitante: {
    id: string;
    nome: string;
    email: string;
    foto_perfil: string | null;
  } | null;
  agente: {
    id: string;
    nome: string;
    email: string;
    foto_perfil: string | null;
  } | null;
}

interface Interaction {
  id: string;
  mensagem: string | null;
  tipo: string;
  created_at: string;
  autor: {
    id: string;
    nome: string;
    foto_perfil: string | null;
  } | null;
}

interface SignedUrls {
  imagens: (string | null)[];
  arquivos: (string | null)[];
  audio: string | null;
}

const statusConfig: Record<TicketStatus, { label: string; color: string; icon: React.ReactNode }> = {
  aberto: { label: 'Aberto', color: 'bg-status-open text-white', icon: <AlertCircle className="h-4 w-4" /> },
  em_andamento: { label: 'Em Andamento', color: 'bg-status-in-progress text-white', icon: <Clock className="h-4 w-4" /> },
  aguardando_resposta: { label: 'Aguardando', color: 'bg-status-waiting text-white', icon: <Clock className="h-4 w-4" /> },
  resolvido: { label: 'Resolvido', color: 'bg-status-resolved text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
  fechado: { label: 'Fechado', color: 'bg-status-closed text-white', icon: <CheckCircle2 className="h-4 w-4" /> },
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

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [solutionResolved, setSolutionResolved] = useState<boolean | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [hasFeedback, setHasFeedback] = useState(false);
  const [feedbackChecked, setFeedbackChecked] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [signedUrls, setSignedUrls] = useState<SignedUrls>({ imagens: [], arquivos: [], audio: null });
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const handledAutoFeedbackRef = useRef(false);

  useEffect(() => {
    if (id) {
      setFeedbackChecked(false);
      handledAutoFeedbackRef.current = false;
      fetchTicket();
      fetchInteractions();
      checkFeedback();
    }
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [interactions]);

  // Fetch signed URLs when ticket loads
  useEffect(() => {
    const fetchSignedUrls = async () => {
      if (!ticket?.anexos) return;
      
      const [imagens, arquivos, audio] = await Promise.all([
        getSignedUrls(ticket.anexos.imagens || []),
        getSignedUrls(ticket.anexos.arquivos || []),
        ticket.anexos.audio ? getSignedUrl(ticket.anexos.audio) : null,
      ]);
      
      setSignedUrls({ imagens, arquivos, audio });
    };
    
    fetchSignedUrls();
  }, [ticket]);

  useEffect(() => {
    if (
      handledAutoFeedbackRef.current ||
      !ticket ||
      !user ||
      !feedbackChecked ||
      searchParams.get('avaliar') !== '1'
    ) {
      return;
    }

    handledAutoFeedbackRef.current = true;

    if ((ticket.status === 'resolvido' || ticket.status === 'fechado') && ticket.solicitante?.id === user.id && !hasFeedback) {
      setShowFeedback(true);
      return;
    }

    toast({
      title: hasFeedback ? 'Ticket já avaliado' : 'Avaliação indisponível',
      description: hasFeedback
        ? 'Este atendimento já recebeu uma avaliação.'
        : 'A avaliação só fica disponível para o solicitante quando o ticket está resolvido ou fechado.',
    });
  }, [feedbackChecked, hasFeedback, searchParams, ticket, toast, user]);

  // Real-time subscription
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`ticket-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'interactions',
          filter: `ticket_id=eq.${id}`,
        },
        () => {
          fetchInteractions();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tickets',
          filter: `id=eq.${id}`,
        },
        () => {
          fetchTicket();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchTicket = async () => {
    try {
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          id,
          protocolo,
          titulo,
          descricao,
          status,
          prioridade,
          setor,
          tipo,
          categoria,
          anexos,
          created_at,
          solicitante_id,
          agente_id
        `)
        .eq('id', id)
        .single();

      if (ticketError) throw ticketError;

      // Fetch profiles separately to avoid FK cache issues
      let solicitante = null;
      let agente = null;

      if (ticketData.solicitante_id) {
        const { data: solicitanteData } = await supabase
          .from('profiles')
          .select('id, nome, email, foto_perfil')
          .eq('id', ticketData.solicitante_id)
          .maybeSingle();
        solicitante = solicitanteData;
      }

      if (ticketData.agente_id) {
        const { data: agenteData } = await supabase
          .from('profiles')
          .select('id, nome, email, foto_perfil')
          .eq('id', ticketData.agente_id)
          .maybeSingle();
        agente = agenteData;
      }

      setTicket({
        ...ticketData,
        solicitante,
        agente,
      } as unknown as TicketData);
    } catch (error) {
      console.error('Error fetching ticket:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o ticket',
        variant: 'destructive',
      });
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchInteractions = async () => {
    try {
      const { data: interactionsData, error } = await supabase
        .from('interactions')
        .select(`
          id,
          mensagem,
          tipo,
          created_at,
          autor_id
        `)
        .eq('ticket_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch author profiles separately
      const autorIds = [...new Set(interactionsData?.map(i => i.autor_id).filter(Boolean))];
      
      const profilesMap: Record<string, { id: string; nome: string; foto_perfil: string | null }> = {};
      
      if (autorIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nome, foto_perfil')
          .in('id', autorIds);
        
        profilesData?.forEach(p => {
          profilesMap[p.id] = p;
        });
      }

      const interactionsWithAuthor = interactionsData?.map(i => ({
        ...i,
        autor: i.autor_id ? profilesMap[i.autor_id] || null : null,
      }));

      setInteractions(interactionsWithAuthor as unknown as Interaction[]);
    } catch (error) {
      console.error('Error fetching interactions:', error);
    }
  };

  const checkFeedback = async () => {
    try {
      setFeedbackChecked(false);
      const { data } = await supabase
        .from('feedbacks')
        .select('id')
        .eq('ticket_id', id)
        .maybeSingle();
      
      setHasFeedback(!!data);
    } catch (error) {
      console.error('Error checking feedback:', error);
    } finally {
      setFeedbackChecked(true);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id || !ticket) return;

    setSending(true);
    try {
      const messageToSend = newMessage.trim();

      await addTicketMessage(id, messageToSend);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const submitFeedback = async () => {
    if (!user || !id || solutionResolved !== true || feedbackRating === 0) return;

    setSubmittingFeedback(true);
    try {
      const { error } = await supabase.from('feedbacks').insert({
        ticket_id: id,
        avaliador_id: user.id,
        nota_satisfacao: feedbackRating,
        comentarios: feedbackComment || null,
        eficacia_solucao: true,
      });

      if (error) throw error;

      toast({
        title: 'Avaliação enviada!',
        description: 'Obrigado pelo seu feedback',
      });
      setShowFeedback(false);
      setHasFeedback(true);
      setSolutionResolved(null);
      setFeedbackRating(0);
      setFeedbackComment('');
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a avaliação',
        variant: 'destructive',
      });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const reopenTicket = async () => {
    if (!user || !id) return;

    setSubmittingFeedback(true);
    try {
      await reopenTicketFromFeedback(id, reopenReason.trim() || undefined);

      toast({
        title: 'Ticket reaberto',
        description: 'A equipe responsável foi avisada que a solicitação ainda não foi resolvida.',
      });

      setShowFeedback(false);
      setSolutionResolved(null);
      setFeedbackRating(0);
      setFeedbackComment('');
      setReopenReason('');
      await Promise.all([fetchTicket(), fetchInteractions(), checkFeedback()]);
    } catch (error) {
      console.error('Error reopening ticket:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível reabrir o ticket',
        variant: 'destructive',
      });
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const handleExportPDF = () => {
    if (!ticket) return;

    setExportingPDF(true);
    try {
      const doc = new jsPDF();
      const createdAt = format(new Date(ticket.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

      doc.setFontSize(16);
      doc.text(`Ticket ${ticket.protocolo}`, 14, 18);

      doc.setFontSize(11);
      doc.text(`Título: ${ticket.titulo}`, 14, 30);
      doc.text(`Status: ${statusConfig[ticket.status].label}`, 14, 38);
      doc.text(`Prioridade: ${ticket.prioridade}`, 14, 46);
      doc.text(`Aberto em: ${createdAt}`, 14, 54);
      doc.text(`Solicitante: ${ticket.solicitante?.nome || 'Não informado'}`, 14, 62);

      const descriptionLines = doc.splitTextToSize(ticket.descricao || '', 180);
      doc.text('Descrição:', 14, 76);
      doc.text(descriptionLines, 14, 84);

      autoTable(doc, {
        startY: Math.min(120, 90 + descriptionLines.length * 6),
        head: [['Data', 'Autor', 'Tipo', 'Mensagem']],
        body: interactions.map((interaction) => [
          format(new Date(interaction.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }),
          interaction.autor?.nome || 'Usuário',
          interaction.tipo,
          interaction.mensagem || '',
        ]),
        styles: { fontSize: 8, cellWidth: 'wrap' },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 35 },
          2: { cellWidth: 30 },
          3: { cellWidth: 88 },
        },
      });

      doc.save(`ticket-${ticket.protocolo}.pdf`);
    } catch (error) {
      console.error('Error exporting ticket PDF:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível exportar o PDF',
        variant: 'destructive',
      });
    } finally {
      setExportingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
          <div className="container flex h-16 items-center gap-4">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </header>
        <main className="container py-6">
          <Skeleton className="h-[400px] w-full rounded-lg" />
        </main>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Ticket não encontrado</p>
      </div>
    );
  }

  const canSendMessage = ticket.status !== 'fechado';
  const canEvaluate = (ticket.status === 'resolvido' || ticket.status === 'fechado') &&
                      ticket.solicitante?.id === user?.id && 
                      !hasFeedback;

  const hasAttachments = signedUrls.imagens.some(Boolean) || 
                         signedUrls.arquivos.some(Boolean) || 
                         signedUrls.audio;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-2 sm:gap-4 px-3 sm:px-4">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs sm:text-sm text-muted-foreground flex-shrink-0">
                {ticket.protocolo}
              </span>
              <Badge className={`${statusConfig[ticket.status].color} text-xs flex-shrink-0`}>
                {statusConfig[ticket.status].icon}
                <span className="ml-1 hidden xs:inline">{statusConfig[ticket.status].label}</span>
              </Badge>
            </div>
            <h1 className="line-clamp-1 text-sm sm:text-lg font-semibold">{ticket.titulo}</h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs sm:text-sm"
              onClick={handleExportPDF}
              disabled={exportingPDF}
              title="Exportar PDF detalhado do ticket"
            >
              {exportingPDF ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-1 h-4 w-4" />
              )}
              Exportar PDF
            </Button>
            <ThemeToggle />
            <NotificationBell />
            {canEvaluate && (
              <Button onClick={() => setShowFeedback(true)} size="sm" className="text-xs sm:text-sm">
                <Star className="mr-1 sm:mr-2 h-4 w-4 fill-yellow-300 text-yellow-300" />
                <span className="hidden xs:inline">Avalie este atendimento</span>
                <span className="xs:hidden">Avaliar</span>
              </Button>
            )}
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container flex flex-1 flex-col gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-4">
        {/* Ticket Info Card */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base">Detalhes da Solicitação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
            <p className="text-xs sm:text-sm text-muted-foreground whitespace-pre-wrap">{ticket.descricao}</p>
            
            {/* Attachments with signed URLs */}
            {hasAttachments && (
              <div className="space-y-2 sm:space-y-3">
                <p className="text-xs sm:text-sm font-medium">Anexos:</p>
                <div className="flex flex-wrap gap-2">
                  {signedUrls.imagens.map((img, i) => img && (
                    <a
                      key={i}
                      href={img}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-lg border bg-muted hover:bg-accent transition-colors flex-shrink-0"
                    >
                      <img
                        src={img}
                        alt={`Anexo ${i + 1}`}
                        className="h-full w-full rounded-lg object-cover"
                      />
                    </a>
                  ))}
                  {signedUrls.arquivos.map((file, i) => file && (
                    <a
                      key={i}
                      href={file}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-lg border bg-muted hover:bg-accent transition-colors flex-shrink-0"
                    >
                      <FileText className="h-5 sm:h-6 w-5 sm:w-6 text-muted-foreground" />
                    </a>
                  ))}
                  {signedUrls.audio && (
                    <div className="flex items-center gap-2 rounded-lg border bg-muted p-2 text-xs sm:text-sm">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"
                        onClick={toggleAudio}
                      >
                        {isPlaying ? (
                          <Pause className="h-4 sm:h-5 w-4 sm:w-5" />
                        ) : (
                          <Play className="h-4 sm:h-5 w-4 sm:w-5" />
                        )}
                      </Button>
                      <span className="hidden xs:inline">Áudio</span>
                      <audio
                        ref={audioRef}
                        src={signedUrls.audio}
                        onEnded={() => setIsPlaying(false)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
              <span className="line-clamp-1">
                Aberto em {format(new Date(ticket.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
              {ticket.tipo && <span className="hidden sm:inline">• {ticket.tipo}</span>}
              {ticket.categoria && <span className="hidden xs:inline">• {ticket.categoria}</span>}
              {ticket.setor && <span className="hidden sm:inline">• {ticket.setor}</span>}
            </div>
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="flex flex-1 flex-col">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base">Conversa</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-3 sm:px-6">
            <div className="flex-1 space-y-3 sm:space-y-4 overflow-y-auto">
              {interactions.length === 0 ? (
                <p className="py-6 sm:py-8 text-center text-xs sm:text-sm text-muted-foreground">
                  Nenhuma mensagem ainda
                </p>
              ) : (
                interactions.map((interaction, index) => {
                  const isOwnMessage = interaction.autor?.id === user?.id;
                  const interactionDate = new Date(interaction.created_at);
                  const previousInteraction = interactions[index - 1];
                  const shouldShowDateSeparator =
                    !previousInteraction ||
                    !isSameCalendarDay(interactionDate, new Date(previousInteraction.created_at));
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
                        <div className={`flex gap-2 sm:gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                          <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                            <AvatarImage src={interaction.autor?.foto_perfil || undefined} />
                            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                              {interaction.autor?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={`max-w-[80%] sm:max-w-[70%] rounded-lg p-2 sm:p-3 text-xs sm:text-sm ${
                              isOwnMessage
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <p className="text-xs font-medium opacity-70">
                              {interaction.autor?.nome || 'Usuário'}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap break-words">{interaction.mensagem}</p>
                            <p className="mt-1 text-right text-xs opacity-50">
                              {format(interactionDate, 'HH:mm', { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Message Input */}
            {canSendMessage && (
              <div className="mt-3 sm:mt-4 flex gap-2">
                <Input
                  placeholder="Mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sending}
                  className="text-xs sm:text-sm"
                />
                <Button onClick={sendMessage} disabled={sending || !newMessage.trim()} size="icon" className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Feedback Dialog */}
      <Dialog
        open={showFeedback}
        onOpenChange={(open) => {
          setShowFeedback(open);
          if (!open) {
            setSolutionResolved(null);
            setReopenReason('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">Avalie este atendimento</DialogTitle>
            <DialogDescription className="text-sm">
              Confirme primeiro se a solicitação foi resolvida. Caso não tenha sido, o mesmo ticket será reaberto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-3 sm:py-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <Label className="text-sm font-semibold text-foreground">Foi resolvida a sua solicitação?</Label>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={solutionResolved === true ? 'default' : 'outline'}
                  onClick={() => setSolutionResolved(true)}
                  className="justify-center"
                >
                  Sim, foi resolvida
                </Button>
                <Button
                  type="button"
                  variant={solutionResolved === false ? 'destructive' : 'outline'}
                  onClick={() => setSolutionResolved(false)}
                  className="justify-center"
                >
                  Não, reabrir ticket
                </Button>
              </div>
            </div>

            {solutionResolved === false && (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
                <div>
                  <Label htmlFor="reopen-reason" className="text-xs sm:text-sm">
                    Descreva o que ainda não foi resolvido (opcional)
                  </Label>
                  <Textarea
                    id="reopen-reason"
                    placeholder="Ex.: O problema continua acontecendo..."
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    className="mt-2 min-h-[80px] text-xs sm:text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Ao confirmar, o ticket voltará para Aberto e a equipe responsável será notificada.
                </p>
              </div>
            )}

            {solutionResolved === true && (
              <>
                <div className="rounded-lg border bg-yellow-50 p-4 text-center dark:bg-yellow-950/20">
                  <Label className="text-sm font-semibold text-foreground">Nota de satisfação</Label>
                  <div className="mt-3 flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Button
                        key={star}
                        variant="ghost"
                        size="icon"
                        className="h-12 w-12 rounded-full hover:bg-yellow-100 focus-visible:ring-yellow-500 dark:hover:bg-yellow-900/40 sm:h-14 sm:w-14"
                        onClick={() => setFeedbackRating(star)}
                        title={`${star} estrela${star > 1 ? 's' : ''}`}
                      >
                        <Star
                          className={`h-8 w-8 transition-all sm:h-9 sm:w-9 ${
                            star <= feedbackRating
                              ? 'scale-110 fill-yellow-400 text-yellow-500'
                              : 'fill-yellow-100 text-yellow-500 opacity-80 dark:fill-yellow-950'
                          }`}
                        />
                      </Button>
                    ))}
                  </div>
                  <p className="mt-3 min-h-5 text-sm font-medium text-muted-foreground">
                    {feedbackRating > 0
                      ? `${feedbackRating} de 5 estrela${feedbackRating > 1 ? 's' : ''}`
                      : 'Selecione uma nota para liberar o envio'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="feedback-comment" className="text-xs sm:text-sm">Comentários (opcional)</Label>
                  <Textarea
                    id="feedback-comment"
                    placeholder="Conte-nos mais sobre sua experiência..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="min-h-[80px] sm:min-h-[100px] text-xs sm:text-sm"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFeedback(false)} className="text-xs sm:text-sm">
              Cancelar
            </Button>
            {solutionResolved === false ? (
              <Button
                variant="destructive"
                onClick={reopenTicket}
                disabled={submittingFeedback}
                className="text-sm"
              >
                {submittingFeedback ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Reabrir Ticket
              </Button>
            ) : (
              <Button
                onClick={submitFeedback}
                disabled={solutionResolved !== true || feedbackRating === 0 || submittingFeedback}
                className="text-sm"
              >
                {submittingFeedback ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Enviar Avaliação
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
