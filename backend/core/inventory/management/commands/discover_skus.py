from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
import time
import random
from decimal import Decimal

class Command(BaseCommand):
    help = 'Descobridor de SKUs via Navegação em Categorias'

    def handle(self, *args, **kwargs):
        # Categorias principais para varrer
        categories = [
            'perfumaria',
            'corpo-e-banho',
            'cabelos',
            'rosto',
            'maquiagem',
            'infantil'
        ]

        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Descoberta de SKUs..."))

        # headless=False para você ver ele rolando a página (opcional)
        with SB(uc=True, headless=True) as sb:
            
            # Acessa home
            sb.open("https://www.natura.com.br/")
            sb.sleep(3)

            for category in categories:
                self.stdout.write(f"📂 Explorando Categoria: {category.upper()}")
                
                # Vamos varrer as primeiras 5 páginas de cada categoria
                for page in range(1, 6):
                    url = f"https://www.natura.com.br/c/{category}?page={page}"
                    
                    try:
                        sb.open(url)
                        sb.sleep(random.uniform(3.0, 5.0))

                        # SIMULAÇÃO HUMANA: Scroll para carregar imagens e produtos
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight / 2);")
                        sb.sleep(1)
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                        sb.sleep(2)

                        # Extrai HTML
                        soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                        
                        # Encontra links de produtos (que tenham /p/ e NATBRA)
                        links = soup.find_all('a', href=re.compile(r'/p/.*NATBRA-(\d+)'))
                        
                        if not links:
                            self.stdout.write(self.style.WARNING(f"   ⚠️ Nenhum produto na pág {page} (ou fim da lista)."))
                            break

                        count = 0
                        for link in links:
                            href = link['href']
                            
                            # Extrai SKU
                            match = re.search(r'NATBRA-(\d+)', href)
                            if match:
                                sku = match.group(1)
                                
                                # Tenta pegar nome e preço ali mesmo no card da vitrine
                                # (O HTML da vitrine é diferente do detalhe, mas vamos tentar o básico)
                                name = link.get('aria-label') or link.text.strip()
                                if not name: name = f"Produto {sku}"

                                # Salva o SKU descoberto!
                                # Não salvamos preço ainda, deixamos o 'crawl_natura' fazer o refino depois
                                # ou salvamos o que der se tivermos sorte
                                product, created = Product.objects.get_or_create(
                                    natura_sku=str(sku),
                                    defaults={
                                        'name': name[:200], # Limita tamanho
                                        'category': category.capitalize(),
                                        'description': f"Descoberto na vitrine {category}",
                                        'sale_price': 0,
                                        'cost_price': 0,
                                        'bar_code': None,
                                        'last_checked_at': timezone.now()
                                    }
                                )
                                
                                if created:
                                    count += 1
                                    print(f"   ✨ Descoberto: [{sku}]")
                        
                        self.stdout.write(self.style.SUCCESS(f"   ✅ Pág {page}: {count} novos cadastrados."))
                        
                        # Pausa entre páginas
                        sb.sleep(random.uniform(2.0, 4.0))

                    except Exception as e:
                        print(f"❌ Erro na navegação: {e}")
                        sb.sleep(10) # Esfria se der erro

        self.stdout.write(self.style.SUCCESS("🎉 Mapeamento Finalizado!"))