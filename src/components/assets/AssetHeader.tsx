import { BarChart3, Boxes, FileSpreadsheet, Plus, Repeat2, Settings } from 'lucide-react';
import { AppHeader, HeaderSubNavigation } from '@/components/AppHeader';
import { useAuth } from '@/contexts/AuthContext';

export function AssetHeader({ title = 'Controle de Patrimônio', subtitle = 'Gestão integrada de bens' }: { title?: string; subtitle?: string }) {
  const { assetAccess } = useAuth();
  const canOperate = assetAccess === 'operador' || assetAccess === 'gestor';
  const canManage = assetAccess === 'gestor';
  const links: HeaderSubNavigation[] = [
    { to: '/patrimonio', label: 'Patrimônios', icon: Boxes, end: true },
    { to: '/patrimonio/movimentacoes', label: 'Movimentações', icon: Repeat2, end: true },
    { to: '/relatorios/patrimonio', label: 'Relatórios', icon: BarChart3, end: true },
    ...(canManage ? [{ to: '/patrimonio/importar', label: 'Importar', icon: FileSpreadsheet, end: true }] : []),
    ...(canManage ? [{ to: '/patrimonio/configuracoes', label: 'Configurações', icon: Settings, end: true }] : []),
    ...(canOperate ? [{ to: '/patrimonio/novo', label: 'Novo patrimônio', icon: Plus, end: true }] : []),
  ];
  return <AppHeader title={title} subtitle={subtitle} badge={assetAccess} subNavigation={links} />;
}
