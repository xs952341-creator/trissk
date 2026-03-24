# 🚀 Fire - Marketplace & SaaS Platform

Plataforma completa de marketplace e SaaS construída com Next.js 14, React 18, TypeScript, Supabase e Stripe.

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração](#configuração)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Módulos Principais](#módulos-principais)
- [Deploy](#deploy)
- [Contribuição](#contribuição)

## 🎯 Visão Geral

O Fire é uma plataforma robusta de marketplace e SaaS que inclui:

- **Marketplace Multi-vendor**: Vendedores podem cadastrar e vender produtos
- **SaaS Management**: Assinaturas recorrentes e gestão de acessos
- **Sistema de Afiliados**: Programa de afiliados multi-level
- **Pagamentos Integrados**: Stripe e Pagar.me
- **Gestão Fiscal**: Emissão de notas fiscais automatizada
- **Analytics Dashboard**: Métricas e relatórios em tempo real
- **White-label**: Domínios customizados para vendedores

## 🛠 Tecnologias

- **Frontend**: Next.js 14, React 18, TypeScript
- **Backend**: Next.js API Routes, Supabase
- **Database**: PostgreSQL (via Supabase)
- **Pagamentos**: Stripe, Pagar.me
- **Autenticação**: Supabase Auth
- **Estilo**: TailwindCSS
- **Estado**: React Hooks, Zustand
- **Webhooks**: Stripe Webhooks, Pagar.me Webhooks
- **Cache**: Upstash Redis
- **Monitoramento**: Sentry

## 📋 Pré-requisitos

- Node.js 18+ 
- npm ou yarn
- Conta Supabase
- Conta Stripe
- Conta Pagar.me (opcional, para pagamentos BR)

## 🚀 Instalação

1. **Clone o repositório**
```bash
git clone <repository-url>
cd playbook-hub
```

2. **Instale as dependências**
```bash
npm install
# ou
yarn install
```

3. **Configure as variáveis de ambiente**
```bash
cp .env.example .env.local
```

4. **Preencha as variáveis obrigatórias** (veja [Configuração](#configuração))

## ⚙️ Configuração

### 1. Supabase

1. Crie um novo projeto no [Supabase Dashboard](https://supabase.com/dashboard)
2. Copie as credenciais para `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Execute as migrations (se disponíveis em `supabase/migrations/`)

### 2. Stripe

1. Crie uma conta no [Stripe Dashboard](https://dashboard.stripe.com/)
2. Obtenha as chaves:
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`
3. Configure webhooks para receber eventos do Stripe

### 3. Variáveis Obrigatórias

Mínimo necessário para rodar localmente:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
```

## 🏗 Estrutura do Projeto

```
fire/
├── app/                    # App Router (Next.js 13+)
│   ├── (dashboards)/      # Dashboard groups
│   ├── admin/             # Admin panel
│   ├── affiliate/         # Affiliate area
│   ├── api/               # API routes
│   ├── buyer/             # Buyer dashboard
│   ├── vendor/            # Vendor dashboard
│   └── ...
├── components/             # Reusable components
├── lib/                   # Utilities and configs
├── public/                # Static assets
├── supabase/              # Database migrations
```

## 🎯 Módulos Principais

### 🛒 Marketplace
- Cadastro de produtos
- Gestão de estoque
- Checkout integrado
- Reviews e avaliações

### 💳 Pagamentos
- Stripe Checkout
- Pagar.me (Brasil)
- Split payments
- Reembolsos automáticos

### 👥 Afiliados
- Programa multi-level (L1/L2/L3)
- Links de afiliado
- Comissões automáticas
- Dashboard de vendas

### 🏢 Vendor Dashboard
- Gestão de produtos
- Analytics e relatórios
- Configuração de domínio
- Saques e payout

### 📊 Admin Panel
- Gestão de usuários
- Relatórios financeiros
- Configurações globais
- Suporte e tickets

### 🧾 Fiscal
- Emissão de NF-e
- Relatórios contábeis
- Gestão de impostos
- Integração eNotas

## 🚀 Deploy

### Vercel (Recomendado)

1. Conecte seu repositório ao Vercel
2. Configure as environment variables
3. Deploy automático

### Manual

```bash
# Build para produção
npm run build

# Inicie o servidor
npm start
```

## 🧪 Testes

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Build test
npm run build
```

## 📝 Desenvolvimento

```bash
# Iniciar servidor de desenvolvimento
npm run dev

# Acessar em http://localhost:3000
```

## 🔧 Configurações Avançadas

### Webhooks

Configure os seguintes endpoints no seu provedor de pagamentos:
- Stripe: `/api/webhooks/stripe`
- Pagar.me: `/api/webhooks/pagarme`

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -am 'Add new feature'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

## 🆘 Suporte

- 📧 Email: suporte@seudominio.com
- 📖 Documentação interna: em preparação

## 🎯 Roadmap

- [ ] Mobile app (React Native)
- [ ] API REST completa
- [ ] Sistema de tickets avançado
- [ ] Integração com mais gateways
- [ ] Machine Learning para recomendações

---

**⭐ Se este projeto ajudou você, deixe uma estrela!**
