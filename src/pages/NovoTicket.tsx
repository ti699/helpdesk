import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  Camera, 
  Paperclip, 
  Mic, 
  MicOff, 
  X, 
  Loader2,
  FileText,
  Image as ImageIcon,
  Send,
  AlertTriangle,
  UserPlus
} from 'lucide-react';
import { z } from 'zod';
import { TicketTypeSelect } from '@/components/tickets/TicketTypeSelect';
import { CategorySelect } from '@/components/tickets/CategorySelect';
import { Checkbox } from '@/components/ui/checkbox';
import { createTicket } from '@/lib/ticketActions';

const ticketSchema = z.object({
  titulo: z.string().min(5, 'Título deve ter no mínimo 5 caracteres').max(100, 'Título deve ter no máximo 100 caracteres'),
  descricao: z.string().min(10, 'Descrição deve ter no mínimo 10 caracteres').max(2000, 'Descrição deve ter no máximo 2000 caracteres'),
});

interface Attachment {
  file: File;
  preview?: string;
  type: 'image' | 'file';
}

export default function NovoTicket() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<string>('TI');
  const [categoria, setCategoria] = useState<string>('Outros');
  const [prioridade, setPrioridade] = useState<'baixa' | 'media' | 'alta' | 'critica'>('media');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Create for another user
  const [createForOther, setCreateForOther] = useState(false);
  const [solicitanteEmail, setSolicitanteEmail] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const isAgentOrAdmin = role === 'agente_ti' || role === 'agente_manutencao' || role === 'admin';

  // Reset categoria when tipo changes
  useEffect(() => {
    setCategoria('Outros');
  }, [tipo]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            { file, preview: reader.result as string, type: 'image' },
          ]);
        };
        reader.readAsDataURL(file);
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      setAttachments((prev) => [...prev, { file, type: 'file' }]);
    });
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível acessar o microfone',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const removeAudio = () => {
    setAudioBlob(null);
  };

  // Função para sanitizar nome de arquivo para o Storage
  const sanitizeFileName = (fileName: string): string => {
    const lastDot = fileName.lastIndexOf('.');
    const name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    const extension = lastDot > 0 ? fileName.substring(lastDot) : '';
    
    const sanitized = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/\s+/g, '_')            // Espaços -> underscores
      .replace(/[^a-zA-Z0-9_-]/g, '')  // Remove caracteres especiais
      .toLowerCase();
    
    return sanitized + extension.toLowerCase();
  };

  // Upload file and return only the storage path (not public URL)
  const uploadFile = async (file: File | Blob, path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('attachments')
      .upload(path, file);

    if (error) throw error;

    // Return just the path, not the public URL
    return data.path;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      ticketSchema.parse({ titulo, descricao });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erro de validação',
          description: error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para criar um ticket',
        variant: 'destructive',
      });
      return;
    }

    const targetRequesterEmail = createForOther ? solicitanteEmail.toLowerCase().trim() : undefined;

    if (createForOther && !targetRequesterEmail) {
      toast({
        title: 'Email obrigatório',
        description: 'Informe o email do solicitante para criar o ticket para outra pessoa.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload attachments - store paths only
      const uploadedImages: string[] = [];
      const uploadedFiles: string[] = [];
      let audioPath: string | null = null;

      for (const attachment of attachments) {
        const timestamp = Date.now();
        const sanitizedName = sanitizeFileName(attachment.file.name);
        const path = `${user.id}/${timestamp}-${sanitizedName}`;
        const storagePath = await uploadFile(attachment.file, path);

        if (attachment.type === 'image') {
          uploadedImages.push(storagePath);
        } else {
          uploadedFiles.push(storagePath);
        }
      }

      if (audioBlob) {
        const timestamp = Date.now();
        const path = `${user.id}/${timestamp}-audio.webm`;
        audioPath = await uploadFile(audioBlob, path);
      }

      const result = await createTicket({
        titulo,
        descricao,
        tipo,
        categoria,
        prioridade,
        solicitanteEmail: targetRequesterEmail,
        anexos: {
          imagens: uploadedImages,
          arquivos: uploadedFiles,
          audio: audioPath,
        },
      });

      toast({
        title: 'Ticket criado!',
        description: `Protocolo: ${result.ticket.protocolo}`,
      });

      navigate(`/ticket/${result.ticket.id}`);
    } catch (error: unknown) {
      console.error('Error creating ticket:', error);
      
      let errorMessage = 'Não foi possível criar o ticket. Tente novamente.';
      
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
      } else if (error instanceof Error && error.message.includes('network')) {
        errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
      }
      
      toast({
        title: 'Erro',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="container flex h-16 items-center gap-2 sm:gap-4 px-3 sm:px-4">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-semibold truncate">Nova Solicitação</h1>
            <p className="text-xs text-muted-foreground">Descreva seu problema</p>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="container px-3 sm:px-4 py-4 sm:py-6">
        <Card className="mx-auto w-full max-w-2xl">
          <CardHeader className="px-3 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-lg sm:text-2xl">Abrir Ticket de Suporte</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Preencha as informações abaixo para que possamos ajudá-lo
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6">
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
              {/* Create for another user (agents/admins only) */}
              {isAgentOrAdmin && (
                <div className="space-y-3 sm:space-y-4 rounded-lg border border-dashed p-3 sm:p-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="createForOther"
                      checked={createForOther}
                      onCheckedChange={(checked) => setCreateForOther(!!checked)}
                    />
                    <Label htmlFor="createForOther" className="flex items-center gap-2 cursor-pointer text-sm">
                      <UserPlus className="h-4 w-4 flex-shrink-0" />
                      Criar ticket para outra pessoa
                    </Label>
                  </div>
                  
                  {createForOther && (
                    <div className="space-y-2 sm:space-y-3">
                      <Label htmlFor="solicitanteEmail" className="text-sm">Email do Solicitante *</Label>
                      <Input
                        id="solicitanteEmail"
                        type="email"
                        placeholder="email@empresa.com"
                        value={solicitanteEmail}
                        onChange={(e) => setSolicitanteEmail(e.target.value)}
                        required={createForOther}
                        className="text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        O usuário precisa ter uma conta no sistema
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Tipo */}
              <div className="space-y-2">
                <Label htmlFor="tipo" className="text-sm">Tipo de Solicitação *</Label>
                <TicketTypeSelect value={tipo} onValueChange={setTipo} />
              </div>

              {/* Categoria */}
              <div className="space-y-2">
                <Label htmlFor="categoria" className="text-sm">Categoria *</Label>
                <CategorySelect tipo={tipo} value={categoria} onValueChange={setCategoria} />
              </div>

              {/* Título */}
              <div className="space-y-2">
                <Label htmlFor="titulo" className="text-sm">Título do Problema *</Label>
                <Input
                  id="titulo"
                  placeholder="Ex: Computador não liga"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  maxLength={100}
                  required
                  className="text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {titulo.length}/100 caracteres
                </p>
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label htmlFor="descricao" className="text-sm">Descrição Detalhada *</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva o problema em detalhes: o que aconteceu, quando começou, qual o impacto..."
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={2000}
                  className="min-h-[120px] sm:min-h-[150px] resize-none text-sm"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  {descricao.length}/2000 caracteres
                </p>
              </div>

              {/* Prioridade */}
              <div className="space-y-2">
                <Label htmlFor="prioridade" className="text-sm">Prioridade *</Label>
                <Select
                  value={prioridade}
                  onValueChange={(value) => setPrioridade(value as 'baixa' | 'media' | 'alta' | 'critica')}
                >
                  <SelectTrigger className="w-full text-sm">
                    <AlertTriangle className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <SelectValue placeholder="Selecione a Prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa (Tranquila)</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta (Urgente)</SelectItem>
                    <SelectItem value="critica">Crítica (Interrupção de Serviço)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Anexos */}
              <div className="space-y-3 sm:space-y-4">
                <Label className="text-sm">Anexos (opcional)</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => imageInputRef.current?.click()}
                    className="text-xs sm:text-sm"
                  >
                    <Camera className="mr-2 h-4 w-4" />
                    <span className="hidden xs:inline">Foto/Screenshot</span>
                    <span className="xs:hidden">Foto</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs sm:text-sm"
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    <span className="hidden xs:inline">Arquivo</span>
                    <span className="xs:hidden">Arquivo</span>
                  </Button>
                  <Button
                    type="button"
                    variant={isRecording ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={isRecording ? stopRecording : startRecording}
                    className="text-xs sm:text-sm"
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="mr-2 h-4 w-4" />
                        <span className="hidden xs:inline">Parar</span>
                      </>
                    ) : (
                      <>
                        <Mic className="mr-2 h-4 w-4" />
                        <span className="hidden xs:inline">Áudio</span>
                      </>
                    )}
                  </Button>
                </div>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {/* Preview de anexos */}
                {(attachments.length > 0 || audioBlob) && (
                  <div className="rounded-lg border p-3 sm:p-4">
                    <p className="mb-2 sm:mb-3 text-xs sm:text-sm font-medium">Arquivos anexados:</p>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      {attachments.map((attachment, index) => (
                        <div
                          key={index}
                          className="relative flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-xs"
                        >
                          {attachment.type === 'image' && attachment.preview ? (
                            <img
                              src={attachment.preview}
                              alt="Preview"
                              className="h-10 w-10 sm:h-12 sm:w-12 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded bg-muted flex-shrink-0">
                              {attachment.type === 'image' ? (
                                <ImageIcon className="h-5 sm:h-6 w-5 sm:w-6 text-muted-foreground" />
                              ) : (
                                <FileText className="h-5 sm:h-6 w-5 sm:w-6 text-muted-foreground" />
                              )}
                            </div>
                          )}
                          <span className="max-w-[80px] sm:max-w-[100px] truncate">
                            {attachment.file.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      ))}
                      {audioBlob && (
                        <div className="relative flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-xs">
                          <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded bg-primary/10 flex-shrink-0">
                            <Mic className="h-5 sm:h-6 w-5 sm:w-6 text-primary" />
                          </div>
                          <span className="hidden xs:inline">Áudio gravado</span>
                          <span className="xs:hidden">Áudio</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0"
                            onClick={removeAudio}
                          >
                            <X className="h-3 w-3 sm:h-4 sm:w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <Button type="submit" className="w-full text-sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar Solicitação
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
