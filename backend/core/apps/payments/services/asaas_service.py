# apps/payments/services/asaas_service.py
import requests
import logging
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.apps import apps

logger = logging.getLogger(__name__)


class AsaasAPIError(Exception):
    def __init__(self, message: str, status_code: int = None, response_data: dict = None):
        self.message = message
        self.status_code = status_code
        self.response_data = response_data or {}
        super().__init__(self.message)


def _get_store_model():
    """
    Helper para obter o modelo Store de forma segura, sem importação direta.

    ⚠️ CORREÇÃO: apontava para o app 'stores', que NÃO EXISTE neste projeto
    (o model Store fica em `inventory`). Isso levantava LookupError e
    derrubava o webhook: o cliente pagava e a loja nunca virava PRO.
    """
    return apps.get_model('inventory', 'Store')


class AsaasService:
    """Service para integração com API do Asaas v3"""

    def __init__(self):
        self.base_url = settings.ASAAS_BASE_URL
        self.headers = {
            'Content-Type': 'application/json',
            'access_token': settings.ASAAS_API_KEY,
        }

    def _request(self, method: str, endpoint: str, data: dict = None, params: dict = None) -> dict:
        url = f"{self.base_url}/{endpoint}"
        try:
            resp = requests.request(
                method=method, url=url, headers=self.headers,
                json=data, params=params, timeout=30
            )
            result = resp.json() if resp.content else {}

            if resp.status_code >= 400:
                errors = result.get('errors', [])
                msg = errors[0].get('description', f'HTTP {resp.status_code}') if errors else f'HTTP {resp.status_code}'
                logger.error(f"[ASAAS] {method} {endpoint} → {resp.status_code}: {result}")
                raise AsaasAPIError(msg, resp.status_code, result)

            return result
        except requests.exceptions.Timeout:
            raise AsaasAPIError("Timeout na comunicação com Asaas", 408)
        except requests.exceptions.ConnectionError:
            raise AsaasAPIError("Falha de conexão com Asaas", 503)
        except AsaasAPIError:
            raise
        except Exception as e:
            raise AsaasAPIError(f"Erro inesperado: {str(e)}", 500)

    # ─── CUSTOMERS ───────────────────────────────────────

    def get_or_create_customer(self, store) -> str:
        """Retorna customer_id do Asaas. Cria se não existir."""
        # Se já tem ID salvo, valida
        if store.payment_external_id and store.payment_provider == 'asaas':
            try:
                existing = self._request('GET', f'customers/{store.payment_external_id}')
                if existing.get('id'):
                    return existing['id']
            except AsaasAPIError:
                pass

        # Busca por email
        try:
            search = self._request('GET', 'customers', params={'email': store.owner.email})
            if search.get('data'):
                customer_id = search['data'][0]['id']
                store.payment_external_id = customer_id
                store.payment_provider = 'asaas'
                store.save(update_fields=['payment_external_id', 'payment_provider'])
                return customer_id
        except AsaasAPIError:
            pass

        # Cria novo
        cpf_cnpj = getattr(store.owner, 'cpf_cnpj', None) or getattr(store, 'cpf_cnpj', None)
        if not cpf_cnpj:
            raise AsaasAPIError("CPF/CNPJ é obrigatório para criar cliente no Asaas", 422)

        customer_data = {
            'name': store.owner.name or store.owner.email.split('@')[0],
            'email': store.owner.email,
            'cpfCnpj': cpf_cnpj,
            'mobilePhone': getattr(store, 'whatsapp', None),
            'externalReference': str(store.id),
            'notificationDisabled': False,
        }
        customer_data = {k: v for k, v in customer_data.items() if v is not None}

        result = self._request('POST', 'customers', data=customer_data)
        customer_id = result['id']

        store.payment_external_id = customer_id
        store.payment_provider = 'asaas'
        store.save(update_fields=['payment_external_id', 'payment_provider'])

        logger.info(f"[ASAAS] Customer criado: {customer_id} para store {store.id}")
        return customer_id

    # ─── SUBSCRIPTIONS ───────────────────────────────────

    def create_subscription(self, store, billing_cycle: str = 'monthly', payment_method: str = 'credit_card') -> dict:
        customer_id = self.get_or_create_customer(store)

        value = 39.90 if billing_cycle == 'monthly' else 399.00
        cycle = 'MONTHLY' if billing_cycle == 'monthly' else 'YEARLY'

        billing_type_map = {
            'credit_card': 'CREDIT_CARD',
            'pix': 'PIX',
            'boleto': 'BOLETO',
        }

        subscription_data = {
            'customer': customer_id,
            'billingType': billing_type_map.get(payment_method, 'CREDIT_CARD'),
            'value': float(value),
            'nextDueDate': (timezone.now() + timedelta(days=1)).strftime('%Y-%m-%d'),
            'cycle': cycle,
            'description': f'Minha Amora PRO - {billing_cycle.capitalize()}',
            'externalReference': str(store.id),
        }

        result = self._request('POST', 'subscriptions', data=subscription_data)

        store.payment_provider = 'asaas'
        store.subscription_started_at = timezone.now()
        store.subscription_expires_at = timezone.now() + timedelta(days=30 if billing_cycle == 'monthly' else 365)
        store.save(update_fields=['payment_provider', 'subscription_started_at', 'subscription_expires_at'])

        logger.info(f"[ASAAS] Subscription criada: {result.get('id')} para store {store.id}")
        return result

    def create_payment_link(self, store, billing_cycle: str = 'monthly') -> dict:
        """
        Cria link de pagamento (checkout hospedado pelo Asaas).

        ⚠️ NÃO criamos "customer" aqui de propósito. Antes havia uma chamada a
        get_or_create_customer() cujo retorno era DESCARTADO (o link não usa
        campo `customer`), e que exigia CPF/CNPJ — travando o checkout com
        "CPF/CNPJ é obrigatório". O Asaas cadastra o pagador na própria página
        de checkout, onde ele informa o documento. Assim o Minha Amora não
        precisa coletar nem armazenar CPF (menos dado pessoal sob nossa
        guarda = menos exposição na LGPD).
        """
        # ✅ Preço vem do PlanConfig (fonte única de verdade), não mais
        # hardcoded. O admin altera o preço no painel → reflete aqui, no
        # Plans.tsx e no /profile/ automaticamente. Fallback para os valores
        # antigos caso o PlanConfig 'pro' não exista.
        value = self._get_pro_price(billing_cycle)

        cycle_label = "Mensal" if billing_cycle == "monthly" else "Anual"
        link_data = {
            'name': f'Minha Amora PRO - {cycle_label}',
            'description': f'Assinatura PRO para {store.name}',
            'endDate': (timezone.now() + timedelta(days=7)).strftime('%Y-%m-%d'),
            'value': float(value),
            'billingType': 'UNDEFINED',
            'chargeType': 'RECURRENT',
            # ⚠️ Obrigatório quando o link aceita boleto (billingType
            # UNDEFINED permite): dias ÚTEIS que o pagador tem para quitar o
            # boleto depois de gerado. Sem este campo o Asaas recusa a
            # criação do link com "É necessário informar a quantidade de
            # dias úteis para vencimento da cobrança."
            'dueDateLimitDays': 5,
            'subscriptionCycle': 'MONTHLY' if billing_cycle == 'monthly' else 'YEARLY',
            'notificationEnabled': True,
            'externalReference': str(store.id),
        }

        result = self._request('POST', 'paymentLinks', data=link_data)

        # Guardamos o ID do link para identificar a loja quando o webhook
        # chegar: a cobrança gerada traz o campo `paymentLink`. É um segundo
        # caminho de identificação além do externalReference.
        link_id = result.get('id')
        if link_id:
            try:
                store.payment_external_id = link_id
                store.payment_provider = 'asaas'
                store.save(update_fields=['payment_external_id', 'payment_provider'])
            except Exception as e:
                logger.warning(f"[ASAAS] Não foi possível salvar o link na loja: {e}")

        logger.info(f"[ASAAS] Payment link: {result.get('url')}")
        return result

    @staticmethod
    def _get_pro_price(billing_cycle: str = 'monthly') -> float:
        """Preço do plano PRO a partir do PlanConfig, com fallback seguro."""
        try:
            from inventory.models import PlanConfig
            cfg = PlanConfig.objects.filter(plan_type='pro').first()
            if cfg:
                price = cfg.yearly_price if billing_cycle == 'yearly' else cfg.monthly_price
                if price and float(price) > 0:
                    return float(price)
        except Exception as e:
            logger.warning(f"[ASAAS] Não foi possível ler preço do PlanConfig: {e}")
        # Fallback: valores históricos
        return 399.00 if billing_cycle == 'yearly' else 39.90

    # ─── WEBHOOK PROCESSING ──────────────────────────────

    def process_webhook(self, event: str, payload: dict) -> dict:
        handlers = {
            # ⚠️ PAYMENT_CONFIRMED é essencial: no cartão de crédito o Asaas
            # só envia PAYMENT_RECEIVED ~32 dias depois (quando o dinheiro é
            # liberado). Tratando apenas RECEIVED, quem pagasse no cartão
            # esperaria um mês pelo acesso. CONFIRMED significa "pagamento
            # efetuado" — é nele que liberamos.
            'PAYMENT_CONFIRMED': self._on_payment_received,
            'PAYMENT_RECEIVED': self._on_payment_received,
            'PAYMENT_OVERDUE': self._on_payment_overdue,
            'SUBSCRIPTION_CANCELED': self._on_subscription_canceled,
        }

        handler = handlers.get(event)
        if not handler:
            return {'status': 'ignored', 'event': event}

        logger.info(f"[ASAAS WEBHOOK] Processando: {event}")
        return handler(payload, event=event)

    def _find_store_from_payload(self, payload: dict):
        """
        Descobre a loja dona da cobrança, tentando três caminhos.

        Como não criamos "customer" (o pagador é cadastrado pelo Asaas na
        página de checkout), a identificação principal é o externalReference
        e o ID do link de pagamento — não o cliente.
        """
        Store = _get_store_model()

        payment = payload.get('payment', {}) or {}

        # 1) externalReference: gravamos o ID da loja ao criar o link
        external_ref = payment.get('externalReference')
        if external_ref:
            try:
                return Store.objects.get(id=external_ref)
            except (Store.DoesNotExist, ValueError, TypeError):
                pass

        # 2) paymentLink: a cobrança traz o link que a originou, e guardamos
        #    esse ID na loja em create_payment_link()
        payment_link = payment.get('paymentLink')
        if payment_link:
            store = Store.objects.filter(
                payment_external_id=payment_link, payment_provider='asaas'
            ).first()
            if store:
                return store

        # 3) customer: caminho legado (lojas que já tinham customer salvo)
        customer_id = payment.get('customer')
        if customer_id:
            store = Store.objects.filter(
                payment_external_id=customer_id, payment_provider='asaas'
            ).first()
            if store:
                return store

        logger.warning(
            "[ASAAS WEBHOOK] Não foi possível identificar a loja da cobrança "
            f"(externalReference={external_ref}, paymentLink={payment_link})"
        )
        return None

    @staticmethod
    def _days_for_payment(paid_value) -> int:
        """
        Quantos dias de PRO liberar, a partir do valor pago.

        Compara o valor com os preços de mensal/anual do PlanConfig e escolhe
        o ciclo mais próximo. Assim funciona mesmo se o admin mudar o preço.
        """
        try:
            if paid_value is None:
                return 30
            value = float(paid_value)
            monthly = AsaasService._get_pro_price('monthly')
            yearly = AsaasService._get_pro_price('yearly')
            if abs(value - yearly) < abs(value - monthly):
                return 365
        except (TypeError, ValueError):
            pass
        return 30

    def _on_payment_received(self, payload: dict, event: str = '') -> dict:
        store = self._find_store_from_payload(payload)
        if not store:
            return {'status': 'error', 'message': 'Store not found'}

        payment = payload.get('payment', {}) or {}

        # ⚠️ IDEMPOTÊNCIA: o Asaas entrega webhooks "at least once" e a mesma
        # cobrança gera CONFIRMED e depois RECEIVED. Sem este guarda, a mesma
        # cobrança somaria 30 dias a cada entrega.
        payment_id = payment.get('id')
        if payment_id:
            from inventory.models import ProcessedPaymentEvent
            if ProcessedPaymentEvent.objects.filter(payment_id=payment_id).exists():
                logger.info(f"[ASAAS WEBHOOK] Cobrança {payment_id} já processada — ignorando")
                return {
                    'status': 'duplicate',
                    'payment_id': payment_id,
                    'store_id': str(store.id),
                }
        # ⚠️ CORREÇÃO: antes liberava sempre 30 dias — quem pagasse o plano
        # ANUAL recebia só um mês de PRO. Agora o período vem do valor pago.
        days = self._days_for_payment(payment.get('value'))

        now = timezone.now()
        # ⚠️ CORREÇÃO: em renovação, estender a partir do vencimento atual
        # (se ainda válido), senão o cliente que renova antes do fim perde
        # os dias restantes.
        current_expiry = store.subscription_expires_at
        base = current_expiry if (current_expiry and current_expiry > now) else now

        store.plan = 'pro'
        if not store.subscription_started_at:
            store.subscription_started_at = now
        store.subscription_expires_at = base + timedelta(days=days)
        store.save(update_fields=['plan', 'subscription_started_at', 'subscription_expires_at'])

        # Marca a cobrança como processada (idempotência)
        if payment_id:
            from inventory.models import ProcessedPaymentEvent
            try:
                ProcessedPaymentEvent.objects.create(
                    payment_id=payment_id, store=store,
                    event=event or '', days_granted=days,
                    value=payment.get('value'), billing_type=payment.get('billingType') or '',
                )
            except Exception as e:
                # Corrida entre duas entregas simultâneas: a constraint UNIQUE
                # já protege o essencial, então só registramos.
                logger.warning(f"[ASAAS WEBHOOK] Não registrou idempotência de {payment_id}: {e}")

        logger.info(f"[ASAAS WEBHOOK] Store {store.id} → PRO por {days} dias (até {store.subscription_expires_at})")
        return {'status': 'success', 'store_id': str(store.id), 'days_granted': days}

    def _on_payment_overdue(self, payload: dict, event: str = '') -> dict:
        store = self._find_store_from_payload(payload)
        if store:
            logger.warning(f"[ASAAS WEBHOOK] Pagamento atrasado: store {store.id}")
        return {'status': 'warning'}

    def _on_subscription_canceled(self, payload: dict, event: str = '') -> dict:
        Store = _get_store_model()

        subscription = payload.get('subscription', {})
        external_ref = subscription.get('externalReference')
        if not external_ref:
            return {'status': 'ignored'}

        try:
            store = Store.objects.get(id=external_ref)
            store.plan = 'free'
            store.subscription_expires_at = timezone.now()
            store.save(update_fields=['plan', 'subscription_expires_at'])
            logger.info(f"[ASAAS WEBHOOK] Store {store.id} → FREE (cancelada)")
            return {'status': 'success', 'store_id': str(store.id)}
        except Store.DoesNotExist:
            return {'status': 'error', 'message': 'Store not found'}


asaas_service = AsaasService()
