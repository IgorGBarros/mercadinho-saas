from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import Product, PriceHistory
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
from decimal import Decimal
import random

class Command(BaseCommand):
    help = 'Crawler Intercalado: O Boticário, Eudora e Quem Disse Berenice'

    def handle(self, *args, **kwargs):
        # Configuração das 3 marcas com a mesma estrutura
        STORES = [
            {
                "brand": "O Boticário",
                "list_url": "https://www.boticario.com.br/todos-os-produtos/",
                "domain": "boticario.com.br"
            },
            {
                "brand": "Quem Disse Berenice",
                "list_url": "https://www.quemdisseberenice.com.br/todos-produtos-site/",
                "domain": "quemdisseberenice.com.br"
            },
            {
                "brand": "Eudora",
                "list_url": "https://www.eudora.com.br/site-todo/",
                "domain": "eudora.com.br"
            }
        ]

        self.stdout.write(self.style.WARNING("🕷️ Iniciando Crawler Intercalado (Grupo Boticário)..."))

        with SB(uc=True, headless=True) as sb:
            page = 1
            consecutive_empty_pages = 0

            while True:
                self.stdout.write(self.style.WARNING(f"\n--- 📂 PROCESSANDO PÁGINA {page} DE TODAS AS MARCAS ---"))
                
                # Armazena os links dos produtos descobertos nesta página (3 de cada loja)
                discovered_links = []

                # 1. PASSO DE DESCOBERTA (Pega os links da página atual para as 3 lojas)
                for store in STORES:
                    url = f"{store['list_url']}?page={page}"
                    self.stdout.write(f"🔍 Vasculhando: {store['brand']} (Pág {page})")
                    
                    try:
                        sb.open(url)
                        
                        # Rolagem suave para carregar os produtos dinâmicos (Lazy Load)
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.3);")
                        sb.sleep(1)
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight * 0.7);")
                        sb.sleep(1)
                        sb.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                        sb.sleep(2)

                        if "Access Denied" in sb.get_page_title():
                            self.stdout.write(self.style.ERROR(f"⛔ Bloqueio no {store['brand']}!"))
                            continue

                        soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                        
                        # Pega todos os links de produtos (geralmente terminam com /p no Boticário)
                        # Ou pega os links dentro dos cards de produto
                        product_cards = soup.find_all('a', href=re.compile(rf"{store['domain']}/.*"))
                        
                        links_loja = []
                        for a in product_cards:
                            href = a.get('href')
                            if href and '/p' in href and href not in links_loja:
                                links_loja.append({"url": href, "brand": store['brand']})
                        
                        # Pegamos os links dessa loja e juntamos na lista global da página
                        discovered_links.extend(links_loja)
                        self.stdout.write(self.style.SUCCESS(f"   ✅ Encontrados {len(links_loja)} links em {store['brand']}"))
                        
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"❌ Erro ao listar {store['brand']}: {e}"))
                
                # Se nenhuma das 3 lojas retornou produtos, chegamos ao fim do site
                if not discovered_links:
                    consecutive_empty_pages += 1
                    if consecutive_empty_pages >= 2:
                        self.stdout.write(self.style.SUCCESS("🏁 Fim das páginas encontrado em todos os sites."))
                        break
                else:
                    consecutive_empty_pages = 0

                # 2. PASSO DE ENRIQUECIMENTO (Visita os links encontrados de forma embaralhada/intercalada)
                # Misturar a lista ajuda no anti-bloqueio
                random.shuffle(discovered_links)
                
                self.stdout.write(self.style.WARNING(f"\n🛒 Iniciando extração profunda de {len(discovered_links)} produtos..."))
                
                for item in discovered_links:
                    product_url = item["url"]
                    brand = item["brand"]
                    
                    try:
                        sb.open(product_url)
                        sb.sleep(random.uniform(2.5, 4.5)) # Pausa para imitar humano
                        
                        soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
                        
                        # --- A. LÓGICA DE EXTRAÇÃO DO SKU ---
                        sku = None
                        sku_div = soup.find('div', class_=re.compile(r'product-sku'))
                        if sku_div:
                            raw_sku = sku_div.text.replace('Cod:', '').replace('"', '').strip()
                            if raw_sku:
                                sku = raw_sku

                        if not sku:
                            continue # Se não achou SKU, pula o produto

                        # --- B. LÓGICA DE EXTRAÇÃO DO PREÇO ---
                        price = Decimal('0.00')
                        price_div = soup.find('div', class_=re.compile(r'nproduct-price-value'))
                        if price_div and price_div.has_attr('content'):
                            try:
                                price = Decimal(price_div['content'])
                            except:
                                pass

                        # --- C. EXTRAÇÃO DO NOME E IMAGEM (🚀 ATUALIZADO PELA SUA IMAGEM) ---
                        name = None
                        name_tag = soup.find('h1')
                        if name_tag:
                            name = name_tag.text.strip()
                        
                        image_url = None
                        
                        # Procura a tag img que tem a classe 'product-image'
                        img_tag = soup.find('img', class_=re.compile(r'product-image'))
                        if img_tag:
                            # 1º Tenta pegar a alta resolução do zoom
                            # 2º Tenta pegar do lazy-load comum
                            # 3º Tenta pegar do src básico
                            raw_image = img_tag.get('data-zoom-image') or img_tag.get('data-src') or img_tag.get('src')
                            
                            # Trava de Segurança: Não salvar o GIF base64 falso no banco de dados!
                            if raw_image and not raw_image.startswith('data:image'):
                                image_url = raw_image

                        if not name:
                            name = f"Produto {brand} - {sku}"

                        # --- D. SALVAR NO BANCO DE DADOS ---
                        # Usamos a mesma lógica segura para não sobrescrever o código de barras
                        product, created = Product.objects.get_or_create(
                            natura_sku=str(sku), # Reutilizamos seu campo natura_sku para guardar o Cód. Boticário
                            defaults={
                                'name': name[:255],
                                'category': brand, # Salvamos a Marca como categoria para facilitar
                                'official_price': price,
                                'bar_code': None, # Mantemos protegido
                                'image_url': image_url,
                                'description': f"Descoberto no site {brand} (Pág {page})",
                                'last_checked_at': timezone.now(),
                                'last_checked_price': price
                            }
                        )

                        # Se o produto já existia, atualizamos o preço e o nome sem mexer no EAN
                        if not created:
                            product.name = name[:255]
                            product.official_price = price
                            product.last_checked_at = timezone.now()
                            product.last_checked_price = price
                            if image_url:
                                product.image_url = image_url
                            product.save()

                        if price > 0:
                            PriceHistory.objects.create(product=product, price=price)

                        status = "✨" if created else "🔄"
                        img_status = "🖼️" if image_url else "❌"
                        self.stdout.write(self.style.SUCCESS(f"{status} [{brand}] {sku} - {name[:30]}... | R$ {price} | {img_status}"))

                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"❌ Erro ao ler produto {product_url}: {e}"))
                        sb.sleep(3)

                # Avança para a próxima página dos 3 sites
                page += 1
                
        self.stdout.write(self.style.SUCCESS("🎉 Varredura do Grupo Boticário Finalizada!"))