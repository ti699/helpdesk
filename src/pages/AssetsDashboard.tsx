import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, CircleDollarSign, FileWarning, Loader2, PackageCheck, Pencil, Search, ShieldAlert, UserRoundX } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { deactivateAsset } from '@/lib/assetActions';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { AssetMetricCard } from '@/components/assets/AssetMetricCard';
import { AssetStatusBadge } from '@/components/assets/AssetStatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AssetCategory, AssetLocation, AssetRecord, AssetStatus, formatCurrency, normalizeAssetText } from '@/types/assets';

const db = supabase as unknown as SupabaseClient;

export default function AssetsDashboard() {
  const { assetAccess } = useAuth();
  const { toast } = useToast();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [location, setLocation] = useState('all');
  const [department, setDepartment] = useState('all');
  const [assetToDeactivate, setAssetToDeactivate] = useState<AssetRecord | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const canOperate = assetAccess === 'operador' || assetAccess === 'gestor';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsResult, categoriesResult, statusesResult, locationsResult] = await Promise.all([
        db.from('assets').select(`
          *,
          category:asset_categories(id, name, active),
          status:asset_statuses(id, name, color, is_default, is_terminal, active),
          location:asset_locations(id, name, description, active),
          responsible:profiles!assets_responsible_user_id_fkey(id, nome, email, setor)
        `).eq('active', true).order('created_at', { ascending: false }),
        db.from('asset_categories').select('*').eq('active', true).order('sort_order'),
        db.from('asset_statuses').select('*').eq('active', true).order('sort_order'),
        db.from('asset_locations').select('*').eq('active', true).order('name'),
      ]);
      if (assetsResult.error) throw assetsResult.error;
      if (categoriesResult.error) throw categoriesResult.error;
      if (statusesResult.error) throw statusesResult.error;
      if (locationsResult.error) throw locationsResult.error;
      setAssets((assetsResult.data || []) as AssetRecord[]);
      setCategories(categoriesResult.data || []);
      setStatuses(statusesResult.data || []);
      setLocations(locationsResult.data || []);
    } catch (error) {
      console.error('Error loading assets:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar os patrimônios.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const departments = useMemo(() => [...new Set(assets.map((asset) => asset.department).filter(Boolean) as string[])].sort(), [assets]);
  const filtered = useMemo(() => assets.filter((asset) => {
    const haystack = normalizeAssetText([
      asset.asset_code, asset.name, asset.brand, asset.model, asset.serial_number,
      asset.department, asset.responsible?.nome, asset.responsible_name,
    ].filter(Boolean).join(' '));
    return (!search || haystack.includes(normalizeAssetText(search)))
      && (category === 'all' || asset.category_id === category)
      && (status === 'all' || asset.status_id === status)
      && (location === 'all' || asset.location_id === location)
      && (department === 'all' || asset.department === department);
  }), [assets, category, department, location, search, status]);

  const stats = useMemo(() => {
    const maintenance = assets.filter((asset) => normalizeAssetText(asset.status?.name || '').includes('manutencao')).length;
    const risk = assets.filter((asset) => ['extraviado', 'baixado', 'descartado'].includes(normalizeAssetText(asset.status?.name || ''))).length;
    return {
      total: assets.length,
      value: assets.reduce((sum, asset) => sum + (Number(asset.purchase_value) || 0), 0),
      unassigned: assets.filter((asset) => !asset.responsible_user_id && !asset.responsible_name).length,
      maintenance,
      risk,
    };
  }, [assets]);

  const confirmDeactivate = async () => {
    if (!assetToDeactivate) return;
    setDeactivating(true);
    try {
      await deactivateAsset(assetToDeactivate.id);
      toast({ title: 'Patrimônio desativado', description: 'O histórico foi preservado.' });
      setAssetToDeactivate(null);
      await fetchData();
    } catch (error) {
      toast({ title: 'Erro', description: error instanceof Error ? error.message : 'Não foi possível desativar.', variant: 'destructive' });
    } finally {
      setDeactivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AssetHeader />
      <main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <AssetMetricCard label="Patrimônios ativos" value={stats.total} detail="itens cadastrados" icon={Boxes} accent="#2563eb" />
          <AssetMetricCard label="Valor registrado" value={formatCurrency(stats.value)} detail="valor de aquisição" icon={CircleDollarSign} accent="#16a34a" />
          <AssetMetricCard label="Sem responsável" value={stats.unassigned} detail="requer conferência" icon={UserRoundX} accent="#eab308" />
          <AssetMetricCard label="Em manutenção" value={stats.maintenance} detail="indisponíveis" icon={FileWarning} accent="#ea580c" />
          <AssetMetricCard label="Baixa ou risco" value={stats.risk} detail="extraviado/baixado" icon={ShieldAlert} accent="#dc2626" />
        </section>

        <Card className="rounded-md">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-lg">Inventário patrimonial</CardTitle>
                <p className="text-sm text-muted-foreground">{filtered.length} de {assets.length} itens</p>
              </div>
              <div className="relative w-full lg:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Código, item, série ou responsável" className="pl-9" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as categorias</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
              <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{statuses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
              <Select value={location} onValueChange={setLocation}><SelectTrigger><SelectValue placeholder="Localização" /></SelectTrigger><SelectContent><SelectItem value="all">Todas as localizações</SelectItem>{locations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
              <Select value={department} onValueChange={setDepartment}><SelectTrigger><SelectValue placeholder="Setor" /></SelectTrigger><SelectContent><SelectItem value="all">Todos os setores</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
            </div>

            {loading ? (
              <div className="flex h-56 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : filtered.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center text-center"><PackageCheck className="mb-3 h-10 w-10 text-muted-foreground" /><p className="font-medium">Nenhum patrimônio encontrado</p><p className="text-sm text-muted-foreground">Ajuste os filtros ou cadastre o primeiro bem.</p></div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader><TableRow><TableHead>Código / Item</TableHead><TableHead>Status</TableHead><TableHead>Categoria</TableHead><TableHead>Responsável</TableHead><TableHead>Setor / Local</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-[110px] text-right">Ações</TableHead></TableRow></TableHeader>
                  <TableBody>{filtered.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell><Link to={`/patrimonio/${asset.id}`} className="block hover:underline"><span className="font-mono text-xs text-primary">{asset.asset_code}</span><p className="max-w-[260px] truncate font-medium">{asset.name}</p><p className="text-xs text-muted-foreground">{[asset.brand, asset.model].filter(Boolean).join(' ') || 'Sem marca/modelo'}</p></Link></TableCell>
                      <TableCell><AssetStatusBadge name={asset.status?.name} color={asset.status?.color} /></TableCell>
                      <TableCell>{asset.category?.name || 'Não informada'}</TableCell>
                      <TableCell><p className="max-w-[210px] truncate">{asset.responsible?.nome || asset.responsible_name || 'Sem responsável'}</p></TableCell>
                      <TableCell><p>{asset.department || 'Sem setor'}</p><p className="text-xs text-muted-foreground">{asset.location?.name || 'Sem localização'}</p></TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(asset.purchase_value) || null)}</TableCell>
                      <TableCell><div className="flex justify-end gap-1"><Link to={`/patrimonio/${asset.id}`}><Button variant="outline" size="sm">Ver</Button></Link>{canOperate && <Link to={`/patrimonio/${asset.id}/editar`}><Button variant="ghost" size="icon" title="Editar"><Pencil className="h-4 w-4" /></Button></Link>}{canOperate && <Button variant="ghost" size="icon" className="text-destructive" title="Desativar" onClick={() => setAssetToDeactivate(asset)}><ShieldAlert className="h-4 w-4" /></Button>}</div></TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={!!assetToDeactivate} onOpenChange={(open) => !open && setAssetToDeactivate(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Desativar patrimônio?</AlertDialogTitle><AlertDialogDescription>O item {assetToDeactivate?.asset_code} deixará de aparecer no inventário ativo. Seu histórico, tickets, termos e movimentações serão preservados.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={confirmDeactivate} disabled={deactivating}>{deactivating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Desativar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
