import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { User, Search, Filter, Loader2, BarChart3, Pencil, UserCheck, UserX } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RoleSelector } from './RoleSelector';

interface UserWithRole {
  active: boolean;
  deactivated_at: string | null;
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  funcao: string | null;
  setor: string | null;
  foto_perfil: string | null;
  num_anydesk: string | null;
  created_at: string;
  role: 'solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin';
  managementAccess: boolean;
}

interface AdminActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface UserProfileUpdateResult {
  user: Partial<UserWithRole>;
}

const roleLabels: Record<string, string> = {
  solicitante: 'Solicitante',
  agente_ti: 'Agente TI',
  agente_manutencao: 'Agente Manutenção',
  admin: 'Administrador',
};

const roleColors: Record<string, string> = {
  solicitante: 'bg-muted text-muted-foreground',
  agente_ti: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  agente_manutencao: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  admin: 'bg-primary/10 text-primary',
};

export function UserManagement() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [editForm, setEditForm] = useState({
    nome: '',
    telefone: '',
    funcao: '',
    setor: '',
    num_anydesk: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, nome, email, telefone, funcao, setor, num_anydesk, foto_perfil, created_at, active, deactivated_at')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const { data: managementAccess, error: managementAccessError } = await supabase
        .from('management_report_access')
        .select('user_id');

      if (managementAccessError) throw managementAccessError;

      const managementAccessSet = new Set((managementAccess || []).map((access) => access.user_id));

      // Merge profiles with roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map((profile) => {
        const userRole = roles?.find((r) => r.user_id === profile.id);
        return {
          ...profile,
          active: profile.active !== false,
          deactivated_at: profile.deactivated_at || null,
          role: (userRole?.role as 'solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin') || 'solicitante',
          managementAccess: managementAccessSet.has(profile.id),
        };
      });

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os usuários',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const invokeAdminUserAction = async <T,>(action: string, payload: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke<AdminActionResult<T>>('admin-user-actions', {
      body: { action, payload },
    });

    if (error) {
      throw new Error(error.message || 'Não foi possível executar a ação administrativa');
    }

    if (!data?.success) {
      throw new Error(data?.error || 'Não foi possível executar a ação administrativa');
    }

    return data.data as T;
  };

  const openEditDialog = (selectedUser: UserWithRole) => {
    setEditingUser(selectedUser);
    setEditForm({
      nome: selectedUser.nome || '',
      telefone: selectedUser.telefone || '',
      funcao: selectedUser.funcao || '',
      setor: selectedUser.setor || '',
      num_anydesk: selectedUser.num_anydesk || '',
    });
  };

  const handleSaveProfile = async () => {
    if (!editingUser) return;

    if (!editForm.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Informe o nome do usuário antes de salvar.',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingUserId(editingUser.id);
    try {
      const result = await invokeAdminUserAction<UserProfileUpdateResult>('update_profile', {
        userId: editingUser.id,
        ...editForm,
      });

      setUsers((prev) =>
        prev.map((user) =>
          user.id === editingUser.id
            ? { ...user, ...result.user }
            : user
        )
      );

      toast({
        title: 'Usuário atualizado',
        description: 'Os dados cadastrais foram salvos.',
      });
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user profile:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o usuário',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleUserActiveChange = async (selectedUser: UserWithRole, active: boolean) => {
    if (!active) {
      const confirmed = window.confirm(
        `Desativar o acesso de ${selectedUser.nome}? O histórico será mantido, mas o usuário não poderá acessar o sistema.`
      );

      if (!confirmed) return;
    }

    setUpdatingUserId(selectedUser.id);
    try {
      const result = await invokeAdminUserAction<UserProfileUpdateResult>(
        active ? 'reactivate_user' : 'deactivate_user',
        { userId: selectedUser.id }
      );

      setUsers((prev) =>
        prev.map((user) =>
          user.id === selectedUser.id
            ? {
                ...user,
                ...result.user,
                active,
                managementAccess: active ? user.managementAccess : false,
              }
            : user
        )
      );

      toast({
        title: active ? 'Usuário reativado' : 'Usuário desativado',
        description: active
          ? 'O usuário voltou a poder acessar o sistema.'
          : 'O acesso foi bloqueado e o histórico foi preservado.',
      });
    } catch (error) {
      console.error('Error changing user active status:', error);
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível alterar o status do usuário',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleManagementAccessChange = async (userId: string, enabled: boolean) => {
    setUpdatingUserId(userId);
    try {
      if (enabled) {
        const { error } = await supabase
          .from('management_report_access')
          .upsert({
            user_id: userId,
            granted_by: currentUser?.id || null,
          });

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('management_report_access')
          .delete()
          .eq('user_id', userId);

        if (error) throw error;
      }

      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, managementAccess: enabled } : user
        )
      );

      toast({
        title: enabled ? 'Alta Gestão liberada' : 'Alta Gestão removida',
        description: enabled
          ? 'Usuário poderá acessar o relatório executivo.'
          : 'Usuário não poderá mais acessar o relatório executivo.',
      });
    } catch (error) {
      console.error('Error updating management access:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o acesso à Alta Gestão',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'solicitante' | 'agente_ti' | 'agente_manutencao' | 'admin') => {
    setUpdatingUserId(userId);
    try {
      // Check if user already has a role entry
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role: newRole })
          .eq('user_id', userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: newRole });

        if (error) throw error;
      }

      // Update local state
      setUsers((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      toast({
        title: 'Permissão atualizada',
        description: `Usuário agora é ${roleLabels[newRole]}`,
      });
    } catch (error) {
      console.error('Error updating role:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a permissão',
        variant: 'destructive',
      });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.nome.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.funcao || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.setor || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.active) ||
      (statusFilter === 'inactive' && !user.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestão de Usuários</CardTitle>
        <CardDescription>
          Visualize e gerencie as permissões dos usuários do sistema
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email, função ou setor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Desativados</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="solicitante">Solicitantes</SelectItem>
                <SelectItem value="agente_ti">Agentes TI</SelectItem>
                <SelectItem value="agente_manutencao">Agentes Manutenção</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-9 w-32" />
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="py-12 text-center">
            <User className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">Nenhum usuário encontrado</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Tente ajustar os filtros de busca
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.foto_perfil || undefined} />
                  <AvatarFallback className="bg-muted">
                    {user.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{user.nome}</p>
                    <Badge variant={user.active ? 'outline' : 'destructive'}>
                      {user.active ? 'Ativo' : 'Desativado'}
                    </Badge>
                    <Badge className={roleColors[user.role]}>
                      {roleLabels[user.role]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {user.funcao && <span>{user.funcao}</span>}
                    {user.funcao && user.setor && <span>•</span>}
                    {user.setor && <span>{user.setor}</span>}
                    {user.setor && <span>•</span>}
                    <span>Desde {format(new Date(user.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                    {!user.active && user.deactivated_at && (
                      <>
                        <span>•</span>
                        <span>Desativado em {format(new Date(user.deactivated_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3 sm:items-end">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(user)}
                      disabled={updatingUserId === user.id}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    {user.active ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleUserActiveChange(user, false)}
                        disabled={updatingUserId === user.id || user.id === currentUser?.id}
                        title={user.id === currentUser?.id ? 'Você não pode desativar seu próprio usuário' : undefined}
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Desativar
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUserActiveChange(user, true)}
                        disabled={updatingUserId === user.id}
                      >
                        <UserCheck className="mr-2 h-4 w-4" />
                        Reativar
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <div className="leading-tight">
                      <p className="text-xs font-medium">Alta Gestão</p>
                      <p className="text-[11px] text-muted-foreground">Relatório executivo</p>
                    </div>
                    <Switch
                      checked={user.managementAccess || user.role === 'admin'}
                      disabled={updatingUserId === user.id || user.role === 'admin' || !user.active}
                      onCheckedChange={(checked) => handleManagementAccessChange(user.id, checked)}
                      aria-label={`Acesso à Alta Gestão para ${user.nome}`}
                    />
                  </div>
                  {updatingUserId === user.id ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Atualizando...
                    </div>
                  ) : (
                    <RoleSelector
                      currentRole={user.role}
                      disabled={!user.active}
                      onRoleChange={(newRole) => handleRoleChange(user.id, newRole)}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Summary */}
        <div className="mt-6 flex flex-wrap gap-4 border-t pt-4 text-sm text-muted-foreground">
          <span>Total: {users.length} usuários</span>
          <span>•</span>
          <span>{users.filter((u) => u.role === 'solicitante').length} solicitantes</span>
          <span>•</span>
          <span>{users.filter((u) => u.role === 'agente_ti').length} agentes TI</span>
          <span>•</span>
          <span>{users.filter((u) => u.role === 'agente_manutencao').length} agentes manutenção</span>
          <span>•</span>
          <span>{users.filter((u) => u.role === 'admin').length} admins</span>
          <span>•</span>
          <span>{users.filter((u) => u.managementAccess || u.role === 'admin').length} com Alta Gestão</span>
          <span>•</span>
          <span>{users.filter((u) => !u.active).length} desativados</span>
        </div>
      </CardContent>
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Atualize os dados cadastrais. O e-mail não é alterado nesta tela.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome</Label>
              <Input
                id="edit-nome"
                value={editForm.nome}
                onChange={(event) => setEditForm((prev) => ({ ...prev, nome: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input id="edit-email" value={editingUser?.email || ''} disabled />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-telefone">Telefone</Label>
                <Input
                  id="edit-telefone"
                  value={editForm.telefone}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, telefone: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-anydesk">AnyDesk</Label>
                <Input
                  id="edit-anydesk"
                  value={editForm.num_anydesk}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, num_anydesk: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-funcao">Função</Label>
                <Input
                  id="edit-funcao"
                  value={editForm.funcao}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, funcao: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-setor">Setor</Label>
                <Input
                  id="edit-setor"
                  value={editForm.setor}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, setor: event.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveProfile} disabled={!!editingUser && updatingUserId === editingUser.id}>
              {editingUser && updatingUserId === editingUser.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
