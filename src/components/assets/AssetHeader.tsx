import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, BarChart3, Boxes, FileSpreadsheet, Plus, Repeat2, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { AccountMenu } from '@/components/AccountMenu';
import { useAuth } from '@/contexts/AuthContext';

const links = [
  { to: '/patrimonio', label: 'Patrimônios', icon: Boxes },
  { to: '/patrimonio/movimentacoes', label: 'Movimentações', icon: Repeat2 },
  { to: '/relatorios/patrimonio', label: 'Relatórios', icon: BarChart3 },
];

export function AssetHeader({ title = 'Controle de Patrimônio', subtitle = 'Gestão integrada de bens' }: { title?: string; subtitle?: string }) {
  const location = useLocation();
  const { assetAccess } = useAuth();
  const canOperate = assetAccess === 'operador' || assetAccess === 'gestor';
  const canManage = assetAccess === 'gestor';

  return (
    <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container flex min-h-16 flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-9 w-9" title="Voltar ao Help Desk">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <img src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" alt="Grupo Astrotur" className="h-9 object-contain" />
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold sm:text-lg">{title}</h1>
            <Badge variant="outline" className="hidden text-[10px] uppercase sm:inline-flex">{assetAccess}</Badge>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">{subtitle}</p>
        </div>

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Navegação de patrimônio">
          {links.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}>
              <Button variant={location.pathname === to ? 'secondary' : 'ghost'} size="sm" className="h-8 whitespace-nowrap text-xs">
                <Icon className="mr-1.5 h-4 w-4" />{label}
              </Button>
            </Link>
          ))}
          {canManage && (
            <Link to="/patrimonio/configuracoes">
              <Button variant={location.pathname === '/patrimonio/configuracoes' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" title="Configurações de patrimônio">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          )}
          {canManage && (
            <Link to="/patrimonio/importar">
              <Button variant={location.pathname === '/patrimonio/importar' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8" title="Importar CSV">
                <FileSpreadsheet className="h-4 w-4" />
              </Button>
            </Link>
          )}
          {canOperate && (
            <Link to="/patrimonio/novo">
              <Button size="sm" className="h-8 whitespace-nowrap text-xs">
                <Plus className="mr-1.5 h-4 w-4" />Novo
              </Button>
            </Link>
          )}
        </nav>
        <ThemeToggle />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  );
}
