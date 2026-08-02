from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model # <--- Importação Correta
from inventory.models import Store

# Pega o modelo de usuário ativo (seja o CustomUser ou o padrão)
User = get_user_model()

class Command(BaseCommand):
    help = 'Inicializa a Loja Piloto e o Admin'

    def handle(self, *args, **kwargs):
        # 1. Cria ou pega o usuário
        user, created_user = User.objects.get_or_create(
            email='admin@example.com', # CustomUser usa email como identificador primário
            defaults={
                'name': 'Administrador', # Campo obrigatório do seu CustomUser
                'is_staff': True,
                'is_superuser': True
            }
        )
        
        if created_user:
            user.set_password('admin')
            user.save()
            self.stdout.write(self.style.SUCCESS("👤 Usuário 'admin@example.com' criado (senha: admin)"))
        else:
            self.stdout.write("ℹ️ Usuário já existe.")

        # 2. Cria a Loja vinculada a esse usuário
        store, created_store = Store.objects.get_or_create(
            user=user,
            defaults={
                'name': "Consultoria Natura VIP",
                'slug': "vip",
                'whatsapp': "5511999999999"
            }
        )
        
        if created_store:
            self.stdout.write(self.style.SUCCESS(f"🏪 Loja '{store.name}' criada com sucesso!"))
        else:
            self.stdout.write("ℹ️ Loja já existe.")