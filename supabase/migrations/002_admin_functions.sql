-- 002_admin_functions.sql
-- Funções administrativas e RPCs para o sistema

-- RPC para reconciliação de orders
CREATE OR REPLACE FUNCTION reconcile_orders(p_since TIMESTAMP WITH TIME ZONE)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}';
  v_orders_checked INTEGER := 0;
  v_discrepancies INTEGER := 0;
  v_order RECORD;
BEGIN
  -- Verifica orders pagas nos últimos 25h
  FOR v_order IN 
    SELECT id, amount, user_id, created_at 
    FROM orders 
    WHERE status = 'paid' 
    AND created_at >= p_since
  LOOP
    v_orders_checked := v_orders_checked + 1;
    
    -- Verifica se existe entrada no ledger
    IF NOT EXISTS (
      SELECT 1 FROM financial_ledger 
      WHERE order_id = v_order.id 
      AND type = 'order_payment'
    ) THEN
      -- Insere entrada no ledger
      INSERT INTO financial_ledger (
        user_id, order_id, amount, type, 
        description, created_at
      ) VALUES (
        v_order.user_id, v_order.id, v_order.amount, 
        'order_payment', 
        'Pagamento order ' || v_order.id,
        v_order.created_at
      );
      v_discrepancies := v_discrepancies + 1;
    END IF;
  END LOOP;
  
  v_result := jsonb_build_object(
    'orders_checked', v_orders_checked,
    'discrepancies', v_discrepancies
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- RPC para calcular saldo de usuário
CREATE OR REPLACE FUNCTION calculate_user_balance(p_user_id UUID)
RETURNS DECIMAL(10,2) AS $$
DECLARE
  v_balance DECIMAL(10,2) := 0;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM financial_ledger 
  WHERE user_id = p_user_id;
  
  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- RPC para estatísticas de vendor
CREATE OR REPLACE FUNCTION get_vendor_stats(p_vendor_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}';
  v_total_products INTEGER := 0;
  v_total_orders INTEGER := 0;
  v_total_revenue DECIMAL(10,2) := 0;
BEGIN
  -- Conta produtos ativos
  SELECT COUNT(*) INTO v_total_products
  FROM saas_products 
  WHERE vendor_id = p_vendor_id AND is_active = true;
  
  -- Conta pedidos pagos
  SELECT COUNT(*) INTO v_total_orders
  FROM orders o
  JOIN saas_products p ON o.product_id = p.id
  WHERE p.vendor_id = p_vendor_id AND o.status = 'paid';
  
  -- Soma receita
  SELECT COALESCE(SUM(o.amount), 0) INTO v_total_revenue
  FROM orders o
  JOIN saas_products p ON o.product_id = p.id
  WHERE p.vendor_id = p_vendor_id AND o.status = 'paid';
  
  v_result := jsonb_build_object(
    'total_products', v_total_products,
    'total_orders', v_total_orders,
    'total_revenue', v_total_revenue
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- RPC para estatísticas de afiliado
CREATE OR REPLACE FUNCTION get_affiliate_stats(p_affiliate_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB := '{}';
  v_total_sales INTEGER := 0;
  v_total_commission DECIMAL(10,2) := 0;
  v_pending_commission DECIMAL(10,2) := 0;
BEGIN
  -- Conta vendas pagas
  SELECT COUNT(*) INTO v_total_sales
  FROM affiliate_sales 
  WHERE affiliate_id = p_affiliate_id AND status = 'paid';
  
  -- Soma comissões pagas
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_total_commission
  FROM affiliate_sales 
  WHERE affiliate_id = p_affiliate_id AND status = 'paid';
  
  -- Soma comissões pendentes
  SELECT COALESCE(SUM(commission_amount), 0) INTO v_pending_commission
  FROM affiliate_sales 
  WHERE affiliate_id = p_affiliate_id AND status = 'pending';
  
  v_result := jsonb_build_object(
    'total_sales', v_total_sales,
    'total_commission', v_total_commission,
    'pending_commission', v_pending_commission
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger nas tabelas principais
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON profiles 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saas_products_updated_at 
  BEFORE UPDATE ON saas_products 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at 
  BEFORE UPDATE ON orders 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entitlements_updated_at 
  BEFORE UPDATE ON entitlements 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
