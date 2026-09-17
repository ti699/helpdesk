import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Ban, CheckCircle2, Loader2, Plus, Repeat2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { approveAssetMovement, cancelAssetMovement, createAssetMovement } from '@/lib/assetActions';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AssetLocation, AssetMovement, AssetMovementType, AssetProfile, AssetRecord, AssetStatus, movementLabels } from '@/types/assets';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const db = supabase as any;
const statusColors: Record<string, string> = { pendente: 'bg-yellow-100 text-yellow-800', aprovada: 'bg-blue-100 text-blue-800', concluida: 'bg-green-100 text-green-800', cancelada: 'bg-slate-100 text-slate-700' };

export default function AssetMovements() {
  const [searchParams] = useSearchParams();
  const { user, assetAccess } = useAuth();
  const { toast } = useToast();
  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [profiles, setProfiles] = useState<AssetProfile[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ assetId: '', movementType: 'transferencia_responsavel' as AssetMovementType, toResponsibleUserId: '', toResponsibleName: '', toDepartment: '', toLocationId: '', toStatusId: '', reason: '', notes: '' });
  const canOperate = assetAccess === 'operador' || assetAccess === 'gestor';
  const canManage = assetAccess === 'gestor';

  const load = useCallback(async () => {
    setLoading(true);
    const [movementResult, assetResult, profileResult, locationResult, statusResult] = await Promise.all([
      db.from('asset_movements').select('*, asset:assets(id, asset_code, name)').order('created_at', { ascending: false }).limit(300),
      db.from('assets').select('id, asset_code, name, responsible_user_id, responsible_name, department, location_id, status_id').eq('active', true).order('asset_code'),
      db.from('profiles').select('id, nome, email, setor').eq('active', true).order('nome'),
      db.from('asset_locations').select('*').eq('active', true).order('name'),
      db.from('asset_statuses').select('*').eq('active', true).order('sort_order'),
    ]);
    setMovements(movementResult.data || []); setAssets(assetResult.data || []); setProfiles(profileResult.data || []); setLocations(locationResult.data || []); setStatuses(statusResult.data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const requestedAsset = searchParams.get('asset');
    if (requestedAsset && assets.some((asset) => asset.id === requestedAsset) && form.assetId !== requestedAsset) {
      selectAsset(requestedAsset);
    }
  }, [assets, searchParams]);

  const selectAsset = (assetId: string) => {
    const asset = assets.find((item) => item.id === assetId);
    setForm((current) => ({ ...current, assetId, toResponsibleUserId: asset?.responsible_user_id || '', toResponsibleName: asset?.responsible_name || '', toDepartment: asset?.department || '', toLocationId: asset?.location_id || '', toStatusId: asset?.status_id || '' }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      await createAssetMovement(form as unknown as Record<string, unknown>);
      toast({ title: 'Movimentação registrada', description: canManage ? 'Aguardando aprovação de outro gestor ou administrador.' : 'Aguardando aprovação do gestor.' });
      setForm({ assetId: '', movementType: 'transferencia_responsavel', toResponsibleUserId: '', toResponsibleName: '', toDepartment: '', toLocationId: '', toStatusId: '', reason: '', notes: '' });
      await load();
    } catch (error) { toast({ title: 'Erro', description: error instanceof Error ? error.message : 'Não foi possível registrar.', variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const updateMovement = async (movement: AssetMovement, action: 'approve' | 'cancel') => {
    try {
      if (action === 'approve') await approveAssetMovement(movement.id); else await cancelAssetMovement(movement.id);
      toast({ title: action === 'approve' ? 'Movimentação concluída' : 'Movimentação cancelada' }); await load();
    } catch (error) { toast({ title: 'Erro', description: error instanceof Error ? error.message : 'Ação não concluída.', variant: 'destructive' }); }
  };

  return <div className="min-h-screen bg-background"><AssetHeader title="Movimentações patrimoniais" subtitle="Transferências, empréstimos, manutenção e baixas" /><main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
    {canOperate && <Card className="rounded-md"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5" />Nova movimentação</CardTitle><CardDescription>A alteração do patrimônio só será aplicada depois da aprovação.</CardDescription></CardHeader><CardContent><form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div className="space-y-2"><Label>Patrimônio *</Label><Select value={form.assetId} onValueChange={selectAsset}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{assets.map((asset) => <SelectItem key={asset.id} value={asset.id}>{asset.asset_code} · {asset.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Tipo *</Label><Select value={form.movementType} onValueChange={(value) => setForm((current) => ({ ...current, movementType: value as AssetMovementType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(movementLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Novo responsável</Label><Select value={form.toResponsibleUserId || 'manual'} onValueChange={(value) => { const profile = profiles.find((item) => item.id === value); setForm((current) => ({ ...current, toResponsibleUserId: value === 'manual' ? '' : value, toResponsibleName: profile?.nome || current.toResponsibleName, toDepartment: current.toDepartment || profile?.setor || '' })); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Nome livre</SelectItem>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.nome}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Nome exibido</Label><Input value={form.toResponsibleName} onChange={(e) => setForm((current) => ({ ...current, toResponsibleName: e.target.value }))} /></div>
      <div className="space-y-2"><Label>Novo setor</Label><Input value={form.toDepartment} onChange={(e) => setForm((current) => ({ ...current, toDepartment: e.target.value }))} /></div>
      <div className="space-y-2"><Label>Nova localização</Label><Select value={form.toLocationId || 'none'} onValueChange={(value) => setForm((current) => ({ ...current, toLocationId: value === 'none' ? '' : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não alterar</SelectItem>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Novo status</Label><Select value={form.toStatusId || 'none'} onValueChange={(value) => setForm((current) => ({ ...current, toStatusId: value === 'none' ? '' : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não alterar</SelectItem>{statuses.map((status) => <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2 md:col-span-2"><Label>Motivo *</Label><Input value={form.reason} onChange={(e) => setForm((current) => ({ ...current, reason: e.target.value }))} required /></div>
      <div className="space-y-2 md:col-span-2 lg:col-span-3"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></div>
      <div className="flex justify-end md:col-span-2 lg:col-span-3"><Button disabled={saving || !form.assetId}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Repeat2 className="mr-2 h-4 w-4" />}Registrar movimentação</Button></div>
    </form></CardContent></Card>}
    <Card className="rounded-md"><CardHeader><CardTitle className="text-lg">Histórico de movimentações</CardTitle></CardHeader><CardContent>{loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Patrimônio</TableHead><TableHead>Tipo</TableHead><TableHead>Motivo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{movements.length === 0 ? <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">Nenhuma movimentação registrada.</TableCell></TableRow> : movements.map((movement) => <TableRow key={movement.id}><TableCell className="whitespace-nowrap">{format(new Date(movement.requested_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell><TableCell><p className="font-mono text-xs text-primary">{movement.asset?.asset_code}</p><p>{movement.asset?.name}</p></TableCell><TableCell>{movementLabels[movement.movement_type]}</TableCell><TableCell className="max-w-[280px] whitespace-normal">{movement.reason}</TableCell><TableCell><Badge className={statusColors[movement.status]}>{movement.status}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{movement.status === 'pendente' && canManage && movement.requested_by !== user?.id && <Button size="icon" variant="ghost" title="Aprovar" onClick={() => updateMovement(movement, 'approve')}><CheckCircle2 className="h-4 w-4 text-green-600" /></Button>}{movement.status === 'pendente' && (movement.requested_by === user?.id || canManage) && <Button size="icon" variant="ghost" title="Cancelar" onClick={() => updateMovement(movement, 'cancel')}><Ban className="h-4 w-4 text-destructive" /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
  </main></div>;
}
