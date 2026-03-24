// app/privacidade/page.tsx
// Política de Privacidade (LGPD) — gerada a partir de lib/legal.ts
// Para atualizar: edite lib/legal.ts e reimplante. Não edite este arquivo.

import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata = {
  title: `Política de Privacidade — ${LEGAL.EMPRESA.NOME_FANTASIA}`,
  description: `Como o ${LEGAL.EMPRESA.NOME_FANTASIA} coleta, usa e protege seus dados pessoais.`,
};

export default function PrivacidadePage() {
  const { EMPRESA, DATAS, NEGOCIOS, LGPD } = LEGAL;

  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto mb-8 flex items-center gap-4">
        <Link href="/" className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors">← Voltar</Link>
        <span className="text-zinc-800 text-xs">·</span>
        <Link href="/termos" className="text-zinc-600 text-sm hover:text-zinc-400 transition-colors">Termos de Uso</Link>
      </div>

      <div className="max-w-3xl mx-auto prose prose-invert prose-emerald prose-h1:text-2xl prose-h1:font-bold prose-h1:text-zinc-50 prose-h2:text-lg prose-h2:font-semibold prose-h2:text-zinc-100 prose-h2:mt-10 prose-p:text-zinc-400 prose-p:text-sm prose-li:text-zinc-400 prose-li:text-sm prose-strong:text-zinc-200 prose-a:text-emerald-500">

        <h1>Política de Privacidade — {EMPRESA.NOME_FANTASIA}</h1>
        <p>
          <strong>Versão {DATAS.PRIVACIDADE_VERSAO} · Última atualização: {DATAS.PRIVACIDADE_ULTIMA_ATUALIZACAO}</strong>
        </p>
        <p>
          Esta Política descreve como a <strong>{EMPRESA.RAZAO_SOCIAL}</strong> (CNPJ {EMPRESA.CNPJ}),
          operadora da plataforma <strong>{EMPRESA.NOME_FANTASIA}</strong>, trata seus dados pessoais
          em conformidade com a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD)</strong>.
        </p>

        <h2>1. Dados que Coletamos</h2>
        <p>Coletamos apenas os dados estritamente necessários para a operação da plataforma:</p>
        <ul>
          {LGPD.DADOS_COLETADOS.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
        <p>
          <strong>Não vendemos seus dados.</strong> Nunca comercializamos informações pessoais com terceiros
          para fins de publicidade ou marketing.
        </p>

        <h2>2. Bases Legais para o Tratamento (Art. 7º LGPD)</h2>
        <ul>
          {LGPD.BASES_LEGAIS.map((b, i) => <li key={i}>{b}</li>)}
        </ul>

        <h2>3. Com Quem Compartilhamos</h2>
        <p>
          Seus dados são compartilhados apenas com parceiros essenciais para a operação, todos
          com adequada proteção contratual e conformidade com GDPR/LGPD:
        </p>
        <ul>
          {LGPD.TRANSFERENCIA_INTERNACIONAL.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
        <p>
          As transferências internacionais de dados ocorrem com base em cláusulas contratuais
          padrão aprovadas pela ANPD, garantindo nível de proteção equivalente ao da LGPD.
        </p>

        <h2>4. Seus Direitos (Art. 18 LGPD)</h2>
        <p>Você tem direito a:</p>
        <ul>
          <li><strong>Acesso:</strong> Solicitar cópia de todos os dados que temos sobre você.</li>
          <li><strong>Correção:</strong> Corrigir dados incorretos ou desatualizados.</li>
          <li><strong>Exclusão:</strong> Solicitar a exclusão dos seus dados. Atendimento em <strong>{LGPD.PRAZO_EXCLUSAO}</strong>.</li>
          <li><strong>Portabilidade:</strong> Receber seus dados em formato estruturado e legível por máquina.</li>
          <li><strong>Revogação de Consentimento:</strong> Retirar o consentimento a qualquer momento para finalidades baseadas em consentimento.</li>
          <li><strong>Oposição:</strong> Opor-se ao tratamento baseado em legítimo interesse.</li>
        </ul>
        <p>
          <strong>Exceção:</strong> {LGPD.EXCECAO_EXCLUSAO}.
        </p>
        <p>
          Para exercer seus direitos, acesse <Link href={LGPD.CANAL_SOLICITACAO}>esta página</Link> ou
          envie e-mail para <a href={`mailto:${LGPD.CONTATO_DPO}`}>{LGPD.CONTATO_DPO}</a>.
        </p>

        <h2>5. Retenção de Dados</h2>
        <p>
          Dados de conta são retidos enquanto a conta estiver ativa. Após exclusão, dados são
          anonimizados ou removidos em até {LGPD.PRAZO_EXCLUSAO}, exceto dados fiscais que
          precisam ser mantidos por {NEGOCIOS.DIAS_RETENCAO_FISCAL / 365} anos por obrigação legal.
        </p>

        <h2>6. Segurança</h2>
        <p>
          Implementamos medidas técnicas e organizacionais adequadas, incluindo:
          criptografia TLS/HTTPS em todas as conexões, tokens de autenticação via JWT com rotação,
          chaves de pagamento nunca armazenadas em nossos servidores (tokenização Stripe),
          acesso aos dados restrito por função (RBAC) e logs de auditoria em todas as ações críticas.
        </p>

        <h2>7. Cookies</h2>
        <p>Utilizamos os seguintes cookies:</p>
        <ul>
          {LEGAL.COOKIES.TIPOS.map((c, i) => (
            <li key={i}>
              <strong>{c.nome}</strong> · {c.duracao} · {c.finalidade}
            </li>
          ))}
        </ul>
        <p>{LEGAL.COOKIES.NAO_USA}</p>

        <h2>8. Encarregado de Dados (DPO)</h2>
        <p>
          Nosso Encarregado de Proteção de Dados (DPO) está disponível em:{" "}
          <a href={`mailto:${LGPD.CONTATO_DPO}`}>{LGPD.CONTATO_DPO}</a>.
          Você também pode acionar a ANPD (Autoridade Nacional de Proteção de Dados)
          em <a href="https://www.gov.br/anpd" target="_blank" rel="noopener">www.gov.br/anpd</a>{" "}
          caso entenda que seus direitos não foram atendidos.
        </p>

        <h2>9. Alterações nesta Política</h2>
        <p>
          Podemos atualizar esta Política periodicamente. Alterações relevantes serão comunicadas
          por e-mail ou notificação na plataforma com pelo menos 15 dias de antecedência.
          A versão atual é sempre acessível em{" "}
          <a href={`${EMPRESA.SITE}/privacidade`}>{EMPRESA.SITE}/privacidade</a>.
        </p>

        <div className="mt-12 pt-8 border-t border-white/10 space-y-1">
          <p className="text-zinc-600 text-xs text-center">
            © {new Date().getFullYear()} {EMPRESA.RAZAO_SOCIAL} · CNPJ {EMPRESA.CNPJ}
          </p>
          <p className="text-zinc-700 text-xs text-center">
            {EMPRESA.SEDE} · Foro: {EMPRESA.FORO}
          </p>
        </div>
      </div>
    </div>
  );
}
