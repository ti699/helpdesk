import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Loader2, Lock, Mail } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

const passwordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirmação deve ter no mínimo 6 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const { session, loading, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [checkingRecoveryLink, setCheckingRecoveryLink] = useState(true);
  const hasRecoverySession = Boolean(session?.user);

  useEffect(() => {
    const prepareRecoverySession = async () => {
      const code = searchParams.get('code');

      if (!code) {
        setCheckingRecoveryLink(false);
        return;
      }

      setIsLoading(true);
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        window.history.replaceState({}, document.title, '/reset-password');
      } catch (error) {
        toast({
          title: 'Link inválido ou expirado',
          description: error instanceof Error ? error.message : 'Solicite um novo link de recuperação.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
        setCheckingRecoveryLink(false);
      }
    };

    prepareRecoverySession();
  }, [searchParams, toast]);

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();

    try {
      passwordSchema.parse({ password: newPassword, confirmPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: 'Erro de validação',
          description: error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setIsSuccess(true);
      toast({
        title: 'Senha redefinida',
        description: 'Sua nova senha foi salva com sucesso.',
      });

      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/auth');
      }, 1800);
    } catch (error) {
      toast({
        title: 'Erro ao redefinir senha',
        description: error instanceof Error ? error.message : 'O link pode estar expirado. Solicite um novo e-mail.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendLink = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email) {
      toast({
        title: 'Email obrigatório',
        description: 'Digite seu email para receber um novo link.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await resetPassword(email);
      if (error) throw error;

      toast({
        title: 'Novo link enviado',
        description: 'Verifique sua caixa de entrada para redefinir a senha.',
      });
      setEmail('');
    } catch (error) {
      toast({
        title: 'Erro ao enviar link',
        description: error instanceof Error ? error.message : 'Não foi possível enviar o e-mail de recuperação.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (loading || checkingRecoveryLink) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-6">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardHeader className="text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <CardTitle>Senha redefinida</CardTitle>
            <CardDescription>Redirecionando para o login...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 text-center">
          <img
            src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png"
            alt="Grupo Astrotur"
            className="mx-auto h-16 sm:h-20 object-contain"
          />
          <h1 className="mt-4 text-2xl font-bold text-foreground">Ticket TI</h1>
          <p className="text-sm text-muted-foreground">Sistema de Help Desk</p>
        </div>

        {hasRecoverySession ? (
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-center">Definir nova senha</CardTitle>
              <CardDescription className="text-center">
                Digite e confirme a nova senha para recuperar seu acesso.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="new-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Digite novamente"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar nova senha
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-center">Link expirado ou inválido</CardTitle>
              <CardDescription className="text-center">
                Solicite um novo link de recuperação para definir sua senha.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleResendLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar novo link
                </Button>
                <Button type="button" variant="link" className="w-full" onClick={() => navigate('/auth')}>
                  Voltar para login
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
