"""
pos/models.py — a venda no totem.

FLUXO
    escaneia → abre Checkout (aguardando) → exibe QR PIX
    → webhook do provedor → confirma → baixa FIFO → destrava → NFC-e (async)

⚠️ REGRA DE OURO: QUEM CONFIRMA A VENDA É O WEBHOOK, NUNCA O TOTEM.
O frontend do totem roda num corredor de condomínio, sem supervisão, num
equipamento que pode ser aberto com uma chave de fenda. Ele PEDE a venda;
o backend DECIDE. Nada de "o totem avisou que o cliente pagou".

⚠️ SEGUNDA REGRA: NFC-e NUNCA BLOQUEIA A VENDA.
Cliente pagou → baixa estoque → destrava → cupom. A nota sai depois,
assíncrona, com retry. Se a SEFAZ estiver instável (e ela fica), acoplar
os dois fecharia a loja do seu cliente.
"""
from datetime import timedelta

from django.db import models
from django.utils import timezone


class Checkout(models.Model):
    """
    Uma tentativa de compra. Vira `inventory.Sale` só quando o pagamento
    é confirmado — antes disso não existe venda, existe intenção.
    """

    class Status(models.TextChoices):
        AGUARDANDO = 'aguardando', 'Aguardando pagamento'
        PAGO = 'pago', 'Pago'
        EXPIRADO = 'expirado', 'Expirado'
        CANCELADO = 'cancelado', 'Cancelado'
        FALHOU = 'falhou', 'Falhou'

    unit = models.ForeignKey(
        'inventory.Store', on_delete=models.PROTECT, related_name='checkouts'
    )
    device = models.ForeignKey(
        'tenancy.Device', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='checkouts'
    )

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AGUARDANDO)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    # ⚠️ Gerada pelo DEVICE e única por unidade. Se a rede cair depois do
    # POST mas antes da resposta, o totem repete a chamada — sem isto, o
    # cliente veria dois QR Codes para a mesma compra.
    idempotency_key = models.CharField(max_length=64)

    payment_provider = models.CharField(max_length=30, blank=True)
    payment_external_id = models.CharField(max_length=120, blank=True, db_index=True)
    pix_payload = models.TextField(blank=True, help_text="Copia-e-cola do QR.")

    sale = models.OneToOneField(
        'inventory.Sale', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='checkout'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    paid_at = models.DateTimeField(null=True, blank=True)
    erro = models.TextField(blank=True)

    JANELA_PAGAMENTO = timedelta(minutes=10)

    class Meta:
        verbose_name = 'Checkout'
        verbose_name_plural = 'Checkouts'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['unit', 'idempotency_key'], name='uniq_checkout_idem_por_unidade'
            ),
        ]
        indexes = [
            models.Index(fields=['unit', 'status', 'created_at']),
            models.Index(fields=['status', 'expires_at']),
        ]

    def __str__(self):
        return f"Checkout #{self.id} · {self.get_status_display()} · R$ {self.total}"

    @property
    def expirou(self) -> bool:
        return self.status == self.Status.AGUARDANDO and timezone.now() > self.expires_at

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + self.JANELA_PAGAMENTO
        super().save(*args, **kwargs)


class CheckoutItem(models.Model):
    checkout = models.ForeignKey(Checkout, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('inventory.Product', on_delete=models.PROTECT)

    quantity = models.PositiveIntegerField(default=1)

    # Preenchido só em item de balança. A quantidade continua 1 (uma
    # embalagem), e o peso é o que multiplica o preço.
    weight_kg = models.DecimalField(max_digits=8, decimal_places=3, null=True, blank=True)

    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2)

    # ⚠️ Congelado no momento da leitura. Se o produto for reclassificado
    # depois, a nota já emitida continua coerente com o que foi vendido.
    ncm_at_time = models.CharField(max_length=8, blank=True)

    class Meta:
        verbose_name = 'Item do checkout'
        verbose_name_plural = 'Itens do checkout'

    def __str__(self):
        return f"{self.quantity}× {self.product.name}"


class UnlockLog(models.Model):
    """
    Registro de cada abertura de trava.

    Sem isto não há como investigar divergência de inventário: você sabe
    que sumiram 3 refrigerantes, mas não sabe em qual abertura. É o dado
    que separa furto de erro de baixa.
    """

    class Motivo(models.TextChoices):
        VENDA = 'venda', 'Venda paga'
        REPOSICAO = 'reposicao', 'Reposição'
        MANUTENCAO = 'manutencao', 'Manutenção'
        MANUAL = 'manual', 'Abertura manual do operador'

    device = models.ForeignKey('tenancy.Device', on_delete=models.CASCADE, related_name='unlocks')
    checkout = models.ForeignKey(
        Checkout, on_delete=models.SET_NULL, null=True, blank=True, related_name='unlocks'
    )
    motivo = models.CharField(max_length=20, choices=Motivo.choices, default=Motivo.VENDA)
    autorizado_por = models.ForeignKey(
        'inventory.CustomUser', on_delete=models.SET_NULL, null=True, blank=True
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    released_at = models.DateTimeField(null=True, blank=True)

    # ⚠️ O relé desliga sozinho após este tempo, mesmo que o processo do
    # totem morra. Sem watchdog, um crash deixa a geladeira aberta.
    timeout_segundos = models.PositiveSmallIntegerField(default=30)

    class Meta:
        verbose_name = 'Abertura de trava'
        verbose_name_plural = 'Aberturas de trava'
        ordering = ['-granted_at']
        indexes = [models.Index(fields=['device', 'granted_at'])]

    def __str__(self):
        return f"{self.device} · {self.get_motivo_display()} · {self.granted_at:%d/%m %H:%M}"
