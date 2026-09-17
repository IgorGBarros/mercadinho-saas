"""
fiscal/models.py — emissão de NFC-e.

⚠️ REGRA INEGOCIÁVEL: A NOTA NUNCA BLOQUEIA A VENDA.
Cliente pagou → estoque baixado → geladeira destravada → cupom impresso.
A nota sai DEPOIS, assíncrona, com retry. A SEFAZ fica instável com
frequência; se você acoplar os dois, uma janela de indisponibilidade
estadual fecha a loja do seu cliente.

⚠️ A NOTA É DO CNPJ DO CLIENTE, NÃO DO SEU.
Você é software house. O certificado A1, o CSC e a responsabilidade
tributária são do Operator. Isso precisa estar explícito em contrato.
"""
from datetime import timedelta

from django.db import models
from django.utils import timezone


class FiscalDocument(models.Model):
    """
    Uma NFC-e. Uma por venda, no máximo.

    O ciclo de vida é longo e cheio de estados intermediários porque a
    SEFAZ é assíncrona: você transmite, recebe um recibo, e consulta o
    resultado depois. Modelar isso como "emitiu/não emitiu" quebra na
    primeira instabilidade.
    """

    class Status(models.TextChoices):
        PENDENTE = 'pendente', 'Aguardando emissão'
        PROCESSANDO = 'processando', 'Transmitida, aguardando SEFAZ'
        AUTORIZADO = 'autorizado', 'Autorizada'
        REJEITADO = 'rejeitado', 'Rejeitada pela SEFAZ'
        CONTINGENCIA = 'contingencia', 'Em contingência offline'
        CANCELADO = 'cancelado', 'Cancelada'
        ERRO = 'erro', 'Falha de comunicação'

    sale = models.OneToOneField(
        'inventory.Sale', on_delete=models.PROTECT, related_name='fiscal'
    )
    operator = models.ForeignKey(
        'tenancy.Operator', on_delete=models.PROTECT, related_name='fiscal_documents'
    )

    provider = models.CharField(max_length=20, default='focusnfe')

    # ⚠️ Chave de idempotência do lado do provedor. Derivada do id da venda,
    # nunca aleatória: se a rede cair depois de transmitir e antes de
    # receber a resposta, o retry usa a MESMA ref e o provedor devolve a
    # nota já emitida em vez de emitir uma segunda para a mesma venda.
    ref = models.CharField(max_length=60, unique=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDENTE)

    chave_acesso = models.CharField(max_length=44, blank=True, db_index=True)
    protocolo = models.CharField(max_length=20, blank=True)
    numero = models.CharField(max_length=15, blank=True)
    serie = models.CharField(max_length=5, blank=True)

    xml_url = models.URLField(max_length=500, blank=True)
    danfe_url = models.URLField(max_length=500, blank=True)
    qrcode_url = models.TextField(blank=True)

    codigo_erro = models.CharField(max_length=20, blank=True)
    erro = models.TextField(blank=True)

    tentativas = models.PositiveSmallIntegerField(default=0)
    proxima_tentativa = models.DateTimeField(null=True, blank=True, db_index=True)

    criado_em = models.DateTimeField(auto_now_add=True)
    transmitido_em = models.DateTimeField(null=True, blank=True)
    autorizado_em = models.DateTimeField(null=True, blank=True)

    MAX_TENTATIVAS = 8

    class Meta:
        verbose_name = 'Documento fiscal'
        verbose_name_plural = 'Documentos fiscais'
        ordering = ['-criado_em']
        indexes = [
            # Consulta do worker: o que precisa ser tentado agora.
            models.Index(fields=['status', 'proxima_tentativa']),
            models.Index(fields=['operator', 'status']),
        ]

    def __str__(self):
        return f"NFC-e {self.ref} · {self.get_status_display()}"

    @property
    def finalizado(self) -> bool:
        return self.status in (self.Status.AUTORIZADO, self.Status.CANCELADO,
                               self.Status.REJEITADO)

    def agendar_retry(self, erro='', codigo=''):
        """
        Backoff exponencial: 1, 2, 4, 8... minutos, teto de 1 hora.

        ⚠️ Só para FALHA DE COMUNICAÇÃO. Rejeição da SEFAZ (NCM errado,
        certificado vencido) não se resolve tentando de novo — insistir só
        queima cota do provedor e esconde o problema do lojista, que
        precisa CORRIGIR o cadastro.
        """
        self.tentativas += 1
        self.erro = erro
        self.codigo_erro = codigo

        if self.tentativas >= self.MAX_TENTATIVAS:
            self.status = self.Status.ERRO
            self.proxima_tentativa = None
        else:
            minutos = min(2 ** (self.tentativas - 1), 60)
            self.status = self.Status.PENDENTE
            self.proxima_tentativa = timezone.now() + timedelta(minutes=minutos)

        self.save(update_fields=['tentativas', 'erro', 'codigo_erro',
                                 'status', 'proxima_tentativa'])
