import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Edit2, Loader2, Mail, Plus, Save, Trash2, X } from 'lucide-react';

type TicketType = 'TI' | 'Manutenção predial';

interface DepartmentEmailRecipient {
  id: string;
  ticket_type: TicketType;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
}

const typedSupabase = supabase as unknown as {
  from: (table: string) => any;
};

export function DepartmentEmailManagement() {
  const { toast } = useToast();
  const [recipients, setRecipients] = useState<DepartmentEmailRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ticketType, setTicketType] = useState<TicketType>('TI');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  useEffect(() => {
    fetchRecipients();
  }, []);

  const fetchRecipients = async () => {
    try {
      const { data, error } = await typedSupabase
        .from('ticket_department_email_recipients')
        .select('*')
        .order('ticket_type', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setRecipients((data || []) as DepartmentEmailRecipient[]);
    } catch (error) {
      console.error('Error fetching department email recipients:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os destinatários de e-mail',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setTicketType('TI');
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!name.trim() || !email.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe nome e e-mail do destinatário.',
        variant: 'destructive',
      });
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await typedSupabase
        .from('ticket_department_email_recipients')
        .insert({
          ticket_type: ticketType,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setRecipients((prev) => [...prev, data as DepartmentEmailRecipient]);
      resetForm();
      toast({ title: 'Destinatário adicionado' });
    } catch (error) {
      console.error('Error creating department email recipient:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar o destinatário. Verifique se o e-mail já existe neste setor.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (recipient: DepartmentEmailRecipient) => {
    setEditingId(recipient.id);
    setEditName(recipient.name);
    setEditEmail(recipient.email);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditEmail('');
  };

  const handleUpdate = async (recipient: DepartmentEmailRecipient) => {
    if (!editName.trim() || !editEmail.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe nome e e-mail do destinatário.',
        variant: 'destructive',
      });
      return;
    }

    setSavingId(recipient.id);
    try {
      const { data, error } = await typedSupabase
        .from('ticket_department_email_recipients')
        .update({
          name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
        })
        .eq('id', recipient.id)
        .select()
        .single();

      if (error) throw error;

      setRecipients((prev) =>
        prev.map((item) => (item.id === recipient.id ? (data as DepartmentEmailRecipient) : item)),
      );
      cancelEdit();
      toast({ title: 'Destinatário atualizado' });
    } catch (error) {
      console.error('Error updating department email recipient:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o destinatário.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (recipient: DepartmentEmailRecipient, active: boolean) => {
    setSavingId(recipient.id);
    try {
      const { error } = await typedSupabase
        .from('ticket_department_email_recipients')
        .update({ active })
        .eq('id', recipient.id);

      if (error) throw error;

      setRecipients((prev) =>
        prev.map((item) => (item.id === recipient.id ? { ...item, active } : item)),
      );
    } catch (error) {
      console.error('Error toggling department email recipient:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status do destinatário.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (recipient: DepartmentEmailRecipient) => {
    setSavingId(recipient.id);
    try {
      const { error } = await typedSupabase
        .from('ticket_department_email_recipients')
        .delete()
        .eq('id', recipient.id);

      if (error) throw error;

      setRecipients((prev) => prev.filter((item) => item.id !== recipient.id));
      toast({ title: 'Destinatário removido' });
    } catch (error) {
      console.error('Error deleting department email recipient:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover o destinatário.',
        variant: 'destructive',
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            E-mails por Setor
          </CardTitle>
          <CardDescription>
            Configure quem recebe alertas automáticos de abertura e movimentação dos tickets.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-[180px_1fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>Setor</Label>
              <Select value={ticketType} onValueChange={(value) => setTicketType(value as TicketType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TI">TI</SelectItem>
                  <SelectItem value="Manutenção predial">Manutenção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Equipe TI" />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@empresa.com"
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Adicionar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Destinatários cadastrados</CardTitle>
          <CardDescription>
            Destinatários inativos ficam salvos, mas não recebem novos alertas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Nenhum destinatário cadastrado.
            </div>
          ) : (
            <div className="space-y-2">
              {recipients.map((recipient) => {
                const isEditing = editingId === recipient.id;
                const isSaving = savingId === recipient.id;

                return (
                  <div
                    key={recipient.id}
                    className="grid gap-3 rounded-lg border p-4 md:grid-cols-[150px_1fr_1fr_auto] md:items-center"
                  >
                    <div className="text-sm font-medium">
                      {recipient.ticket_type === 'Manutenção predial' ? 'Manutenção' : recipient.ticket_type}
                    </div>
                    {isEditing ? (
                      <>
                        <Input value={editName} onChange={(event) => setEditName(event.target.value)} />
                        <Input
                          type="email"
                          value={editEmail}
                          onChange={(event) => setEditEmail(event.target.value)}
                        />
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-medium">{recipient.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {recipient.active ? 'Ativo' : 'Inativo'}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground break-all">{recipient.email}</p>
                      </>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <Switch
                        checked={recipient.active}
                        onCheckedChange={(active) => handleToggleActive(recipient, active)}
                        disabled={isSaving}
                      />
                      {isEditing ? (
                        <>
                          <Button size="icon" variant="outline" onClick={() => handleUpdate(recipient)} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          </Button>
                          <Button size="icon" variant="ghost" onClick={cancelEdit} disabled={isSaving}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="icon" variant="outline" onClick={() => beginEdit(recipient)} disabled={isSaving}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="destructive" onClick={() => handleDelete(recipient)} disabled={isSaving}>
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
