import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Boxes, Headphones, Menu, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AccountMenu } from '@/components/AccountMenu';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface HeaderSubNavigation {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  badge?: string | null;
  subNavigation?: HeaderSubNavigation[];
  actions?: ReactNode;
}

const isActivePath = (pathname: string, item: HeaderSubNavigation) => item.end
  ? pathname === item.to
  : pathname === item.to || pathname.startsWith(`${item.to}/`);

export function AppHeader({ title, subtitle, badge, subNavigation = [], actions }: AppHeaderProps) {
  const location = useLocation();
  const { role, managementReportAccess, assetAccess } = useAuth();
  const mainNavigation: HeaderSubNavigation[] = [
    { to: role === 'solicitante' ? '/' : '/dashboard', label: 'Help Desk', icon: Headphones, end: true },
    ...(assetAccess ? [{ to: '/patrimonio', label: 'Patrimônio', icon: Boxes, end: true }] : []),
    ...(role === 'admin' || managementReportAccess ? [{ to: '/gestao', label: 'Alta Gestão', icon: BarChart3, end: true }] : []),
    ...(role === 'admin' ? [{ to: '/admin', label: 'Administração', icon: Settings, end: true }] : []),
  ];

  const navItems = (items: HeaderSubNavigation[], mobile = false) => items.map((item) => {
    const Icon = item.icon;
    const active = isActivePath(location.pathname, item);
    return <Link key={item.to} to={item.to} className={mobile ? 'w-full' : ''}>
      <Button variant={active ? 'secondary' : 'ghost'} size="sm" className={mobile ? 'w-full justify-start' : 'h-9 whitespace-nowrap'}>
        {Icon && <Icon className="mr-2 h-4 w-4" />}{item.label}
      </Button>
    </Link>;
  });

  return <header className="sticky top-0 z-50 border-b bg-card/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
    <div className="container flex h-16 items-center gap-3 px-3 sm:px-4">
      <Sheet>
        <SheetTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></Button></SheetTrigger>
        <SheetContent side="left" className="w-72 p-4">
          <SheetHeader className="mb-5 text-left"><SheetTitle>Navegação</SheetTitle></SheetHeader>
          <nav className="space-y-1" aria-label="Navegação principal">{navItems(mainNavigation, true)}</nav>
          {subNavigation.length > 0 && <><p className="mb-2 mt-6 px-3 text-xs font-semibold uppercase text-muted-foreground">{title}</p><nav className="space-y-1" aria-label={`Navegação de ${title}`}>{navItems(subNavigation, true)}</nav></>}
        </SheetContent>
      </Sheet>

      <Link to={role === 'solicitante' ? '/' : '/dashboard'} className="flex shrink-0 items-center">
        <img src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" alt="Grupo Astrotur" className="h-9 w-auto object-contain sm:h-10" />
      </Link>
      <div className="min-w-0 border-l pl-3">
        <div className="flex min-w-0 items-center gap-2"><h1 className="truncate text-sm font-semibold sm:text-base">{title}</h1>{badge && <Badge variant="outline" className="hidden shrink-0 text-[10px] uppercase xl:inline-flex">{badge}</Badge>}</div>
        {subtitle && <Tooltip><TooltipTrigger asChild><p className="max-w-56 truncate text-xs text-muted-foreground sm:max-w-72">{subtitle}</p></TooltipTrigger><TooltipContent>{subtitle}</TooltipContent></Tooltip>}
      </div>

      <nav className="ml-auto hidden items-center gap-1 lg:flex" aria-label="Navegação principal">{navItems(mainNavigation)}</nav>
      <div className="hidden h-6 w-px bg-border lg:block" />
      {actions}
      <ThemeToggle />
      <NotificationBell />
      <AccountMenu />
    </div>
    {subNavigation.length > 0 && <div className="hidden border-t bg-muted/25 lg:block"><div className="container flex h-11 items-center gap-1 overflow-x-auto px-4"><span className="mr-2 shrink-0 text-xs font-medium text-muted-foreground">{title}</span>{navItems(subNavigation)}</div></div>}
  </header>;
}
