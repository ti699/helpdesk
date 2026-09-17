import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, FileDown, FileSignature, Loader2, Pencil, Plus, Repeat2, Ticket, User } from 'lucide-react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { createAssetTerm } from '@/lib/assetActions';
import { AssetHeader } from '@/components/assets/AssetHeader';
import { AssetStatusBadge } from '@/components/assets/AssetStatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AssetMovement, AssetRecord, formatCurrency, movementLabels } from '@/types/assets';

const db = supabase as any;

interface AuditLog { id: string; action: string; description: string | null; before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; created_at: string; user_id: string | null }
interface AssetTicket { id: string; protocolo: string; titulo: string; status: string; prioridade: string; created_at: string }
interface AssetTerm { id: string; document_type: string; document_snapshot: Record<string, unknown>; content_hash: string; status: 'pendente' | 'aceito' | 'cancelado'; responsible_user_id: string | null; responsible_name: string | null; issued_at: string; accepted_at: string | null }

const termLabels: Record<string, string> = { responsabilidade: 'Termo de Responsabilidade', transferencia: 'Termo de Transferência', emprestimo: 'Termo de Empréstimo', devolucao: 'Termo de Devolução', envio_manutencao: 'Envio para Manutenção', retorno_manutencao: 'Retorno de Manutenção', baixa: 'Termo de Baixa', descarte: 'Termo de Descarte' };

