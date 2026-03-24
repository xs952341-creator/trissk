-- 004_seed_data.sql
-- Dados iniciais para demonstração do sistema

-- Usuário admin padrão
INSERT INTO profiles (id, email, full_name, role) VALUES 
('00000000-0000-0000-0000-000000000001', 'admin@fire.com', 'Admin Fire', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Vendor de exemplo
INSERT INTO profiles (id, email, full_name, role) VALUES 
('00000000-0000-0000-0000-000000000002', 'vendor@fire.com', 'Vendor Demo', 'vendor')
ON CONFLICT (email) DO NOTHING;

-- Buyer de exemplo
INSERT INTO profiles (id, email, full_name, role) VALUES 
('00000000-0000-0000-0000-000000000003', 'buyer@fire.com', 'Buyer Demo', 'user')
ON CONFLICT (email) DO NOTHING;

-- Afiliado de exemplo
INSERT INTO profiles (id, email, full_name, role) VALUES 
('00000000-0000-0000-0000-000000000004', 'affiliate@fire.com', 'Affiliate Demo', 'affiliate')
ON CONFLICT (email) DO NOTHING;

-- Produtos de exemplo
INSERT INTO saas_products (id, name, slug, description, price_monthly, price_lifetime, vendor_id) VALUES 
('10000000-0000-0000-0000-000000000001', 'Fire SaaS Pro', 'fire-saas-pro', 'Plano profissional completo com todos os recursos', 97.00, 997.00, '00000000-0000-0000-0000-000000000002'),
('10000000-0000-0000-0000-000000000002', 'Fire Analytics', 'fire-analytics', 'Analytics avançado para marketplace', 47.00, 497.00, '00000000-0000-0000-0000-000000000002')
ON CONFLICT (slug) DO NOTHING;

-- Links de afiliado de exemplo
INSERT INTO affiliate_links (id, affiliate_id, product_id, code, commission_percent) VALUES 
('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'FIRE10', 10.00),
('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'FIRE15', 15.00)
ON CONFLICT (code) DO NOTHING;

-- Order de exemplo (paga)
INSERT INTO orders (id, user_id, product_id, stripe_session_id, amount, status) VALUES 
('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'cs_test_a1b2c3d4e5f6', 97.00, 'paid')
ON CONFLICT (stripe_session_id) DO NOTHING;

-- Entitlement de exemplo
INSERT INTO entitlements (id, user_id, product_id, order_id, status, expires_at) VALUES 
('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'active', NOW() + INTERVAL '1 month')
ON CONFLICT (user_id, product_id) DO NOTHING;

-- Venda de afiliado de exemplo
INSERT INTO affiliate_sales (id, affiliate_id, product_id, order_id, commission_amount, sale_amount, status) VALUES 
('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 9.70, 97.00, 'paid')
ON CONFLICT DO NOTHING;

-- Entrada no ledger de exemplo
INSERT INTO financial_ledger (id, user_id, order_id, amount, type, description) VALUES 
('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 97.00, 'order_payment', 'Pagamento order 30000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 9.70, 'affiliate_commission', 'Comissão afiliado 50000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Log estruturado de exemplo
INSERT INTO structured_logs (id, level, message, context, trace_id) VALUES 
('70000000-0000-0000-0000-000000000001', 'info', 'Sistema inicializado', '{"version": "1.0.0", "environment": "development"}', 'trace-init-001'),
('70000000-0000-0000-0000-000000000002', 'info', 'Seed data inserida', '{"tables": ["profiles", "products", "orders"]}', 'trace-seed-001')
ON CONFLICT DO NOTHING;
