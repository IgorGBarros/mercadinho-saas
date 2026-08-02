# backend/core/inventory/models.py
import hashlib
import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin

# Firebase (opcional, com try/except para evitar crash se não instalado)
try:
    from firebase_admin import auth
except ImportError:
    auth = None


# ==========================================
# 0. USUÁRIO CUSTOMIZADO (AUTH) - DEVE VIR PRIMEIRO
# ==========================================

class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("O usuário deve ter um email")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, password, **extra_fields)
    
    def create_user_with_firebase(self, firebase_token, **extra_fields):
        if not auth:
            raise ValueError("Firebase Admin SDK não está instalado")
        try:
            decoded_token = auth.verify_id_token(firebase_token)
            email = decoded_token.get('email')
            name = decoded_token.get('name') or decoded_token.get('uid')
            
            user, created = self.get_or_create(
                email=email, 
                defaults={'name': name, **extra_fields}
            )
            if created:
                user.set_unusable_password()
                user.save(using=self._db)
            return user
        except Exception as e:
            raise ValueError(f"Erro ao verificar o token do Firebase: {e}")


class CustomUser(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    is_superuser = models.BooleanField(default=False)
    
    objects = CustomUserManager()
    
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']
    
    def __str__(self):
        return self.email


# ==========================================
# 1. CAMADA PÚBLICA (CATÁLOGO GLOBAL)
# ==========================================

class Product(models.Model):
    """Catálogo global de produtos - alimentado por scrapers"""
    name = models.CharField(max_length=255, verbose_name="Nome do Produto")
    brand = models.CharField(max_length=100, null=True, blank=True, verbose_name="Marca")
    
    # Identificadores únicos
    bar_code = models.CharField(max_length=50, unique=True, null=True, blank=True, verbose_name="Código de Barras")
    natura_sku = models.CharField(max_length=50, unique=True, null=True, blank=True, verbose_name="SKU Natura")
    
    # Detalhes do produto
    category = models.CharField(max_length=100, default="Geral")
    description = models.TextField(null=True, blank=True)
    image_url = models.URLField(max_length=500, null=True, blank=True)
    min_quantity = models.PositiveIntegerField(default=5)
    
    # Preço oficial de referência
    official_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, verbose_name="Preço Site")
    
    # Controle do scraper
    last_checked_price = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    last_checked_at = models.DateTimeField(null=True, blank=True, verbose_name="Última Checagem de Preço")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Produto'
        verbose_name_plural = 'Produtos'
        indexes = [
            models.Index(fields=['bar_code']),
            models.Index(fields=['natura_sku']),
            models.Index(fields=['category']),
        ]

    def __str__(self):
        return self.name


class PriceHistory(models.Model):
    """Histórico de preços coletados pelo scraper"""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="price_history")
    price = models.DecimalField(max_digits=10, decimal_places=2, verbose_name="Preço Coletado")
    captured_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-captured_at']
        verbose_name = 'Histórico de Preço'
        verbose_name_plural = 'Históricos de Preço'

    def __str__(self):
        return f"{self.product.name}: R$ {self.price} em {self.captured_at.strftime('%d/%m/%Y')}"


class CrawlerLog(models.Model):
    """Log de execuções do scraper"""
    sku = models.CharField(max_length=50, db_index=True)
    status_code = models.IntegerField(null=True, blank=True)
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    retry_count = models.IntegerField(default=0)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Log do Crawler'
        verbose_name_plural = 'Logs do Crawler'

    def __str__(self):
        return f"Erro SKU {self.sku}: {self.error_message}"


# ==========================================
# 2. CAMADA PRIVADA (DADOS DA CONSULTORA)
# ==========================================

