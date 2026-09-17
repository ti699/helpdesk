import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createAsset, updateAsset } from '@/lib/assetActions';
import { AssetCategory, AssetLocation, AssetProfile, AssetRecord, AssetStatus } from '@/types/assets';

const db = supabase as any;
const emptyForm = {
  assetCode: '', name: '', description: '', categoryId: '', brand: '', model: '', serialNumber: '',
  invoiceNumber: '', purchaseDate: '', purchaseValue: '', warrantyUntil: '', department: '', locationId: '',
  responsibleUserId: '', responsibleName: '', statusId: '', notes: '',
};

export default function AssetFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const editing = !!id;
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [profiles, setProfiles] = useState<AssetProfile[]>([]);
  const [responsibleMode, setResponsibleMode] = useState('manual');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [categoriesResult, statusesResult, locationsResult, profilesResult, assetResult] = await Promise.all([
          db.from('asset_categories').select('*').eq('active', true).order('sort_order'),
          db.from('asset_statuses').select('*').eq('active', true).order('sort_order'),
          db.from('asset_locations').select('*').eq('active', true).order('name'),
          db.from('profiles').select('id, nome, email, setor').eq('active', true).order('nome'),
          id ? db.from('assets').select('*').eq('id', id).single() : Promise.resolve({ data: null, error: null }),
        ]);
        if (categoriesResult.error || statusesResult.error || locationsResult.error || profilesResult.error || assetResult.error) {
          throw categoriesResult.error || statusesResult.error || locationsResult.error || profilesResult.error || assetResult.error;
        }
        setCategories(categoriesResult.data || []);
        setStatuses(statusesResult.data || []);
        setLocations(locationsResult.data || []);
        setProfiles(profilesResult.data || []);
        if (assetResult.data) {
          const asset = assetResult.data as AssetRecord;
          setForm({
            assetCode: asset.asset_code || '', name: asset.name || '', description: asset.description || '', categoryId: asset.category_id || '',
            brand: asset.brand || '', model: asset.model || '', serialNumber: asset.serial_number || '', invoiceNumber: asset.invoice_number || '',
            purchaseDate: asset.purchase_date || '', purchaseValue: asset.purchase_value?.toString() || '', warrantyUntil: asset.warranty_until || '',
            department: asset.department || '', locationId: asset.location_id || '', responsibleUserId: asset.responsible_user_id || '',
            responsibleName: asset.responsible_name || '', statusId: asset.status_id || '', notes: asset.notes || '',
          });
          setResponsibleMode(asset.responsible_user_id || 'manual');
        } else {
          const defaultStatus = (statusesResult.data || []).find((item: AssetStatus) => item.is_default);
          setForm((current) => ({ ...current, statusId: defaultStatus?.id || '' }));
        }
      } catch (error) {
        console.error('Error loading asset form:', error);
        toast({ title: 'Erro', description: 'Não foi possível preparar o cadastro.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, toast]);

  const setValue = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const handleResponsible = (value: string) => {
    setResponsibleMode(value);
    if (value === 'manual') {
      setForm((current) => ({ ...current, responsibleUserId: '' }));
      return;
    }
    const selected = profiles.find((profile) => profile.id === value);
    setForm((current) => ({ ...current, responsibleUserId: value, responsibleName: selected?.nome || '', department: current.department || selected?.setor || '' }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.assetCode.trim() || !form.name.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Informe o código e o nome do patrimônio.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const result = editing && id ? await updateAsset(id, form) : await createAsset(form);
      toast({ title: editing ? 'Patrimônio atualizado' : 'Patrimônio cadastrado', description: `Código ${result.asset.asset_code}` });
      navigate(`/patrimonio/${result.asset.id}`);
    } catch (error) {
      toast({ title: 'Erro ao salvar', description: error instanceof Error ? error.message : 'Não foi possível salvar.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AssetHeader title={editing ? 'Editar patrimônio' : 'Novo patrimônio'} subtitle="Cadastro e identificação do bem" />
      <main className="container px-3 py-4 sm:px-4 sm:py-6">
        <Card className="mx-auto max-w-5xl rounded-md">
          <CardHeader><CardTitle>{editing ? 'Atualizar cadastro' : 'Cadastrar patrimônio'}</CardTitle><CardDescription>Campos marcados como obrigatórios identificam o bem no inventário.</CardDescription></CardHeader>
          <CardContent>
            {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div> : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="assetCode">Número do patrimônio *</Label><Input id="assetCode" value={form.assetCode} onChange={(e) => setValue('assetCode', e.target.value)} maxLength={80} /></div>
                  <div className="space-y-2 md:col-span-1 lg:col-span-2"><Label htmlFor="name">Nome do bem *</Label><Input id="name" value={form.name} onChange={(e) => setValue('name', e.target.value)} maxLength={160} /></div>
                  <div className="space-y-2"><Label>Categoria</Label><Select value={form.categoryId || 'none'} onValueChange={(value) => setValue('categoryId', value === 'none' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem categoria</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="brand">Marca</Label><Input id="brand" value={form.brand} onChange={(e) => setValue('brand', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="model">Modelo</Label><Input id="model" value={form.model} onChange={(e) => setValue('model', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="serial">Número de série</Label><Input id="serial" value={form.serialNumber} onChange={(e) => setValue('serialNumber', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="invoice">Nota fiscal</Label><Input id="invoice" value={form.invoiceNumber} onChange={(e) => setValue('invoiceNumber', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="purchaseDate">Data de aquisição</Label><Input id="purchaseDate" type="date" value={form.purchaseDate} onChange={(e) => setValue('purchaseDate', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="purchaseValue">Valor de aquisição</Label><Input id="purchaseValue" type="number" min="0" step="0.01" value={form.purchaseValue} onChange={(e) => setValue('purchaseValue', e.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="warranty">Garantia até</Label><Input id="warranty" type="date" value={form.warrantyUntil} onChange={(e) => setValue('warrantyUntil', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={form.statusId || 'none'} onValueChange={(value) => setValue('statusId', value === 'none' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem status</SelectItem>{statuses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label>Localização</Label><Select value={form.locationId || 'none'} onValueChange={(value) => setValue('locationId', value === 'none' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem localização</SelectItem>{locations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2"><Label htmlFor="department">Setor</Label><Input id="department" value={form.department} onChange={(e) => setValue('department', e.target.value)} /></div>
                  <div className="space-y-2"><Label>Responsável</Label><Select value={responsibleMode} onValueChange={handleResponsible}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Nome, setor ou posto</SelectItem>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>{profile.nome} · {profile.setor || 'Sem setor'}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-2 md:col-span-2"><Label htmlFor="responsibleName">Nome exibido do responsável</Label><Input id="responsibleName" value={form.responsibleName} onChange={(e) => setValue('responsibleName', e.target.value)} placeholder="Colaborador, setor ou posto" /></div>
                  <div className="space-y-2 md:col-span-2 lg:col-span-3"><Label htmlFor="description">Descrição</Label><Textarea id="description" value={form.description} onChange={(e) => setValue('description', e.target.value)} rows={3} /></div>
                  <div className="space-y-2 md:col-span-2 lg:col-span-3"><Label htmlFor="notes">Observações</Label><Textarea id="notes" value={form.notes} onChange={(e) => setValue('notes', e.target.value)} rows={3} /></div>
                </div>
                <div className="flex justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar</Button></div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
