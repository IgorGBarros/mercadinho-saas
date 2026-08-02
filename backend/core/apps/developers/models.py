"""
Identidade do desenvolvedor — separada de CustomUser de propósito.

Uma consultora nunca tem uma DeveloperAccount, e um desenvolvedor nunca tem
uma Store. São dois produtos diferentes (o app de gestão de estoque, e a
API comercial de dados agregados) compartilhando a mesma infraestrutura de
banco/deploy, mas com identidades que não se misturam.
"""
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.db import models


class DeveloperAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    # Em branco pra contas criadas só via login social (Google/GitHub) —
    # ela nunca definiu uma senha manual, e não deveria conseguir logar com
    # senha vazia por isso.
    password_hash = models.CharField(max_length=255, blank=True)

    name = models.CharField(max_length=150)
    company_name = models.CharField(max_length=150, blank=True)

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_login_at = models.DateTimeField(null=True, blank=True)

    # 🔑 Login social (Google/GitHub/outros via Firebase) — preenchido só
    # quando a conta foi criada ou vinculada por esse caminho. Contas
    # criadas via e-mail/senha manual ficam com isto vazio; as duas formas
    # de entrar coexistem na MESMA conta se o e-mail bater.
    firebase_uid = models.CharField(max_length=128, blank=True, db_index=True)

    # ─────────────────────────────────────────────────────────────
    # ⚠️ ENCAIXE PARA REVISÃO DE LGPD — deixado pronto, não aplicado ainda.
    # ─────────────────────────────────────────────────────────────
    # O produto real (Fase 3) vende dado agregado de comportamento de
    # consultoras/clientes finais pra marcas — isso muda a categoria de
    # risco de LGPD do que construímos até aqui no admin-panel. Antes de
    # vender de verdade, alguém com conhecimento jurídico precisa revisar:
    #
    #   1. Se o termo que a CONSULTORA aceita hoje (ver ConsentRecord em
    #      inventory/models.py) já cobre "seus dados de venda podem virar
    #      inteligência de mercado agregada e vendida a terceiros" — o
    #      purpose 'data_commercialization' foi adicionado lá, mas NADA
    #      ainda checa esse consentimento, porque não existe endpoint de
    #      venda de dado ainda (isso é Fase 3).
    #   2. Que termo o DESENVOLVEDOR (cliente da API) precisa aceitar sobre
    #      uso responsável do dado agregado que ele está comprando.
    #
    # Os dois campos abaixo só GUARDAM a aceitação quando ela existir — não
    # bloqueiam cadastro nem validam conteúdo nenhum agora. É opcional na
    # Fase 1 de propósito, pra não travar ninguém num termo que ainda não
    # foi escrito/revisado.
    terms_accepted_at = models.DateTimeField(null=True, blank=True)
    terms_version = models.CharField(max_length=20, blank=True)

    class Meta:
        db_table = 'developer_accounts'
        verbose_name = 'Conta de desenvolvedor'
        verbose_name_plural = 'Contas de desenvolvedor'

    # ⚠️ Necessário pro DRF: IsAuthenticated checa `request.user.is_authenticated`.
    # AbstractBaseUser do Django fornece isso de graça; como esta classe é um
    # models.Model comum de propósito (pra não herdar nenhuma máquina de
    # AUTH_USER_MODEL), precisa declarar manualmente.
    is_authenticated = True
    is_anonymous = False

    def __str__(self):
        return f"{self.name} <{self.email}>"

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        if not self.password_hash:
            # Conta só de login social — nunca teve senha manual definida.
            return False
        return check_password(raw_password, self.password_hash)


# ==========================================
# 💰 COBRANÇA DA API COMERCIAL (Fase 4)
# ==========================================
# Mesmo padrão do PlanConfig/Store das consultoras — só que pro produto de
# API. Reaproveita a MESMA conta Asaas (não é um gateway novo), só um
# produto diferente sendo cobrado.

class ApiPlanConfig(models.Model):
    """
    Preço e limites de cada tier da API comercial — o que o admin-panel
    configura na aba "Planos de API". Antes disso, ApiKey.plan (starter/
    pro/enterprise) existia mas não tinha preço nenhum associado a ele.
    """
    PLAN_CHOICES = [('starter', 'Starter'), ('pro', 'Pro'), ('enterprise', 'Enterprise')]

    plan_type = models.CharField(max_length=20, choices=PLAN_CHOICES, unique=True)
    display_name = models.CharField(max_length=50)
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    monthly_quota = models.IntegerField(default=1000)
    rate_limit = models.IntegerField(default=20, help_text="Requisições por minuto")
    is_visible = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Plano de API"
        verbose_name_plural = "Planos de API"

    def __str__(self):
        return f"{self.display_name} (R$ {self.monthly_price}/mês)"


class ApiSubscription(models.Model):
    """
    Liga um DeveloperAccount a um plano PAGO — mesmo papel que
    Store.plan/subscription_expires_at fazem hoje pras consultoras.
    """
    developer = models.OneToOneField(DeveloperAccount, on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(ApiPlanConfig, on_delete=models.PROTECT, related_name='subscriptions')
    started_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    # Mesmo caminho de identificação que Store já usa com o Asaas — guarda
    # o ID do link de pagamento pra reconhecer o webhook depois.
    payment_external_id = models.CharField(max_length=100, blank=True)

    class Meta:
        verbose_name = "Assinatura de API"
        verbose_name_plural = "Assinaturas de API"

    def __str__(self):
        return f"{self.developer.email} → {self.plan.display_name}"

    @property
    def is_active(self):
        from django.utils import timezone
        return bool(self.expires_at and self.expires_at > timezone.now())