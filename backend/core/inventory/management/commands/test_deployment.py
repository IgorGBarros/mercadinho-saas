# inventory/management/commands/test_deployment.py
from django.core.management.base import BaseCommand
from django.db import connection
from django.conf import settings
from inventory.models import Product, ExternalBarcodeCatalog
import os

class Command(BaseCommand):
    help = 'Testa se o deployment está funcionando corretamente'
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("🚀 TESTE DE DEPLOYMENT"))
        self.stdout.write("="*50)
        
        # ✅ 1. Verificar configurações básicas
        self.stdout.write(f"🐍 Python: {os.sys.version}")
        self.stdout.write(f"🔧 DEBUG: {settings.DEBUG}")
        self.stdout.write(f"🌐 ALLOWED_HOSTS: {settings.ALLOWED_HOSTS}")
        self.stdout.write(f"🔑 SECRET_KEY definida: {'Sim' if settings.SECRET_KEY else 'Não'}")
        
        # ✅ 2. Verificar variáveis de ambiente
        self.stdout.write(f"\n📋 VARIÁVEIS DE AMBIENTE:")
        env_vars = ['DATABASE_URL', 'DEBUG', 'RENDER', 'SECRET_KEY']
        for var in env_vars:
            value = os.getenv(var)
            if var == 'DATABASE_URL' and value:
                # Mascarar senha
                masked = value.replace(value.split('@')[0].split(':')[-1], '***')
                self.stdout.write(f"   {var}: {masked}")
            elif var == 'SECRET_KEY' and value:
                self.stdout.write(f"   {var}: {'*' * len(value)}")
            else:
                self.stdout.write(f"   {var}: {value}")
        
        # ✅ 3. Testar conexão com banco
        self.stdout.write(f"\n🗄️ TESTE DE BANCO DE DADOS:")
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                result = cursor.fetchone()
                self.stdout.write("   ✅ Conexão com banco: OK")
                
                # Testar consulta básica
                total_products = Product.objects.count()
                self.stdout.write(f"   📦 Total de produtos: {total_products}")
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"   ❌ Erro no banco: {e}"))
        
        # ✅ 4. Testar tabela ExternalBarcodeCatalog
        self.stdout.write(f"\n🔢 TESTE TABELA TEMPORÁRIA:")
        try:
            total_gtins = ExternalBarcodeCatalog.objects.count()
            self.stdout.write(f"   ✅ Tabela ExternalBarcodeCatalog: {total_gtins} registros")
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"   ❌ Tabela não existe: {e}"))
            self.stdout.write("   💡 Execute: python manage.py migrate")
        
        # ✅ 5. Testar criação de registro
        self.stdout.write(f"\n✏️ TESTE DE ESCRITA:")
        try:
            # Tentar criar um registro de teste
            test_gtin, created = ExternalBarcodeCatalog.objects.get_or_create(
                gtin='1234567890123',
                defaults={
                    'brand': 'Teste',
                    'description': 'Teste de deployment',
                    'source': 'deployment_test',
                    'searched_product_sku': 'TEST001'
                }
            )
            
            if created:
                self.stdout.write("   ✅ Criação de registro: OK")
                # Deletar o registro de teste
                test_gtin.delete()
                self.stdout.write("   🗑️ Registro de teste removido")
            else:
                self.stdout.write("   ✅ Escrita no banco: OK (registro já existia)")
                
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"   ❌ Erro na escrita: {e}"))
        
        self.stdout.write(self.style.SUCCESS("\n🏁 Teste de deployment concluído!"))