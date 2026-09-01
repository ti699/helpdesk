import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountMenu } from '@/components/AccountMenu';
import { ArrowLeft, BarChart3, Loader2, Users, Mail, UserRoundCog } from 'lucide-react';
import { UserManagement } from '@/components/admin/UserManagement';
import { InvitationManagement } from '@/components/admin/InvitationManagement';
import { DepartmentEmailManagement } from '@/components/admin/DepartmentEmailManagement';
import { ServiceExecutorManagement } from '@/components/admin/ServiceExecutorManagement';

export default function Admin() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!authLoading && role !== 'admin') {
      navigate('/dashboard');
    }
  }, [role, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="container flex h-16 items-center justify-between px-3 sm:px-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <img 
              src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" 
              alt="Grupo Astrotur" 
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block min-w-0">
              <h1 className="text-sm sm:text-lg font-semibold text-foreground truncate">Administração</h1>
              <p className="text-xs text-muted-foreground">Gestão de Usuários e Convites</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-4">
            <Badge variant="outline" className="hidden sm:flex bg-primary/10 text-primary border-primary/20 text-xs">
              Administrador
            </Badge>
            <Link to="/gestao">
              <Button variant="outline" size="sm" className="hidden sm:flex h-8">
                <BarChart3 className="mr-2 h-4 w-4" />
                Alta Gestão
              </Button>
              <Button variant="outline" size="icon" className="sm:hidden h-8 w-8">
                <BarChart3 className="h-4 w-4" />
              </Button>
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container px-3 sm:px-4 py-4 sm:py-6">
        <Tabs defaultValue="usuarios" className="w-full">
          <TabsList className="mb-4 sm:mb-6 grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="usuarios" className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="h-4 w-4" />
              <span className="hidden xs:inline">Usuários</span>
              <span className="xs:hidden">Users</span>
            </TabsTrigger>
            <TabsTrigger value="convites" className="flex items-center gap-2 text-xs sm:text-sm">
              <Mail className="h-4 w-4" />
              <span className="hidden xs:inline">Convites</span>
              <span className="xs:hidden">Convite</span>
            </TabsTrigger>
            <TabsTrigger value="emails" className="flex items-center gap-2 text-xs sm:text-sm">
              <Mail className="h-4 w-4" />
              <span>E-mails</span>
            </TabsTrigger>
            <TabsTrigger value="executores" className="flex items-center gap-2 text-xs sm:text-sm">
              <UserRoundCog className="h-4 w-4" />
              <span className="hidden xs:inline">Executores</span>
              <span className="xs:hidden">Exec.</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="usuarios">
            <UserManagement />
          </TabsContent>
          
          <TabsContent value="convites">
            <InvitationManagement />
          </TabsContent>

          <TabsContent value="emails">
            <DepartmentEmailManagement />
          </TabsContent>

          <TabsContent value="executores">
            <ServiceExecutorManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
