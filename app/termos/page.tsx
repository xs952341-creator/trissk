// app/termos/page.tsx
// Termos de Uso gerados a partir de lib/legal.ts
// Para mudar qualquer cláusula, edite lib/legal.ts — não edite este arquivo.

import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata = {
  title: `Termos de Uso — ${LEGAL.EMPRESA.NOME_FANTASIA}`,
  description: `Termos de uso, responsabilidades fiscais e regras da plataforma ${LEGAL.EMPRESA.NOME_FANTASIA}.`,
};

export default function TermosPage() {
  const { EMPRESA, DATAS, NEGOCIOS, LGPD, PROIBICOES, MOTIVOS_BANIMENTO } = LEGAL;

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto mb-8">
        <Link href="/" className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors">← Voltar</Link>
      </div>
      <div className="max-w-3xl mx-auto prose prose-invert prose-emerald prose-h1:text-2xl prose-h1:font-bold prose-h1:text-zinc-50 prose-h2:text-lg prose-h2:font-semibold prose-h2:text-zinc-100 prose-h2:mt-10 prose-p:text-zinc-400 prose-p:text-sm prose-li:text-zinc-400 prose-li:text-sm prose-strong:text-zinc-200 prose-a:text-emerald-500">

        <h1>Termos de Uso e Responsabilidades — {EMPRESA.NOME_FANTASIA}</h1>
        <p><strong>Versão {DATAS.TERMOS_VERSAO} · Última atualização: {DATAS.TERMOS_ULTIMA_ATUALIZACAO}</strong></p>
        <p>{EMPRESA.RAZAO_SOCIAL} (CNPJ {EMPRESA.CNPJ}), com sede em {EMPRESA.SEDE}, doravante denominada "{EMPRESA.NOME_FANTASIA}".</p>

        <h2>1. Capacidade Civil e Maioridade</h2>
        <p>
          O uso da plataforma {EMPRESA.NOME_FANTASIA} é restrito a pessoas físicas com idade igual ou superior
          a 18 (dezoito) anos e a pessoas jurídicas regularmente constituídas. Ao aceitar este termo, o usuário
          declara possuir plena capacidade civil para contratar, vender e assumir obrigações financeiras. Contas
          de menores de idade ou sem representação legal serão sumariamente suspensas.
        </p>

        <h2>2. Objeto e Natureza Jurídica ("As Is")</h2>
        <p>
          O {EMPRESA.NOME_FANTASIA} opera como plataforma SaaS de intermediação tecnológica "no estado em que
          se encontra" (<em>As Is</em>). Não comercializa produtos próprios — fornece infraestrutura para o
          licenciamento de softwares de terceiros (Vendors).
        </p>
        <ul>
          <li><strong>Independência:</strong> {EMPRESA.NOME_FANTASIA} e usuários são partes independentes. Não se
          estabelece vínculo empregatício, parceria ou representação comercial.</li>
          <li><strong>Disponibilidade:</strong> Não garantimos operação ininterrupta. Não nos responsabilizamos por
          lucros cessantes decorrentes de instabilidades de infraestrutura (ex: AWS, Stripe). Falhas dos softwares
          comercializados são responsabilidade exclusiva do Vendor.</li>
        </ul>

        <h2>3. Fluxo Financeiro, Fiscalidade e Taxa da Plataforma</h2>
        <p>
          O {EMPRESA.NOME_FANTASIA} atua como mandatário de recebimento (intermediador via Stripe Connect). A
          responsabilidade tributária pela comercialização ao consumidor final é exclusiva do Vendor.
        </p>
        <ul>
          <li>A taxa da plataforma é de <strong>{NEGOCIOS.TAXA_PLATAFORMA_PCT}%</strong> sobre o valor bruto de cada transação.</li>
          <li>O repasse ao Vendor ocorre em ciclo <strong>{NEGOCIOS.REPASSE_CICLO}</strong> via Stripe Connect, sujeito a aprovação KYC.</li>
          <li>O Vendor é o único responsável pela emissão de Nota Fiscal ao consumidor pelo valor integral da compra.</li>
          <li>O {EMPRESA.NOME_FANTASIA} emitirá nota fiscal apenas sobre a taxa ({NEGOCIOS.TAXA_PLATAFORMA_PCT}%) cobrada do Vendor.</li>
          <li>Notas fiscais são emitidas em {NEGOCIOS.DIAS_D_MAIS_REPASSE} dias úteis após confirmação do pagamento.</li>
        </ul>

        <h2>4. Propriedade Intelectual</h2>
        <p>
          O Vendor concede ao {EMPRESA.NOME_FANTASIA} licença não exclusiva para exibir, promover e distribuir
          o software. O Vendor garante ser detentor dos direitos autorais ou possuir licença para revenda,
          isentando o {EMPRESA.NOME_FANTASIA} de qualquer processo por violação de propriedade intelectual.
        </p>

        <h2>5. Direitos do Consumidor e Chargebacks</h2>
        <ul>
          <li><strong>Arrependimento:</strong> Em conformidade com o Art. 49 do CDC, o Comprador tem <strong>{NEGOCIOS.DIAS_GARANTIA_REEMBOLSO} dias</strong> para
          solicitar reembolso incondicional após a compra.</li>
          <li><strong>Chargebacks:</strong> Em caso de contestação, os valores serão debitados do saldo do Vendor.
          O acesso do Comprador infrator será suspenso imediatamente e o e-mail bloqueado na plataforma.</li>
        </ul>

        <h2>6. Regras de Afiliados e Vedações</h2>
        <p>
          A atribuição de comissões segue a regra do <strong>Último Clique</strong> (<em>Last-Click</em>),
          com validade de <strong>{NEGOCIOS.DIAS_COOKIE_AFILIADO} dias</strong> via cookie rastreador.
          Em caso de reembolso ou chargeback, as comissões são automaticamente estornadas.
        </p>
        <p>São expressamente proibidas as seguintes condutas:</p>
        <ul>
          {PROIBICOES.map((p, i) => <li key={i}>{p}</li>)}
        </ul>

        <h2>7. Direito de Moderação e Banimento</h2>
        <p>
          O {EMPRESA.NOME_FANTASIA} reserva-se o direito de suspender ou banir permanentemente, sem aviso
          prévio, qualquer conta que incorra em:
        </p>
        <ul>
          {MOTIVOS_BANIMENTO.map((m, i) => <li key={i}>{m}</li>)}
        </ul>

        <h2>8. Proteção de Dados — LGPD (Lei nº 13.709/2018)</h2>
        <p>
          Processamos dados pessoais com base nas seguintes hipóteses legais:
        </p>
        <ul>
          {LGPD.BASES_LEGAIS.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
        <p><strong>Dados coletados:</strong></p>
        <ul>
          {LGPD.DADOS_COLETADOS.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
        <p>
          Dados fiscais são retidos pelo prazo legal de <strong>{NEGOCIOS.DIAS_RETENCAO_FISCAL / 365} anos</strong>.
          Solicitações de exclusão são atendidas em {LGPD.PRAZO_EXCLUSAO}. Para mais detalhes, consulte
          nossa <Link href="/privacidade">Política de Privacidade</Link> ou envie e-mail para{" "}
          <a href={`mailto:${LGPD.CONTATO_DPO}`}>{LGPD.CONTATO_DPO}</a>.
        </p>

        <h2>9. Cookies</h2>
        <p>Utilizamos os seguintes tipos de cookies:</p>
        <ul>
          {LEGAL.COOKIES.TIPOS.map((c, i) => (
            <li key={i}><strong>{c.nome}</strong> ({c.duracao}): {c.finalidade}</li>
          ))}
        </ul>
        <p>{LEGAL.COOKIES.NAO_USA}</p>

        <h2>10. Alterações e Foro de Eleição</h2>
        <p>
          Estes termos podem ser atualizados. A continuidade do uso constitui aceitação tácita.
          Para dirimir controvérsias, as partes elegem o <strong>Foro da {EMPRESA.FORO}</strong>,
          com renúncia a qualquer outro. Contato jurídico: <a href={`mailto:${EMPRESA.EMAIL_JURIDICO}`}>{EMPRESA.EMAIL_JURIDICO}</a>.
        </p>

        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-zinc-700 text-xs text-center">
            © {new Date().getFullYear()} {EMPRESA.NOME_FANTASIA} ({EMPRESA.RAZAO_SOCIAL}) · Todos os direitos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
