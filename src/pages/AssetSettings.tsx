import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, MapPin, PackageCheck, Plus, Tags } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AssetCategory, AssetLocation, AssetStatus } from '@/types/assets';

const db = supabase as any;

export default function AssetSettings() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [statuses, setStatuses] = useState<AssetStatus[]>([]);
  const [locations, setLocations] = useState<AssetLocation[]>([]);
  const [names, setNames] = useState({ category: '', status: '', location: '' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [categoryResult, statusResult, locationResult] = await Promise.all([
      db.from('asset_categories').select('*').order('sort_order'),
      db.from('asset_statuses').select('*').order('sort_order'),
      db.from('asset_locations').select('*').order('name'),
    ]);
    setCategories(categoryResult.data || []); setStatuses(statusResult.data || []); setLocations(locationResult.data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const createItem = async (event: FormEvent, type: 'category' | 'status' | 'location') => {
    event.preventDefault();
    const name = names[type].trim();
    if (!name) return;
    const table = type === 'category' ? 'asset_categories' : type === 'status' ? 'asset_statuses' : 'asset_locations';
    const values = type === 'status' ? { name, color: '#64748b' } : { name };
    const { error } = await db.from(table).insert(values);
    if (error) toast({ title: 'Erro', description: error.code === '23505' ? 'Já existe um registro com este nome.' : error.message, variant: 'destructive' });
    else { setNames((current) => ({ ...current, [type]: '' })); toast({ title: 'Configuração adicionada' }); await load(); }
  };

  const toggle = async (table: string, id: string, active: boolean) => {
    const { error } = await db.from(table).update({ active }).eq('id', id);
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' }); else await load();
  };

  const sections = [
    { key: 'category' as const, title: 'Categorias', description: 'Classificação dos bens', table: 'asset_categories', items: categories, icon: Tags },
    { key: 'status' as const, title: 'Status', description: 'Situação operacional', table: 'asset_statuses', items: statuses, icon: PackageCheck },
    { key: 'location' as const, title: 'Localizações', description: 'Prédios, salas e depósitos', table: 'asset_locations', items: locations, icon: MapPin },
  ];

  return <div className="min-h-screen bg-background"><AssetHeader title="Configurações patrimoniais" subtitle="Listas controladas do inventário" /><main className="container grid gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-3">{loading ? <div className="col-span-full flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div> : sections.map(({ key, title, description, table, items, icon: Icon }) => <Card key={key} className="rounded-md"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-3"><form onSubmit={(event) => createItem(event, key)} className="flex gap-2"><Input value={names[key]} onChange={(event) => setNames((current) => ({ ...current, [key]: event.target.value }))} placeholder={`Nova ${title.toLowerCase()}`} /><Button size="icon" title={`Adicionar ${title.toLowerCase()}`}><Plus className="h-4 w-4" /></Button></form><div className="divide-y rounded-md border">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-sm">{item.name}</span><Switch checked={item.active} onCheckedChange={(checked) => toggle(table, item.id, checked)} aria-label={`${item.name} ativo`} /></div>)}</div></CardContent></Card>)}</main></div>;
}
