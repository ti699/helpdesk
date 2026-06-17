import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, LogOut, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function AccountMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleUpdatePassword = async () => {
    if (newPassword.length < 6) {
      toast({
        title: 'Senha muito curta',
        description: 'A nova senha deve ter no mínimo 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Senhas diferentes',
        description: 'Confirme a nova senha digitando o mesmo valor.',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({
        title: 'Senha alterada',
        description: 'Sua senha foi atualizada com sucesso.',
      });
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordDialog(false);
    } catch (error) {
      toast({
        title: 'Erro ao alterar senha',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar sua senha.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-10 gap-2 px-2">
            <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
              <AvatarImage src={profile?.foto_perfil || undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {profile?.nome?.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-40 truncate text-sm font-medium md:inline">
              {profile?.nome || 'Minha conta'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{profile?.nome || 'Usuário'}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{profile?.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowPasswordDialog(true)}>
            <KeyRound className="mr-2 h-4 w-4" />
            Conta / Alterar senha
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para sua conta de acesso ao Help Desk.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-new-password">Nova senha</Label>
              <Input
                id="account-new-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm-password">Confirmar senha</Label>
              <Input
                id="account-confirm-password"
                type="password"
                placeholder="Digite novamente"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleUpdatePassword} disabled={updatingPassword}>
              {updatingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
