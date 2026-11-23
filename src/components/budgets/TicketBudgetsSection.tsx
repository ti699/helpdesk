import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BudgetDetailsDialog } from '@/components/budgets/BudgetDetailsDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BudgetRecord, BudgetStatus, budgetStatusLabels } from '@/lib/budgets';
import { formatBudgetCurrency } from '@/lib/budgetUtils';

interface TicketBudgetsSectionProps {
  ticketId: string;
}

const isAgentRole = (role: string | null) => role === 'agente_ti' || role === 'agente_manutencao';

export function TicketBudgetsSection({ ticketId }: TicketBudgetsSectionProps) {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<BudgetRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const loadBudgets = useCallback(async () => {
    const { data, error } = await supabase
      .from('orcamentos')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading ticket budgets:', error);
      toast({ title: 'Erro ao carregar orçamentos', description: error.message, variant: 'destructive' });
      setBudgets([]);
    } else {
      setBudgets(data || []);
    }
    setLoading(false);
  }, [ticketId, toast]);

  useEffect(() => {
    if (role === 'admin' || isAgentRole(role)) void loadBudgets();
    else setLoading(false);
  }, [loadBudgets, role]);

  if (role !== 'admin' && !isAgentRole(role)) return null;

  return (
    <>
      <Card className="shrink-0">
        <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Orçamentos do chamado</CardTitle>
          {isAgentRole(role) && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/orcamentos?ticketId=${encodeURIComponent(ticketId)}`}><Plus className="mr-2 h-4 w-4" />Novo orçamento</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent className="max-h-40 space-y-2 overflow-y-auto">
          {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /> : budgets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum orçamento vinculado a este chamado.</p>
          ) : budgets.map((budget) => (
            <button key={budget.id} type="button" onClick={() => setSelectedBudget(budget)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-left hover:bg-muted/50">
              <span><span className="font-medium">{budget.codigo} · {budget.titulo}</span><span className="block text-xs text-muted-foreground">{formatBudgetCurrency(budget.valor_total)}</span></span>
              <Badge variant={budget.status === 'aprovado' ? 'default' : budget.status === 'reprovado' ? 'destructive' : 'secondary'}>{budgetStatusLabels[budget.status as BudgetStatus]}</Badge>
            </button>
          ))}
        </CardContent>
      </Card>

      <BudgetDetailsDialog
        budget={selectedBudget}
        open={!!selectedBudget}
        onOpenChange={(open) => { if (!open) setSelectedBudget(null); }}
        isAdmin={role === 'admin'}
        canEdit={!!selectedBudget && selectedBudget.criado_por === user?.id && ['rascunho', 'revisao'].includes(selectedBudget.status)}
        onEdit={() => {
          if (selectedBudget) navigate(`/orcamentos?ticketId=${encodeURIComponent(ticketId)}&budgetId=${encodeURIComponent(selectedBudget.id)}`);
        }}
        onChanged={loadBudgets}
      />
    </>
  );
}