class Store(models.Model):
    """Loja/Perfil da consultora"""
    name = models.CharField(max_length=255, default='Minha Loja Natura')
    slug = models.SlugField(unique=True, blank=True, max_length=120)
    whatsapp = models.CharField(max_length=20, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Relacionamento com usuário
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='store',
        null=True,
        blank=True
    )

    PLAN_CHOICES = [('free', 'Free'), ('pro', 'Pro')]
    plan = models.CharField(
        max_length=20,
        choices=PLAN_CHOICES,
        default='free',
        help_text="Plano de assinatura da loja"
    )

    # Dados de pagamento/assinatura
    payment_provider = models.CharField(max_length=50, blank=True, null=True)
    payment_external_id = models.CharField(max_length=100, blank=True, null=True)
    subscription_started_at = models.DateTimeField(blank=True, null=True)
    subscription_expires_at = models.DateTimeField(blank=True, null=True)

    # 🎁 Período de teste: 14 dias com acesso completo, sem pedir cartão.
    # Preenchidos automaticamente na criação da loja (ver signals.py).
    trial_started_at = models.DateTimeField(blank=True, null=True)
    trial_ends_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        verbose_name = 'Loja'
        verbose_name_plural = 'Lojas'
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['owner', 'plan']),
        ]

    def save(self, *args, **kwargs):
        if not self.slug:
            base_slug = slugify(self.name)
            slug = base_slug
            counter = 1
            while Store.objects.filter(slug=slug).exists():
                slug = f"{base_slug}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    @property
    def product_count(self):
        """Contagem de produtos únicos da loja"""
        return self.items.values('product').distinct().count()
    
    @property
    def plan_config(self):
        """
        Configuração do plano em vigor.

        Durante o teste devolvemos a config do PRO. Assim TODO o sistema
        (recursos liberados, limite de produtos, feature gates, /profile/,
        os 403 do servidor) respeita o trial automaticamente, sem precisar
        tratar o caso em cada lugar que consulta o plano.
        """
        tipo = 'pro' if (self.plan == 'pro' or self.is_in_trial) else self.plan
        return PlanConfig.objects.filter(plan_type=tipo).first()

    @property
    def is_in_trial(self):
        """Está no período de teste (e ainda não assinou)."""
        if self.plan == 'pro':
            return False
        if not self.trial_ends_at:
            return False
        return timezone.now() < self.trial_ends_at

    @property
    def trial_days_left(self):
        """Dias inteiros restantes de teste. 0 se acabou ou não há trial."""
        if not self.trial_ends_at:
            return 0
        restante = self.trial_ends_at - timezone.now()
        if restante.total_seconds() <= 0:
            return 0
        return restante.days + (1 if restante.seconds > 0 else 0)

    @property
    def trial_expired(self):
        """Teve teste e ele terminou, sem assinatura ativa."""
        if self.plan == 'pro':
            return False
        return bool(self.trial_ends_at) and timezone.now() >= self.trial_ends_at

    @property
    def has_pro_access(self):
        """Pode usar os recursos completos (assinante OU em teste)."""
        return self.plan == 'pro' or self.is_in_trial

    @property
    def access_status(self):
        """Situação de acesso, para o frontend decidir o que mostrar."""
        if self.plan == 'pro':
            return 'subscribed'
        if self.is_in_trial:
            return 'trial'
        if self.trial_expired:
            return 'trial_expired'
        return 'no_trial'
    
    @property
    def can_add_products(self):
        """Verifica se a loja pode adicionar mais produtos"""
        if self.has_pro_access:
            return True
        current_count = self.items.count()
        plan_config = self.plan_config
        max_products = plan_config.max_products if plan_config else 20
        return current_count < max_products
    
    def get_plan_limits(self):
        """Retorna informações completas de limites do plano"""
        config = self.plan_config
        current_count = self.product_count
        
        if config and config.max_products:
            return {
                'current_count': current_count,
                'limit': config.max_products,
                'can_add': current_count < config.max_products,
                'remaining': config.max_products - current_count,
                'percentage_used': (current_count / config.max_products) * 100
            }
        return {
            'current_count': current_count,
            'limit': None,
            'can_add': True,
            'remaining': None,
            'percentage_used': 0
        }
    
    @property
    def products_limit_reached(self):
        return not self.can_add_products
    
    @property
    def can_use_feature(self):
        """Retorna dict com recursos disponíveis pelo plano"""
        config = self.plan_config
        if not config:
            return {
                'scanner': True, 'storefront': False, 'alerts': False,
                'ai_assistant': False, 'analytics': False
            }
        return {
            'scanner': config.can_use_scanner,
            'storefront': config.can_use_storefront,
            'alerts': config.can_use_alerts,
            'ai_assistant': config.can_use_ai_assistant,
            'analytics': config.can_use_analytics
        }
    
    @property
    def subscription_status(self):
        if not self.subscription_expires_at:
            return 'active' if self.plan == 'pro' else 'free'
        if timezone.now() > self.subscription_expires_at:
            return 'expired'
        return 'active'
    
    @property
    def days_until_expiry(self):
        if not self.subscription_expires_at:
            return None
        delta = self.subscription_expires_at - timezone.now()
        return max(0, delta.days)
    
    def upgrade_to_pro(self, billing_cycle='monthly'):
        self.plan = 'pro'
        self.subscription_started_at = timezone.now()
        if billing_cycle == 'yearly':
            self.subscription_expires_at = timezone.now() + timezone.timedelta(days=365)
        else:
            self.subscription_expires_at = None
        self.save()
    
    def downgrade_to_free(self):
        self.plan = 'free'
        self.subscription_expires_at = None
        self.payment_provider = None
        self.payment_external_id = None
        self.save()
    
    def get_active_promotions(self):
        """Retorna promoções ativas para esta loja"""
        active_promotions = []
        now = timezone.now()
        
        for promo in Promotion.objects.filter(is_active=True):
            if now < promo.starts_at or (promo.ends_at and now > promo.ends_at):
                continue
            if promo.target_audience == 'free' and self.plan != 'free':
                continue
            if promo.target_audience == 'pro' and self.plan != 'pro':
                continue
            if promo.target_audience == 'new_stores':
                if (now - self.created_at).days > 7:
                    continue
            
            active_promotions.append({
                'id': str(promo.id),
                'title': promo.title,
                'message': promo.message,
                'discount_percent': promo.discount_percent
            })
        
        return active_promotions

    def __str__(self):
        return f"{self.name} ({self.owner.email if self.owner else 'Sem dono'})"


