"""
tenancy/models.py — a hierarquia de tenant do mercadinho.

    Operator  → a empresa cliente (CNPJ, certificado fiscal, assinatura)
      ├── Unit      → o mercadinho físico  [hoje ainda se chama inventory.Store]
      │     └── Device → totem, trava de geladeira, tablet
      └── Membership  → User × Operator × papel × unidades permitidas

⚠️ POR QUE ISSO EXISTE
O modelo herdado era `Store.owner = OneToOneField(User)`: um usuário, uma
loja. Serve para consultora autônoma; não serve para mercadinho, onde uma
empresa tem N unidades, cada unidade tem M dispositivos, e pessoas
diferentes (dono, gerente, repositor, síndico) enxergam coisas diferentes.

⚠️ RENOMEAÇÃO PENDENTE
`inventory.Store` vira `Unit` num bloco seguinte, separado de propósito: é
uma mudança mecânica em ~100 pontos, e misturá-la com a criação destes
modelos tornaria impossível saber o que quebrou o quê. Até lá, leia
"Store" como "Unit" — as FKs abaixo já apontam para o conceito certo.
"""
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone


# ==========================================
# 🏢 OPERATOR — a empresa cliente
# ==========================================

class Operator(models.Model):
    """
    Dona do CNPJ, do contrato e da assinatura.

    A assinatura mora AQUI, não na unidade, por três motivos concretos:
      • o cliente Asaas é um CNPJ — 5 unidades geram 1 cobrança, não 5;
      • o certificado digital A1 é do CNPJ;
      • a cobrança passa a ser por unidade ativa (base + adicional), que é
        um modelo comercial melhor e mais fácil de explicar ao lojista.
    """

    class TaxRegime(models.TextChoices):
        SIMPLES = 'simples', 'Simples Nacional'
        PRESUMIDO = 'presumido', 'Lucro Presumido'
        REAL = 'real', 'Lucro Real'
        MEI = 'mei', 'MEI'

    name = models.CharField(max_length=255, help_text="Nome fantasia")
    legal_name = models.CharField(max_length=255, blank=True, help_text="Razão social")
    cnpj = models.CharField(max_length=14, unique=True, null=True, blank=True)

    # Define CSOSN (Simples) vs CST (Presumido/Real) na emissão da NFC-e.
    tax_regime = models.CharField(
        max_length=20, choices=TaxRegime.choices, default=TaxRegime.SIMPLES
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # ── 💳 Assinatura (migrada de Store) ──────────────────────────────
    PLAN_CHOICES = [('free', 'Free'), ('pro', 'Pro')]
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='free')
    payment_provider = models.CharField(max_length=50, blank=True, null=True)
    payment_external_id = models.CharField(max_length=100, blank=True, null=True)
    subscription_started_at = models.DateTimeField(blank=True, null=True)
    subscription_expires_at = models.DateTimeField(blank=True, null=True)
    trial_started_at = models.DateTimeField(blank=True, null=True)
    trial_ends_at = models.DateTimeField(blank=True, null=True)

    # ── 🔐 Fiscal ──────────────────────────────────────────────────────
    # ⚠️ O certificado A1 (.pfx) NUNCA entra no repositório, nunca aparece
    # em log e nunca sai por API. Guardado criptografado; a chave de
    # criptografia vive em variável de ambiente, fora do banco.
    cert_a1_encrypted = models.BinaryField(null=True, blank=True)
    cert_a1_expires_at = models.DateField(
        null=True, blank=True,
        help_text="Alertar o cliente 30 dias antes: certificado vencido = loja sem emitir nota."
    )
    # CSC / Token IdCSC emitidos pela SEFAZ do estado, por CNPJ.
    csc_id = models.CharField(max_length=10, blank=True)
    csc_token_encrypted = models.BinaryField(null=True, blank=True)

    fiscal_provider = models.CharField(
        max_length=20, default='focusnfe',
        help_text="Hub fiscal usado para emitir NFC-e."
    )

    class Meta:
        verbose_name = 'Operação'
        verbose_name_plural = 'Operações'
        ordering = ['name']
        indexes = [models.Index(fields=['is_active', 'plan'])]

    def __str__(self):
        return self.name

    @property
    def active_units_count(self):
        return self.units.filter(is_active=True).count()

    @property
    def is_subscription_active(self):
        agora = timezone.now()
        if self.trial_ends_at and agora < self.trial_ends_at:
            return True
        return bool(self.subscription_expires_at and agora < self.subscription_expires_at)

    def start_trial(self, dias=14):
        agora = timezone.now()
        self.trial_started_at = agora
        self.trial_ends_at = agora + timedelta(days=dias)
        self.save(update_fields=['trial_started_at', 'trial_ends_at'])


# ==========================================
# 👥 MEMBERSHIP — quem pode o quê, e onde
# ==========================================

