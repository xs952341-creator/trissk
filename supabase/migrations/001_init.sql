-- 001_init.sql
-- Schema inicial do banco de dados Fire Marketplace
-- Cria tabelas fundamentais para o funcionamento do sistema

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'vendor', 'admin', 'affiliate')),
  stripe_connect_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de produtos (SaaS e marketplace)
CREATE TABLE IF NOT EXISTS saas_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  price_monthly DECIMAL(10,2),
  price_lifetime DECIMAL(10,2),
  currency TEXT DEFAULT 'BRL',
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de pedidos/orders
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES saas_products(id) ON DELETE CASCADE,
  stripe_session_id TEXT UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'BRL',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de entitlements/acessos
CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES saas_products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  instance_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Tabela de afiliados
CREATE TABLE IF NOT EXISTS affiliate_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES saas_products(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,
  commission_percent DECIMAL(5,2) DEFAULT 30.00,
  commission_fixed DECIMAL(10,2),
  commission_type_v2 TEXT DEFAULT 'percentage' CHECK (commission_type_v2 IN ('percentage', 'fixed')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de vendas de afiliados
CREATE TABLE IF NOT EXISTS affiliate_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  affiliate_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  upline_affiliate_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  product_id UUID REFERENCES saas_products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  commission_amount DECIMAL(10,2),
  upline_commission_amount DECIMAL(10,2) DEFAULT 0,
  sale_amount DECIMAL(10,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'canceled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela financeira (ledger)
CREATE TABLE IF NOT EXISTS financial_ledger (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  affiliate_sale_id UUID REFERENCES affiliate_sales(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('order_payment', 'affiliate_commission', 'payout', 'refund', 'fee')),
  description TEXT,
  currency TEXT DEFAULT 'BRL',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de logs estruturados
CREATE TABLE IF NOT EXISTS structured_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message TEXT NOT NULL,
  context JSONB,
  trace_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_saas_products_vendor ON saas_products(vendor_id);
CREATE INDEX IF NOT EXISTS idx_saas_products_slug ON saas_products(slug);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_entitlements_user ON entitlements(user_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_product ON entitlements(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_affiliate ON affiliate_links(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_sales_affiliate ON affiliate_sales(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_user ON financial_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_structured_logs_level ON structured_logs(level);
CREATE INDEX IF NOT EXISTS idx_structured_logs_created ON structured_logs(created_at);

-- RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_ledger ENABLE ROW LEVEL SECURITY;

-- Políticas básicas de RLS
-- Usuários podem ver seu próprio perfil
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Usuários podem atualizar seu próprio perfil
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Todos podem ver produtos ativos
CREATE POLICY "Anyone can view active products" ON saas_products
  FOR SELECT USING (is_active = true);

-- Vendors podem gerenciar seus produtos
CREATE POLICY "Vendors can manage their products" ON saas_products
  FOR ALL USING (auth.uid() = vendor_id);

-- Usuários podem ver seus próprios pedidos
CREATE POLICY "Users can view own orders" ON orders
  FOR SELECT USING (auth.uid() = user_id);

-- Usuários podem ver seus entitlements
CREATE POLICY "Users can view own entitlements" ON entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- Todos podem ver links de afiliado ativos
CREATE POLICY "Anyone can view active affiliate links" ON affiliate_links
  FOR SELECT USING (is_active = true);

-- Afiliados podem ver suas vendas
CREATE POLICY "Affiliates can view own sales" ON affiliate_sales
  FOR SELECT USING (auth.uid() = affiliate_id);