class InventoryItem(models.Model):
    """Vínculo entre Loja e Produto Global - define preços e estoque da consultora"""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    
    # Preços personalizados
    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, verbose_name="Custo Médio")
    sale_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00, verbose_name="Preço Venda")
    
    # Estoque consolidado
    total_quantity = models.IntegerField(default=0)
    min_quantity = models.IntegerField(default=5)
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('store', 'product')
        verbose_name = 'Item de Estoque'
        verbose_name_plural = 'Itens de Estoque'
        indexes = [
            models.Index(fields=['store', 'total_quantity']),
            models.Index(fields=['product', 'sale_price']),
        ]

    def __str__(self):
        return f"{self.product.name} ({self.total_quantity})"


class InventoryBatch(models.Model):
    """Lotes físicos com validade e quantidade específica"""
    item = models.ForeignKey(InventoryItem, on_delete=models.CASCADE, related_name="batches")
    quantity = models.IntegerField()
    batch_code = models.CharField(max_length=50, blank=True, null=True, verbose_name="Lote")
    expiration_date = models.DateField(null=True, blank=True, verbose_name="Validade")
    entry_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Lote'
        verbose_name_plural = 'Lotes'
        indexes = [
            models.Index(fields=['expiration_date']),
            models.Index(fields=['item', 'quantity']),
        ]

    def __str__(self):
        return f"Lote {self.batch_code} - Val: {self.expiration_date}"


# ==========================================
# 3. CAMADA DE SAÍDA (VENDAS E MOVIMENTAÇÕES)
# ==========================================

class Sale(models.Model):
    SALE_TYPES = [
        ('VENDA', 'Venda'),
        ('PRESENTE', 'Presente Pessoal'),
        ('BRINDE', 'Brinde Cliente'),
        ('PERDA', 'Perda/Avaria'),
        ('USO_PROPRIO', 'Uso Próprio')
    ]

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name="sales")
    transaction_type = models.CharField(max_length=20, choices=SALE_TYPES, default='VENDA')
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    client_name = models.CharField(max_length=100, blank=True, null=True)
    payment_method = models.CharField(max_length=50, default="DINHEIRO", blank=True)
    notes = models.TextField(blank=True, null=True, verbose_name="Observações")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Venda'
        verbose_name_plural = 'Vendas'
        ordering = ['-created_at']

    def __str__(self):
        return f"#{self.id} - {self.transaction_type} - R$ {self.total_amount}"


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    batch = models.ForeignKey(InventoryBatch, on_delete=models.SET_NULL, null=True, blank=True)
    quantity = models.IntegerField()
    unit_price_sold = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost_at_time = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    class Meta:
        verbose_name = 'Item de Venda'
        verbose_name_plural = 'Itens de Venda'


class StockTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('ENTRADA', 'Entrada de Estoque'),
        ('VENDA', 'Saída por Venda'),
        ('PRESENTE', 'Saída para Presente'),
        ('BRINDE', 'Saída para Brinde'),
        ('USO_PROPRIO', 'Uso Próprio'),
        ('PERDA', 'Perda / Avaria'),
        ('AJUSTE', 'Ajuste Manual'),
    ]

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name="transactions")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    batch = models.ForeignKey(InventoryBatch, on_delete=models.SET_NULL, null=True, blank=True)
    transaction_type = models.CharField(max_length=20, choices=TRANSACTION_TYPES)
    quantity = models.IntegerField()  # Positivo = Entrada, Negativo = Saída
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Transação de Estoque'
        verbose_name_plural = 'Transações de Estoque'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['store', 'transaction_type', 'created_at']),
            models.Index(fields=['product', 'created_at']),
        ]

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.product.name} ({self.quantity})"


# ==========================================
# 4. SESSÕES E CONFIGURAÇÕES
# ==========================================

class RegistrationSession(models.Model):
    """Sessão de cadastro de produtos"""
    store = models.ForeignKey(Store, on_delete=models.CASCADE)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    # Contadores
    products_count = models.PositiveIntegerField(default=0)
    total_estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    # Dados de pagamento
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    total_paid = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    installments = models.PositiveIntegerField(default=1)

    class Meta:
        verbose_name = "Sessão de Cadastro"
        verbose_name_plural = "Sessões de Cadastro"
        ordering = ['-started_at']

    @property
    def duration_minutes(self):
        end = self.finished_at or timezone.now()
        return (end - self.started_at).total_seconds() / 60
    
    def add_product(self, inventory_item, quantity=1):
        self.products_count += quantity
        cost_per_unit = inventory_item.cost_price or inventory_item.product.official_price or 0
        self.total_estimated_cost += cost_per_unit * quantity
        self.save()
    
    def finish_session(self):
        self.is_active = False
        self.finished_at = timezone.now()
        self.save()
        return self
    
    def __str__(self):
        return f"Sessão {self.id} - {self.store.name} ({self.products_count} produtos)"