class Membership(models.Model):
    """
    Substitui `Store.owner`. Um usuário pode pertencer a vários operadores,
    e dentro de um operador pode ser restrito a um subconjunto de unidades.
    """

    class Role(models.TextChoices):
        OWNER = 'owner', 'Proprietário'      # tudo, inclusive fiscal e membros
        MANAGER = 'manager', 'Gerente'       # opera unidades, vê financeiro delas
        STOCKER = 'stocker', 'Repositor'     # só estoque — não vê custo nem receita
        VIEWER = 'viewer', 'Visualizador'    # leitura (ex.: síndico do condomínio)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='memberships'
    )
    operator = models.ForeignKey(
        Operator, on_delete=models.CASCADE, related_name='memberships'
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OWNER)

    # Vazio = todas as unidades do operador (caso comum: dono).
    # Preenchido = só essas (caso comum: repositor que atende 3 condomínios).
    units = models.ManyToManyField(
        'inventory.Store', blank=True, related_name='members',
        help_text="Deixe vazio para dar acesso a todas as unidades da operação."
    )

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Vínculo'
        verbose_name_plural = 'Vínculos'
        unique_together = [('user', 'operator')]
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['operator', 'role']),
        ]

    def __str__(self):
        return f"{self.user} @ {self.operator} ({self.get_role_display()})"

    def allowed_units(self):
        """Queryset das unidades que este vínculo enxerga."""
        from inventory.models import Store

        if not self.is_active or not self.operator.is_active:
            return Store.objects.none()

        explicitas = self.units.filter(is_active=True)
        if explicitas.exists():
            return explicitas
        return self.operator.units.filter(is_active=True)

    # ── Permissões por papel ───────────────────────────────────────────
    # Isolamento por linha (queryset) diz QUAIS registros a pessoa vê.
    # Isto diz QUAIS CAMPOS e QUAIS AÇÕES — um repositor não pode ver
    # preço de custo, que é dado comercial do dono.

    @property
    def can_see_costs(self):
        return self.role in (self.Role.OWNER, self.Role.MANAGER)

    @property
    def can_write_stock(self):
        return self.role in (self.Role.OWNER, self.Role.MANAGER, self.Role.STOCKER)

    @property
    def can_see_financials(self):
        return self.role in (self.Role.OWNER, self.Role.MANAGER)

    @property
    def can_emit_fiscal(self):
        return self.role in (self.Role.OWNER, self.Role.MANAGER)

    @property
    def can_manage_operator(self):
        """Membros, certificado fiscal e criação de unidade (afeta a fatura)."""
        return self.role == self.Role.OWNER


# ==========================================
# 🖥️ DEVICE — o totem não é uma pessoa
# ==========================================

class Device(models.Model):
    """
    Totem, trava de geladeira ou tablet do repositor.

    ⚠️ Um Device NÃO tem Membership. Ele autentica pela ApiKey que já existe
    em inventory.models — não faz login com e-mail/senha e não carrega
    refresh token de 7 dias. Isso importa porque um totem fica num corredor
    de condomínio sem supervisão: se for roubado, você revoga uma chave sem
    mexer em nenhum usuário.
    """

    class Kind(models.TextChoices):
        TOTEM = 'totem', 'Totem de autoatendimento'
        FRIDGE_LOCK = 'fridge_lock', 'Trava de geladeira'
        TABLET = 'tablet', 'Tablet do repositor'
        SCALE = 'scale', 'Balança'

    unit = models.ForeignKey(
        'inventory.Store', on_delete=models.CASCADE, related_name='devices'
    )
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.TOTEM)
    name = models.CharField(max_length=100, blank=True)
    serial = models.CharField(max_length=64, unique=True)

    api_key = models.OneToOneField(
        'inventory.ApiKey', on_delete=models.PROTECT,
        related_name='device', null=True, blank=True
    )

    firmware = models.CharField(max_length=20, blank=True)

    # Hash do catálogo que o device tem em cache local. Se divergir do
    # servidor, o device sabe que precisa ressincronizar — sem isso, ou você
    # baixa o catálogo inteiro toda hora, ou vende com preço desatualizado.
    catalog_hash = models.CharField(max_length=64, blank=True)

    last_seen = models.DateTimeField(null=True, blank=True)
    is_blocked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    HEARTBEAT_TOLERANCIA = timedelta(minutes=15)

    class Meta:
        verbose_name = 'Dispositivo'
        verbose_name_plural = 'Dispositivos'
        indexes = [
            models.Index(fields=['unit', 'kind']),
            models.Index(fields=['last_seen']),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} · {self.name or self.serial}"

    @property
    def is_online(self):
        if not self.last_seen:
            return False
        return timezone.now() - self.last_seen < self.HEARTBEAT_TOLERANCIA

    def touch(self, firmware=None):
        """Registra heartbeat. Totem offline = loja parada = receita zero."""
        self.last_seen = timezone.now()
        campos = ['last_seen']
        if firmware and firmware != self.firmware:
            self.firmware = firmware
            campos.append('firmware')
        self.save(update_fields=campos)
