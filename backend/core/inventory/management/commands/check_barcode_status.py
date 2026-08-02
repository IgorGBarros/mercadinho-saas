# inventory/management/commands/check_barcode_status.py
from django.core.management.base import BaseCommand
from inventory.models import ExternalBarcodeCatalog, Product
from django.db.models import Count

class Command(BaseCommand):
    help = 'Verifica estado atual das tabelas de códigos de barras'
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("📊 STATUS ATUAL DAS TABELAS"))
        self.stdout.write("="*50)
        
        # Tabela external_barcode_catalog
        total_gtins = ExternalBarcodeCatalog.objects.count()
        self.stdout.write(f"🔢 Total GTINs coletados: {total_gtins}")
        
        if total_gtins > 0:
            # Por nível de confiança
            confidence_stats = ExternalBarcodeCatalog.objects.values(
                'confidence_level'
            ).annotate(count=Count('id')).order_by('-count')
            
            self.stdout.write("\n📈 Por nível de confiança:")
            for stat in confidence_stats:
                level = stat['confidence_level'] or 'N/A'
                count = stat['count']
                self.stdout.write(f"   {level}: {count}")
            
            # Por fonte
            source_stats = ExternalBarcodeCatalog.objects.values(
                'source'
            ).annotate(count=Count('id')).order_by('-count')
            
            self.stdout.write("\n🔍 Por fonte:")
            for stat in source_stats:
                source = stat['source'] or 'N/A'
                count = stat['count']
                self.stdout.write(f"   {source}: {count}")
            
            # Produtos únicos processados
            unique_products = ExternalBarcodeCatalog.objects.filter(
                searched_product_sku__isnull=False
            ).values('searched_product_sku').distinct().count()
            
            self.stdout.write(f"\n📦 Produtos únicos processados: {unique_products}")
            
            # Últimos 5 adicionados
            recent = ExternalBarcodeCatalog.objects.order_by('-created_at')[:5]
            self.stdout.write("\n🕐 Últimos 5 GTINs:")
            for record in recent:
                sku = getattr(record, 'searched_product_sku', 'N/A')
                confidence = getattr(record, 'confidence_level', 'N/A')
                self.stdout.write(f"   • {record.gtin} | SKU: {sku} | {confidence}")
        
        # Tabela products
        total_products = Product.objects.count()
        products_with_barcodes = Product.objects.filter(bar_code__isnull=False).count()
        products_natura = Product.objects.filter(brand__iexact='Natura').count()
        natura_with_barcodes = Product.objects.filter(
            brand__iexact='Natura', 
            bar_code__isnull=False
        ).count()
        
        self.stdout.write(f"\n📊 PRODUTOS:")
        self.stdout.write(f"   Total produtos: {total_products}")
        self.stdout.write(f"   Com código de barras: {products_with_barcodes}")
        self.stdout.write(f"   Produtos Natura: {products_natura}")
        self.stdout.write(f"   Natura com código: {natura_with_barcodes}")
        
        if products_natura > 0:
            natura_percentage = (natura_with_barcodes / products_natura) * 100
            self.stdout.write(f"   Taxa Natura: {natura_percentage:.1f}%")
        
        # Produtos sem código de barras
        natura_without_barcodes = products_natura - natura_with_barcodes
        self.stdout.write(f"\n🎯 Natura sem código: {natura_without_barcodes}")
        
        if natura_without_barcodes > 0:
            self.stdout.write(f"\n💡 Próximo comando sugerido:")
            self.stdout.write(f"   python manage.py cosmos_barcode_finder_fixed --limit {min(natura_without_barcodes, 50)} --skip-existing")