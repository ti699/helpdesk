import { ChangeEvent, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { AssetImportResolutions, AssetImportValidation, commitAssetImport, validateAssetImport } from '@/lib/assetActions';
import {
  ASSET_IMPORT_COLUMNS, ASSET_IMPORT_MAX_BYTES, ASSET_IMPORT_MAX_ROWS, AssetImportField,
  detectAssetMapping, mapAssetRows, officialAssetExample, officialAssetHeaders, parseCsvRows,
} from '@/lib/assetImport';

type SheetData = { name: string; rows: Array<Array<string | number | null>> };
type Step = 'file' | 'mapping' | 'validation' | 'result';
const groups = ['categories', 'locations', 'statuses'] as const;
const emptyResolutions = (): AssetImportResolutions => ({ categories: {}, statuses: {}, locations: {} });

const downloadBlob = (content: BlobPart, type: string, fileName: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const quoteCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function AssetImport() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('file');
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<AssetImportField, string>>>({});
  const [validation, setValidation] = useState<AssetImportValidation | null>(null);
  const [resolutions, setResolutions] = useState<AssetImportResolutions>(emptyResolutions);
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState(0);

  const sheet = sheets[sheetIndex];
  const headers = useMemo(() => (sheet?.rows[0] || []).map(String), [sheet]);
  const dataRows = useMemo(() => (sheet?.rows.slice(1) || []).filter((row) => row.some((value) => String(value ?? '').trim())), [sheet]);
  const mappedRows = useMemo(() => mapAssetRows(dataRows, mapping), [dataRows, mapping]);
  const requiredReady = ['asset_code', 'name'].every((field) => mapping[field as AssetImportField] != null && mapping[field as AssetImportField] !== 'none');
  const unknownCount = validation ? groups.reduce((sum, group) => sum + validation.unknown[group].length, 0) : 0;
  const resolvedCount = groups.reduce((sum, group) => sum + Object.keys(resolutions[group]).length, 0);
  const canCommit = !!validation && validation.errors === 0 && resolvedCount === unknownCount;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > ASSET_IMPORT_MAX_BYTES) {
      toast({ title: 'Arquivo muito grande', description: 'O limite é de 5 MB.', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      let parsedSheets: SheetData[];
      if (/\.xlsx$/i.test(file.name)) {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
        parsedSheets = workbook.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json<Array<string | number | null>>(workbook.Sheets[name], { header: 1, defval: '', raw: true }),
        })).filter((item) => item.rows.length > 0);
      } else {
        parsedSheets = [{ name: 'CSV', rows: parseCsvRows(await file.text()) }];
      }
      if (!parsedSheets.length) throw new Error('O arquivo não possui dados legíveis.');
      if (parsedSheets.some((item) => item.rows.length - 1 > ASSET_IMPORT_MAX_ROWS)) throw new Error('Cada importação aceita até 2.000 linhas.');
      setFileName(file.name);
      setSheets(parsedSheets);
      setSheetIndex(0);
      setMapping(detectAssetMapping((parsedSheets[0].rows[0] || []).map(String)));
      setValidation(null);
      setResolutions(emptyResolutions());
      setStep('mapping');
    } catch (error) {
      toast({ title: 'Arquivo inválido', description: error instanceof Error ? error.message : 'Não foi possível ler o arquivo.', variant: 'destructive' });
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const selectSheet = (value: string) => {
    const nextIndex = Number(value);
    setSheetIndex(nextIndex);
    setMapping(detectAssetMapping((sheets[nextIndex]?.rows[0] || []).map(String)));
    setValidation(null);
  };

  const downloadCsvModel = () => {
    const csv = `\uFEFF${officialAssetHeaders.map(quoteCsv).join(';')}\n${officialAssetExample.map(quoteCsv).join(';')}\n`;
    downloadBlob(csv, 'text/csv;charset=utf-8', 'modelo-importacao-patrimonio.csv');
  };

  const downloadExcelModel = async () => {
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([officialAssetHeaders, officialAssetExample]), 'Patrimônios');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Instruções'], ['Obrigatórios', 'Código do patrimônio e Nome do bem'],
      ['Datas', 'dd/mm/aaaa ou aaaa-mm-dd'], ['Valores', 'Número do Excel, 4500,00 ou 4.500,00'],
      ['Limites', '5 MB e 2.000 linhas por importação'],
    ]), 'Instruções');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Campo', 'Exemplos permitidos'],
      ['Status', 'Disponível; Em uso; Emprestado; Em manutenção; Extraviado; Baixado; Descartado'],
      ['Categoria', 'TI; Mobiliário; Equipamentos eletrônicos; Ferramentas; Outro'],
    ]), 'Valores permitidos');
    XLSX.writeFile(workbook, 'modelo-importacao-patrimonio.xlsx');
  };

  const handleValidate = async () => {
    if (!requiredReady) return;
    setBusy(true);
    try {
      const result = await validateAssetImport(fileName, sheet?.name || null, mapping as Record<string, string>, mappedRows);
      setValidation(result);
      setResolutions(emptyResolutions());
      setStep('validation');
    } catch (error) {
      toast({ title: 'Falha na validação', description: error instanceof Error ? error.message : 'Não foi possível validar.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const setResolution = (group: typeof groups[number], key: string, value: string) => {
    const reference = validation?.unknown[group].find((item) => item.key === key);
    const next = value === 'create'
      ? { mode: 'create' as const, name: reference?.name, ...(group === 'statuses' ? { color: '#64748b', is_terminal: false } : {}) }
      : { mode: 'existing' as const, id: value };
    setResolutions((current) => ({ ...current, [group]: { ...current[group], [key]: next } }));
  };

  const handleCommit = async () => {
    if (!validation || !canCommit) return;
    setBusy(true);
    try {
      const result = await commitAssetImport(validation.jobId, resolutions);
      setImported(result.imported);
      setStep('result');
      toast({ title: 'Importação concluída', description: `${result.imported} patrimônios cadastrados com segurança.` });
    } catch (error) {
      toast({ title: 'Importação não concluída', description: error instanceof Error ? error.message : 'Revise os dados e tente novamente.', variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const downloadErrors = () => {
    if (!validation) return;
    const rows = validation.preview.filter((row) => row.errors.length || row.warnings.length);
    const csv = `\uFEFFLinha;Tipo;Mensagem\n${rows.flatMap((row) => [
      ...row.errors.map((message) => `${row.row_number};Erro;${quoteCsv(message)}`),
      ...row.warnings.map((message) => `${row.row_number};Aviso;${quoteCsv(message)}`),
    ]).join('\n')}`;
    downloadBlob(csv, 'text/csv;charset=utf-8', `apontamentos-${fileName.replace(/\.[^.]+$/, '')}.csv`);
  };

  const reset = () => {
    setStep('file'); setFileName(''); setSheets([]); setMapping({}); setValidation(null); setResolutions(emptyResolutions()); setImported(0);
  };

  return <div className="min-h-screen bg-background">
    <AssetHeader title="Importar patrimônios" subtitle="Excel e CSV com validação antes da gravação" />
    <main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
      <div className="grid gap-2 sm:grid-cols-4">{['Arquivo', 'Mapeamento', 'Validação', 'Resultado'].map((label, index) => {
        const activeIndex = ['file', 'mapping', 'validation', 'result'].indexOf(step);
        return <div key={label} className={`rounded-md border px-3 py-2 text-sm ${index <= activeIndex ? 'border-primary bg-primary/5 font-medium text-primary' : 'text-muted-foreground'}`}>{index + 1}. {label}</div>;
      })}</div>
      {busy && <Progress value={65} className="h-1" />}

      {step === 'file' && <Card className="rounded-md"><CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Importação assistida</CardTitle><CardDescription>Use o modelo oficial ou envie uma planilha externa. Nenhum patrimônio será gravado nesta etapa.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button variant="outline" onClick={downloadExcelModel}><Download className="mr-2 h-4 w-4" />Baixar modelo Excel</Button><Button variant="outline" onClick={downloadCsvModel}><Download className="mr-2 h-4 w-4" />Baixar modelo CSV</Button><label className="inline-flex cursor-pointer"><Button asChild><span><Upload className="mr-2 h-4 w-4" />Selecionar arquivo</span></Button><input className="hidden" type="file" accept=".xlsx,.csv,text/csv" onChange={handleFile} /></label><p className="w-full pt-2 text-xs text-muted-foreground">Formatos .xlsx e .csv · máximo 5 MB · até 2.000 linhas.</p></CardContent></Card>}

      {step === 'mapping' && <Card className="rounded-md"><CardHeader><CardTitle>Mapeamento de colunas</CardTitle><CardDescription>{fileName} · {dataRows.length} linhas. Confirme como cada coluna deve ser interpretada.</CardDescription></CardHeader><CardContent className="space-y-4">
        {sheets.length > 1 && <div className="max-w-sm space-y-1.5"><Label>Aba do Excel</Label><Select value={String(sheetIndex)} onValueChange={selectSheet}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{sheets.map((item, index) => <SelectItem key={item.name} value={String(index)}>{item.name} ({Math.max(0, item.rows.length - 1)} linhas)</SelectItem>)}</SelectContent></Select></div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{ASSET_IMPORT_COLUMNS.map(({ field, label, required }) => <div key={field} className="space-y-1.5"><Label className="text-xs">{label}{required ? ' *' : ''}</Label><Select value={mapping[field] ?? 'none'} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value }))}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não importar</SelectItem>{headers.map((header, index) => <SelectItem key={`${field}-${index}`} value={String(index)}>{header || `Coluna ${index + 1}`}</SelectItem>)}</SelectContent></Select></div>)}</div>
        <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Setor</TableHead><TableHead>Responsável</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{mappedRows.slice(0, 12).map((row, index) => <TableRow key={index}><TableCell>{row.asset_code || '-'}</TableCell><TableCell>{row.name || '-'}</TableCell><TableCell>{row.category || '-'}</TableCell><TableCell>{row.department || '-'}</TableCell><TableCell>{row.responsible_name || '-'}</TableCell><TableCell>{row.status || '-'}</TableCell></TableRow>)}</TableBody></Table></div>
        <div className="flex justify-between"><Button variant="outline" onClick={reset}>Trocar arquivo</Button><Button onClick={handleValidate} disabled={busy || !requiredReady}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Validar dados</Button></div>
      </CardContent></Card>}

      {step === 'validation' && validation && <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">{[['Total', validation.total, ''], ['Válidas', validation.valid, 'text-green-600'], ['Avisos', validation.warnings, 'text-amber-600'], ['Erros', validation.errors, 'text-red-600']].map(([label, value, color]) => <Card key={String(label)}><CardHeader className="p-4"><CardDescription>{label}</CardDescription><CardTitle className={String(color)}>{value}</CardTitle></CardHeader></Card>)}</div>
        {validation.errors > 0 && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Arquivo ainda não pode ser importado</AlertTitle><AlertDescription>Corrija as linhas com erro no arquivo e valide novamente. Nenhuma alteração foi feita na base.</AlertDescription></Alert>}
        {groups.map((group) => validation.unknown[group].length > 0 && <Card key={group}><CardHeader><CardTitle className="text-base">Resolver {group === 'categories' ? 'categorias' : group === 'locations' ? 'localizações' : 'status'} desconhecidos</CardTitle><CardDescription>Associe a um cadastro existente ou confirme a criação.</CardDescription></CardHeader><CardContent className="space-y-3">{validation.unknown[group].map((item) => {
          const current = resolutions[group][item.key];
          return <div key={item.key} className="grid items-center gap-2 rounded-md border p-3 md:grid-cols-[1fr_260px_180px]"><div><p className="font-medium">{item.name}</p><p className="text-xs text-muted-foreground">Encontrado na planilha</p></div><Select value={current?.mode === 'create' ? 'create' : current?.id || ''} onValueChange={(value) => setResolution(group, item.key, value)}><SelectTrigger><SelectValue placeholder="Escolher tratamento" /></SelectTrigger><SelectContent>{validation.options[group].map((option) => <SelectItem key={option.id} value={option.id}>Usar {option.name}</SelectItem>)}<SelectItem value="create">Criar “{item.name}”</SelectItem></SelectContent></Select>{group === 'statuses' && current?.mode === 'create' ? <div className="flex items-center gap-2"><Input type="color" className="h-9 w-14 p-1" value={current.color} onChange={(event) => setResolutions((state) => ({ ...state, statuses: { ...state.statuses, [item.key]: { ...state.statuses[item.key], color: event.target.value } } }))} /><Switch checked={current.is_terminal} onCheckedChange={(checked) => setResolutions((state) => ({ ...state, statuses: { ...state.statuses, [item.key]: { ...state.statuses[item.key], is_terminal: checked } } }))} /><span className="text-xs">Terminal</span></div> : <Badge variant={current ? 'default' : 'outline'}>{current ? 'Definido' : 'Pendente'}</Badge>}</div>;
        })}</CardContent></Card>)}
        <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">Prévia validada</CardTitle><CardDescription>Todos os dados permanecem em staging até a confirmação. A tabela mostra as primeiras 100 linhas.</CardDescription></div><Button variant="outline" size="sm" onClick={downloadErrors}><Download className="mr-2 h-4 w-4" />Baixar apontamentos</Button></CardHeader><CardContent><div className="max-h-96 overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Linha</TableHead><TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Situação</TableHead><TableHead>Apontamentos</TableHead></TableRow></TableHeader><TableBody>{validation.preview.slice(0, 100).map((row) => <TableRow key={row.row_number}><TableCell>{row.row_number}</TableCell><TableCell>{String(row.normalized_data.asset_code || '-')}</TableCell><TableCell>{String(row.normalized_data.name || '-')}</TableCell><TableCell><Badge variant={row.row_status === 'error' ? 'destructive' : row.row_status === 'warning' ? 'secondary' : 'default'}>{row.row_status === 'error' ? 'Erro' : row.row_status === 'warning' ? 'Aviso' : 'Válida'}</Badge></TableCell><TableCell className="max-w-lg text-xs">{[...row.errors, ...row.warnings].join(' · ') || 'Sem apontamentos'}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
        <div className="flex justify-between"><Button variant="outline" onClick={() => setStep('mapping')}>Voltar ao mapeamento</Button><Button onClick={handleCommit} disabled={busy || !canCommit}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmar e importar {validation.valid} linhas</Button></div>
      </div>}

      {step === 'result' && <Alert className="border-green-300 bg-green-50 dark:bg-green-950/20"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertTitle>Importação finalizada</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{imported} patrimônios foram cadastrados e auditados.</span><Button variant="outline" size="sm" onClick={reset}>Nova importação</Button></AlertDescription></Alert>}
    </main>
  </div>;
}
