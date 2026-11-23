import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { roundBudgetValue, type BudgetLine } from '@/lib/budgetUtils';

export type BudgetType = 'interno' | 'externo';
export type BudgetStatus = 'rascunho' | 'aguardando_aprovacao' | 'aprovado' | 'reprovado' | 'revisao';
export type BudgetDecision = Extract<BudgetStatus, 'aprovado' | 'reprovado' | 'revisao'>;
export type BudgetRecord = Database['public']['Tables']['orcamentos']['Row'];

export const BUDGET_ATTACHMENT_BUCKET = 'orcamentos-anexos';
export const budgetStatusLabels: Record<BudgetStatus, string> = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  revisao: 'Revisão solicitada',
};

export const parseBudgetItems = (value: Json): BudgetLine[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
    const id = item.id;
    const descricao = item.descricao;
    const quantidade = item.quantidade;
    const valorUnitario = item.valor_unitario;
    const total = item.total;

    if (
      typeof id !== 'string'
      || typeof descricao !== 'string'
      || typeof quantidade !== 'number'
      || typeof valorUnitario !== 'number'
      || typeof total !== 'number'
    ) return [];

    return [{ id, descricao, quantidade, valor_unitario: valorUnitario, total }];
  });
};

export interface SaveBudgetInput {
  id?: string;
  userId: string;
  ticketId: string | null;
  titulo: string;
  tipo: BudgetType;
  setor: string;
  fornecedor: string | null;
  descricao: string;
  itens: BudgetLine[];
  valorTotal: number;
  status: Extract<BudgetStatus, 'rascunho' | 'aguardando_aprovacao' | 'revisao'>;
  currentAttachmentPath?: string | null;
  currentAttachmentName?: string | null;
  currentReason?: string | null;
  attachment?: File | null;
}

const sanitizeFileName = (name: string) =>
  name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_');

const getAttachmentMimeType = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  return (extension && mimeTypes[extension]) || file.type || 'application/octet-stream';
};

export const saveBudget = async (input: SaveBudgetInput): Promise<BudgetRecord> => {
  let uploadedPath: string | null = null;
  const attachmentName = input.attachment?.name || input.currentAttachmentName || null;

  if (input.attachment) {
    uploadedPath = `${input.userId}/${crypto.randomUUID()}/${sanitizeFileName(input.attachment.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUDGET_ATTACHMENT_BUCKET)
      .upload(uploadedPath, input.attachment, {
        contentType: getAttachmentMimeType(input.attachment),
        upsert: false,
      });

    if (uploadError) throw uploadError;
  }

  const payload = {
    ticket_id: input.ticketId,
    titulo: input.titulo,
    tipo: input.tipo,
    setor: input.setor,
    fornecedor: input.fornecedor,
    descricao: input.descricao,
    itens: input.itens.map((item) => ({ ...item, total: roundBudgetValue(item.total) })),
    valor_total: roundBudgetValue(input.valorTotal),
    anexo_url: uploadedPath || input.currentAttachmentPath || null,
    anexo_nome: attachmentName,
    status: input.status,
    motivo_decisao: input.status === 'revisao' ? input.currentReason || null : null,
    aprovado_por: null,
    aprovado_em: null,
  };

  const result = input.id
    ? await supabase.from('orcamentos').update(payload).eq('id', input.id).select('*').single()
    : await supabase.from('orcamentos').insert({ ...payload, criado_por: input.userId }).select('*').single();

  if (result.error) {
    if (uploadedPath) {
      const { error: cleanupError } = await supabase.storage.from(BUDGET_ATTACHMENT_BUCKET).remove([uploadedPath]);
      if (cleanupError) console.error('Failed to clean up uploaded budget attachment:', cleanupError);
    }
    throw result.error;
  }

  if (uploadedPath && input.currentAttachmentPath) {
    const { error: cleanupError } = await supabase.storage
      .from(BUDGET_ATTACHMENT_BUCKET)
      .remove([input.currentAttachmentPath]);
    if (cleanupError) console.error('Failed to remove replaced budget attachment:', cleanupError);
  }

  return result.data;
};

export const decideBudget = async (
  budgetId: string,
  decision: BudgetDecision,
  reason: string,
): Promise<BudgetRecord> => {
  const { data, error } = await supabase
    .from('orcamentos')
    .update({
      status: decision,
      motivo_decisao: reason.trim() || null,
    })
    .eq('id', budgetId)
    .eq('status', 'aguardando_aprovacao')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Este orçamento não está mais aguardando decisão.');
  return data;
};

export const deleteBudget = async (budgetId: string, reason: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_orcamento', {
    _orcamento_id: budgetId,
    _motivo: reason.trim(),
  });

  if (error) throw error;
};

export const getBudgetAttachmentUrl = async (path: string) => {
  const { data, error } = await supabase.storage
    .from(BUDGET_ATTACHMENT_BUCKET)
    .createSignedUrl(path, 3600);

  if (error) throw error;
  return data.signedUrl;
};
