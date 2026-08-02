# backend/core/inventory/signals.py
import uuid
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import Store

User = get_user_model()


@receiver(pre_save, sender=User)
def sync_admin_status_from_email(sender, instance, **kwargs):
    """
    Sincroniza is_staff/is_superuser com a allowlist ADMIN_EMAILS.

    Fonte única de verdade para acesso ao painel admin: o email. Se o email
    do usuário está em ADMIN_EMAILS → is_staff=True; se não está → is_staff
    é forçado para False (mesmo que alguém tenha marcado manualmente no
    banco ou via DevTools). Roda em pre_save (não post_save) para não
    disparar salvamento recursivo.

    Usa pre_save porque queremos ajustar o objeto ANTES de gravar, sem um
    segundo .save().
    """
    admin_emails = getattr(settings, "ADMIN_EMAILS", [])
    email = (instance.email or "").strip().lower()

    # Se a lista está vazia (ex.: ambiente sem a env configurada), não mexe
    # em nada — evita trancar todo mundo por configuração ausente. O
    # superusuário criado por createsuperuser continua funcionando.
    if not admin_emails:
        return

    is_authorized = email in admin_emails
    # Só ajusta se divergir, para não sobrescrever à toa.
    if instance.is_staff != is_authorized:
        instance.is_staff = is_authorized
    # is_superuser acompanha is_staff para os autorizados; para não
    # autorizados, remove superuser também.
    if instance.is_superuser and not is_authorized:
        instance.is_superuser = False


@receiver(post_save, sender=User)
def create_store_for_new_user(sender, instance, created, **kwargs):
    """
    Toda vez que um User é criado no banco, esta função é disparada.
    Garante que todo usuário tenha uma loja (Store) pronta para uso.
    """
    if created:
        # Pega o primeiro nome ou parte do email para montar o link da vitrine
        base_name = getattr(instance, 'first_name', '')
        if not base_name:
            base_name = instance.email.split('@')[0] if getattr(instance, 'email', None) else 'loja'
        
        # Garante que o slug (URL da vitrine) seja único usando um UUID curto
        unique_slug = f"{base_name.lower().replace(' ', '-')}-{str(uuid.uuid4())[:6]}"
        
        # Cria a Loja vinculada ao novo Usuário
        # 🎁 Trial: toda loja nova nasce com acesso completo por alguns dias,
        # sem pedir cartão. A duração vem do settings (TRIAL_DAYS) para poder
        # ser ajustada sem alterar código.
        agora = timezone.now()
        dias_trial = getattr(settings, 'TRIAL_DAYS', 14)

        Store.objects.create(
            owner=instance,
            name=f"Espaço de {base_name.capitalize()}",
            slug=unique_slug,
            trial_started_at=agora,
            trial_ends_at=agora + timedelta(days=dias_trial),
            whatsapp="", # A consultora preenche depois
            # storefront_enabled=False (Se você tiver esse campo no model, inicie desativado)
        )