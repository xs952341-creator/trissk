-- 003_billing_fiscal.sql
-- Tabelas para billing, pagamentos e fiscal

-- Tabela de saques/payouts
CREATE TABLE IF NOT EXISTS vendor_payouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  stripe_payout_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de reembolsos
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT,
  stripe_refund_id TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  stripe_event_id TEXT UNIQUE,
  processed BOOLEAN DEFAULT FALSE,
  data JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de reconciliação
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trace_id TEXT UNIQUE NOT NULL,
  orders_checked INTEGER DEFAULT 0,
  discrepancies INTEGER DEFAULT 0,
  affiliate_sales_checked INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de notas fiscais
CREATE TABLE IF NOT EXISTS fiscal_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  number TEXT UNIQUE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'error')),
  xml_url TEXT,
  pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  issued_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de domínios customizados de vendors
CREATE TABLE IF NOT EXISTS vendor_custom_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT FALSE,
  dns_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vendor_payouts_vendor ON vendor_payouts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_payouts_status ON vendor_payouts(status);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_trace ON reconciliation_runs(trace_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_notes_order ON fiscal_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_custom_domains_vendor ON vendor_custom_domains(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_custom_domains_domain ON vendor_custom_domains(domain);

-- RLS para novas tabelas
ALTER TABLE vendor_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_custom_domains ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
-- Vendors podem ver seus payouts
CREATE POLICY "Vendors can view own payouts" ON vendor_payouts
  FOR SELECT USING (auth.uid() = vendor_id);

-- Usuários podem ver seus reembolsos
CREATE POLICY "Users can view own refunds" ON refunds
  FOR SELECT USING (auth.uid() = user_id);

-- Apenas admin pode ver webhook events
CREATE POLICY "Admin can view webhook events" ON webhook_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Apenas admin pode ver reconciliação
CREATE POLICY "Admin can view reconciliation runs" ON reconciliation_runs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Vendors podem ver suas notas fiscais
CREATE POLICY "Vendors can view own fiscal notes" ON fiscal_notes
  FOR SELECT USING (auth.uid() = vendor_id);

-- Vendors podem gerenciar seus domínios
CREATE POLICY "Vendors can manage own domains" ON vendor_custom_domains
  FOR ALL USING (auth.uid() = vendor_id);
