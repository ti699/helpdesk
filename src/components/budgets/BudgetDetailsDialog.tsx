import { useEffect, useState } from 'react';
import { Check, FileText, RotateCcw, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  BudgetDecision,
  BudgetRecord,
  BudgetStatus,
  budgetStatusLabels,
  decideBudget,
  getBudgetAttachmentUrl,
  parseBudgetItems,
} from '@/lib/budgets';
import { formatBudgetCurrency } from '@/lib/budgetUtils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface BudgetDetailsDialogProps {
  budget: BudgetRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}

const statusVariant: Record<BudgetStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline',
  aguardando_aprovacao: 'secondary',
  aprovado: 'default',
  reprovado: 'destructive',
  revisao: 'outline',
};

const decisionLabels: Record<BudgetDecision, string> = {
  aprovado: 'Aprovar',
  reprovado: 'Reprovar',
  revisao: 'Solicitar revisão',
};

export function BudgetDetailsDialog({
  budget,
  open,
  onOpenChange,
  isAdmin,
  canEdit,
  onEdit,
  onChanged,
}: BudgetDetailsDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState(false);
  const [ticketLabel, setTicketLabel] = useState<string | null>(null);
  const [decision, setDecision] = useState<BudgetDecision | null>(null);
  const [reason, setReason] = useState('');
  const [savingDecision, setSavingDecision] = useState(false);

  useEffect(() => {
    let active = true;
    setAttachmentUrl(null);
    setAttachmentError(false);

    if (open && budget?.anexo_url) {
      getBudgetAttachmentUrl(budget.anexo_url)
        .then((url) => { if (active) setAttachmentUrl(url); })
        .catch((error: unknown) => {
          console.error('Failed to load budget attachment:', error);
          if (active) {
            setAttachmentError(true);
            toast({ title: 'Erro ao abrir anexo', description: error instanceof Error ? error.message : 'Não foi possível gerar o link do anexo.', variant: 'destructive' });
          }
        });
    }

    return () => { active = false; };
  }, [budget?.anexo_url, open, toast]);

  useEffect(() => {
    let active = true;
    setTicketLabel(null);

    const loadTicket = async () => {
      if (!open || !budget?.ticket_id) return;
      try {
        const { data, error } = await supabase
        .from('tickets')
        .select('protocolo, titulo')
        .eq('id', budget.ticket_id)
        .maybeSingle();
        if (error) throw error;
        if (active && data) setTicketLabel(`${data.protocolo} · ${data.titulo}`);
        else if (active) setTicketLabel('Chamado não disponível');
      } catch (error) {
        console.error('Failed to load budget ticket:', error);
        if (active) {
          setTicketLabel('Chamado não disponível');
          toast({ title: 'Erro ao carregar chamado vinculado', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
        }
      }
    };

    void loadTicket();

    return () => { active = false; };
  }, [budget?.ticket_id, open, toast]);

  const items = budget ? parseBudgetItems(budget.itens) : [];

  const submitDecision = async () => {
    if (!budget || !decision || !user) return;
    if (decision !== 'aprovado' && !reason.trim()) {
      toast({ title: 'Motivo obrigatório', description: 'Informe o motivo da reprovação ou da revisão solicitada.', variant: 'destructive' });
      return;
    }

    setSavingDecision(true);
    try {
      await decideBudget(budget.id, decision, reason);
      toast({ title: 'Decisão registrada', description: `${budget.codigo}: ${decisionLabels[decision].toLowerCase()}.` });
      setDecision(null);
      setReason('');
      onOpenChange(false);
      await onChanged();
    } catch (error) {
      toast({ title: 'Não foi possível registrar a decisão', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSavingDecision(false);
    }
  };

  return (
    <>
      <Dialog open={open && !!budget} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {budget && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {budget.codigo} · {budget.titulo}
                  <Badge variant={statusVariant[budget.status as BudgetStatus] || 'outline'}>
                    {budgetStatusLabels[budget.status as BudgetStatus] || budget.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription>Detalhes e histórico de decisão do orçamento.</DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div><p className="text-muted-foreground">Tipo</p><p className="font-medium">{budget.tipo === 'interno' ? 'Interno' : 'Externo'}</p></div>
                <div><p className="text-muted-foreground">Setor</p><p className="font-medium">{budget.setor}</p></div>
                <div><p className="text-muted-foreground">Fornecedor</p><p className="font-medium">{budget.fornecedor || 'Não informado'}</p></div>
                <div><p className="text-muted-foreground">Chamado</p><p className="font-medium">{budget.ticket_id ? ticketLabel || 'Carregando chamado…' : 'Sem chamado vinculado'}</p></div>
                <div><p className="text-muted-foreground">Criado em</p><p className="font-medium">{new Date(budget.created_at).toLocaleString('pt-BR')}</p></div>
                <div className="sm:col-span-2"><p className="text-muted-foreground">Descrição</p><p className="whitespace-pre-wrap">{budget.descricao}</p></div>
              </div>

              <div className="space-y-2">
                <Label>Itens</Label>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead className="text-right">Qtd.</TableHead><TableHead className="text-right">Unitário</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.descricao}</TableCell>
                          <TableCell className="text-right">{item.quantidade}</TableCell>
                          <TableCell className="text-right">{formatBudgetCurrency(item.valor_unitario)}</TableCell>
                          <TableCell className="text-right">{formatBudgetCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                      {items.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Nenhum item cadastrado.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-right text-base font-semibold">Total: {formatBudgetCurrency(budget.valor_total)}</p>
              </div>

              {budget.anexo_url && (
                <div>
                  {attachmentUrl
                    ? <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline"><FileText className="h-4 w-4" />{budget.anexo_nome || 'Abrir anexo'}</a>
                    : <p className="text-sm text-muted-foreground">{attachmentError ? 'Não foi possível carregar o anexo.' : 'Carregando anexo…'}</p>}
                </div>
              )}
              {budget.motivo_decisao && <div className="rounded-md border bg-muted/40 p-3 text-sm"><p className="font-medium">Motivo da decisão</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{budget.motivo_decisao}</p></div>}

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                {canEdit && <Button variant="outline" onClick={onEdit}>Editar orçamento</Button>}
                {isAdmin && budget.status === 'aguardando_aprovacao' && (
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    <Button variant="outline" onClick={() => setDecision('revisao')}><RotateCcw className="mr-2 h-4 w-4" />Revisão</Button>
                    <Button variant="destructive" onClick={() => setDecision('reprovado')}><X className="mr-2 h-4 w-4" />Reprovar</Button>
                    <Button onClick={() => setDecision('aprovado')}><Check className="mr-2 h-4 w-4" />Aprovar</Button>
                  </div>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!decision} onOpenChange={(nextOpen) => { if (!nextOpen && !savingDecision) setDecision(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{decision ? decisionLabels[decision] : 'Decisão do orçamento'}</DialogTitle>
            <DialogDescription>{budget?.codigo} · A decisão será registrada no histórico do chamado vinculado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="budget-decision-reason">{decision === 'aprovado' ? 'Observação (opcional)' : 'Motivo (obrigatório)'}</Label>
            <Textarea id="budget-decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Informe os detalhes da decisão" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)} disabled={savingDecision}>Cancelar</Button>
            <Button onClick={submitDecision} disabled={savingDecision || !decision || (decision !== 'aprovado' && !reason.trim())}>
              {savingDecision ? 'Salvando…' : 'Confirmar decisão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
