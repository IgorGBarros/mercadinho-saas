from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
import time
import random

class Command(BaseCommand):
    help = 'Varredura Total: Salva SKUs da página "Todos os Produtos"'

    def handle(self, *args, **kwargs):
        base_url = "https://www.natura.com.br/c/todos-produtos"
        
        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Varredura Total em: {base_url}"))

        with SB(uc=True, headless=True) as sb:
            try: sb.open("https://www.natura.com.br/"); sb.sleep(2)
            except: pass

            page = 1
            empty_pages_count = 0

            while True:
                url = f"{base_url}?page={page}"
                self.stdout.write(f"📂 Lendo Página {page}...")
                
                try:
                    sb.open(url)
                    sb.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.3);")
                    sb.sleep(0.5)
                    sb.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    sb.sleep(1.5)

                    if "Ops" in sb.get_page_title() or "404" in sb.get_page_title():
                        self.stdout.write(self.style.SUCCESS("🏁 Fim das páginas encontrado."))
                        break

                    soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                    links = soup.find_all('a', href=re.compile(r'NATBRA-(\d+)'))
                    
                    if not links:
                        empty_pages_count += 1
                        self.stdout.write(self.style.WARNING(f"   ⚠️ Nenhum produto na página {page}."))
                        if empty_pages_count >= 3: break
                    else:
                        empty_pages_count = 0

                    count_new = 0
                    for link in links:
                        href = link['href']
                        match = re.search(r'NATBRA-(\d+)', href)
                        
                        if match:
                            sku = match.group(1)
                            name = link.get('title') or link.get('aria-label')
                            if not name:
                                name_tag = link.find(['h3', 'h4', 'p'])
                                if name_tag: name = name_tag.text.strip()
                            
                            if not name: name = f"Produto {sku}"

                            # --- CORREÇÃO AQUI ---
                            # Usamos 'official_price' em vez de 'sale_price'
                            # Removemos 'cost_price' pois isso é dado privado da consultora
                            product, created = Product.objects.get_or_create(
                                natura_sku=str(sku),
                                defaults={
                                    'name': name[:200],
                                    'category': 'Geral',
                                    'official_price': 0, # Preço oficial (Global)
                                    'bar_code': None,
                                    'description': f"Descoberto em Todos os Produtos (Pág {page})",
                                    'last_checked_at': timezone.now()
                                }
                            )
                            if created: count_new += 1

                    self.stdout.write(self.style.SUCCESS(f"   ✅ Pág {page}: {len(links)} links, {count_new} novos."))
                    
                    page += 1
                    sb.sleep(random.uniform(2.0, 4.0))

                except Exception as e:
                    self.stdout.write(self.style.ERROR(f"❌ Erro na pág {page}: {e}"))
                    sb.sleep(5)

        self.stdout.write(self.style.SUCCESS("🎉 Varredura Completa Finalizada!"))