import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface DiagnosticRow {
  id: string;
  message: string;
  route: string | null;
  app_version: string | null;
  browser: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
}

export function DiagnosticsManagement() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('application_error_logs').select('*').order('last_seen_at', { ascending: false }).limit(200);
    if (error) toast({ title: 'Falha ao carregar diagnóstico', description: error.message, variant: 'destructive' });
    setRows((data || []) as DiagnosticRow[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const resolve = async (id: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from('application_error_logs').update({ resolved_at: new Date().toISOString(), resolved_by: userData.user?.id }).eq('id', id);
    if (error) toast({ title: 'Não foi possível resolver', description: error.message, variant: 'destructive' });
    else void load();
  };

  const openCount = rows.filter((row) => !row.resolved_at).length;
  return <Card className="rounded-md"><CardHeader className="flex-row items-start justify-between"><div><CardTitle className="flex items-center gap-2"><TriangleAlert className="h-5 w-5" />Diagnóstico da aplicação</CardTitle><CardDescription>Falhas técnicas sanitizadas e agrupadas. Nenhuma senha, token ou conteúdo de ticket é armazenado.</CardDescription></div><Button variant="outline" size="icon" onClick={load} title="Atualizar"><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent>
    <div className="mb-4 flex gap-2"><Badge variant={openCount ? 'destructive' : 'secondary'}>{openCount} abertas</Badge><Badge variant="outline">{rows.length} registros</Badge></div>
    {loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Mensagem</TableHead><TableHead>Rota</TableHead><TableHead>Versão</TableHead><TableHead>Ocorrências</TableHead><TableHead>Última ocorrência</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><Badge variant={row.resolved_at ? 'secondary' : 'destructive'}>{row.resolved_at ? 'Resolvido' : 'Aberto'}</Badge></TableCell><TableCell className="max-w-md"><p className="line-clamp-2 text-sm">{row.message}</p></TableCell><TableCell className="whitespace-nowrap text-xs">{row.route || '-'}</TableCell><TableCell>{row.app_version || '-'}</TableCell><TableCell>{row.occurrence_count}</TableCell><TableCell className="whitespace-nowrap">{format(new Date(row.last_seen_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell><TableCell className="text-right">{!row.resolved_at && <Button variant="ghost" size="sm" onClick={() => resolve(row.id)}><CheckCircle2 className="mr-2 h-4 w-4" />Resolver</Button>}</TableCell></TableRow>)}{!rows.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">Nenhuma falha registrada.</TableCell></TableRow>}</TableBody></Table></div>}
  </CardContent></Card>;
}
