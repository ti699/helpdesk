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

export const importAssets = (fileName: string, rows: Record<string, unknown>[]) =>
  invoke<{ jobId: string; total: number; imported: number; errors: Array<{ row_number: number; message: string }> }>('import_assets', { fileName, rows });

export const createAssetTerm = (assetId: string, documentType: string, movementId?: string) =>
  invoke<{ term: Record<string, unknown> }>('create_term', { assetId, documentType, movementId });
