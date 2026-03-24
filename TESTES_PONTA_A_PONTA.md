# Plano de Testes Ponta a Ponta - Playbook Hub

## Pré-requisitos

- Ambiente de staging ou produção configurado
- Stripe em modo teste
- Pagar.me em modo sandbox (se aplicável)
- Email de teste configurado (Mailpit/Mailhog ou similar)
- Usuários de teste criados (buyer, vendor, admin)

---

## 1. Compra Única (Lifetime)

### 1.1 Checkout com Stripe
- [ ] Criar produto com preço lifetime no dashboard vendor
- [ ] Acessar página pública do produto
- [ ] Clicar em "Comprar agora"
- [ ] Completar checkout Stripe com cartão de teste `4242 4242 4242 4242`
- [ ] Verificar:
  - [ ] Redirect para página de sucesso
  - [ ] Email de confirmação recebido
  - [ ] Entitlement criado no Supabase
  - [ ] Order criada com status "paid"
  - [ ] Ledger atualizado corretamente
  - [ ] Notificação enviada para vendor

### 1.2 Checkout com Pagar.me (Parcelado)
- [ ] Criar produto com preço lifetime
- [ ] Acessar checkout e selecionar parcelamento
- [ ] Completar pagamento
- [ ] Verificar webhook Pagar.me processado
- [ ] Confirmar provisionamento de acesso

---

## 2. Assinatura

### 2.1 Criação de Assinatura
- [ ] Criar tier com billing mensal
- [ ] Completar checkout de assinatura
- [ ] Verificar:
  - [ ] Subscription criada no Stripe
  - [ ] Subscription criada no Supabase
  - [ ] Entitlement ativo
  - [ ] Invoice paga

### 2.2 Renovação
- [ ] Aguardar/avancar para data de renovação
- [ ] Verificar webhook `invoice.paid` processado
- [ ] Confirmar ledger atualizado
- [ ] Verificar email de renovação enviado

### 2.3 Upgrade/Downgrade de Plano
- [ ] Usar rota `/api/stripe/change-plan`
- [ ] Verificar proration aplicada
- [ ] Confirmar mudança de tier no Supabase
- [ ] Validar novo valor na próxima invoice

---

## 3. Cancelamento

### 3.1 Cancelamento ao Fim do Período
- [ ] Chamar `/api/stripe/cancel-subscription` com `cancel_at_period_end: true`
- [ ] Verificar flag `cancel_at_period_end` no Stripe
- [ ] Confirmar acesso mantido até fim do período
- [ ] Verificar email de confirmação

### 3.2 Cancelamento Imediato
- [ ] Chamar `/api/stripe/cancel-subscription` com `cancel_at_period_end: false`
- [ ] Verificar assinatura cancelada no Stripe
- [ ] Confirmar entitlements revogados
- [ ] Validar email de cancelamento enviado

---

## 4. Reembolso (Refund)

### 4.1 Refund Total
- [ ] Criar assinatura paga
- [ ] Chamar `/api/refund` dentro da janela de 7 dias
- [ ] Verificar:
  - [ ] Refund processado no Stripe
  - [ ] Subscription marcada como "refunded"
  - [ ] Entitlements revogados
  - [ ] Email de reembolso enviado
  - [ ] Ledger atualizado com negativo

### 4.2 Tentativa de Refund Duplicado
- [ ] Tentar refund na mesma subscription
- [ ] Verificar erro 409 (conflict)

---

## 5. Payout Vendor

### 5.1 Payout Automático
- [ ] Realizar venda com vendor Connect
- [ ] Verificar `payout.paid` webhook
- [ ] Confirmar registro em payouts
- [ ] Validar email de notificação

### 5.2 Payout Falho
- [ ] Simular falha de payout
- [ ] Verificar webhook `payout.failed`
- [ ] Confirmar notificação de falha

---

## 6. Payout Afiliado

### 6.1 Comissão de Afiliado
- [ ] Criar link de afiliado
- [ ] Realizar compra com código afiliado
- [ ] Verificar comissão criada
- [ ] Confirmar payout agendado/aprovado

---

## 7. Webhooks e Idempotência

### 7.1 Retry de Webhook Stripe
- [ ] Forçar falha no processamento (erro 500)
- [ ] Verificar rollback de idempotência
- [ ] Confirmar reprocessamento no retry
- [ ] Validar que não duplicou dados

### 7.2 Webhook Pagar.me Duplicado
- [ ] Enviar mesmo evento 2x
- [ ] Verificar que foi ignorado (duplicate: true)

---

## 8. Acesso Admin/Vendor

### 8.1 Dashboard Vendor
- [ ] Login como vendor
- [ ] Visualizar produtos
- [ ] Ver vendas e analytics
- [ ] Configurar webhooks

### 8.2 Dashboard Admin
- [ ] Login como admin
- [ ] Visualizar todos os vendors
- [ ] Ver relatórios de revenue
- [ ] Gerenciar produtos

---

## 9. Edge Cases

### 9.1 Cartão com 3DS
- [ ] Usar cartão `4000 0027 6000 3184` (requer 3DS)
- [ ] Verificar fluxo de autenticação
- [ ] Confirmar pagamento após 3DS

### 9.2 Cartão Recusado
- [ ] Usar cartão `4000 0000 0000 9995` (recusado)
- [ ] Verificar erro apropriado
- [ ] Confirmar que não criou entitlements

### 9.3 Blacklist
- [ ] Adicionar email à blacklist
- [ ] Tentar checkout com esse email
- [ ] Verificar bloqueio

---

## 10. One-Click Upsell

### 10.1 Upsell Bem-sucedido
- [ ] Ter subscription ativa com método de pagamento salvo
- [ ] Chamar `/api/stripe/one-click-upsell`
- [ ] Verificar novo produto provisionado
- [ ] Confirmar cobrança off-session

### 10.2 Upsell com 3DS
- [ ] Verificar retorno de `requiresAction: true`
- [ ] Confirmar client_secret fornecido

---

## Checklist Final

- [ ] Type-check passa: `npm run type-check`
- [ ] Build passa: `npm run build`
- [ ] Lint passa: `npm run lint`
- [ ] Sem erros no console
- [ ] Todos os emails sendo enviados
- [ ] Webhooks processados corretamente
- [ ] Ledger consistente
- [ ] Sem duplicatas em orders/subscriptions

---

## Comandos para Validação

```bash
# TypeScript
npm run type-check

# Build
npm run build

# Lint
npm run lint

# Testes (se houver)
npm test
```

---

## Anotações de Teste

Data: ___________
Testador: ___________
Ambiente: ___________

### Issues Encontradas
1. 
2. 
3. 

### Ajustes Necessários
1. 
2. 
3. 

### Aprovado/Rejeitado
- [ ] Aprovado para produção
- [ ] Rejeitado - necessita correções
