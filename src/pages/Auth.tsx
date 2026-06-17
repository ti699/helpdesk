import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User, Phone, Building, Briefcase } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
});

const signupSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  telefone: z.string().optional(),
  funcao: z.string().optional(),
  setor: z.string().optional(),
  num_anydesk: z.string().optional(),
});

const SETORES = [
  'Comercial/Fretamento',
  'Comercial/Turismo',
  'Diretoria',
  'DP',
  'Financeiro',
  'Jurídico',
  'Manutenção',
  'Marketing',
  'Operações',
  'Portaria',
  'Posto',
  'Qualidade',
  'Recursos Humanos',
  'Segurança do Trabalho',
  'TI',
  'Tráfego',
  'Transastro',
  'Outro',
];

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  
  const [activeTab, setActiveTab] = useState(inviteToken ? 'signup' : 'login');
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Signup form
  const [signupNome, setSignupNome] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupTelefone, setSignupTelefone] = useState('');
  const [signupFuncao, setSignupFuncao] = useState('');
  const [signupSetor, setSignupSetor] = useState('');
  const [signupNumAnyDesk, setSignupNumAnyDesk] = useState('');

  // Removido signInWithGoogle daqui
  const { signIn, signUp, resetPassword, user, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (user && role) {
      const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
      if (from?.pathname && from.pathname !== '/reset-password') {
        navigate(`${from.pathname}${from.search || ''}`, { replace: true });
      } else if (role === 'solicitante') {
        navigate('/', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, role, navigate, location.state]);

  const isNetworkError = (error: Error | { message: string }) => {
    const msg = error.message?.toLowerCase() || '';
    return msg === 'failed to fetch' || msg.includes('networkerror') || msg.includes('network');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
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
      const { error } = await signIn(loginEmail, loginPassword);

      if (error) {
        toast({
          title: isNetworkError(error) ? 'Erro de conexão' : 'Erro ao entrar',
          description: isNetworkError(error)
            ? 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.'
            : error.message === 'Invalid login credentials' 
              ? 'Email ou senha incorretos' 
              : error.message,
          variant: 'destructive',
        });
      }
    } catch (err) {
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      signupSchema.parse({
        nome: signupNome,
        email: signupEmail,
        password: signupPassword,
        telefone: signupTelefone,
        funcao: signupFuncao,
        setor: signupSetor,
        num_anydesk: signupNumAnyDesk,
      });
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
      const { error } = await signUp(
        signupEmail,
        signupPassword,
        {
          nome: signupNome,
          telefone: signupTelefone || null,
          funcao: signupFuncao || null,
          setor: signupSetor || null,
          num_anydesk: signupNumAnyDesk || null,
        },
        inviteToken || undefined
      );

      if (error) {
        toast({
          title: isNetworkError(error) ? 'Erro de conexão' : 'Erro ao cadastrar',
          description: isNetworkError(error)
            ? 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.'
            : error.message.includes('already registered')
              ? 'Este email já está cadastrado'
              : error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Cadastro realizado!',
          description: 'Você já pode acessar o sistema.',
        });
      }
    } catch (err) {
      toast({
        title: 'Erro de conexão',
        description: 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      toast({
        title: 'Email obrigatório',
        description: 'Digite seu email para recuperar a senha.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await resetPassword(resetEmail);
      if (error) {
        toast({
          title: 'Erro',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Email enviado!',
          description: 'Abra o link recebido para definir uma nova senha.',
        });
        setShowForgotPassword(false);
        setResetEmail('');
      }
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar o email de recuperação.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted px-4 py-6">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
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
            <CardTitle className="text-center text-lg sm:text-xl">
              {inviteToken ? 'Complete seu Cadastro' : 'Acesso ao Sistema'}
            </CardTitle>
            <CardDescription className="text-center text-xs sm:text-sm">
              {inviteToken 
                ? 'Você foi convidado para acessar o sistema'
                : 'Entre com suas credenciais para continuar'
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-4 sm:mb-6">
                <TabsTrigger value="login" className="text-xs sm:text-sm">Entrar</TabsTrigger>
                <TabsTrigger value="signup" className="text-xs sm:text-sm">Cadastrar</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="space-y-3 sm:space-y-4">
                <form onSubmit={handleLogin} className="space-y-3 sm:space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-xs sm:text-sm">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="pl-10 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-xs sm:text-sm">Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="login-password"
                        type="password"
                        placeholder="••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full text-sm" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Entrar
                  </Button>

                  <Button
                    type="button"
                    variant="link"
                    className="w-full px-0 text-xs sm:text-sm text-muted-foreground"
                    onClick={() => setShowForgotPassword(!showForgotPassword)}
                  >
                    Esqueci minha senha
                  </Button>

                  {showForgotPassword && (
                    <div className="space-y-2 sm:space-y-3 rounded-lg border border-border bg-muted/50 p-3 sm:p-4">
                      <Label htmlFor="reset-email" className="text-xs sm:text-sm">Digite seu email para recuperar a senha:</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="reset-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          className="pl-10 text-sm"
                        />
                      </div>
                      <Button 
                        type="button"
                        className="w-full text-sm" 
                        onClick={handleForgotPassword}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Enviar link de recuperação
                      </Button>
                    </div>
                  )}
                </form>
              </TabsContent>

              <TabsContent value="signup" className="space-y-3 sm:space-y-4 max-h-[70vh] overflow-y-auto">
                <form onSubmit={handleSignup} className="space-y-3 sm:space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-nome" className="text-xs sm:text-sm">Nome Completo *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-nome"
                        type="text"
                        placeholder="Seu nome completo"
                        value={signupNome}
                        onChange={(e) => setSignupNome(e.target.value)}
                        className="pl-10 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-xs sm:text-sm">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-xs sm:text-sm">Senha *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-password"
                        type="password"
                        placeholder="Mínimo 6 caracteres"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-telefone" className="text-xs sm:text-sm">Telefone</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-telefone"
                        type="tel"
                        placeholder="(00) 00000-0000"
                        value={signupTelefone}
                        onChange={(e) => setSignupTelefone(e.target.value)}
                        className="pl-10 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-funcao" className="text-xs sm:text-sm">Função/Cargo</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-funcao"
                        type="text"
                        placeholder="Sua função na empresa"
                        value={signupFuncao}
                        onChange={(e) => setSignupFuncao(e.target.value)}
                        className="pl-10 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-setor" className="text-xs sm:text-sm">Setor</Label>
                    <Select value={signupSetor} onValueChange={setSignupSetor}>
                      <SelectTrigger className="w-full text-sm">
                        <Building className="mr-2 h-4 w-4 text-muted-foreground" />
                        <SelectValue placeholder="Selecione seu setor" />
                      </SelectTrigger>
                      <SelectContent>
                        {SETORES.map((setor) => (
                          <SelectItem key={setor} value={setor} className="text-sm">
                            {setor}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-anydesk" className="text-xs sm:text-sm">Número AnyDesk</Label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-anydesk"
                        type="text"
                        placeholder="Ex: 123 456 789"
                        value={signupNumAnyDesk}
                        onChange={(e) => setSignupNumAnyDesk(e.target.value)}
                        className="pl-10 text-sm"
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full text-sm" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Cadastrar
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
