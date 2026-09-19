import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Boxes, CalendarClock, CircleDollarSign, Download, FileDown, Loader2, Repeat2, ShieldAlert, UserRoundX, Wrench } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { AssetMetricCard } from '@/components/assets/AssetMetricCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AssetRecord, formatCurrency, normalizeAssetText } from '@/types/assets';

const db = supabase as unknown as SupabaseClient;
const sanitize = (value: unknown, max = 100) => String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, max);

export default function AssetReports() {
  const { toast } = useToast();
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [movementAssetIds, setMovementAssetIds] = useState<string[]>([]);
  const [maintenanceCosts, setMaintenanceCosts] = useState<{ asset_id: string; asset_final_cost: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [department, setDepartment] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [responsible, setResponsible] = useState('all');
  const [location, setLocation] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    Promise.all([
      db.from('assets').select(`*, category:asset_categories(*), status:asset_statuses(*), location:asset_locations(*), responsible:profiles!assets_responsible_user_id_fkey(id, nome, email, setor)`).eq('active', true).order('created_at', { ascending: false }),
      db.from('asset_movements').select('asset_id'),
      db.from('tickets').select('asset_id, asset_final_cost').not('asset_id', 'is', null),
    ]).then(([assetResult, movementResult, costResult]) => {
      if (assetResult.error) toast({ title: 'Erro', description: 'Não foi possível carregar o relatório.', variant: 'destructive' });
      setAssets(assetResult.data || []);
      setMovementAssetIds((movementResult.data || []).map((item: { asset_id: string }) => item.asset_id));
      setMaintenanceCosts(costResult.data || []);
      setLoading(false);
    });
  }, [toast]);

  const options = useMemo(() => ({
    departments: [...new Set(assets.map((item) => item.department).filter(Boolean) as string[])].sort(),
    categories: [...new Set(assets.map((item) => item.category?.name).filter(Boolean) as string[])].sort(),
    statuses: [...new Set(assets.map((item) => item.status?.name).filter(Boolean) as string[])].sort(),
    responsibles: [...new Set(assets.map((item) => item.responsible?.nome || item.responsible_name).filter(Boolean) as string[])].sort(),
    locations: [...new Set(assets.map((item) => item.location?.name).filter(Boolean) as string[])].sort(),
  }), [assets]);

  const filtered = useMemo(() => assets.filter((item) => (department === 'all' || item.department === department)
    && (category === 'all' || item.category?.name === category) && (status === 'all' || item.status?.name === status)
    && (responsible === 'all' || (item.responsible?.nome || item.responsible_name) === responsible)
    && (location === 'all' || item.location?.name === location) && (!startDate || item.created_at >= startDate)
    && (!endDate || item.created_at <= `${endDate}T23:59:59`)), [assets, category, department, endDate, location, responsible, startDate, status]);

  const metrics = useMemo(() => {
    const now = Date.now();
    const warrantyLimit = now + 60 * 24 * 60 * 60 * 1000;
    const filteredIds = new Set(filtered.map((item) => item.id));
    return {
      total: filtered.length,
      value: filtered.reduce((sum, item) => sum + (Number(item.purchase_value) || 0), 0),
      unassigned: filtered.filter((item) => !item.responsible_user_id && !item.responsible_name).length,
      maintenance: filtered.filter((item) => normalizeAssetText(item.status?.name || '').includes('manutencao')).length,
      risk: filtered.filter((item) => ['extraviado', 'baixado', 'descartado'].includes(normalizeAssetText(item.status?.name || ''))).length,
      expiredWarranty: filtered.filter((item) => item.warranty_until && new Date(`${item.warranty_until}T23:59:59`).getTime() < now).length,
      expiringWarranty: filtered.filter((item) => { const date = item.warranty_until ? new Date(`${item.warranty_until}T23:59:59`).getTime() : 0; return date >= now && date <= warrantyLimit; }).length,
      maintenanceCost: maintenanceCosts.filter((item) => filteredIds.has(item.asset_id)).reduce((sum, item) => sum + (Number(item.asset_final_cost) || 0), 0),
      movements: movementAssetIds.filter((assetId) => filteredIds.has(assetId)).length,
    };
  }, [filtered, maintenanceCosts, movementAssetIds]);

  const ranking = (selector: (asset: AssetRecord) => string) => Object.entries(filtered.reduce<Record<string, number>>((map, asset) => { const key = selector(asset) || 'Não informado'; map[key] = (map[key] || 0) + 1; return map; }, {})).sort((a, b) => b[1] - a[1]);
  const byDepartment = ranking((item) => item.department || '');
  const byCategory = ranking((item) => item.category?.name || '');
  const byStatus = ranking((item) => item.status?.name || '');
  const byResponsible = ranking((item) => item.responsible?.nome || item.responsible_name || '');
  const reportFilters: Array<{ label: string; value: string; setValue: (value: string) => void; values: string[] }> = [
    { label: 'Setor', value: department, setValue: setDepartment, values: options.departments },
    { label: 'Categoria', value: category, setValue: setCategory, values: options.categories },
    { label: 'Status', value: status, setValue: setStatus, values: options.statuses },
    { label: 'Responsável', value: responsible, setValue: setResponsible, values: options.responsibles },
    { label: 'Localização', value: location, setValue: setLocation, values: options.locations },
  ];

  const downloadCsv = () => {
    const headers = ['Código', 'Item', 'Categoria', 'Status', 'Setor', 'Localização', 'Responsável', 'Valor'];
    const rows = filtered.map((item) => [item.asset_code, item.name, item.category?.name, item.status?.name, item.department, item.location?.name, item.responsible?.nome || item.responsible_name, item.purchase_value]);
    const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const blob = new Blob(['\ufeff' + [headers, ...rows].map((row) => row.map(escape).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `relatorio-patrimonio-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFillColor(201, 32, 38); doc.rect(0, 0, 297, 25, 'F'); doc.setTextColor(255); doc.setFontSize(18); doc.text('Relatório de Controle Patrimonial', 14, 16);
    doc.setTextColor(25); doc.setFontSize(9); doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} | ${filtered.length} itens | Valor ${formatCurrency(metrics.value)}`, 14, 34);
    doc.text(`Filtros: Setor ${department}; Categoria ${category}; Status ${status}; Responsável ${responsible}; Local ${location}; Período ${startDate || '-'} a ${endDate || '-'}`, 14, 41);
    const summaries = [[`Total: ${metrics.total}`, `Sem responsável: ${metrics.unassigned}`, `Em manutenção: ${metrics.maintenance}`, `Baixa/risco: ${metrics.risk}`], [`Garantias vencidas: ${metrics.expiredWarranty}`, `Vencem em 60 dias: ${metrics.expiringWarranty}`, `Custo de manutenção: ${formatCurrency(metrics.maintenanceCost)}`, `Movimentações: ${metrics.movements}`]];
    autoTable(doc, { startY: 47, body: summaries, theme: 'grid', styles: { fontSize: 9, cellPadding: 4, fontStyle: 'bold' }, columnStyles: { 0: { fillColor: [241, 245, 249] }, 1: { fillColor: [254, 249, 195] }, 2: { fillColor: [255, 237, 213] }, 3: { fillColor: [254, 226, 226] } }, margin: { left: 10, right: 10 } });
    autoTable(doc, { startY: 71, head: [['Código', 'Item', 'Categoria', 'Status', 'Setor', 'Localização', 'Responsável', 'Aquisição', 'Valor']], body: filtered.map((item) => [sanitize(item.asset_code, 20), sanitize(item.name, 42), sanitize(item.category?.name, 24), sanitize(item.status?.name, 20), sanitize(item.department, 24), sanitize(item.location?.name, 24), sanitize(item.responsible?.nome || item.responsible_name, 30), item.purchase_date ? new Date(`${item.purchase_date}T12:00:00`).toLocaleDateString('pt-BR') : '-', formatCurrency(Number(item.purchase_value) || null)]), styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' }, headStyles: { fillColor: [201, 32, 38] }, columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 44 }, 2: { cellWidth: 29 }, 3: { cellWidth: 25 }, 4: { cellWidth: 30 }, 5: { cellWidth: 30 }, 6: { cellWidth: 37 }, 7: { cellWidth: 24 }, 8: { cellWidth: 25, halign: 'right' } }, margin: { left: 10, right: 10, bottom: 12 }, didDrawPage: ({ pageNumber }) => { doc.setFontSize(7); doc.setTextColor(100); doc.text(`Help Desk - Grupo Astrotur | Página ${pageNumber}`, 148.5, 204, { align: 'center' }); } });
    doc.save(`relatorio-patrimonio-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return <div className="min-h-screen bg-background"><AssetHeader title="Relatório patrimonial" subtitle="Prévia antes da exportação" /><main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
    <Card className="rounded-md"><CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5" />Filtros do relatório</CardTitle><div className="flex gap-2"><Button variant="outline" onClick={downloadCsv}><Download className="mr-2 h-4 w-4" />CSV</Button><Button onClick={downloadPdf}><FileDown className="mr-2 h-4 w-4" />Exportar PDF</Button></div></div></CardHeader><CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{reportFilters.map(({ label, value, setValue, values }) => <Select key={label} value={value} onValueChange={setValue}><SelectTrigger><SelectValue placeholder={label} /></SelectTrigger><SelectContent><SelectItem value="all">{label}: todos</SelectItem>{values.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>)}<Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Cadastro a partir de" /><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Cadastro até" /></CardContent></Card>
    {loading ? <div className="flex h-64 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin" /></div> : <><section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><AssetMetricCard label="Itens filtrados" value={metrics.total} icon={Boxes} /><AssetMetricCard label="Valor patrimonial" value={formatCurrency(metrics.value)} icon={CircleDollarSign} accent="#16a34a" /><AssetMetricCard label="Sem responsável" value={metrics.unassigned} icon={UserRoundX} accent="#eab308" /><AssetMetricCard label="Em manutenção" value={metrics.maintenance} icon={Wrench} accent="#ea580c" /><AssetMetricCard label="Baixa ou risco" value={metrics.risk} icon={ShieldAlert} accent="#dc2626" /><AssetMetricCard label="Garantias vencidas" value={metrics.expiredWarranty} detail={`${metrics.expiringWarranty} vencem em 60 dias`} icon={CalendarClock} accent="#ca8a04" /><AssetMetricCard label="Custo de manutenção" value={formatCurrency(metrics.maintenanceCost)} icon={CircleDollarSign} accent="#7c3aed" /><AssetMetricCard label="Movimentações" value={metrics.movements} icon={Repeat2} accent="#2563eb" /></section>
      <section className="grid gap-4 lg:grid-cols-2">{[['Distribuição por setor', byDepartment], ['Distribuição por categoria', byCategory], ['Distribuição por status', byStatus], ['Principais responsáveis', byResponsible]].map(([title, rows]) => <Card key={title as string} className="rounded-md"><CardHeader><CardTitle className="text-base">{title as string}</CardTitle></CardHeader><CardContent className="space-y-3">{(rows as [string, number][]).slice(0, 10).map(([label, count]) => <div key={label}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{count}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${metrics.total ? (count / metrics.total) * 100 : 0}%` }} /></div></div>)}</CardContent></Card>)}</section>
      <Card className="rounded-md"><CardHeader><CardTitle className="text-lg">Relação detalhada</CardTitle></CardHeader><CardContent><div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Item</TableHead><TableHead>Status</TableHead><TableHead>Setor</TableHead><TableHead>Responsável</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => <TableRow key={item.id}><TableCell className="font-mono text-xs text-primary">{item.asset_code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.status?.name}</TableCell><TableCell>{item.department || '-'}</TableCell><TableCell>{item.responsible?.nome || item.responsible_name || '-'}</TableCell><TableCell className="text-right">{formatCurrency(Number(item.purchase_value) || null)}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card></>}
  </main></div>;
}
