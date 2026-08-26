-- Enum para roles de usuário
CREATE TYPE public.app_role AS ENUM ('solicitante', 'agente_ti', 'agente_manutencao', 'admin');

-- Enum para status do ticket
CREATE TYPE public.ticket_status AS ENUM ('aberto', 'em_andamento', 'aguardando_resposta', 'resolvido', 'fechado');

-- Enum para prioridade do ticket
CREATE TYPE public.ticket_priority AS ENUM ('baixa', 'media', 'alta', 'critica');

-- Enum para tipo de interação
CREATE TYPE public.interaction_type AS ENUM ('texto', 'mudanca_status', 'anexo_extra');

-- Tabela de perfis de usuários
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  funcao TEXT,
  setor TEXT,
  foto_perfil TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de roles (separada por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'solicitante',
  UNIQUE (user_id, role)
);

-- Tabela de convites
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role app_role NOT NULL DEFAULT 'solicitante',
  token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de tickets
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo TEXT UNIQUE NOT NULL DEFAULT 'TKT-' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0'),
  solicitante_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agente_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  status ticket_status DEFAULT 'aberto',
  prioridade ticket_priority DEFAULT 'media',
  setor TEXT,
  anexos JSONB DEFAULT '{"imagens": [], "arquivos": [], "audio": null}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de interações (chat do ticket)
CREATE TABLE public.interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  autor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  mensagem TEXT,
  tipo interaction_type DEFAULT 'texto',
  anexos JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de feedbacks/avaliações
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL UNIQUE,
  avaliador_id UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  nota_satisfacao INTEGER CHECK (nota_satisfacao >= 1 AND nota_satisfacao <= 5),
  eficacia_solucao BOOLEAN,
  tempo_resposta TEXT,
  comentarios TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Function para verificar role (security definer)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function para obter role do usuário
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Agents and admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agente_ti') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for invitations
CREATE POLICY "Admins can manage invitations"
  ON public.invitations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view invitation by token"
  ON public.invitations FOR SELECT
  TO anon, authenticated
  USING (true);

-- RLS Policies for tickets
CREATE POLICY "Solicitantes can view their own tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (solicitante_id = auth.uid());

CREATE POLICY "Solicitantes can create tickets"
  ON public.tickets FOR INSERT
  TO authenticated
  WITH CHECK (solicitante_id = auth.uid());

CREATE POLICY "Agents and admins can view all tickets"
  ON public.tickets FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agente_ti') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Agents and admins can update tickets"
  ON public.tickets FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agente_ti') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for interactions
CREATE POLICY "Users can view interactions of their tickets"
  ON public.interactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets 
      WHERE tickets.id = interactions.ticket_id 
      AND (tickets.solicitante_id = auth.uid() OR tickets.agente_id = auth.uid())
    ) OR
    public.has_role(auth.uid(), 'agente_ti') OR
    public.has_role(auth.uid(), 'agente_manutencao') OR
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can create interactions on their tickets"
  ON public.interactions FOR INSERT
  TO authenticated
  WITH CHECK (
    autor_id = auth.uid() AND (
      EXISTS (
        SELECT 1 FROM public.tickets 
        WHERE tickets.id = interactions.ticket_id 
        AND (tickets.solicitante_id = auth.uid() OR tickets.agente_id = auth.uid())
      ) OR
      public.has_role(auth.uid(), 'agente_ti') OR 
      public.has_role(auth.uid(), 'admin')
    )
  );

-- RLS Policies for feedbacks
CREATE POLICY "Solicitantes can create feedback for their tickets"
  ON public.feedbacks FOR INSERT
  TO authenticated
  WITH CHECK (
    avaliador_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.tickets 
      WHERE tickets.id = feedbacks.ticket_id 
      AND tickets.solicitante_id = auth.uid()
      AND tickets.status = 'resolvido'
    )
  );

CREATE POLICY "Users can view their own feedbacks"
  ON public.feedbacks FOR SELECT
  TO authenticated
  USING (avaliador_id = auth.uid());

CREATE POLICY "Agents and admins can view all feedbacks"
  ON public.feedbacks FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'agente_ti') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'attachments');

CREATE POLICY "Anyone can view attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'attachments');

CREATE POLICY "Users can delete their own attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for tickets and interactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.interactions;
