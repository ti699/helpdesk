import { supabase } from '@/integrations/supabase/client';

export type AssetAccessLevel = 'consulta' | 'operador' | 'gestor';
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

export interface AssetFormPayload {
  assetCode: string;
  name: string;
  description?: string;
  categoryId?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  invoiceNumber?: string;
  purchaseDate?: string;
  purchaseValue?: number | string;
  warrantyUntil?: string;
  department?: string;
  locationId?: string;
  responsibleUserId?: string;
  responsibleName?: string;
  statusId?: string;
  notes?: string;
}

interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

const invoke = async <T>(action: string, payload: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke<ActionResult<T>>('asset-actions', {
    body: { action, payload },
  });
  if (error) throw new Error(error.message || 'Não foi possível executar a ação patrimonial');
  if (!data?.success) throw new Error(data?.error || 'Não foi possível executar a ação patrimonial');
  return data.data as T;
};

export const createAsset = (payload: AssetFormPayload) =>
  invoke<{ asset: { id: string; asset_code: string } }>('create_asset', payload as unknown as Record<string, unknown>);

export const updateAsset = (assetId: string, payload: AssetFormPayload) =>
  invoke<{ asset: { id: string; asset_code: string } }>('update_asset', { assetId, ...payload });

export const deactivateAsset = (assetId: string) =>
  invoke<{ asset: { id: string } }>('deactivate_asset', { assetId });

export const createAssetMovement = (payload: Record<string, unknown>) =>
  invoke<{ movement: Record<string, unknown> }>('create_movement', payload);

export const approveAssetMovement = (movementId: string) =>
  invoke<{ movement: Record<string, unknown> }>('approve_movement', { movementId });

export const cancelAssetMovement = (movementId: string) =>
  invoke<{ movement: Record<string, unknown> }>('cancel_movement', { movementId });

export interface ImportReferenceOption {
  id: string;
  name: string;
  color?: string;
  is_terminal?: boolean;
}

export interface ImportUnknownReference { key: string; name: string }

export interface AssetImportValidation {
  jobId: string;
  total: number;
  valid: number;
  errors: number;
  warnings: number;
  preview: Array<{
    row_number: number;
    normalized_data: Record<string, unknown>;
    errors: string[];
    warnings: string[];
    row_status: 'valid' | 'warning' | 'error';
  }>;
  unknown: Record<'categories' | 'statuses' | 'locations', ImportUnknownReference[]>;
  options: Record<'categories' | 'statuses' | 'locations', ImportReferenceOption[]>;
}

export interface ImportResolution {
  mode: 'existing' | 'create';
  id?: string;
  name?: string;
  color?: string;
  is_terminal?: boolean;
}

export type AssetImportResolutions = Record<'categories' | 'statuses' | 'locations', Record<string, ImportResolution>>;

export const validateAssetImport = (
  fileName: string,
  sourceSheet: string | null,
  columnMapping: Record<string, string>,
  rows: Record<string, unknown>[],
) => invoke<AssetImportValidation>('validate_import', { fileName, sourceSheet, columnMapping, rows });

export const commitAssetImport = (jobId: string, resolutions: AssetImportResolutions) =>
  invoke<{ jobId: string; total: number; imported: number }>('commit_import', { jobId, resolutions });

export const createAssetTerm = (assetId: string, documentType: string, movementId?: string) =>
  invoke<{ term: Record<string, unknown> }>('create_term', { assetId, documentType, movementId });