export default function AssetDetail() {
  const { id } = useParams();
  const { user, assetAccess } = useAuth();
  const { toast } = useToast();
  const [asset, setAsset] = useState<AssetRecord | null>(null);
  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [tickets, setTickets] = useState<AssetTicket[]>([]);
  const [terms, setTerms] = useState<AssetTerm[]>([]);
  const [termType, setTermType] = useState('responsabilidade');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const canOperate = assetAccess === 'operador' || assetAccess === 'gestor';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [assetResult, movementResult, auditResult, ticketResult, termResult] = await Promise.all([
        db.from('assets').select(`*, category:asset_categories(*), status:asset_statuses(*), location:asset_locations(*), responsible:profiles!assets_responsible_user_id_fkey(id, nome, email, setor)`).eq('id', id).single(),
        db.from('asset_movements').select('*').eq('asset_id', id).order('created_at', { ascending: false }),
        assetAccess ? db.from('asset_audit_logs').select('*').eq('entity_type', 'asset').eq('entity_id', id).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        db.from('tickets').select('id, protocolo, titulo, status, prioridade, created_at').eq('asset_id', id).order('created_at', { ascending: false }),
        db.from('asset_terms').select('*').eq('asset_id', id).order('issued_at', { ascending: false }),
      ]);
      if (assetResult.error) throw assetResult.error;
      setAsset(assetResult.data); setMovements(movementResult.data || []); setAudit(auditResult.data || []); setTickets(ticketResult.data || []); setTerms(termResult.data || []);
    } catch (error) {
      console.error('Error loading asset detail:', error);
      toast({ title: 'Erro', description: 'Não foi possível carregar este patrimônio.', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [assetAccess, id, toast]);
  useEffect(() => { load(); }, [load]);

  const timeline = useMemo(() => [
    ...movements.map((movement) => ({ id: movement.id, date: movement.requested_at, type: 'movement', title: movementLabels[movement.movement_type], detail: `${movement.reason} · ${movement.status}` })),
    ...audit.map((log) => ({ id: log.id, date: log.created_at, type: 'audit', title: log.description || 'Alteração patrimonial', detail: log.action })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [audit, movements]);

  const issueTerm = async () => {
    if (!asset) return; setWorking(true);
    try { await createAssetTerm(asset.id, termType); toast({ title: 'Termo emitido', description: 'A cópia imutável foi registrada.' }); await load(); }
    catch (error) { toast({ title: 'Erro', description: error instanceof Error ? error.message : 'Não foi possível emitir.', variant: 'destructive' }); }
    finally { setWorking(false); }
  };

  const acceptTerm = async (termId: string) => {
    setWorking(true);
    const { error } = await db.rpc('accept_asset_term', { _term_id: termId, _user_agent: navigator.userAgent });
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' }); else { toast({ title: 'Termo confirmado', description: 'O aceite foi registrado com data, usuário e hash.' }); await load(); }
    setWorking(false);
  };

  const exportTerm = (term: AssetTerm) => {
    if (!asset) return;
    const snapshot = term.document_snapshot || {};
    const snapshotAsset = (snapshot.asset || {}) as Partial<AssetRecord>;
    const snapshotResponsible = typeof snapshot.responsibleName === 'string' ? snapshot.responsibleName : null;
    const snapshotLocation = typeof snapshot.locationName === 'string' ? snapshot.locationName : null;
    const doc = new jsPDF();
    doc.setFillColor(201, 32, 38); doc.rect(0, 0, 210, 30, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(18); doc.text('GRUPO ASTROTUR', 105, 18, { align: 'center' });
    doc.setTextColor(20, 30, 50); doc.setFontSize(16); doc.text(termLabels[term.document_type] || 'Termo Patrimonial', 105, 45, { align: 'center' });
    doc.setFontSize(10); const lines = [
      `Patrimônio: ${snapshotAsset.asset_code || asset.asset_code} - ${snapshotAsset.name || asset.name}`, `Marca/Modelo: ${[snapshotAsset.brand, snapshotAsset.model].filter(Boolean).join(' ') || 'Não informado'}`,
      `Número de série: ${snapshotAsset.serial_number || 'Não informado'}`, `Responsável: ${snapshotResponsible || snapshotAsset.responsible_name || 'Não informado'}`,
      `Setor: ${snapshotAsset.department || 'Não informado'}`, `Localização: ${snapshotLocation || 'Não informada'}`,
      `Emitido em: ${format(new Date(term.issued_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}`, `Situação: ${term.status === 'aceito' ? 'Aceito' : 'Pendente de aceite'}`,
    ];
    let y = 62; lines.forEach((line) => { doc.text(line, 20, y); y += 8; });
    doc.setFontSize(9); doc.text(doc.splitTextToSize('Declaro ciência e responsabilidade pela guarda e uso adequado do bem identificado neste documento, comprometendo-me a comunicar qualquer ocorrência ao gestor patrimonial.', 170), 20, y + 8);
    doc.setFontSize(7); doc.setTextColor(90, 100, 115); doc.text(`Hash de integridade: ${term.content_hash}`, 20, 275); doc.text('Confirmação interna auditável. Não equivale a assinatura ICP-Brasil.', 20, 282);
    doc.save(`termo-${asset.asset_code}-${term.document_type}.pdf`);
  };

  if (loading) return <div className="min-h-screen bg-background"><AssetHeader /><div className="flex h-[70vh] items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /></div></div>;
  if (!asset) return <div className="min-h-screen bg-background"><AssetHeader /><div className="container py-16 text-center">Patrimônio não encontrado ou sem permissão de acesso.</div></div>;

  return <div className="min-h-screen bg-background"><AssetHeader title={`${asset.asset_code} · ${asset.name}`} subtitle="Ficha e histórico do patrimônio" /><main className="container space-y-4 px-3 py-4 sm:px-4 sm:py-6">
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="rounded-md"><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{asset.name}</CardTitle><CardDescription className="font-mono">{asset.asset_code}</CardDescription></div><AssetStatusBadge name={asset.status?.name} color={asset.status?.color} /></div></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
        ['Categoria', asset.category?.name], ['Marca / Modelo', [asset.brand, asset.model].filter(Boolean).join(' ')], ['Número de série', asset.serial_number], ['Nota fiscal', asset.invoice_number],
        ['Aquisição', asset.purchase_date ? format(new Date(`${asset.purchase_date}T12:00:00`), 'dd/MM/yyyy') : null], ['Valor', formatCurrency(Number(asset.purchase_value) || null)],
        ['Garantia', asset.warranty_until ? format(new Date(`${asset.warranty_until}T12:00:00`), 'dd/MM/yyyy') : null], ['Setor', asset.department], ['Localização', asset.location?.name],
      ].map(([label, value]) => <div key={label}><p className="text-xs font-medium text-muted-foreground">{label}</p><p>{value || 'Não informado'}</p></div>)}
        <div className="sm:col-span-2 lg:col-span-3"><p className="text-xs font-medium text-muted-foreground">Descrição</p><p className="whitespace-pre-wrap">{asset.description || 'Sem descrição'}</p></div>
      </CardContent></Card>
      <Card className="rounded-md"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" />Responsabilidade atual</CardTitle></CardHeader><CardContent className="space-y-3"><div><p className="font-medium">{asset.responsible?.nome || asset.responsible_name || 'Sem responsável'}</p><p className="text-xs text-muted-foreground">{asset.responsible?.email || 'Nome livre, setor ou posto'}</p></div>{canOperate && <div className="grid gap-2"><Link to={`/patrimonio/${asset.id}/editar`}><Button variant="outline" className="w-full"><Pencil className="mr-2 h-4 w-4" />Editar cadastro</Button></Link><Link to={`/patrimonio/movimentacoes?asset=${asset.id}`}><Button className="w-full"><Repeat2 className="mr-2 h-4 w-4" />Movimentar</Button></Link><Link to={`/novo-ticket?asset=${asset.id}`}><Button variant="secondary" className="w-full"><Ticket className="mr-2 h-4 w-4" />Abrir ticket</Button></Link></div>}</CardContent></Card>
    </div>

    <Tabs defaultValue="timeline"><TabsList className="grid w-full max-w-2xl grid-cols-3"><TabsTrigger value="timeline">Histórico</TabsTrigger><TabsTrigger value="tickets">Tickets ({tickets.length})</TabsTrigger><TabsTrigger value="terms">Termos ({terms.length})</TabsTrigger></TabsList>
      <TabsContent value="timeline"><Card className="rounded-md"><CardHeader><CardTitle className="text-lg">Linha do tempo</CardTitle></CardHeader><CardContent><div className="space-y-0">{timeline.length === 0 ? <p className="py-10 text-center text-muted-foreground">Nenhuma movimentação registrada.</p> : timeline.map((item, index) => <div key={`${item.type}-${item.id}`} className="relative flex gap-4 pb-5"><div className="relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full bg-primary" />{index < timeline.length - 1 && <div className="absolute left-[5px] top-4 h-full w-px bg-border" />}<div><p className="font-medium">{item.title}</p><p className="text-sm text-muted-foreground">{item.detail}</p><p className="mt-1 text-xs text-muted-foreground">{format(new Date(item.date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p></div></div>)}</div></CardContent></Card></TabsContent>
      <TabsContent value="tickets"><Card className="rounded-md"><CardHeader><div className="flex items-center justify-between"><CardTitle className="text-lg">Tickets relacionados</CardTitle><Link to={`/novo-ticket?asset=${asset.id}`}><Button size="sm"><Plus className="mr-2 h-4 w-4" />Novo ticket</Button></Link></div></CardHeader><CardContent className="divide-y rounded-md border">{tickets.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum ticket vinculado.</p> : tickets.map((ticket) => <Link key={ticket.id} to={`/ticket/${ticket.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/50"><div><p className="font-mono text-xs text-primary">{ticket.protocolo}</p><p className="font-medium">{ticket.titulo}</p><p className="text-xs text-muted-foreground">{format(new Date(ticket.created_at), 'dd/MM/yyyy HH:mm')}</p></div><Badge variant="outline">{ticket.status.replaceAll('_', ' ')}</Badge></Link>)}</CardContent></Card></TabsContent>
      <TabsContent value="terms"><Card className="rounded-md"><CardHeader><CardTitle className="text-lg">Termos patrimoniais</CardTitle><CardDescription>Cópias imutáveis com hash de integridade e aceite autenticado.</CardDescription></CardHeader><CardContent className="space-y-4">{canOperate && <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row"><Select value={termType} onValueChange={setTermType}><SelectTrigger className="sm:w-72"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(termLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Button onClick={issueTerm} disabled={working}><FileSignature className="mr-2 h-4 w-4" />Emitir termo</Button></div>}<div className="divide-y rounded-md border">{terms.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Nenhum termo emitido.</p> : terms.map((term) => <div key={term.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{termLabels[term.document_type] || term.document_type}</p><p className="text-xs text-muted-foreground">Emitido em {format(new Date(term.issued_at), 'dd/MM/yyyy HH:mm')} · {term.status}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => exportTerm(term)}><FileDown className="mr-2 h-4 w-4" />PDF</Button>{term.status === 'pendente' && (term.responsible_user_id === user?.id || assetAccess === 'gestor') && <Button size="sm" onClick={() => acceptTerm(term.id)} disabled={working}><CheckCircle2 className="mr-2 h-4 w-4" />Confirmar aceite</Button>}</div></div>)}</div></CardContent></Card></TabsContent>
    </Tabs>
  </main></div>;
}
