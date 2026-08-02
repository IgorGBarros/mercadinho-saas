import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Mail, MapPin, Clock } from "lucide-react";
import logoMinhaAmora from "../assets/logo-minhaamora.png";

const LAST_UPDATE = "01 de junho de 2025";
const COMPANY_EMAIL = "privacidade@minhaamora.com.br";
const COMPANY_NAME = "Minha Amora Tecnologia Ltda.";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

// ─── Componentes auxiliares ──────────────────────────────────────────────────
function Section({ title, children, index = 0 }: { title: string; children: React.ReactNode; index?: number }) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      custom={index}
      className="mb-10"
    >
      <h2 className="font-display text-xl font-bold text-foreground mb-3 flex items-center gap-2">
        <span className="text-[#871745]">§</span> {title}
      </h2>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </motion.section>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#871745] shrink-0" />
      <span>{children}</span>
    </li>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <nav className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="flex items-center gap-2.5">
            <img src={logoMinhaAmora} alt="Minha Amora" className="h-8 w-8 rounded-xl object-contain" />
            <span className="font-display text-sm font-bold text-foreground">
              Minha <span className="text-[#871745]">Amora</span>
            </span>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-12">
        {/* Header */}
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#871745]/10">
              <Shield className="h-6 w-6 text-[#871745]" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Política de Privacidade</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Em conformidade com a LGPD – Lei nº 13.709/2018</p>
            </div>
          </div>

          {/* Metadados */}
          <div className="flex flex-wrap gap-4 mt-6 p-4 rounded-2xl bg-[#FDF2F7]/60 border border-[#871745]/15">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-[#871745]" />
              <span>Última atualização: <strong className="text-foreground">{LAST_UPDATE}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 text-[#871745]" />
              <span>Contato: <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#871745] hover:underline">{COMPANY_EMAIL}</a></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 text-[#871745]" />
              <span>Brasil</span>
            </div>
          </div>
        </motion.div>

        {/* Aviso de destaque */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="mb-10 rounded-2xl border border-[#871745]/20 bg-[#871745]/5 p-5"
        >
          <p className="text-sm text-foreground leading-relaxed">
            <strong className="text-[#871745]">Resumo simples:</strong> A Minha Amora coleta apenas os dados
            necessários para funcionar. Não vendemos suas informações. Você tem controle total sobre seus dados
            e pode solicitar exclusão a qualquer momento. Esta política explica tudo em detalhes.
          </p>
        </motion.div>

        {/* Índice */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={2}
          className="mb-12 rounded-2xl border border-border bg-card p-5"
        >
          <p className="text-sm font-bold text-foreground mb-3">Índice</p>
          <ol className="space-y-1.5 text-sm text-muted-foreground">
            {[
              "Quem somos (Controlador dos Dados)",
              "Quais dados coletamos",
              "Como e por que usamos seus dados",
              "Base legal para o tratamento",
              "Compartilhamento de dados",
              "Cookies e tecnologias semelhantes",
              "Retenção e exclusão de dados",
              "Segurança das informações",
              "Seus direitos como titular (LGPD Art. 18)",
              "Transferência internacional de dados",
              "Alterações nesta política",
              "Contato e Encarregado de Dados (DPO)",
            ].map((item, i) => (
              <li key={item} className="flex items-center gap-2">
                <span className="text-[#871745] font-semibold text-xs w-5 text-right shrink-0">{i + 1}.</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </motion.div>

        {/* ─── Seções ─── */}
        <Section title="Quem somos (Controlador dos Dados)" index={3}>
          <p>
            O <strong className="text-foreground">{COMPANY_NAME}</strong>, inscrita no CNPJ [CNPJ], com sede em
            [Endereço completo], é a controladora dos dados pessoais coletados por meio do aplicativo e site
            Minha Amora ("Plataforma").
          </p>
          <p>
            Para fins da Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018), somos responsáveis pelas
            decisões relativas ao tratamento dos seus dados pessoais.
          </p>
        </Section>

        <Section title="Quais dados coletamos" index={4}>
          <p>Coletamos apenas os dados estritamente necessários para a prestação do serviço:</p>
          <ul className="space-y-2 mt-2">
            <Li><strong className="text-foreground">Dados de cadastro:</strong> nome completo, endereço de e-mail e senha (armazenada com hash seguro).</Li>
            <Li><strong className="text-foreground">Dados do negócio:</strong> produtos cadastrados, informações de estoque, histórico de movimentações e configurações da vitrine digital.</Li>
            <Li><strong className="text-foreground">Dados de pagamento:</strong> processados exclusivamente pela Stripe (não armazenamos dados de cartão). Registramos apenas o status da assinatura e o plano ativo.</Li>
            <Li><strong className="text-foreground">Dados de uso:</strong> logs de acesso (endereço IP, data/hora, dispositivo), páginas acessadas e funcionalidades utilizadas — para fins de segurança e melhoria do serviço.</Li>
            <Li><strong className="text-foreground">Dados da câmera:</strong> usados exclusivamente em tempo real para o scanner de código de barras e OCR de validade. Nenhuma imagem é armazenada em nossos servidores.</Li>
            <Li><strong className="text-foreground">Comunicações:</strong> mensagens enviadas para a assistente Amorinha, armazenadas apenas para manter o contexto da conversa durante a sessão.</Li>
          </ul>
          <p className="mt-3">
            <strong className="text-foreground">Não coletamos</strong> dados sensíveis como origem racial, convicções religiosas, dados de saúde, biometria, orientação sexual ou dados de menores de 18 anos.
          </p>
        </Section>

        <Section title="Como e por que usamos seus dados" index={5}>
          <p>Utilizamos seus dados exclusivamente para as seguintes finalidades:</p>
          <ul className="space-y-2 mt-2">
            <Li>Criar e gerenciar sua conta na plataforma;</Li>
            <Li>Fornecer as funcionalidades do app (estoque, scanner, vitrine digital, Amorinha);</Li>
            <Li>Processar pagamentos e gerenciar assinaturas;</Li>
            <Li>Enviar notificações transacionais (alertas de estoque, vencimentos, confirmações de pagamento);</Li>
            <Li>Enviar comunicações de marketing com sua autorização explícita, podendo ser canceladas a qualquer momento;</Li>
            <Li>Garantir a segurança da plataforma e prevenir fraudes;</Li>
            <Li>Melhorar o produto por meio de análise agregada e anonimizada de uso;</Li>
            <Li>Cumprir obrigações legais e regulatórias.</Li>
          </ul>
        </Section>

        <Section title="Base legal para o tratamento" index={6}>
          <p>Conforme a LGPD (Art. 7º), tratamos seus dados com as seguintes bases legais:</p>
          <div className="mt-3 space-y-3">
            {[
              { base: "Execução de contrato (Art. 7º, V)", desc: "Dados necessários para prestar o serviço contratado (conta, estoque, scanner, vitrine)." },
              { base: "Consentimento (Art. 7º, I)", desc: "Cookies não essenciais, comunicações de marketing e funcionalidades opcionais. Revogável a qualquer momento." },
              { base: "Legítimo interesse (Art. 7º, IX)", desc: "Análise de uso para melhoria do produto, segurança contra fraudes e logs de acesso." },
              { base: "Cumprimento de obrigação legal (Art. 7º, II)", desc: "Dados fiscais e registros obrigatórios por lei." },
            ].map((item) => (
              <div key={item.base} className="rounded-xl border border-border bg-background p-3">
                <p className="text-xs font-bold text-[#871745] mb-1">{item.base}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Compartilhamento de dados" index={7}>
          <p>
            <strong className="text-foreground">Não vendemos seus dados.</strong> Compartilhamos apenas com terceiros
            essenciais para a operação do serviço, todos sob acordo de processamento de dados (DPA):
          </p>
          <ul className="space-y-2 mt-2">
            <Li><strong className="text-foreground">Stripe:</strong> processamento de pagamentos (sede nos EUA, com cláusulas contratuais padrão da ANPD).</Li>
            <Li><strong className="text-foreground">Anthropic / OpenAI:</strong> processamento das mensagens da assistente Amorinha (dados são transmitidos de forma segura e não usados para treinar modelos sem consentimento).</Li>
            <Li><strong className="text-foreground">Serviços de hospedagem:</strong> infraestrutura de cloud (AWS ou similar), com dados armazenados preferencialmente no Brasil.</Li>
            <Li><strong className="text-foreground">Serviços de e-mail transacional:</strong> para envio de notificações (ex.: SendGrid).</Li>
          </ul>
          <p className="mt-3">Podemos divulgar dados quando exigido por autoridade judicial ou regulatória competente.</p>
        </Section>

        <Section title="Cookies e tecnologias semelhantes" index={8}>
          <p>Utilizamos cookies nas seguintes categorias:</p>
          <div className="mt-3 space-y-3">
            {[
              { name: "Necessários", color: "#2E8B57", desc: "Autenticação, segurança, preferências da sessão. Não podem ser desativados." },
              { name: "Desempenho / Analytics", color: "#871745", desc: "Entender como o app é usado (dados anonimizados). Ativados somente com seu consentimento." },
              { name: "Marketing", color: "#871745", desc: "Personalização de comunicações e medição de campanhas. Ativados somente com seu consentimento explícito." },
            ].map((c) => (
              <div key={c.name} className="flex items-start gap-3 rounded-xl border border-border bg-background p-3">
                <span
                  className="mt-0.5 h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: c.color, marginTop: 6 }}
                />
                <div>
                  <p className="text-xs font-bold text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3">
            Você pode gerenciar suas preferências de cookies a qualquer momento clicando em "Preferências de Privacidade"
            no rodapé do site ou nas configurações da sua conta.
          </p>
        </Section>

        <Section title="Retenção e exclusão de dados" index={9}>
          <p>Mantemos seus dados pelo tempo necessário para a finalidade coletada:</p>
          <ul className="space-y-2 mt-2">
            <Li>Dados de conta ativa: enquanto a conta existir;</Li>
            <Li>Após exclusão da conta: dados removidos em até <strong className="text-foreground">30 dias</strong>;</Li>
            <Li>Dados fiscais e financeiros: <strong className="text-foreground">5 anos</strong> conforme obrigação legal;</Li>
            <Li>Logs de segurança: <strong className="text-foreground">90 dias</strong>;</Li>
            <Li>Backups: eliminados em até <strong className="text-foreground">60 dias</strong> após a exclusão.</Li>
          </ul>
        </Section>

        <Section title="Segurança das informações" index={10}>
          <p>Adotamos medidas técnicas e organizacionais para proteger seus dados:</p>
          <ul className="space-y-2 mt-2">
            <Li>Criptografia em trânsito (TLS 1.3) e em repouso (AES-256);</Li>
            <Li>Senhas armazenadas com hash bcrypt, nunca em texto puro;</Li>
            <Li>Acesso à base de dados restrito por princípio do menor privilégio;</Li>
            <Li>Monitoramento contínuo e alertas de acesso suspeito;</Li>
            <Li>Plano de resposta a incidentes com notificação à ANPD e titulares em até 72h conforme exigido pela LGPD.</Li>
          </ul>
        </Section>

        <Section title="Seus direitos como titular (LGPD Art. 18)" index={11}>
          <p>
            Como titular dos dados, você tem os seguintes direitos garantidos pela LGPD, que podem ser exercidos
            a qualquer momento pelo e-mail <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#871745] hover:underline">{COMPANY_EMAIL}</a>:
          </p>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { right: "Confirmação", desc: "Saber se tratamos seus dados." },
              { right: "Acesso", desc: "Receber cópia dos seus dados." },
              { right: "Correção", desc: "Corrigir dados incompletos ou desatualizados." },
              { right: "Anonimização/Bloqueio", desc: "Para dados desnecessários ou excessivos." },
              { right: "Portabilidade", desc: "Transferir seus dados para outro serviço." },
              { right: "Eliminação", desc: "Excluir dados tratados com consentimento." },
              { right: "Revogação do consentimento", desc: "Retirar consentimento a qualquer momento." },
              { right: "Oposição", desc: "Opor-se ao tratamento em determinadas hipóteses." },
            ].map((item) => (
              <div key={item.right} className="rounded-xl border border-border bg-[#FDF2F7]/40 p-3">
                <p className="text-xs font-bold text-[#871745]">✓ {item.right}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="mt-3">
            Responderemos às solicitações em até <strong className="text-foreground">15 dias úteis</strong>. 
            Você também pode peticionar perante a{" "}
            <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-[#871745] hover:underline">
              Autoridade Nacional de Proteção de Dados (ANPD)
            </a>.
          </p>
        </Section>

        <Section title="Transferência internacional de dados" index={12}>
          <p>
            Alguns de nossos parceiros (como Stripe e provedores de IA) têm sede fora do Brasil. Nestes casos,
            garantimos que a transferência ocorra mediante:
          </p>
          <ul className="space-y-2 mt-2">
            <Li>Cláusulas contratuais padrão aprovadas pela ANPD;</Li>
            <Li>País de destino com nível adequado de proteção reconhecido;</Li>
            <Li>Certificações de segurança equivalentes (ex.: ISO 27001, SOC 2).</Li>
          </ul>
        </Section>

        <Section title="Alterações nesta política" index={13}>
          <p>
            Podemos atualizar esta Política de Privacidade periodicamente. Quando o fizermos, revisaremos a data
            de "última atualização" no topo desta página e, para alterações significativas, enviaremos uma
            notificação por e-mail ou aviso no aplicativo com antecedência mínima de <strong className="text-foreground">30 dias</strong>.
          </p>
          <p>
            O uso continuado da Plataforma após a data de vigência das alterações constitui aceite das novas
            condições.
          </p>
        </Section>

        <Section title="Contato e Encarregado de Dados (DPO)" index={14}>
          <p>Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato com nosso Encarregado de Dados:</p>
          <div className="mt-4 rounded-2xl border border-[#871745]/20 bg-[#871745]/5 p-5 space-y-2">
            <p className="text-sm font-bold text-foreground">{COMPANY_NAME}</p>
            <p className="text-sm text-muted-foreground">Encarregado de Proteção de Dados (DPO): [Nome do DPO]</p>
            <a
              href={`mailto:${COMPANY_EMAIL}`}
              className="flex items-center gap-2 text-sm text-[#871745] hover:underline font-medium"
            >
              <Mail className="h-4 w-4" /> {COMPANY_EMAIL}
            </a>
            <p className="text-xs text-muted-foreground pt-1">
              Horário de atendimento: Segunda a Sexta, das 9h às 18h (horário de Brasília)
            </p>
          </div>
        </Section>

        {/* Footer */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mt-12 pt-8 border-t border-border text-center"
        >
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {COMPANY_NAME} · Todos os direitos reservados ·{" "}
            <span className="text-[#871745]">Feito com 💜 para consultoras brasileiras</span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
