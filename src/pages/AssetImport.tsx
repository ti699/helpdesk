import { ChangeEvent, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { importAssets } from '@/lib/assetActions';

const fields = [
  ['asset_code', 'Código do patrimônio', true], ['name', 'Nome do bem', true], ['category', 'Categoria', false],
  ['brand', 'Marca', false], ['model', 'Modelo', false], ['serial_number', 'Número de série', false],
  ['invoice_number', 'Nota fiscal', false], ['purchase_date', 'Data de aquisição', false], ['purchase_value', 'Valor', false],
  ['warranty_until', 'Garantia até', false], ['department', 'Setor', false], ['location', 'Localização', false],
  ['responsible_name', 'Responsável', false], ['status', 'Status', false], ['description', 'Descrição', false], ['notes', 'Observações', false],
] as const;

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseCsv(content: string) {
  const delimiter = (content.split('\n')[0]?.match(/;/g)?.length || 0) > (content.split('\n')[0]?.match(/,/g)?.length || 0) ? ';' : ',';
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"' && content[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) result.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) result.push(row);
  return result;
}

const synonyms: Record<string, string[]> = {
  asset_code: ['codigo', 'patrimonio', 'tombo', 'id'], name: ['nome', 'item', 'tipo', 'produto'], category: ['categoria'],
  brand: ['marca'], model: ['modelo'], serial_number: ['serial', 'numerodeserie', 'serie'], invoice_number: ['nf', 'notafiscal'],
  purchase_date: ['datadeaquisicao', 'dataentrada', 'data'], purchase_value: ['valor', 'custo'], warranty_until: ['garantia', 'garantiaate'],
  department: ['setor', 'departamento'], location: ['local', 'localizacao'], responsible_name: ['responsavel', 'colaborador'],
  status: ['status', 'situacao'], description: ['descricao'], notes: ['observacoes', 'obs'],
};

export default function AssetImport() {
  const { toast } = useToast();
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ total: number; imported: number; errors: Array<{ row_number: number; message: string }> } | null>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Arquivo muito grande', description: 'Use um CSV de até 5 MB.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result || ''));
      const nextHeaders = parsed[0] || [];
      const detected: Record<string, string> = {};
      fields.forEach(([field]) => {
        const index = nextHeaders.findIndex((header) => (synonyms[field] || []).includes(normalize(header)));
        if (index >= 0) detected[field] = String(index);
      });
      setFileName(file.name);
      setHeaders(nextHeaders);
      setRawRows(parsed.slice(1).filter((row) => row.some(Boolean)).slice(0, 2000));
      setMapping(detected);
      setResult(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const mappedRows = useMemo(() => rawRows.map((row) => Object.fromEntries(fields.map(([field]) => [field, mapping[field] == null ? '' : row[Number(mapping[field])] || '']))), [mapping, rawRows]);
  const requiredReady = !!mapping.asset_code && mapping.asset_code !== 'none' && !!mapping.name && mapping.name !== 'none';
  const clientErrors = useMemo(() => mappedRows.reduce<string[]>((errors, row, index) => {
    if (!String(row.asset_code).trim()) errors.push(`Linha ${index + 2}: código obrigatório`);
    if (!String(row.name).trim()) errors.push(`Linha ${index + 2}: nome obrigatório`);
    return errors;
  }, []), [mappedRows]);

  const handleImport = async () => {
    if (!requiredReady) {
      toast({ title: 'Mapeamento incompleto', description: 'Mapeie código e nome do patrimônio.', variant: 'destructive' });
      return;
    }
    setImporting(true);
    try {
      const response = await importAssets(fileName, mappedRows);
      setResult(response);
      toast({ title: 'Importação concluída', description: `${response.imported} patrimônios cadastrados; ${response.errors.length} linhas rejeitadas.` });
    } catch (error) {
      toast({ title: 'Erro na importação', description: error instanceof Error ? error.message : 'Não foi possível importar.', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AssetHeader title="Importar patrimônios" subtitle="Prévia e validação antes de gravar" />
      <main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        <Card className="rounded-md"><CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />Arquivo CSV</CardTitle><CardDescription>O arquivo só será gravado após o mapeamento e a confirmação. O limite é de 2.000 linhas por importação.</CardDescription></CardHeader><CardContent><label className="inline-flex cursor-pointer"><Button type="button" variant="outline" asChild><span><Upload className="mr-2 h-4 w-4" />Selecionar CSV</span></Button><input className="hidden" type="file" accept=".csv,text/csv" onChange={handleFile} /></label>{fileName && <span className="ml-3 text-sm text-muted-foreground">{fileName} · {rawRows.length} linhas</span>}</CardContent></Card>

        {headers.length > 0 && (
          <Card className="rounded-md"><CardHeader><CardTitle>Mapeamento de colunas</CardTitle><CardDescription>Confirme qual coluna do arquivo corresponde a cada campo.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{fields.map(([field, label, required]) => <div key={field} className="space-y-1.5"><p className="text-xs font-medium">{label}{required ? ' *' : ''}</p><Select value={mapping[field] ?? 'none'} onValueChange={(value) => setMapping((current) => ({ ...current, [field]: value }))}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não importar</SelectItem>{headers.map((header, index) => <SelectItem key={`${field}-${index}`} value={String(index)}>{header || `Coluna ${index + 1}`}</SelectItem>)}</SelectContent></Select></div>)}</div>
            {clientErrors.length > 0 && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Linhas incompletas</AlertTitle><AlertDescription>{clientErrors.slice(0, 5).join(' · ')}{clientErrors.length > 5 ? ` e mais ${clientErrors.length - 5}` : ''}. O servidor rejeitará apenas as linhas inválidas.</AlertDescription></Alert>}
            <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Categoria</TableHead><TableHead>Setor</TableHead><TableHead>Responsável</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{mappedRows.slice(0, 20).map((row, index) => <TableRow key={index}><TableCell>{row.asset_code || '-'}</TableCell><TableCell>{row.name || '-'}</TableCell><TableCell>{row.category || '-'}</TableCell><TableCell>{row.department || '-'}</TableCell><TableCell>{row.responsible_name || '-'}</TableCell><TableCell>{row.status || '-'}</TableCell></TableRow>)}</TableBody></Table></div>
            <div className="flex justify-end"><Button onClick={handleImport} disabled={importing || !requiredReady}>{importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Confirmar importação</Button></div>
          </CardContent></Card>
        )}

        {result && <Alert className="border-green-300 bg-green-50 dark:bg-green-950/20"><CheckCircle2 className="h-4 w-4 text-green-600" /><AlertTitle>Importação finalizada</AlertTitle><AlertDescription>{result.imported} de {result.total} linhas importadas. {result.errors.length > 0 && `Erros: ${result.errors.slice(0, 5).map((error) => `linha ${error.row_number}: ${error.message}`).join(' · ')}`}</AlertDescription></Alert>}
      </main>
    </div>
  );
}