class PlanConfig(models.Model):
    """Configuração dinâmica de planos"""
    PLAN_CHOICES = [('free', 'Free'), ('pro', 'Pro'), ('premium', 'Premium')]
    
    plan_type = models.CharField(max_length=20, choices=PLAN_CHOICES, unique=True)
    display_name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    
    # Limites
    max_products = models.IntegerField(null=True, blank=True, help_text="NULL = ilimitado")
    max_storage_mb = models.IntegerField(default=100)
    
    # Recursos
    can_use_scanner = models.BooleanField(default=True)
    can_use_storefront = models.BooleanField(default=False)
    can_use_alerts = models.BooleanField(default=False)
    can_use_ai_assistant = models.BooleanField(default=False)
    can_use_analytics = models.BooleanField(default=False)
    can_export_data = models.BooleanField(default=False)
    can_use_api = models.BooleanField(default=False)
    
    # Preços
    monthly_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    yearly_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    yearly_discount_percent = models.IntegerField(
        default=0, validators=[MinValueValidator(0), MaxValueValidator(100)]
    )
    
    # UI
    highlight_color = models.CharField(max_length=7, default='#3B82F6')
    is_popular = models.BooleanField(default=False)
    is_visible = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'plan_configs'
        ordering = ['sort_order', 'plan_type']
        verbose_name = 'Configuração de Plano'
        verbose_name_plural = 'Configurações de Planos'
        
    def __str__(self):
        return f"{self.display_name} (R$ {self.monthly_price}/mês)"
    
    @property
    def yearly_price_monthly(self):
        return self.yearly_price / 12 if self.yearly_price > 0 else self.monthly_price
    
    @property
    def yearly_savings(self):
        if self.yearly_price > 0 and self.monthly_price > 0:
            return (self.monthly_price * 12) - self.yearly_price
        return Decimal('0.00')


class Promotion(models.Model):
    """Promoções e banners configuráveis"""
    TARGET_CHOICES = [
        ('all', 'Todos os usuários'),
        ('free', 'Apenas plano Free'),
        ('pro', 'Apenas plano Pro'),
        ('new_users', 'Usuários novos (< 7 dias)'),
        ('inactive', 'Usuários inativos (> 30 dias)'),
    ]
    TYPE_CHOICES = [
        ('banner', 'Banner'), ('modal', 'Modal'),
        ('notification', 'Notificação'), ('email', 'Email'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=100)
    message = models.TextField()
    
    promotion_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='banner')
    target_audience = models.CharField(max_length=20, choices=TARGET_CHOICES, default='free')

    # 🎯 Alvo por consultora específica — além do segmento amplo acima
    # (target_audience). Quando preenchido, a promoção só aparece pras
    # lojas selecionadas aqui, IGNORANDO target_audience (é mais específico
    # e vence). Vazio = mantém o comportamento de sempre (segmento amplo).
    target_stores = models.ManyToManyField(Store, blank=True, related_name='targeted_promotions')
    
    discount_percent = models.IntegerField(default=0, validators=[MinValueValidator(0), MaxValueValidator(100)])
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    
    is_active = models.BooleanField(default=True)
    max_views = models.IntegerField(null=True, blank=True)
    current_views = models.IntegerField(default=0)
    
    background_color = models.CharField(max_length=7, default='#3B82F6')
    text_color = models.CharField(max_length=7, default='#FFFFFF')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'promotions'
        ordering = ['-created_at']
        verbose_name = 'Promoção'
        verbose_name_plural = 'Promoções'
        
    def __str__(self):
        return self.title
        
    def is_valid_for_store(self, store):
        now = timezone.now()
        if not self.is_active or now < self.starts_at or (self.ends_at and now > self.ends_at):
            return False
        if self.target_audience == 'free' and store.plan != 'free':
            return False
        if self.target_audience == 'pro' and store.plan != 'pro':
            return False
        if self.target_audience == 'new_stores' and (now - store.created_at).days > 7:
            return False
        return True
        
    @property
    def is_valid(self):
        now = timezone.now()
        if not self.is_active or now < self.starts_at or (self.ends_at and now > self.ends_at):
            return False
        if self.max_views and self.current_views >= self.max_views:
            return False
        return True


class UserPlanCache(models.Model):
    """Cache de limites por usuário para performance"""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, 
        related_name='plan_cache'
    )
    
    current_plan = models.CharField(max_length=20, default='free')
    max_products = models.IntegerField(null=True, blank=True)
    products_used = models.IntegerField(default=0)
    
    can_use_scanner = models.BooleanField(default=True)
    can_use_storefront = models.BooleanField(default=False)
    can_use_alerts = models.BooleanField(default=False)
    can_use_ai_assistant = models.BooleanField(default=False)
    can_use_analytics = models.BooleanField(default=False)
    
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_plan_cache'
        verbose_name = 'Cache de Plano'
        verbose_name_plural = 'Cache de Planos'
        
    def __str__(self):
        return f"{self.user.email} - {self.current_plan}"
    
    def refresh_from_store(self):
        try:
            store = self.user.store
            self.current_plan = store.plan
            plan_config = PlanConfig.objects.filter(plan_type=store.plan).first()
            if plan_config:
                self.max_products = plan_config.max_products
                self.can_use_scanner = plan_config.can_use_scanner
                self.can_use_storefront = plan_config.can_use_storefront
                self.can_use_alerts = plan_config.can_use_alerts
                self.can_use_ai_assistant = plan_config.can_use_ai_assistant
                self.can_use_analytics = plan_config.can_use_analytics
            if hasattr(store, 'items'):
                self.products_used = store.items.count()
            self.save()
        except:
            pass


# ==========================================
# 5. ANALYTICS E LGPD (DADOS AGREGADOS)
# ==========================================

