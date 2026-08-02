# inventory/management/commands/reset_barcode_catalog.py
from django.core.management.base import BaseCommand
from inventory.models import ExternalBarcodeCatalog, Product
from django.db import connection

class Command(BaseCommand):
    help = 'Reseta APENAS a tabela external_barcode_catalog (NUNCA altera inventory_product)'
    
    def add_arguments(self, parser):
        parser.add_argument('--confirm', action='store_true', help='Confirmar reset sem prompt')
    
    def handle(self, *args, **options):
        confirm = options['confirm']
        
        self.stdout.write(self.style.WARNING("🗑️ RESET DA TABELA EXTERNAL_BARCODE_CATALOG"))
        self.stdout.write("="*60)
        
        # Estatísticas atuais
        total_records = ExternalBarcodeCatalog.objects.count()
        products_with_barcodes = Product.objects.filter(bar_code__isnull=False).count()
        
        self.stdout.write(f"📊 Registros atuais na tabela staging: {total_records}")
        self.stdout.write(f"📦 Produtos com código de barras: {products_with_barcodes}")
        self.stdout.write(f"🔒 GARANTIA: Tabela inventory_product NÃO será alterada")
        
        if total_records == 0:
            self.stdout.write(self.style.SUCCESS("✅ Tabela staging já está vazia!"))
            return
        
        # Mostrar alguns exemplos do que será deletado
        if total_records > 0:
            examples = ExternalBarcodeCatalog.objects.all()[:5]
            self.stdout.write("\n📋 Exemplos de registros que serão removidos:")
            for record in examples:
                sku = getattr(record, 'searched_product_sku', 'N/A')
                confidence = getattr(record, 'confidence_level', 'N/A')
                self.stdout.write(f"   • GTIN: {record.gtin} | SKU: {sku} | Confiança: {confidence}")
            
            if total_records > 5:
                self.stdout.write(f"   ... e mais {total_records - 5} registros")
        
        # Confirmação
        if not confirm:
            self.stdout.write(f"\n🔥 Esta operação irá:")
            self.stdout.write(f"   ✅ Deletar {total_records} registros da tabela external_barcode_catalog")
            self.stdout.write(f"   🔒 MANTER intacta a tabela inventory_product")
            self.stdout.write(f"   🔒 MANTER todos os códigos de barras dos produtos")
            self.stdout.write(f"   ✅ Permitir uma nova raspagem limpa")
            
            try:
                response = input("\nDigite 'RESET' para confirmar: ")
                if response.upper() != 'RESET':
                    self.stdout.write("❌ Operação cancelada")
                    return
            except (KeyboardInterrupt, EOFError):
                self.stdout.write("\n❌ Operação cancelada")
                return
        
        # Executar reset
        self.stdout.write("\n🔄 Executando reset...")
        
        try:
            # ✅ APENAS LIMPAR TABELA external_barcode_catalog
            deleted_records = ExternalBarcodeCatalog.objects.all().delete()
            self.stdout.write(f"✅ Removidos {deleted_records[0]} registros da tabela staging")
            
            # ✅ NÃO TOCAR NA TABELA inventory_product
            # (código removido completamente)
            
            # Reset do auto-increment (PostgreSQL)
            try:
                with connection.cursor() as cursor:
                    cursor.execute("ALTER SEQUENCE external_barcode_catalog_id_seq RESTART WITH 1;")
                self.stdout.write("✅ Sequência de ID resetada")
            except Exception as e:
                self.stdout.write(f"⚠️ Não foi possível resetar sequência: {e}")
            
            # Verificação final
            remaining_records = ExternalBarcodeCatalog.objects.count()
            remaining_barcodes = Product.objects.filter(bar_code__isnull=False).count()
            
            self.stdout.write(self.style.SUCCESS("\n" + "="*60))
            self.stdout.write(self.style.SUCCESS("✅ RESET CONCLUÍDO COM SUCESSO"))
            self.stdout.write(self.style.SUCCESS("="*60))
            self.stdout.write(f"📊 Registros restantes na tabela staging: {remaining_records}")
            self.stdout.write(f"🔒 Produtos com código de barras (inalterado): {remaining_barcodes}")
            self.stdout.write("\n💡 Agora você pode executar:")
            self.stdout.write("   python manage.py cosmos_barcode_finder_fixed --limit 10 --skip-existing")
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"❌ Erro durante o reset: {e}"))