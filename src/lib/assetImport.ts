export const ASSET_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_IMPORT_MAX_ROWS = 2000;

export type AssetImportField =
  | 'asset_code'
  | 'name'
  | 'category'
  | 'brand'
  | 'model'
  | 'serial_number'
  | 'invoice_number'
  | 'purchase_date'
  | 'purchase_value'
  | 'warranty_until'
  | 'department'
  | 'location'
  | 'responsible_name'
  | 'responsible_email'
  | 'status'
  | 'description'
  | 'notes';

export interface AssetImportColumn {
  field: AssetImportField;
  label: string;
  required?: boolean;
  synonyms: string[];
}

export const ASSET_IMPORT_COLUMNS: AssetImportColumn[] = [
  { field: 'asset_code', label: 'Código do patrimônio', required: true, synonyms: ['codigo', 'codigodopatrimonio', 'patrimonio', 'tombo', 'id'] },
  { field: 'name', label: 'Nome do bem', required: true, synonyms: ['nome', 'nomedobem', 'item', 'tipo', 'produto'] },
  { field: 'category', label: 'Categoria', synonyms: ['categoria'] },
  { field: 'brand', label: 'Marca', synonyms: ['marca'] },
  { field: 'model', label: 'Modelo', synonyms: ['modelo'] },
  { field: 'serial_number', label: 'Número de série', synonyms: ['numerodeserie', 'serial', 'serie'] },
  { field: 'invoice_number', label: 'Nota fiscal', synonyms: ['notafiscal', 'nf'] },
  { field: 'purchase_date', label: 'Data de aquisição', synonyms: ['datadeaquisicao', 'dataentrada', 'data'] },
  { field: 'purchase_value', label: 'Valor de aquisição', synonyms: ['valordeaquisicao', 'valor', 'custo'] },
  { field: 'warranty_until', label: 'Garantia até', synonyms: ['garantiaate', 'garantia'] },
  { field: 'department', label: 'Setor', synonyms: ['setor', 'departamento'] },
  { field: 'location', label: 'Localização', synonyms: ['localizacao', 'local'] },
  { field: 'responsible_name', label: 'Responsável', synonyms: ['responsavel', 'colaborador'] },
  { field: 'responsible_email', label: 'E-mail do responsável', synonyms: ['emaildoresponsavel', 'emailresponsavel', 'email'] },
  { field: 'status', label: 'Status', synonyms: ['status', 'situacao'] },
  { field: 'description', label: 'Descrição', synonyms: ['descricao'] },
  { field: 'notes', label: 'Observações', synonyms: ['observacoes', 'obs'] },
];

export type AssetImportRow = Record<AssetImportField, string | number | null>;

export const normalizeImportHeader = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

export const detectAssetMapping = (headers: string[]) => Object.fromEntries(
  ASSET_IMPORT_COLUMNS.flatMap((column) => {
    const index = headers.findIndex((header) => column.synonyms.includes(normalizeImportHeader(header)));
    return index >= 0 ? [[column.field, String(index)]] : [];
  }),
) as Partial<Record<AssetImportField, string>>;

export const mapAssetRows = (
  rows: Array<Array<string | number | null>>,
  mapping: Partial<Record<AssetImportField, string>>,
): AssetImportRow[] => rows.map((row) => Object.fromEntries(
  ASSET_IMPORT_COLUMNS.map(({ field }) => {
    const mappedIndex = mapping[field];
    return [field, mappedIndex == null || mappedIndex === 'none' ? '' : (row[Number(mappedIndex)] ?? '')];
  }),
)) as AssetImportRow[];

export const parseBrazilianMoney = (value: unknown): number | null => {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = String(value).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const normalizeAssetDate = (value: unknown): string | null => {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(value));
    return epoch.toISOString().slice(0, 10);
  }
  const raw = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  const candidate = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : br ? `${br[3]}-${br[2]}-${br[1]}` : '';
  if (!candidate) return null;
  const date = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
};

export const parseCsvRows = (content: string): string[][] => {
  const firstLine = content.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g)?.length || 0) >= (firstLine.match(/,/g)?.length || 0) ? ';' : ',';
  const result: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"' && content[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) result.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) result.push(row);
  return result;
};

export const officialAssetHeaders = ASSET_IMPORT_COLUMNS.map((column) => column.label);

export const officialAssetExample = [
  'PAT-0001', 'Notebook Dell Latitude', 'Informática', 'Dell', 'Latitude 5420', 'ABC123', 'NF-9981',
  '15/09/2026', '4500,00', '15/09/2029', 'TI', 'Sala TI', 'João da Silva',
  'joao@astroturviagens.com', 'Em uso', 'Notebook corporativo', 'Equipamento do suporte',
];