class UserBehaviorLog(models.Model):
    """Log comportamental agregado - LGPD compliant"""
    ACTION_TYPES = [
        ('product_scan', 'Produto Escaneado'),
        ('product_add', 'Produto Adicionado'),
        ('product_edit', 'Produto Editado'),
        ('stock_update', 'Estoque Atualizado'),
        ('sale_record', 'Venda Registrada'),
        ('report_view', 'Relatório Visualizado'),
        ('storefront_access', 'Vitrine Acessada'),
        ('plan_view', 'Página de Planos Visualizada'),
    ]
    
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='behavior_logs')
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    
    # Dados contextuais (não pessoais)
    plan_at_time = models.CharField(max_length=10)
    products_count_at_time = models.IntegerField()
    day_of_week = models.IntegerField()  # 0-6
    hour_of_day = models.IntegerField()  # 0-23
    
    # Metadados para ML
    session_duration_minutes = models.IntegerField(null=True, blank=True)
    feature_used = models.CharField(max_length=50, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'user_behavior_logs'
        indexes = [
            models.Index(fields=['action_type', 'plan_at_time']),
            models.Index(fields=['created_at']),
            models.Index(fields=['store', 'action_type']),
        ]
        
    def __str__(self):
        return f"{self.action_type} - {self.plan_at_time} - {self.created_at.date()}"


class MLInsight(models.Model):
    """Insights gerados por Machine Learning - dados agregados"""
    INSIGHT_TYPES = [
        ('conversion_prediction', 'Predição de Conversão'),
        ('churn_risk', 'Risco de Churn'),
        ('product_recommendation', 'Recomendação de Produto'),
        ('optimal_pricing', 'Precificação Otimizada'),
        ('seasonal_trend', 'Tendência Sazonal'),
    ]
    
    insight_type = models.CharField(max_length=30, choices=INSIGHT_TYPES)
    target_segment = models.CharField(max_length=50)  # Dados agregados, não individuais
    
    confidence_score = models.FloatField()  # 0.0 - 1.0
    insight_data = models.JSONField()
    
    model_version = models.CharField(max_length=20, default='v1.0')
    training_data_size = models.IntegerField()
    generated_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'ml_insights'
        indexes = [
            models.Index(fields=['insight_type', 'target_segment']),
            models.Index(fields=['generated_at']),
        ]
        
    def __str__(self):
        return f"{self.get_insight_type_display()} - {self.target_segment} ({self.confidence_score:.2f})"


class ExternalBarcodeCatalog(models.Model):
    """Catálogo externo de códigos de barras para enriquecimento"""
    brand = models.CharField(max_length=100, db_index=True)
    gtin = models.CharField(max_length=14, unique=True, db_index=True)
    description = models.CharField(max_length=255)
    source = models.CharField(max_length=50, default='bluesoft')
    source_url = models.URLField(null=True, blank=True)
    matched = models.BooleanField(default=False, db_index=True)
    
    # Rastreamento de busca
    searched_product_sku = models.CharField(max_length=50, null=True, blank=True, db_index=True)
    searched_product_name = models.CharField(max_length=255, null=True, blank=True)
    search_term_used = models.CharField(max_length=255, null=True, blank=True)
    confidence_level = models.CharField(max_length=20, null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'external_barcode_catalog'
        indexes = [
            models.Index(fields=['brand', 'matched']),
            models.Index(fields=['source', 'created_at']),
            models.Index(fields=['searched_product_sku']),
        ]
    
    def __str__(self):
        return f"{self.brand} - {self.gtin} - {self.description[:50]}"


# ==========================================
# 6. CONFIGURAÇÕES GLOBAIS E API
# ==========================================

class ThemeConfig(models.Model):
    """Singleton - Configuração global de tema/cores"""
    # Cores principais
    color_primary = models.CharField(max_length=7, default="#871745")
    color_primary_light = models.CharField(max_length=7, default="#FDF2F7")
    color_success = models.CharField(max_length=7, default="#2E8B57")
    color_text = models.CharField(max_length=7, default="#2D292E")
    
    # Cores secundárias
    color_accent = models.CharField(max_length=7, default="#A91B60")
    color_destructive = models.CharField(max_length=7, default="#DC2626")
    color_warning = models.CharField(max_length=7, default="#F59E0B")
    color_background = models.CharField(max_length=7, default="#FFFFFF")
    color_card = models.CharField(max_length=7, default="#FFFFFF")
    color_border = models.CharField(max_length=7, default="#E5E7EB")
    
    # Metadados
    app_name = models.CharField(max_length=100, default="Minha Amora")
    logo_url = models.URLField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração de Tema"
        verbose_name_plural = "Configuração de Tema"
    
    def __str__(self):
        return f"Tema — {self.app_name}"
    
    def save(self, *args, **kwargs):
        """Garante singleton: apenas 1 registro"""
        self.pk = 1
        super().save(*args, **kwargs)
    
    @classmethod
    def load(cls):
        """Carrega ou cria a configuração padrão"""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ApiKey(models.Model):
    """Chave de API para acesso comercial"""
    PLAN_CHOICES = [('starter', 'Starter'), ('pro', 'Pro'), ('enterprise', 'Enterprise')]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, help_text="Nome descritivo da chave")
    key = models.CharField(max_length=64, unique=True, editable=False)
    
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='api_keys',
        null=True,
        blank=True,
        help_text="Usuário dono da chave (opcional para clientes externos)"
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name='api_keys',
        null=True,
        blank=True,
        help_text="Loja associada (para consultoras)"
    )
    # ⚠️ Adicionado junto com a fundação do produto de API (apps/developers):
    # chave emitida pra um desenvolvedor de verdade, não uma loja disfarçada
    # de "cliente de API" — antes o admin-panel simulava chaves a partir de
    # lojas com vitrine ativa, sem nenhuma chave real ter sido emitida.
   
    
    plan = models.CharField(max_length=20, choices=PLAN_CHOICES, default='starter')
    scopes = models.JSONField(default=list, help_text="Lista de scopes permitidos")
    
    rate_limit = models.IntegerField(default=20, help_text="Requisições por minuto")
    monthly_quota = models.IntegerField(default=1000, help_text="Requisições por mês")
    
    is_active = models.BooleanField(default=True)
    last_used = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True, help_text="Expiração da chave")

    class Meta:
        db_table = 'api_keys'
        indexes = [
            models.Index(fields=['key']),
            models.Index(fields=['owner', 'is_active']),
            models.Index(fields=['store', 'plan']),
        ]
    
    def save(self, *args, **kwargs):
        if not self.key:
            import secrets
            prefix = 'pk_live_' if self.plan != 'starter' else 'pk_test_'
            self.key = prefix + secrets.token_urlsafe(32)
        super().save(*args, **kwargs)
    
    def check_quota(self):
        """
        Verifica se a cota mensal foi excedida — conta requisições reais
        registradas em ApiUsageLog neste mês. Antes disto, era só um
        comentário "Implementar lógica real", sempre retornava True.
        """
        from django.utils import timezone
        inicio_mes = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        usadas = self.usage_logs.filter(created_at__gte=inicio_mes).count()
        return usadas < self.monthly_quota
    
    def __str__(self):
        return f"{self.name} ({self.key[:16]}•••) - {self.plan}"


