import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppHeader } from '@/components/AppHeader';
import { Activity, Loader2, Users, Mail, UserRoundCog } from 'lucide-react';
import { UserManagement } from '@/components/admin/UserManagement';
import { InvitationManagement } from '@/components/admin/InvitationManagement';
import { DepartmentEmailManagement } from '@/components/admin/DepartmentEmailManagement';
import { ServiceExecutorManagement } from '@/components/admin/ServiceExecutorManagement';
import { DiagnosticsManagement } from '@/components/admin/DiagnosticsManagement';

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
      <AppHeader title="Administração" subtitle="Usuários, acessos, configurações e diagnóstico" badge="Administrador" />

      {/* Main Content */}
      <main className="container px-3 sm:px-4 py-4 sm:py-6">
        <Tabs defaultValue="usuarios" className="w-full">
          <TabsList className="mb-4 grid h-auto w-full max-w-4xl grid-cols-2 sm:mb-6 sm:grid-cols-5">
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
            <TabsTrigger value="diagnostico" className="flex items-center gap-2 text-xs sm:text-sm">
              <Activity className="h-4 w-4" /><span>Diagnóstico</span>
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

          <TabsContent value="diagnostico">
            <DiagnosticsManagement />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
