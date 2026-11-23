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
type JsonObject = { [key: string]: Database['public']['Tables']['orcamentos_historico']['Row']['detalhes'] | undefined };

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

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getBudgetSnapshot = (details: BudgetAuditRecord['detalhes']): JsonObject | null => {
  if (!isJsonObject(details)) return null;
  const snapshot = details.depois || details.antes;
  return isJsonObject(snapshot) ? snapshot : null;
};

const getSnapshotString = (snapshot: JsonObject | null, field: string): string | null => {
  const value = snapshot?.[field];
  return typeof value === 'string' && value.trim() ? value : null;
};

const getSnapshotAmount = (snapshot: JsonObject | null): number | null => {
  const value = snapshot?.valor_total;
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(amount) ? amount : null;
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
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

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
      const profileIds = [...new Set(page.flatMap((entry) => [
        entry.usuario_id,
        getSnapshotString(getBudgetSnapshot(entry.detalhes), 'criado_por'),
      ].filter((id): id is string => !!id)))];

      if (profileIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', profileIds);
        if (profilesError) throw profilesError;

        const names = Object.fromEntries((profiles || []).map((profile) => [profile.id, profile.nome]));
        setProfileNames((current) => ({ ...current, ...names }));
      }

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
    setProfileNames({});
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
        const snapshot = getBudgetSnapshot(entry.detalhes);
        const creatorId = getSnapshotString(snapshot, 'criado_por');
        const amount = getSnapshotAmount(snapshot);
        const reason = entry.motivo || getSnapshotString(snapshot, 'motivo_decisao');
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
                Ação por: {entry.usuario_id ? profileNames[entry.usuario_id] || 'Nome não disponível' : 'Não identificado'}
                {' · '}
                Criado por: {creatorId ? profileNames[creatorId] || 'Nome não disponível' : 'Não identificado'}
              </p>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Título</dt><dd className="font-medium">{getSnapshotString(snapshot, 'titulo') || 'Não informado'}</dd></div>
                <div><dt className="text-muted-foreground">Setor</dt><dd>{getSnapshotString(snapshot, 'setor') || 'Não informado'}</dd></div>
                <div><dt className="text-muted-foreground">Fornecedor</dt><dd>{getSnapshotString(snapshot, 'fornecedor') || 'Não informado'}</dd></div>
                <div><dt className="text-muted-foreground">Valor total</dt><dd>{amount === null ? 'Não informado' : amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</dd></div>
                <div className="sm:col-span-2"><dt className="text-muted-foreground">Motivo</dt><dd className="whitespace-pre-wrap">{reason || 'Não informado'}</dd></div>
              </dl>
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