class ApiUsageLog(models.Model):
    """Log de uso da API para billing e analytics"""
    api_key = models.ForeignKey(ApiKey, on_delete=models.CASCADE, related_name='usage_logs')
    endpoint = models.CharField(max_length=100)
    method = models.CharField(max_length=10)
    status_code = models.IntegerField()
    response_time_ms = models.IntegerField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'api_usage_logs'
        indexes = [
            models.Index(fields=['api_key', 'created_at']),
            models.Index(fields=['endpoint', 'status_code']),
        ]


# ==========================================
# 7. MODELO LGPD: CONSENTIMENTO
# ==========================================

class ConsentRecord(models.Model):
    """
    Registro de consentimento LGPD (Art. 8º)
    Armazena manifestação de vontade com versionamento e suporte a anônimos.
    """
    PURPOSE_CHOICES = [
        ('essential', 'Funcionamento essencial do sistema'),
        ('authentication', 'Autenticação e gestão de conta'),
        ('service_delivery', 'Entrega do serviço contratado'),
        ('legal_compliance', 'Conformidade legal/fiscal'),
        ('analytics', 'Analytics de uso e melhorias'),
        ('marketing', 'Marketing e comunicações promocionais'),
        ('behavior_tracking', 'Captura de comportamento para IA'),
        ('ai_features', 'Recursos de IA/Amorinha'),
        ('ai_training', 'Uso de dados de estoque e vendas para treinamento de modelos de IA'),
        # ⚠️ ENCAIXE PARA LGPD (API comercial, Fase 3 do produto de dados):
        # cobre a loja entrar em agregados de inteligência de mercado
        # (vendas por marca/época) vendidos a terceiros via API. Só o TIPO
        # existe por enquanto — nenhuma query hoje checa esse consentimento,
        # porque o endpoint que venderia esse dado ainda não existe. Quando
        # a Fase 3 for construída, cada agregação precisa filtrar por
        # has_consent_for_purpose(loja.owner, 'data_commercialization')
        # antes de incluir a loja no cálculo.
        ('data_commercialization', 'Uso de dados agregados e anonimizados de vendas em produtos comerciais vendidos a terceiros'),
    ]

    # Identificação do titular
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='consent_records',
        help_text="Usuário autenticado (nulo para pré-cadastro/anônimos)"
    )
    email = models.EmailField(db_index=True, blank=True, help_text="Email do titular")
    session_id = models.CharField(max_length=100, blank=True, help_text="ID da sessão para anônimos")

    # Dados do consentimento (anonimizados quando possível)
    ip_hash = models.CharField(max_length=64, db_index=True, help_text="Hash SHA-256 do IP")
    purpose_flags = models.JSONField(default=list, help_text="Finalidades consentidas")
    term_version = models.CharField(max_length=20, db_index=True, help_text="Versão do termo")
    accepted_at = models.DateTimeField(db_index=True, help_text="Data da manifestação")
    revoked_at = models.DateTimeField(null=True, blank=True, help_text="Data da revogação")
    user_agent = models.TextField(blank=True, help_text="User-Agent (truncado no serializer)")

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-accepted_at']
        verbose_name = 'Registro de Consentimento LGPD'
        verbose_name_plural = 'Registros de Consentimento LGPD'
        indexes = [
            models.Index(fields=['email', 'term_version']),
            models.Index(fields=['user', 'purpose_flags']),
            models.Index(fields=['term_version', 'accepted_at']),
        ]

    def __str__(self):
        identifier = self.user.email if self.user else self.email
        status = 'Revogado' if self.revoked_at else 'Ativo'
        return f"[{status}] {identifier} • v{self.term_version}"

    def is_active(self):
        return self.revoked_at is None

    def revoke(self, purpose: str | None = None):
        """Revoga consentimento total ou por finalidade específica"""
        if purpose and purpose in self.purpose_flags:
            self.purpose_flags = [p for p in self.purpose_flags if p != purpose]
            if not self.purpose_flags:
                self.revoked_at = timezone.now()
        else:
            self.revoked_at = timezone.now()
        self.save(update_fields=['purpose_flags', 'revoked_at', 'updated_at'])

    @classmethod
    def hash_ip(cls, ip_address: str, salt: str | None = None) -> str:
        """Gera hash SHA-256 do IP + salt para anonimização (LGPD Art. 12)"""
        if salt is None:
            salt = getattr(settings, 'LGPD_IP_SALT', '')
        return hashlib.sha256(f"{ip_address}{salt}".encode()).hexdigest()

    @classmethod
    def get_latest_active(cls, user_or_email, version: str):
        """Retorna o consentimento ativo mais recente para um titular e versão"""
        lookup = {'user': user_or_email} if hasattr(user_or_email, 'id') else {'email': user_or_email}
        return cls.objects.filter(
            **lookup,
            term_version=version,
            revoked_at__isnull=True
        ).order_by('-accepted_at').first()

