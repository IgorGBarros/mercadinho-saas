"""
replenishment/models.py — reposição preditiva.

A diferença comercial entre alerta e reposição:

    alerta      → "acabou o refrigerante"      (você já perdeu venda)
    reposição   → "vai acabar em 2 dias"       (dá tempo de comprar)

A Minha Amora tinha `min_quantity`, que é a primeira coisa. Isto aqui é a
segunda, e é o que diferencia a oferta da AMLabs.

⚠️ TODOS OS DADOS JÁ EXISTEM.
`StockTransaction` tem índice em (store, transaction_type, created_at) —
exatamente a consulta do cálculo de velocidade. Não é preciso nenhuma
tabela de agregação nova para a primeira versão.
"""
from django.db import models
from django.utils import timezone


class ReplenishmentRule(models.Model):
    """
    Parâmetros de reposição por item de estoque.

    Com `is_auto=True` os valores são recalculados a partir da venda real.
    O lojista pode fixar à mão quando conhece algo que o histórico não
    mostra — contrato com o condomínio, sazonalidade de festa junina.
    """

    item = models.OneToOneField(
        'inventory.InventoryItem', on_delete=models.CASCADE, related_name='replenishment'
    )

    min_qty = models.PositiveIntegerField(default=0, verbose_name="Ponto de pedido")
    max_qty = models.PositiveIntegerField(default=0, verbose_name="Nível de recompletamento")

    # Quanto tempo entre pedir e a mercadoria estar na prateleira. É o
    # parâmetro que o lojista mais erra: ele pensa no prazo do fornecedor
    # e esquece que alguém ainda precisa ir até a unidade repor.
    lead_time_days = models.PositiveSmallIntegerField(default=3)

    safety_stock = models.PositiveIntegerField(default=0, verbose_name="Estoque de segurança")
    is_auto = models.BooleanField(default=True, verbose_name="Calcular automaticamente")

    # Cache do último cálculo — evita recomputar na abertura de cada tela.
    venda_media_diaria = models.DecimalField(max_digits=8, decimal_places=3, default=0)
    calculado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Regra de reposição'
        verbose_name_plural = 'Regras de reposição'

    def __str__(self):
        return f"{self.item} · pedir a {self.min_qty}"

    @property
    def dias_de_cobertura(self):
        """Quantos dias o estoque atual aguenta no ritmo de venda atual."""
        if not self.venda_media_diaria:
            return None
        return float(self.item.total_quantity or 0) / float(self.venda_media_diaria)


class Alert(models.Model):
    """
    Os seis alertas que valem dinheiro num mercadinho.

    ⚠️ DEDUPLICADO POR `chave`. Sem isso, o worker rodando de hora em hora
    geraria 24 alertas por dia do mesmo refrigerante em falta — e alerta
    repetido é alerta ignorado. O lojista para de olhar, e aí o sistema
    inteiro perde a utilidade.
    """

    class Tipo(models.TextChoices):
        RUPTURA_PREVISTA = 'ruptura_prevista', 'Vai faltar'
        RUPTURA_ATIVA = 'ruptura_ativa', 'Faltou'
        VALIDADE = 'validade', 'Validade crítica'
        DEAD_STOCK = 'dead_stock', 'Produto parado'
        DIVERGENCIA = 'divergencia', 'Divergência de inventário'
        DEVICE_OFFLINE = 'device_offline', 'Totem offline'

    class Severidade(models.TextChoices):
        INFO = 'info', 'Informativo'
        ATENCAO = 'atencao', 'Atenção'
        URGENTE = 'urgente', 'Urgente'

    unit = models.ForeignKey('inventory.Store', on_delete=models.CASCADE, related_name='alerts')
    tipo = models.CharField(max_length=30, choices=Tipo.choices)
    severidade = models.CharField(max_length=10, choices=Severidade.choices,
                                  default=Severidade.ATENCAO)

    item = models.ForeignKey(
        'inventory.InventoryItem', on_delete=models.CASCADE,
        null=True, blank=True, related_name='alerts'
    )
    device = models.ForeignKey(
        'tenancy.Device', on_delete=models.CASCADE, null=True, blank=True, related_name='alerts'
    )

    titulo = models.CharField(max_length=160)
    detalhe = models.TextField(blank=True)
    dados = models.JSONField(default=dict, blank=True)

    chave = models.CharField(max_length=120, help_text="Identidade do alerta, para deduplicar.")

    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    resolvido_em = models.DateTimeField(null=True, blank=True)
    lido_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Alerta'
        verbose_name_plural = 'Alertas'
        ordering = ['-severidade', '-criado_em']
        constraints = [
            models.UniqueConstraint(
                fields=['unit', 'chave'],
                condition=models.Q(resolvido_em__isnull=True),
                name='uniq_alerta_aberto_por_chave',
            ),
        ]
        indexes = [
            models.Index(fields=['unit', 'resolvido_em', 'severidade']),
            models.Index(fields=['tipo', 'criado_em']),
        ]

    def __str__(self):
        return f"[{self.get_severidade_display()}] {self.titulo}"

    def resolver(self):
        self.resolvido_em = timezone.now()
        self.save(update_fields=['resolvido_em'])


class PickList(models.Model):
    """
    Romaneio de reposição: o que o repositor leva para a unidade.

    Fecha o ciclo sem digitação — ele abre no celular (o app Expo já
    existe), escaneia o que repôs, e cada confirmação vira
    StockTransaction(ENTRADA). Sem isso, a sugestão de compra morre numa
    tela que ninguém abre.
    """

    class Status(models.TextChoices):
        ABERTO = 'aberto', 'Aberto'
        EM_ROTA = 'em_rota', 'Em rota'
        CONCLUIDO = 'concluido', 'Concluído'
        CANCELADO = 'cancelado', 'Cancelado'

    unit = models.ForeignKey('inventory.Store', on_delete=models.CASCADE, related_name='picklists')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ABERTO)
    responsavel = models.ForeignKey(
        'inventory.CustomUser', on_delete=models.SET_NULL, null=True, blank=True
    )
    criado_em = models.DateTimeField(auto_now_add=True)
    concluido_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Romaneio'
        verbose_name_plural = 'Romaneios'
        ordering = ['-criado_em']

    def __str__(self):
        return f"Romaneio #{self.id} · {self.unit.name}"


class PickListItem(models.Model):
    picklist = models.ForeignKey(PickList, on_delete=models.CASCADE, related_name='items')
    item = models.ForeignKey('inventory.InventoryItem', on_delete=models.CASCADE)

    quantidade_sugerida = models.PositiveIntegerField()
    quantidade_reposta = models.PositiveIntegerField(null=True, blank=True)

    # Fotografia do momento da sugestão. Sem isso não dá para avaliar
    # depois se o cálculo estava certo ou se o parâmetro precisa mudar.
    estoque_no_momento = models.PositiveIntegerField(default=0)
    cobertura_dias = models.FloatField(null=True, blank=True)

    class Meta:
        verbose_name = 'Item do romaneio'
        verbose_name_plural = 'Itens do romaneio'
        unique_together = [('picklist', 'item')]

    def __str__(self):
        return f"{self.quantidade_sugerida}× {self.item}"
