import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Lock, CheckCircle, Mail } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z.object({
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  confirmPassword: z.string().min(6, 'Confirmação deve ter no mínimo 6 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não conferem',
  path: ['confirmPassword'],
});

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const { verifyResetCode } = useAuth();
  
  // Email e código podem vir via query string ou serem inseridos pelo usuário
  const emailFromUrl = searchParams.get('email') || '';
  const codeFromUrl = searchParams.get('code') || '';
  
  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState(codeFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(!!codeFromUrl);
  const [checkingSession, setCheckingSession] = useState(!codeFromUrl);

  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setCheckingSession(false);
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !code) {
      toast({
        title: 'Dados incompletos',
        description: 'Email e código são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

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
      const { error } = await verifyResetCode(email, code, newPassword);

      if (error) {
        toast({
          title: 'Erro ao redefinir senha',
          description: error.message || 'Código inválido ou expirado.',
          variant: 'destructive',
        });
      } else {
        setIsSuccess(true);
        toast({
          title: 'Senha redefinida com sucesso!',
          description: 'Você será redirecionado para o login.',
        });
        setTimeout(() => {
          navigate('/auth');
        }, 2000);
      }
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Ocorreu um erro ao redefinir sua senha.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isValidSession && !codeFromUrl) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-6">
        <div className="w-full max-w-md">
          <div className="mb-6 sm:mb-8 text-center">
            <img 
              src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" 
              alt="Grupo Astrotur" 
              className="mx-auto h-16 sm:h-20 object-contain"
            />
            <h1 className="mt-3 sm:mt-4 text-xl sm:text-2xl font-bold text-foreground">Ticket TI</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">Sistema de Help Desk</p>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardHeader className="space-y-1 px-4 sm:px-6 py-3 sm:py-4">
              <CardTitle className="text-center text-lg sm:text-xl">Recuperar Senha</CardTitle>
              <CardDescription className="text-center text-xs sm:text-sm">
                Insira seu email e o código recebido
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6">
              <form onSubmit={(e) => {
                e.preventDefault();
                if (email && code) {
                  setIsValidSession(true);
                }
              }} className="space-y-3 sm:space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-xs sm:text-sm">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 text-sm"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-xs sm:text-sm">Código de Recuperação</Label>
                  <Input
                    id="code"
                    type="text"
                    placeholder="Insira o código recebido por email"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\\s+/g, ''))}
                    className="text-sm font-mono"
                    required
                  />
                  <p className="text-xs text-muted-foreground">Você recebeu um código por email. Insira-o aqui.</p>
                </div>
                <Button type="submit" className="w-full text-sm" disabled={!email || !code}>
                  Continuar
                </Button>
                <Button 
                  type="button"
                  variant="link"
                  className="w-full px-0 text-xs sm:text-sm text-muted-foreground"
                  onClick={() => navigate('/auth')}
                >
                  Voltar para Login
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-6">
        <Card className="w-full max-w-md border-border/50 shadow-lg">
          <CardHeader className="text-center px-4 sm:px-6 py-3 sm:py-4">
            <CheckCircle className="mx-auto h-10 sm:h-12 w-10 sm:w-12 text-green-500" />
            <CardTitle className="text-lg sm:text-xl">Senha Redefinida!</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Sua senha foi alterada com sucesso. Redirecionando...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-6">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 sm:mb-8 text-center">
          <img 
            src="/lovable-uploads/8bb8e15f-a27f-4dfe-b08a-7d5ce03cff09.png" 
            alt="Grupo Astrotur" 
            className="mx-auto h-16 sm:h-20 object-contain"
          />
          <h1 className="mt-3 sm:mt-4 text-xl sm:text-2xl font-bold text-foreground">Ticket TI</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Sistema de Help Desk</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="space-y-1 px-4 sm:px-6 py-3 sm:py-4">
            <CardTitle className="text-center text-lg sm:text-xl">Redefinir Senha</CardTitle>
            <CardDescription className="text-center text-xs sm:text-sm">
              Digite sua nova senha abaixo
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <form onSubmit={handleResetPassword} className="space-y-3 sm:space-y-4">
              {codeFromUrl && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-email" className="text-xs sm:text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10 text-sm bg-muted"
                        disabled
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-code" className="text-xs sm:text-sm">Código</Label>
                    <Input
                      id="confirm-code"
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="text-sm font-mono bg-muted"
                      disabled
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-xs sm:text-sm">Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-xs sm:text-sm">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="Digite novamente"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 text-sm"
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full text-sm" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Redefinir Senha
              </Button>
              <Button 
                type="button"
                variant="link"
                className="w-full px-0 text-xs sm:text-sm text-muted-foreground"
                onClick={() => navigate('/auth')}
              >
                Voltar para Login
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
