import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { 
  Mail, 
  Plus, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  Copy, 
  Loader2,
  RefreshCw 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { z } from 'zod';

interface Invitation {
  id: string;
  email: string;
  role: 'solicitante' | 'agente_ti' | 'admin';
  token: string;
  used: boolean;
  expires_at: string;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  solicitante: 'Solicitante',
  agente_ti: 'Agente TI',
  admin: 'Administrador',
};

const roleColors: Record<string, string> = {
  solicitante: 'bg-muted text-muted-foreground',
  agente_ti: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  admin: 'bg-primary/10 text-primary',
};

const emailSchema = z.string().email('Email inválido');

export function InvitationManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'solicitante' | 'agente_ti' | 'admin'>('solicitante');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchInvitations();
  }, []);

  const fetchInvitations = async () => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvitations(data as Invitation[]);
    } catch (error) {
      console.error('Error fetching invitations:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os convites',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      emailSchema.parse(newEmail);
    } catch {
      toast({
        title: 'Erro',
        description: 'Por favor, insira um email válido',
        variant: 'destructive',
      });
      return;
    }

    // Check if email already has a pending invitation
    const existingInvitation = invitations.find(
      (inv) => inv.email === newEmail && !inv.used && new Date(inv.expires_at) > new Date()
    );

    if (existingInvitation) {
      toast({
        title: 'Convite já existe',
        description: 'Este email já possui um convite pendente',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          email: newEmail.toLowerCase().trim(),
          role: newRole,
          invited_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      setInvitations((prev) => [data as Invitation, ...prev]);
      setNewEmail('');
      setNewRole('solicitante');

      toast({
        title: 'Convite criado',
        description: 'O link de convite foi gerado com sucesso',
      });
    } catch (error) {
      console.error('Error creating invitation:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar o convite',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setInvitations((prev) => prev.filter((inv) => inv.id !== id));

      toast({
        title: 'Convite removido',
        description: 'O convite foi removido com sucesso',
      });
    } catch (error) {
      console.error('Error deleting invitation:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o convite',
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/auth?invite=${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: 'Link copiado',
      description: 'O link de convite foi copiado para a área de transferência',
    });
  };

  const getInvitationStatus = (invitation: Invitation) => {
    if (invitation.used) {
      return { label: 'Usado', icon: CheckCircle2, color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    }
    if (new Date(invitation.expires_at) < new Date()) {
      return { label: 'Expirado', icon: XCircle, color: 'bg-destructive/10 text-destructive' };
    }
    return { label: 'Pendente', icon: Clock, color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' };
  };

  const pendingCount = invitations.filter(
    (inv) => !inv.used && new Date(inv.expires_at) > new Date()
  ).length;

  const usedCount = invitations.filter((inv) => inv.used).length;

  return (
    <div className="space-y-6">
      {/* Create Invitation Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Novo Convite
          </CardTitle>
          <CardDescription>
            Crie um convite para um novo usuário se cadastrar no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateInvitation} className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1 space-y-2">
              <Label htmlFor="email">Email do Convidado</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@exemplo.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Permissão</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as typeof newRole)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solicitante">Solicitante</SelectItem>
                  <SelectItem value="agente_ti">Agente TI</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Criar Convite
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Invitations List Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Convites</CardTitle>
            <CardDescription>
              Lista de todos os convites enviados
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInvitations}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4">
                  <Skeleton className="h-10 w-10 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-9 w-24" />
                </div>
              ))}
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-12 text-center">
              <Mail className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-medium">Nenhum convite encontrado</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Crie um novo convite usando o formulário acima
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {invitations.map((invitation) => {
                const status = getInvitationStatus(invitation);
                const StatusIcon = status.icon;
                const isExpiredOrUsed = invitation.used || new Date(invitation.expires_at) < new Date();

                return (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium truncate">{invitation.email}</p>
                        <Badge className={roleColors[invitation.role]}>
                          {roleLabels[invitation.role]}
                        </Badge>
                        <Badge className={status.color}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {status.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Criado em {format(new Date(invitation.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        {!invitation.used && (
                          <span>
                            {' • '}
                            Expira em {format(new Date(invitation.expires_at), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isExpiredOrUsed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyInviteLink(invitation.token)}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copiar Link
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteInvitation(invitation.id)}
                        disabled={deletingId === invitation.id}
                      >
                        {deletingId === invitation.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Summary */}
          <div className="mt-6 flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
            <span>Total: {invitations.length} convites</span>
            <span>•</span>
            <span>{pendingCount} pendentes</span>
            <span>•</span>
            <span>{usedCount} utilizados</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