class ProcessedPaymentEvent(models.Model):
    """
    Registro de cobranças já processadas pelo webhook de pagamento.

    Existe por dois motivos, ambos documentados pelo Asaas:

    1. Os webhooks são entregues "at least once" — o mesmo evento pode chegar
       repetido. Sem este controle, cada reentrega somaria mais 30 dias de
       assinatura à loja.
    2. Uma mesma cobrança dispara eventos em sequência (cartão:
       PAYMENT_CONFIRMED e, ~32 dias depois, PAYMENT_RECEIVED). Como tratamos
       os dois para liberar o PRO na hora do pagamento, precisamos garantir
       que a MESMA cobrança seja contabilizada uma vez só.

    A chave é o id da cobrança no Asaas (`payment.id`), único por cobrança.
    """
    payment_id = models.CharField(
        max_length=100, unique=True, db_index=True,
        help_text="ID da cobrança no Asaas (ex.: pay_080225913252)"
    )
    store = models.ForeignKey(
        Store, on_delete=models.CASCADE, related_name='processed_payments',
        null=True, blank=True,
        help_text="Preenchido só pra pagamento de assinatura de consultora (PRO)."
    )
    # 💰 Fase 4 — mesma tabela de idempotência, agora também usada pelas
    # assinaturas de API dos desenvolvedores. Exatamente um dos dois
   
    event = models.CharField(max_length=50, blank=True)
    days_granted = models.IntegerField(default=0)
    processed_at = models.DateTimeField(auto_now_add=True)

    # 💰 O valor realmente pago (payment.value do payload) e a forma de
    # pagamento — o webhook sempre trouxe isso, mas era descartado depois de
    # calcular quantos dias liberar. Sem isso, o admin não tinha como saber
    # a receita REAL da plataforma (assinaturas pagas de verdade), só uma
    # estimativa baseada em quem está com plan='pro' hoje.
    value = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    billing_type = models.CharField(max_length=20, blank=True)  # PIX, CREDIT_CARD, BOLETO...

    class Meta:
        verbose_name = "Cobrança processada"
        verbose_name_plural = "Cobranças processadas"
        ordering = ['-processed_at']

    def __str__(self):
        alvo = f"loja {self.store_id}" if self.store_id else f"dev {self.developer_id}"
        return f"{self.payment_id} → {alvo} (+{self.days_granted}d)"

# ==========================================
# 📇 CRM DA VITRINE (leads e carrinhos)
# ==========================================
# O frontend (lib/leads.ts, lib/cart.ts, CheckoutModal, CRM.tsx) já estava
# pronto e esperando estes modelos — só faltava o backend. É o "CRM
# invisível": quando um cliente da vitrine finaliza um pedido pela primeira
# vez na sessão, um modal leve pede nome e WhatsApp antes de abrir a
# conversa. Isso vira um Lead automaticamente, sem exigir cadastro nem
# login do cliente final.
#
# Importante: este é o relacionamento CONSULTORA <-> CLIENTE DELA — B2C, uma
# relação diferente (e sem sobreposição) com o ConsentRecord, que trata do
# consentimento da CONSULTORA com o Minha Amora.

