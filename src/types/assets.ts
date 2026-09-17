export type AssetAccessLevel = 'consulta' | 'operador' | 'gestor';
export type AssetMovementStatus = 'pendente' | 'aprovada' | 'concluida' | 'cancelada';
export type AssetMovementType =
  | 'transferencia_responsavel'
  | 'transferencia_setor'
  | 'transferencia_local'
  | 'emprestimo'
  | 'devolucao'
  | 'envio_manutencao'
  | 'retorno_manutencao'
  | 'baixa'
  | 'descarte'
  | 'extravio';

export interface AssetCategory {
  id: string;
  name: string;
  active: boolean;
}

export interface AssetStatus {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
  is_terminal: boolean;
  active: boolean;
}

export interface AssetLocation {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface AssetProfile {
  id: string;
  nome: string;
  email: string;
  setor: string | null;
}

export interface AssetRecord {
  id: string;
  asset_code: string;
  name: string;
  description: string | null;
  category_id: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  invoice_number: string | null;
  purchase_date: string | null;
  purchase_value: number | null;
  warranty_until: string | null;
  department: string | null;
  location_id: string | null;
  responsible_user_id: string | null;
  responsible_name: string | null;
  status_id: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  category?: AssetCategory | null;
  status?: AssetStatus | null;
  location?: AssetLocation | null;
  responsible?: AssetProfile | null;
}

export interface AssetMovement {
  id: string;
  asset_id: string;
  movement_type: AssetMovementType;
  status: AssetMovementStatus;
  from_snapshot: Record<string, unknown>;
  to_responsible_user_id: string | null;
  to_responsible_name: string | null;
  to_department: string | null;
  to_location_id: string | null;
  to_status_id: string | null;
  reason: string;
  notes: string | null;
  requested_by: string;
  approved_by: string | null;
  requested_at: string;
  approved_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  asset?: Pick<AssetRecord, 'id' | 'asset_code' | 'name'> | null;
  requester?: Pick<AssetProfile, 'id' | 'nome' | 'email'> | null;
}

export const movementLabels: Record<AssetMovementType, string> = {
  transferencia_responsavel: 'Transferência de responsável',
  transferencia_setor: 'Transferência de setor',
  transferencia_local: 'Transferência de localização',
  emprestimo: 'Empréstimo',
  devolucao: 'Devolução',
  envio_manutencao: 'Envio para manutenção',
  retorno_manutencao: 'Retorno de manutenção',
  baixa: 'Baixa',
  descarte: 'Descarte',
  extravio: 'Extravio',
};

export const formatCurrency = (value: number | null | undefined) =>
  value == null
    ? 'Não informado'
    : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const normalizeAssetText = (value: string) =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
