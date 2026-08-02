import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Mail, Clock } from "lucide-react";
import logoMinhaAmora from "../assets/logo-minhaamora.png";

const LAST_UPDATE = "01 de junho de 2025";
const COMPANY_EMAIL = "suporte@minhaamora.com.br";
const COMPANY_NAME = "Minha Amora Tecnologia Ltda.";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

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

export default function TermsPage() {
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
              <FileText className="h-6 w-6 text-[#871745]" />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">Termos de Uso</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Leia antes de usar a Minha Amora</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-6 p-4 rounded-2xl bg-[#FDF2F7]/60 border border-[#871745]/15">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-[#871745]" />
              <span>Última atualização: <strong className="text-foreground">{LAST_UPDATE}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5 text-[#871745]" />
              <span>Contato: <a href={`mailto:${COMPANY_EMAIL}`} className="text-[#871745] hover:underline">{COMPANY_EMAIL}</a></span>
            </div>
          </div>
        </motion.div>

        {/* Aviso */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          custom={1}
          className="mb-10 rounded-2xl border border-[#871745]/20 bg-[#871745]/5 p-5"
        >
          <p className="text-sm text-foreground leading-relaxed">
            <strong className="text-[#871745]">Ao criar uma conta ou usar a Minha Amora</strong>, você concorda com estes
            Termos de Uso. Se não concordar com algum ponto, por favor, não utilize a Plataforma. Dúvidas?
            Fale conosco antes de se cadastrar.
          </p>
        </motion.div>

        {/* ─── Seções ─── */}
        <Section title="Definições" index={2}>
          <p>Para fins destes Termos, entende-se por:</p>
          <ul className="space-y-2 mt-2">
            <Li><strong className="text-foreground">"Plataforma":</strong> o aplicativo Minha Amora, site e todos os serviços relacionados;</Li>
            <Li><strong className="text-foreground">"Empresa":</strong> {COMPANY_NAME}, controladora da Plataforma;</Li>
            <Li><strong className="text-foreground">"Usuário"</strong> ou <strong className="text-foreground">"Você":</strong> pessoa física que acessa e utiliza a Plataforma;</Li>
            <Li><strong className="text-foreground">"Conteúdo do Usuário":</strong> dados de produtos, estoque e outras informações inseridas por você na Plataforma;</Li>
            <Li><strong className="text-foreground">"Amorinha":</strong> a assistente virtual com inteligência artificial disponível na Plataforma.</Li>
          </ul>
        </Section>

        <Section title="Aceitação e elegibilidade" index={3}>
          <p>
            Para utilizar a Minha Amora, você deve ter pelo menos <strong className="text-foreground">18 anos de idade</strong> e
            capacidade legal para firmar contratos. Ao aceitar estes Termos, você declara que atende a esses requisitos.
          </p>
          <p>
            A utilização da Plataforma é pessoal e intransferível. Você é responsável por todas as atividades
            realizadas na sua conta.
          </p>
        </Section>

        <Section title="Descrição do serviço" index={4}>
          <p>A Minha Amora é uma plataforma de gestão de estoque e vendas para consultoras de beleza, que oferece:</p>
          <ul className="space-y-2 mt-2">
            <Li>Cadastro e controle de produtos por código de barras (scanner);</Li>
            <Li>Gestão de estoque com alertas de nível baixo e vencimento;</Li>
            <Li>Vitrine digital personalizada para compartilhamento de produtos;</Li>
            <Li>Assistente virtual Amorinha com inteligência artificial;</Li>
            <Li>Relatórios e analytics de desempenho.</Li>
          </ul>
          <p className="mt-3">
            A Empresa reserva-se o direito de modificar, suspender ou descontinuar funcionalidades a qualquer
            momento, mediante aviso prévio de <strong className="text-foreground">30 dias</strong> para alterações
            substanciais que afetem planos pagos.
          </p>
        </Section>

        <Section title="Criação de conta e segurança" index={5}>
          <p>Ao criar uma conta, você compromete-se a:</p>
          <ul className="space-y-2 mt-2">
            <Li>Fornecer informações verdadeiras, precisas e atualizadas;</Li>
            <Li>Manter a confidencialidade de sua senha;</Li>
            <Li>Notificar imediatamente a Empresa em caso de uso não autorizado da sua conta;</Li>
            <Li>Não compartilhar sua conta com terceiros;</Li>
            <Li>Criar apenas uma conta por pessoa.</Li>
          </ul>
          <p className="mt-3">
            A Empresa não será responsável por danos decorrentes do descumprimento das obrigações de segurança
            acima.
          </p>
        </Section>

        <Section title="Planos, preços e pagamentos" index={6}>
          <p>
            A Plataforma oferece um plano <strong className="text-foreground">Free</strong> (gratuito com limitações)
            e um plano <strong className="text-foreground">PRO</strong> (pago com acesso completo).
          </p>
          <ul className="space-y-2 mt-2">
            <Li>Os preços vigentes são os exibidos na página de planos no momento da contratação;</Li>
            <Li>O pagamento do plano PRO é processado pela <strong className="text-foreground">Stripe</strong>, de forma segura;</Li>
            <Li>Assinaturas mensais renovam automaticamente todo mês; anuais, todo ano;</Li>
            <Li>O cancelamento pode ser feito a qualquer momento, sem multas ou fidelidade;</Li>
            <Li>Após o cancelamento, o acesso PRO permanece ativo até o fim do período já pago;</Li>
            <Li>Não há reembolso proporcional por fração do período, salvo erro da Empresa.</Li>
          </ul>
          <p className="mt-3">
            A Empresa pode alterar os preços com aviso prévio de <strong className="text-foreground">30 dias</strong>.
            Assinantes ativos serão notificados por e-mail.
          </p>
        </Section>

        <Section title="Uso aceitável" index={7}>
          <p>Você concorda em usar a Plataforma exclusivamente para fins lícitos. É <strong className="text-foreground">proibido</strong>:</p>
          <ul className="space-y-2 mt-2">
            <Li>Usar a Plataforma para atividades ilegais ou que violem direitos de terceiros;</Li>
            <Li>Tentar acessar sistemas ou dados de outros usuários;</Li>
            <Li>Realizar engenharia reversa, descompilar ou modificar o código da Plataforma;</Li>
            <Li>Usar scripts automáticos para acessar a Plataforma sem autorização;</Li>
            <Li>Cadastrar informações falsas ou enganosas;</Li>
            <Li>Revender ou sublicenciar acesso à Plataforma sem autorização expressa.</Li>
          </ul>
          <p className="mt-3">
            O descumprimento pode resultar em suspensão ou encerramento imediato da conta, sem direito a reembolso.
          </p>
        </Section>

        <Section title="Conteúdo do Usuário" index={8}>
          <p>
            Você é o único responsável pelo Conteúdo do Usuário inserido na Plataforma. Ao inserir conteúdo,
            você declara que:
          </p>
          <ul className="space-y-2 mt-2">
            <Li>Tem direito de usar e compartilhar o conteúdo;</Li>
            <Li>O conteúdo não viola leis, regulamentos ou direitos de terceiros.</Li>
          </ul>
          <p className="mt-3">
            A Empresa não reivindica propriedade sobre seu Conteúdo. Você concede à Empresa uma licença limitada,
            não exclusiva e revogável para processar e exibir o conteúdo exclusivamente para a prestação do serviço.
          </p>
        </Section>

        <Section title="Propriedade intelectual" index={9}>
          <p>
            Todos os elementos da Plataforma — incluindo, mas não se limitando a, código-fonte, design, logotipos,
            marca "Minha Amora", "Amorinha" e demais elementos de identidade visual — são de propriedade exclusiva
            da Empresa e protegidos pelas leis de propriedade intelectual brasileiras (Lei nº 9.610/1998 e
            Lei nº 9.279/1996).
          </p>
          <p>
            Estes Termos não concedem a você qualquer direito de propriedade intelectual sobre a Plataforma além
            do direito de uso conforme aqui descrito.
          </p>
        </Section>

        <Section title="Assistente Amorinha (IA)" index={10}>
          <p>A assistente Amorinha é uma funcionalidade baseada em inteligência artificial. Você compreende que:</p>
          <ul className="space-y-2 mt-2">
            <Li>As respostas são geradas por IA e podem conter imprecisões;</Li>
            <Li>A Amorinha não substitui aconselhamento profissional financeiro, jurídico ou contábil;</Li>
            <Li>Você é responsável por verificar as informações antes de tomar decisões de negócio;</Li>
            <Li>Conversas com a Amorinha são processadas conforme nossa Política de Privacidade.</Li>
          </ul>
        </Section>

        <Section title="Disponibilidade e SLA" index={11}>
          <p>
            A Empresa envidar esforços razoáveis para manter a Plataforma disponível 24h por dia, 7 dias por semana.
            Contudo, não garantimos disponibilidade ininterrupta. Manutenções programadas serão comunicadas
            com antecedência. A Empresa não se responsabiliza por indisponibilidades causadas por:
          </p>
          <ul className="space-y-2 mt-2">
            <Li>Falhas de infraestrutura de terceiros (internet, cloud providers);</Li>
            <Li>Casos fortuitos ou de força maior;</Li>
            <Li>Ataques cibernéticos além do razoavelmente controláveis.</Li>
          </ul>
        </Section>

        <Section title="Limitação de responsabilidade" index={12}>
          <p>
            Na extensão máxima permitida pela lei brasileira, a Empresa não será responsável por danos indiretos,
            incidentais, especiais ou consequenciais decorrentes do uso ou incapacidade de uso da Plataforma,
            incluindo perda de lucros, dados ou oportunidades de negócio.
          </p>
          <p>
            A responsabilidade total da Empresa, por qualquer causa, fica limitada ao valor pago pelo Usuário
            nos últimos <strong className="text-foreground">3 meses</strong> antes do evento que deu origem à reclamação,
            ou R$ 100,00, o que for maior.
          </p>
          <p>
            Esta limitação não se aplica a casos de dolo ou culpa grave da Empresa, nem a direitos garantidos
            pelo Código de Defesa do Consumidor (Lei nº 8.078/1990).
          </p>
        </Section>

        <Section title="Rescisão" index={13}>
          <p>
            <strong className="text-foreground">Pelo Usuário:</strong> Você pode encerrar sua conta a qualquer momento
            pelo painel de configurações ou pelo e-mail de suporte.
          </p>
          <p>
            <strong className="text-foreground">Pela Empresa:</strong> Podemos suspender ou encerrar sua conta, com aviso
            prévio de <strong className="text-foreground">15 dias</strong>, por violação destes Termos, ou imediatamente
            em casos graves (fraude, atividade ilícita, violação de segurança).
          </p>
          <p>
            Após o encerramento, seus dados serão tratados conforme nossa{" "}
            <button
              onClick={() => window.history.pushState({}, "", "/privacy")}
              className="text-[#871745] hover:underline"
            >
              Política de Privacidade
            </button>.
          </p>
        </Section>

        <Section title="Legislação aplicável e foro" index={14}>
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil, em especial o Código Civil
            (Lei nº 10.406/2002), o Código de Defesa do Consumidor (Lei nº 8.078/1990), o Marco Civil da
            Internet (Lei nº 12.965/2014) e a LGPD (Lei nº 13.709/2018).
          </p>
          <p>
            Fica eleito o foro da comarca de <strong className="text-foreground">[Cidade/Estado da sede da empresa]</strong>,
            Brasil, para dirimir quaisquer controvérsias decorrentes destes Termos, com renúncia a qualquer
            outro, por mais privilegiado que seja.
          </p>
          <p>
            Antes de recorrer ao judiciário, as partes comprometem-se a tentar resolução amigável em até
            <strong className="text-foreground"> 30 dias</strong>.
          </p>
        </Section>

        <Section title="Alterações nos Termos" index={15}>
          <p>
            Podemos atualizar estes Termos periodicamente. Alterações relevantes serão comunicadas com antecedência
            mínima de <strong className="text-foreground">30 dias</strong> por e-mail e aviso na Plataforma.
          </p>
          <p>
            Caso não concorde com as alterações, você pode cancelar sua conta antes da data de vigência.
            O uso continuado após essa data implica aceite dos novos Termos.
          </p>
        </Section>

        {/* Contato */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mb-12 rounded-2xl border border-[#871745]/20 bg-[#871745]/5 p-6"
        >
          <h2 className="font-display text-base font-bold text-foreground mb-3 flex items-center gap-2">
            <span className="text-[#871745]">§</span> Dúvidas e Contato
          </h2>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            Se tiver dúvidas sobre estes Termos, entre em contato com nossa equipe. Estamos aqui para ajudar.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{COMPANY_NAME}</p>
            <a
              href={`mailto:${COMPANY_EMAIL}`}
              className="flex items-center gap-2 text-sm text-[#871745] hover:underline font-medium"
            >
              <Mail className="h-4 w-4" /> {COMPANY_EMAIL}
            </a>
            <p className="text-xs text-muted-foreground">
              Atendimento: Segunda a Sexta, das 9h às 18h (horário de Brasília)
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="pt-8 border-t border-border text-center"
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
