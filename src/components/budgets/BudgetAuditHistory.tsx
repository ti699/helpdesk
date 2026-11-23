import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type BudgetAuditRecord = Database['public']['Tables']['orcamentos_historico']['Row'];
type BudgetAuditAction = 'criado' | 'editado' | 'enviado' | 'aprovado' | 'reprovado' | 'revisao' | 'excluido';

const PAGE_SIZE = 50;

const actionLabels: Record<BudgetAuditAction, string> = {
  criado: 'Criado',
  editado: 'Editado',
  enviado: 'Enviado para aprovação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  revisao: 'Revisão solicitada',
  excluido: 'Excluído',
};

interface BudgetAuditHistoryProps {
  budgetId?: string;
}

export function BudgetAuditHistory({ budgetId }: BudgetAuditHistoryProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<BudgetAuditRecord[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPage = useCallback(async (from: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      let query = supabase
        .from('orcamentos_historico')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (budgetId) query = query.eq('orcamento_id', budgetId);

      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      const page = data || [];
      setEntries((current) => from === 0 ? page : [...current, ...page]);
      setOffset(from + page.length);
      setHasMore(page.length === PAGE_SIZE);
    } catch (error) {
      console.error('Error loading budget audit history:', error);
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      setLoadError(message);
      toast({ title: 'Erro ao carregar histórico de orçamentos', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [budgetId, toast]);

  useEffect(() => {
    setEntries([]);
    setOffset(0);
    setHasMore(false);
    void loadPage(0);
  }, [loadPage]);

  if (entries.length === 0 && loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      {entries.length === 0 && !loadError && (
        <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma ação registrada.</p>
      )}
      {entries.map((entry) => {
        const action = entry.acao as BudgetAuditAction;
        const destructive = action === 'reprovado' || action === 'excluido';
        return (
          <Card key={entry.id}>
            <CardContent className="space-y-2 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{entry.orcamento_codigo}</span>
                  <Badge variant={destructive ? 'destructive' : action === 'aprovado' ? 'default' : 'secondary'}>
                    {actionLabels[action] || entry.acao}
                  </Badge>
                </div>
                <time className="text-xs text-muted-foreground" dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleString('pt-BR')}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                Usuário: {entry.usuario_id || 'indisponível'}
                {entry.ticket_id ? ` · Chamado: ${entry.ticket_id}` : ''}
              </p>
              {entry.motivo && (
                <p className="whitespace-pre-wrap text-sm"><span className="font-medium">Motivo:</span> {entry.motivo}</p>
              )}
              <details className="rounded-md border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-medium">Snapshot completo</summary>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(entry.detalhes, null, 2)}
                </pre>
              </details>
            </CardContent>
          </Card>
        );
      })}
      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button variant="outline" onClick={() => void loadPage(offset)} disabled={loading}>Tentar novamente</Button>
        </div>
      )}
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => void loadPage(offset)} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Carregar mais histórico
          </Button>
        </div>
      )}
    </div>
  );
}
