import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AppHeader } from '@/components/AppHeader';
import { BudgetDetailsDialog } from '@/components/budgets/BudgetDetailsDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  BudgetRecord,
  BudgetStatus,
  BudgetType,
  budgetStatusLabels,
  parseBudgetItems,
  saveBudget,
} from '@/lib/budgets';
import { BudgetLine, calculateBudgetTotal, canAccessBudgets, formatBudgetCurrency, roundBudgetValue } from '@/lib/budgetUtils';
import { supabase } from '@/integrations/supabase/client';

interface TicketOption {
  id: string;
  protocolo: string;
  titulo: string;
}

interface BudgetFormValues {
  titulo: string;
  tipo: BudgetType;
  setor: string;
  fornecedor: string;
  descricao: string;
  ticketId: string;
  itens: BudgetLine[];
  attachment: File | null;
}

const createEmptyLine = (): BudgetLine => ({ id: crypto.randomUUID(), descricao: '', quantidade: 1, valor_unitario: 0, total: 0 });
const emptyForm = (ticketId = ''): BudgetFormValues => ({
  titulo: '',
  tipo: 'interno',
  setor: '',
  fornecedor: '',
  descricao: '',
  ticketId,
  itens: [createEmptyLine()],
  attachment: null,
});

const statusVariant: Record<BudgetStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline',
  aguardando_aprovacao: 'secondary',
  aprovado: 'default',
  reprovado: 'destructive',
  revisao: 'outline',
};

const fileIsAllowed = (file: File) =>
  file.size <= 20 * 1024 * 1024
  && /\.(pdf|doc|docx|xls|xlsx|jpe?g|png)$/i.test(file.name);

