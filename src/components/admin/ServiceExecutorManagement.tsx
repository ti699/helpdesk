import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Pencil, Plus, UserRoundCog } from 'lucide-react';

type ExecutorArea = 'TI' | 'Manutenção predial';

interface ServiceExecutor {
  id: string;
  name: string;
  specialty: string;
  area: ExecutorArea;
  phone: string | null;
  email: string | null;
  active: boolean;
}

const emptyForm = {
  name: '',
  specialty: '',
  area: 'Manutenção predial' as ExecutorArea,
  phone: '',
  email: '',
  active: true,
};

export function ServiceExecutorManagement() {
  const { toast } = useToast();
  const [executors, setExecutors] = useState<ServiceExecutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingExecutor, setEditingExecutor] = useState<ServiceExecutor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    fetchExecutors();
  }, []);

  const fetchExecutors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('service_executors')
        .select('id, name, specialty, area, phone, email, active')
        .order('area', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setExecutors((data || []) as ServiceExecutor[]);
    } catch (error) {
      console.error('Erro ao carregar executores:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os executores de serviço.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setEditingExecutor(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (executor: ServiceExecutor) => {
    setEditingExecutor(executor);
    setForm({
      name: executor.name,
      specialty: executor.specialty,
      area: executor.area,
      phone: executor.phone || '',
      email: executor.email || '',
      active: executor.active,
    });
    setDialogOpen(true);
  };

  const saveExecutor = async () => {
    if (!form.name.trim() || !form.specialty.trim()) {
      toast({
        title: 'Dados obrigatórios',
        description: 'Informe o nome e a função/especialidade do executor.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        specialty: form.specialty.trim(),
        area: form.area,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        active: form.active,
      };

      if (editingExecutor) {
        const { error } = await supabase
          .from('service_executors')
          .update(payload)
          .eq('id', editingExecutor.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('service_executors')
          .insert(payload);

        if (error) throw error;
      }

      toast({
        title: editingExecutor ? 'Executor atualizado' : 'Executor cadastrado',
        description: 'O cadastro de execução foi salvo.',
      });
      setDialogOpen(false);
      await fetchExecutors();
    } catch (error) {
      console.error('Erro ao salvar executor:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível salvar o executor.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleExecutor = async (executor: ServiceExecutor) => {
    try {
      const { error } = await supabase
        .from('service_executors')
        .update({ active: !executor.active })
        .eq('id', executor.id);

      if (error) throw error;
      setExecutors((current) =>
        current.map((item) =>
          item.id === executor.id ? { ...item, active: !item.active } : item
        )
      );
    } catch (error) {
      console.error('Erro ao alterar executor:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status do executor.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Executores de Serviço</CardTitle>
          <CardDescription>
            Cadastre colaboradores que executam serviços, sem criar login no sistema.
          </CardDescription>
        </div>
        <Button onClick={openCreateDialog} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Adicionar executor
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : executors.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <UserRoundCog className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhum executor cadastrado</p>
            <p className="text-sm text-muted-foreground">
              Cadastre pedreiros, eletricistas, técnicos e outros executores.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {executors.map((executor) => (
              <div key={executor.id} className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{executor.name}</p>
                    <Badge variant={executor.active ? 'outline' : 'secondary'}>
                      {executor.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge variant="outline">{executor.area === 'Manutenção predial' ? 'Manutenção' : 'TI'}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{executor.specialty}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {executor.phone && <span>{executor.phone}</span>}
                    {executor.phone && executor.email && <span>•</span>}
                    {executor.email && <span>{executor.email}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(executor)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <span className="text-xs text-muted-foreground">Ativo</span>
                    <Switch checked={executor.active} onCheckedChange={() => toggleExecutor(executor)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingExecutor ? 'Editar executor' : 'Adicionar executor'}</DialogTitle>
            <DialogDescription>
              Executor é quem realiza o serviço. Ele não precisa ter usuário e senha.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="executor-name">Nome</Label>
              <Input
                id="executor-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Ex.: João da Silva"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="executor-specialty">Função/especialidade</Label>
                <Input
                  id="executor-specialty"
                  value={form.specialty}
                  onChange={(event) => setForm((current) => ({ ...current, specialty: event.target.value }))}
                  placeholder="Ex.: Pedreiro"
                />
              </div>
              <div className="space-y-2">
                <Label>Área</Label>
                <Select value={form.area} onValueChange={(value) => setForm((current) => ({ ...current, area: value as ExecutorArea }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Manutenção predial">Manutenção predial</SelectItem>
                    <SelectItem value="TI">TI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="executor-phone">Telefone</Label>
                <Input
                  id="executor-phone"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="executor-email">E-mail</Label>
                <Input
                  id="executor-email"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Executor ativo</p>
                <p className="text-xs text-muted-foreground">Executores inativos não aparecem para novos serviços.</p>
              </div>
              <Switch checked={form.active} onCheckedChange={(active) => setForm((current) => ({ ...current, active }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveExecutor} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