class Lead(models.Model):
    """Cliente capturado através da vitrine (ou lançado manualmente pela consultora)."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='leads')
    name = models.CharField(max_length=200)
    # Guardado só com dígitos — é a chave de deduplicação por loja.
    phone = models.CharField(max_length=20, db_index=True)
    email = models.EmailField(blank=True, null=True)
    # Opcional: ajuda a consultora a personalizar contato (ex.: mensagem de
    # aniversário). Não é exigido para concluir a compra.
    birth_date = models.DateField(blank=True, null=True)
    whatsapp_opt_in = models.BooleanField(default=False)
    source = models.CharField(
        max_length=20, default='storefront',
        choices=[('storefront', 'Vitrine'), ('dashboard', 'Manual')],
    )
    # Consentimento do CLIENTE FINAL para receber mensagens — LGPD, opt-in
    # explícito e desmarcado por padrão no CheckoutModal.
    consent_version = models.CharField(max_length=20, blank=True, null=True)
    consent_timestamp = models.DateTimeField(blank=True, null=True)
    tags = models.JSONField(default=list, blank=True)
    total_orders = models.PositiveIntegerField(default=0)
    total_spent = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    # Direito ao esquecimento (LGPD): quando preenchido, name/phone/email já
    # foram substituídos por placeholders — ver LeadViewSet.anonymize.
    anonymized_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        # Um telefone é um cliente só, por loja — pedidos repetidos
        # atualizam o mesmo Lead em vez de duplicar.
        unique_together = [('store', 'phone')]
        indexes = [models.Index(fields=['store', 'phone'])]
        ordering = ['-last_seen']

    def __str__(self):
        return f"{self.name} ({self.phone}) — loja {self.store_id}"


class Cart(models.Model):
    """Carrinho da vitrine — visitante identificado por sessão, não por login."""
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='storefront_carts')
    session_id = models.CharField(max_length=100, db_index=True)
    # Pode ficar sem lead: nem todo visitante chega a finalizar o pedido.
    lead = models.ForeignKey(Lead, on_delete=models.SET_NULL, null=True, blank=True, related_name='carts')
    checked_out = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # 💳 Forma de pagamento que a CLIENTE escolheu na vitrine antes de mandar
    # a mensagem — é o que ela DECLAROU, não uma confirmação de pagamento
    # (não há integração com o WhatsApp nem com nenhum meio de pagamento
    # ainda, então o sistema não tem como saber se ela pagou de verdade).
    PAGAMENTO_CHOICES = [('pix', 'PIX'), ('cartao', 'Cartão de crédito')]
    payment_method = models.CharField(max_length=10, choices=PAGAMENTO_CHOICES, blank=True, null=True)

    # ✅ Confirmação MANUAL da consultora — ela quem sabe se o dinheiro
    # realmente caiu ou o cartão passou. Começa sempre False.
    payment_confirmed = models.BooleanField(default=False)

    # 📝 A mensagem exata que foi montada e enviada pro WhatsApp da
    # consultora. Registrar isso é o que a consultora pediu: um histórico do
    # que a cliente mandou, mesmo sem integração com a API do WhatsApp para
    # confirmar se a mensagem chegou ou foi lida.
    whatsapp_message = models.TextField(blank=True, null=True)

    class Meta:
        indexes = [models.Index(fields=['store', 'session_id'])]
        ordering = ['-updated_at']


class CartItem(models.Model):
    """Item de um carrinho da vitrine — guarda o preço no momento da compra."""
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name='items')
    # String de propósito: é o id do InventoryItem tal como o frontend manda,
    # sem depender de FK (o item pode ser removido do estoque depois).
    inventory_id = models.CharField(max_length=50)
    product_name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    price_snapshot = models.DecimalField(max_digits=10, decimal_places=2, default=0)

# ==========================================
# ⚙️ CONFIGURAÇÃO GLOBAL DO SISTEMA
# ==========================================
# Antes, "Modo de Manutenção" e "Feature Flags Globais" no admin-panel
# salvavam tudo em localStorage do NAVEGADOR DO PRÓPRIO ADMIN — não mudava
# nada pra ninguém além de quem estava com aquele navegador aberto naquele
# momento. O texto até dizia "usuários veem tela de manutenção ao acessar",
# o que nunca foi verdade: nada no backend sabia que existia manutenção.
# Isto aqui é a peça que faltava — um estado real, compartilhado, que
# qualquer consultora loga e vê de verdade.

class SystemConfig(models.Model):
    """
    Configuração global — linha única (padrão singleton, sempre pk=1).
    Use SystemConfig.get_solo() em vez de instanciar direto.
    """
    maintenance_mode = models.BooleanField(default=False)
    maintenance_message = models.TextField(
        blank=True,
        default="O sistema está em manutenção programada e pode apresentar instabilidade ou "
                "indisponibilidade temporária em algumas funcionalidades. Já estamos de olho — "
                "pode continuar usando normalmente."
    )

    # Feature flags globais — hoje só desligam a interface (ver comentário
    # em cada consumidor). Nome do campo bate com a chave usada no frontend.
    ai_enabled = models.BooleanField(default=True)
    storefront_enabled = models.BooleanField(default=True)
    ocr_enabled = models.BooleanField(default=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Configuração do sistema"
        verbose_name_plural = "Configuração do sistema"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Configuração global do sistema"


class PromotionView(models.Model):
    """
    Uma consultora viu uma promoção específica. É a base real de
    "Visualizações" e "Taxa de Conversão" no admin-panel — antes esses dois
    números eram Math.random() no frontend, recalculados (diferentes!) a
    cada nova renderização da tela.

    Uma linha por (promoção, loja) — visualizações repetidas da MESMA loja
    não inflam a contagem; o que importa é quantas lojas DIFERENTES viram.
    """
    promotion = models.ForeignKey(Promotion, on_delete=models.CASCADE, related_name='views')
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='promotion_views')
    viewed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('promotion', 'store')]
        indexes = [models.Index(fields=['promotion', 'store'])]