export default function Budgets() {
  const { role, user, managementReportAccess } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [tickets, setTickets] = useState<TicketOption[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetRecord | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetRecord | null>(null);
  const [form, setForm] = useState<BudgetFormValues>(emptyForm(searchParams.get('ticketId') || ''));
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [typeFilter, setTypeFilter] = useState('todos');

  const isAdmin = role === 'admin';
  const canCreate = canAccessBudgets(role, managementReportAccess);

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orcamentos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading budgets:', error);
      toast({ title: 'Erro ao carregar orçamentos', description: error.message, variant: 'destructive' });
      setBudgets([]);
    } else {
      setBudgets(data || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (canCreate) void loadBudgets();
    else setLoading(false);
  }, [canCreate, loadBudgets]);

  useEffect(() => {
    if (!canCreate) return;
    let active = true;
    const loadTickets = async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, protocolo, titulo')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        console.error('Error loading budget ticket options:', error);
        toast({ title: 'Erro ao carregar chamados', description: error.message, variant: 'destructive' });
        return;
      }

      const options = data || [];
      const selectedTicketId = searchParams.get('ticketId');
      if (selectedTicketId && !options.some((ticket) => ticket.id === selectedTicketId)) {
        const { data: selectedTicket, error: selectedTicketError } = await supabase
          .from('tickets')
          .select('id, protocolo, titulo')
          .eq('id', selectedTicketId)
          .maybeSingle();
        if (selectedTicketError) {
          console.error('Error loading selected budget ticket:', selectedTicketError);
          toast({ title: 'Erro ao carregar chamado vinculado', description: selectedTicketError.message, variant: 'destructive' });
        } else if (selectedTicket) {
          options.unshift(selectedTicket);
        }
      }

      if (active) setTickets(options);
    };
    void loadTickets();
    return () => { active = false; };
  }, [canCreate, searchParams, toast]);

  useEffect(() => {
    const budgetId = searchParams.get('budgetId');
    if (!budgetId || loading) return;
    const budget = budgets.find((item) => item.id === budgetId);
    if (!budget) return;

    if (
      canCreate
      && budget.criado_por === user?.id
      && (budget.status === 'rascunho' || budget.status === 'revisao')
    ) {
      setEditingBudget(budget);
      setForm({
        titulo: budget.titulo,
        tipo: budget.tipo as BudgetType,
        setor: budget.setor,
        fornecedor: budget.fornecedor || '',
        descricao: budget.descricao,
        ticketId: budget.ticket_id || '',
        itens: parseBudgetItems(budget.itens),
        attachment: null,
      });
      setFormOpen(true);
    } else {
      setSelectedBudget(budget);
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('budgetId');
    setSearchParams(nextParams, { replace: true });
  }, [budgets, canCreate, loading, searchParams, setSearchParams, user?.id]);

  const filteredBudgets = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return budgets.filter((budget) => {
      const matchesStatus = statusFilter === 'todos' || budget.status === statusFilter;
      const matchesType = typeFilter === 'todos' || budget.tipo === typeFilter;
      const searchable = `${budget.codigo} ${budget.titulo} ${budget.setor} ${budget.fornecedor || ''}`.toLocaleLowerCase('pt-BR');
      return matchesStatus && matchesType && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [budgets, query, statusFilter, typeFilter]);

  const openNewForm = () => {
    setEditingBudget(null);
    setForm(emptyForm(searchParams.get('ticketId') || ''));
    setFormOpen(true);
  };

  const openEditForm = () => {
    if (!selectedBudget) return;
    const budget = selectedBudget;
    setSelectedBudget(null);
    setEditingBudget(budget);
    setForm({
      titulo: budget.titulo,
      tipo: budget.tipo as BudgetType,
      setor: budget.setor,
      fornecedor: budget.fornecedor || '',
      descricao: budget.descricao,
      ticketId: budget.ticket_id || '',
      itens: parseBudgetItems(budget.itens),
      attachment: null,
    });
    setFormOpen(true);
  };

  const updateLine = (id: string, patch: Partial<BudgetLine>) => {
    setForm((current) => ({
      ...current,
      itens: current.itens.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        return { ...next, total: roundBudgetValue(next.quantidade * next.valor_unitario) };
      }),
    }));
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = '';
    if (file && !fileIsAllowed(file)) {
      toast({ title: 'Arquivo não permitido', description: 'Envie PDF, Word, Excel, JPG ou PNG com até 20 MB.', variant: 'destructive' });
      return;
    }
    setForm((current) => ({ ...current, attachment: file }));
  };

  const submitForm = async (submitForApproval: boolean) => {
    if (!user || !canCreate) return;
    if (!form.titulo.trim() || !form.setor.trim() || !form.descricao.trim()) {
      toast({ title: 'Dados obrigatórios', description: 'Preencha título, setor e descrição do orçamento.', variant: 'destructive' });
      return;
    }

    const items = form.itens
      .filter((item) => item.descricao.trim())
      .map((item) => ({ ...item, descricao: item.descricao.trim(), total: roundBudgetValue(item.quantidade * item.valor_unitario) }));
    if (
      (submitForApproval || editingBudget?.status === 'revisao')
      && (!items.length || items.some((item) =>
        !Number.isFinite(item.quantidade)
        || !Number.isFinite(item.valor_unitario)
        || item.quantidade <= 0
        || item.valor_unitario < 0
      ))
    ) {
      toast({ title: 'Itens inválidos', description: 'Informe ao menos um item, com quantidade maior que zero e valores válidos.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await saveBudget({
        id: editingBudget?.id,
        userId: user.id,
        ticketId: form.ticketId || null,
        titulo: form.titulo.trim(),
        tipo: form.tipo,
        setor: form.setor.trim(),
        fornecedor: form.fornecedor.trim() || null,
        descricao: form.descricao.trim(),
        itens: items,
        valorTotal: calculateBudgetTotal(items),
        status: submitForApproval
          ? 'aguardando_aprovacao'
          : editingBudget?.status === 'revisao' ? 'revisao' : 'rascunho',
        currentAttachmentPath: editingBudget?.anexo_url,
        currentAttachmentName: editingBudget?.anexo_nome,
        currentReason: editingBudget?.status === 'revisao' ? editingBudget.motivo_decisao : null,
        attachment: form.attachment,
      });
      toast({ title: submitForApproval ? 'Orçamento enviado para aprovação' : 'Rascunho salvo' });
      setFormOpen(false);
      setEditingBudget(null);
      await loadBudgets();
    } catch (error) {
      console.error('Error saving budget:', error);
      toast({ title: 'Não foi possível salvar o orçamento', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const closeForm = (open: boolean) => {
    if (saving) return;
    setFormOpen(open);
    if (!open) setEditingBudget(null);
  };

  if (!canCreate) {
    return <div className="min-h-screen bg-background"><AppHeader title="Orçamentos" /><main className="container py-8"><Alert><AlertDescription>Seu perfil não tem acesso ao módulo de orçamentos.</AlertDescription></Alert></main></div>;
  }

  const validItems = form.itens.filter((item) => item.descricao.trim());
  const total = calculateBudgetTotal(validItems);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Orçamentos" subtitle="Cadastro e aprovação de orçamentos" badge={isAdmin ? 'Administrador' : 'Gerencial'} />
      <main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Orçamentos</h2><p className="text-sm text-muted-foreground">{isAdmin ? 'Todos os orçamentos aguardando decisão e histórico.' : 'Orçamentos e respectivas decisões.'}</p></div>
          {canCreate && <Button onClick={openNewForm}><Plus className="mr-2 h-4 w-4" />Novo orçamento</Button>}
        </div>

        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(220px,1fr)_220px_180px]">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, título, setor ou fornecedor" aria-label="Buscar orçamentos" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filtrar por status"><SelectValue placeholder="Todos os status" /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos os status</SelectItem>{Object.entries(budgetStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger aria-label="Filtrar por tipo"><SelectValue placeholder="Todos os tipos" /></SelectTrigger>
              <SelectContent><SelectItem value="todos">Todos os tipos</SelectItem><SelectItem value="interno">Interno</SelectItem><SelectItem value="externo">Externo</SelectItem></SelectContent>
            </Select>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : filteredBudgets.length === 0 ? (
          <Card><CardContent className="flex min-h-40 flex-col items-center justify-center gap-2 text-center"><FileText className="h-8 w-8 text-muted-foreground" /><p className="font-medium">Nenhum orçamento encontrado</p><p className="text-sm text-muted-foreground">Ajuste os filtros ou cadastre um novo orçamento.</p></CardContent></Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredBudgets.map((budget) => (
              <Card key={budget.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2"><div><CardDescription>{budget.codigo} · {budget.tipo === 'interno' ? 'Interno' : 'Externo'}</CardDescription><CardTitle className="mt-1 text-base">{budget.titulo}</CardTitle></div><Badge variant={statusVariant[budget.status as BudgetStatus]}>{budgetStatusLabels[budget.status as BudgetStatus]}</Badge></div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <p className="line-clamp-2 text-sm text-muted-foreground">{budget.descricao}</p>
                  <div className="flex items-center justify-between gap-2 text-sm"><span>{budget.setor}{budget.fornecedor ? ` · ${budget.fornecedor}` : ''}</span><span className="shrink-0 font-semibold">{formatBudgetCurrency(budget.valor_total)}</span></div>
                  <Button variant="outline" className="mt-auto" onClick={() => setSelectedBudget(budget)}>Ver detalhes</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={formOpen} onOpenChange={closeForm}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingBudget ? `Editar ${editingBudget.codigo}` : 'Novo orçamento'}</DialogTitle>
            <DialogDescription>Preencha os dados e os itens. O total é calculado automaticamente.</DialogDescription>
          </DialogHeader>
          <form id="budget-form" onSubmit={(event) => { event.preventDefault(); void submitForm(true); }} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="budget-title">Título *</Label><Input id="budget-title" required maxLength={160} value={form.titulo} onChange={(event) => setForm((current) => ({ ...current, titulo: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Tipo *</Label><Select value={form.tipo} onValueChange={(value: BudgetType) => setForm((current) => ({ ...current, tipo: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="interno">Interno</SelectItem><SelectItem value="externo">Externo</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label htmlFor="budget-sector">Setor *</Label><Input id="budget-sector" required maxLength={120} value={form.setor} onChange={(event) => setForm((current) => ({ ...current, setor: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label htmlFor="budget-vendor">Fornecedor</Label><Input id="budget-vendor" maxLength={160} value={form.fornecedor} onChange={(event) => setForm((current) => ({ ...current, fornecedor: event.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Chamado vinculado</Label><Select value={form.ticketId || 'none'} onValueChange={(value) => setForm((current) => ({ ...current, ticketId: value === 'none' ? '' : value }))}><SelectTrigger><SelectValue placeholder="Sem chamado" /></SelectTrigger><SelectContent><SelectItem value="none">Sem chamado</SelectItem>{tickets.map((ticket) => <SelectItem key={ticket.id} value={ticket.id}>{ticket.protocolo} · {ticket.titulo}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="budget-description">Descrição *</Label><Textarea id="budget-description" required maxLength={5000} value={form.descricao} onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>Itens</Label><Button type="button" variant="outline" size="sm" onClick={() => setForm((current) => ({ ...current, itens: [...current.itens, createEmptyLine()] }))}><Plus className="mr-2 h-4 w-4" />Adicionar item</Button></div>
              <div className="space-y-2">
                {form.itens.map((item, index) => (
                  <div key={item.id} className="grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(160px,1fr)_90px_140px_130px_36px] sm:items-end">
                    <div className="space-y-1"><Label htmlFor={`budget-item-${item.id}`} className="text-xs">Descrição {index + 1}</Label><Input id={`budget-item-${item.id}`} maxLength={200} value={item.descricao} onChange={(event) => updateLine(item.id, { descricao: event.target.value })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Quantidade</Label><Input type="number" min="0" step="1" value={item.quantidade} onChange={(event) => updateLine(item.id, { quantidade: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Valor unitário</Label><Input type="number" min="0" step="0.01" value={item.valor_unitario} onChange={(event) => updateLine(item.id, { valor_unitario: Number(event.target.value) || 0 })} /></div>
                    <div className="space-y-1"><Label className="text-xs">Subtotal</Label><p className="flex h-10 items-center text-sm font-medium">{formatBudgetCurrency(item.quantidade * item.valor_unitario)}</p></div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remover item ${index + 1}`} onClick={() => setForm((current) => ({ ...current, itens: current.itens.filter((line) => line.id !== item.id) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
              <p className="text-right font-semibold">Total: {formatBudgetCurrency(total)}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="budget-attachment">Anexo (PDF, Word, Excel, JPG ou PNG · até 20 MB)</Label>
              <Input id="budget-attachment" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={onFileChange} />
              {(form.attachment || editingBudget?.anexo_nome) && <p className="text-xs text-muted-foreground">{form.attachment?.name || `Anexo atual: ${editingBudget?.anexo_nome}`}</p>}
            </div>
          </form>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => { void submitForm(false); }} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editingBudget?.status === 'revisao' ? 'Salvar alterações' : 'Salvar rascunho'}</Button>
            <Button type="submit" form="budget-form" disabled={saving || !form.titulo.trim() || !form.setor.trim() || !form.descricao.trim() || validItems.length === 0}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{editingBudget?.status === 'revisao' ? 'Reenviar para aprovação' : 'Enviar para aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BudgetDetailsDialog
        budget={selectedBudget}
        open={!!selectedBudget}
        onOpenChange={(open) => { if (!open) setSelectedBudget(null); }}
        isAdmin={isAdmin}
        canEdit={!!selectedBudget && selectedBudget.criado_por === user?.id && (selectedBudget.status === 'rascunho' || selectedBudget.status === 'revisao')}
        onEdit={openEditForm}
        onChanged={loadBudgets}
      />
    </div>
  );
}
