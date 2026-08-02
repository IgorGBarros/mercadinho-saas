# inventory/management/commands/bluesoft_stats.py
from django.core.management.base import BaseCommand
from inventory.models import ExternalBarcodeCatalog
from django.db.models import Count

class Command(BaseCommand):
    help = 'Estatísticas dos dados do Bluesoft'
    
    def handle(self, *args, **options):
        total = ExternalBarcodeCatalog.objects.count()
        matched = ExternalBarcodeCatalog.objects.filter(matched=True).count()
        unmatched = total - matched
        
        by_brand = ExternalBarcodeCatalog.objects.values('brand').annotate(
            count=Count('id')
        ).order_by('-count')
        
        self.stdout.write(self.style.SUCCESS("📊 ESTATÍSTICAS BLUESOFT"))
        self.stdout.write(f"Total de GTINs: {total}")
        self.stdout.write(f"Matched: {matched}")
        self.stdout.write(f"Unmatched: {unmatched}")
        self.stdout.write("\nPor marca:")
        
        for item in by_brand:
            self.stdout.write(f"  {item['brand']}: {item['count']}")
        
        # Últimos 10 adicionados
        recent = ExternalBarcodeCatalog.objects.order_by('-created_at')[:10]
        self.stdout.write("\n🕐 Últimos 10 adicionados:")
        for item in recent:
            self.stdout.write(f"  {item.gtin} - {item.description[:50]}...")