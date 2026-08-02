from django.core.management.base import BaseCommand
from inventory.models import Product
import requests
from bs4 import BeautifulSoup
import time
import random
import re

class Command(BaseCommand):
    help = 'Crawler para descobrir e salvar produtos da Natura via SKU'

    def handle(self, *args, **kwargs):
        # Intervalo de SKUs (Códigos Natura) para escanear
        # Dica: Produtos ativos geralmente estão entre 10000 e 150000
        start_sku = 38850 
        end_sku = 38860 # Comece pequeno para testar (ex: 10 produtos)

        self.stdout.write(self.style.WARNING(f"🕷️ Iniciando Crawler Natura: SKUs {start_sku} a {end_sku}..."))

        ua_list = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
        ]

        for sku in range(start_sku, end_sku + 1):
            url = f"https://www.natura.com.br/p/x/NATBRA-{sku}"
            
            try:
                headers = {
                    'User-Agent': random.choice(ua_list),
                    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
                }
                
                # Delay para não ser bloqueado (Ética de Scraping)
                time.sleep(random.uniform(1.0, 3.0))
                
                resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
                
                # Verifica se é uma página de produto válida (200 OK e não redirecionou para Home)
                if resp.status_code == 200 and "natura.com.br/p/" in resp.url:
                    soup = BeautifulSoup(resp.text, 'html.parser')
                    
                    # 1. Extrair Nome (Geralmente h1 ou meta tag)
                    title_tag = soup.find('h1')
                    name = title_tag.text.strip() if title_tag else f"Produto Natura {sku}"
                    
                    # 2. Extrair Preço (Procura por R$)
                    price = 0.00
                    price_tag = soup.find(string=re.compile(r'R\$\s*\d+'))
                    if price_tag:
                        clean_price = re.sub(r'[^\d,]', '', price_tag).replace(',', '.')
                        try:
                            price = float(clean_price)
                        except:
                            pass
                    
                    # 3. Salvar no Banco (Update ou Create)
                    # Usamos 'natura_sku' como chave única
                    product, created = Product.objects.update_or_create(
                        natura_sku=str(sku),
                        defaults={
                            'name': name,
                            'sale_price': price,
                            # Se não tiver categoria, define uma padrão para não quebrar
                            'category': 'Perfumaria' if 'colônia' in name.lower() else 'Geral'
                        }
                    )
                    
                    status_icon = "✨" if created else "🔄"
                    self.stdout.write(self.style.SUCCESS(f"{status_icon} [{sku}] {name} - R$ {price}"))
                
                else:
                    # 404 ou Redirecionamento (Produto não existe ou inativo)
                    self.stdout.write(self.style.NOTICE(f"💨 SKU {sku} não encontrado."))

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"❌ Erro SKU {sku}: {str(e)}"))

        self.stdout.write(self.style.SUCCESS("✅ Ciclo do Crawler finalizado!"))