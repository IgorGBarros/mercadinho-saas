# inventory/management/commands/bluesoft_crawler_v2.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from inventory.models import ExternalBarcodeCatalog
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
import time
import random
from urllib.parse import urljoin, urlparse, parse_qs
import logging
import json

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Crawler Bluesoft V2 - Busca inteligente por produtos Natura'
    
    def add_arguments(self, parser):
        parser.add_argument('--strategy', type=str, default='search', 
                          choices=['search', 'categories', 'scroll'], 
                          help='Estratégia de busca: search, categories ou scroll')
        parser.add_argument('--delay', type=float, default=3.0, help='Delay entre requests')
        parser.add_argument('--dry-run', action='store_true', help='Apenas simular')
        parser.add_argument('--max-products', type=int, default=1000, help='Máximo de produtos')
    
    def handle(self, *args, **options):
        strategy = options['strategy']
        delay = options['delay']
        dry_run = options['dry_run']
        max_products = options['max_products']
        
        self.stdout.write(self.style.WARNING(f"🕷️ Bluesoft Crawler V2 - Estratégia: {strategy}"))
        
        stats = {
            'products_found': 0,
            'products_saved': 0,
            'errors': 0,
            'duplicates': 0
        }
        
        with SB(uc=True, headless=True, page_load_strategy="eager") as sb:
            # Configurações anti-detecção
            sb.execute_cdp_cmd('Network.setUserAgentOverride', {
                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            
            if strategy == 'search':
                stats = self.search_strategy(sb, delay, dry_run, max_products)
            elif strategy == 'categories':
                stats = self.categories_strategy(sb, delay, dry_run, max_products)
            elif strategy == 'scroll':
                stats = self.scroll_strategy(sb, delay, dry_run, max_products)
        
        self.print_final_stats(stats)
    
    def search_strategy(self, sb, delay, dry_run, max_products):
        """Estratégia 1: Buscar por 'Natura' no site"""
        stats = {'products_found': 0, 'products_saved': 0, 'errors': 0, 'duplicates': 0}
        
        try:
            # Ir para página de busca
            search_url = "https://cosmos.bluesoft.com.br/pesquisar"
            sb.open(search_url)
            sb.sleep(3)
            
            # Procurar campo de busca
            search_selectors = [
                'input[name="q"]',
                'input[type="search"]',
                'input[placeholder*="buscar"]',
                'input[placeholder*="pesquisar"]',
                '#search',
                '.search-input'
            ]
            
            search_input = None
            for selector in search_selectors:
                try:
                    if sb.is_element_present(selector):
                        search_input = selector
                        break
                except:
                    continue
            
            if not search_input:
                self.stdout.write(self.style.ERROR("❌ Campo de busca não encontrado"))
                return stats
            
            # Fazer busca por "Natura"
            sb.type(search_input, "Natura")
            sb.sleep(1)
            
            # Tentar submeter busca
            try:
                sb.press_keys(search_input, '\n')
            except:
                try:
                    sb.click('button[type="submit"]')
                except:
                    sb.click('.search-button')
            
            sb.sleep(5)
            
            # Verificar se chegou na página de resultados
            current_url = sb.get_current_url()
            self.stdout.write(f"   🔍 URL após busca: {current_url}")
            
            # Extrair produtos da página de resultados
            products = self.extract_all_products_from_current_page(sb)
            stats['products_found'] = len(products)
            
            # Processar produtos
            for product_data in products:
                if stats['products_saved'] >= max_products:
                    break
                    
                try:
                    if not dry_run:
                        result = self.save_product_data(product_data)
                        if result in ['saved', 'updated']:
                            stats['products_saved'] += 1
                        else:
                            stats['duplicates'] += 1
                    else:
                        self.stdout.write(f"   🧪 [DRY] {product_data['gtin']} - {product_data['description'][:50]}...")
                        stats['products_saved'] += 1
                except Exception as e:
                    stats['errors'] += 1
                    self.stdout.write(f"   ❌ Erro ao salvar: {e}")
            
        except Exception as e:
            stats['errors'] += 1
            self.stdout.write(self.style.ERROR(f"❌ Erro na estratégia de busca: {e}"))
        
        return stats
    
    def categories_strategy(self, sb, delay, dry_run, max_products):
        """Estratégia 2: Navegar por categorias que podem ter produtos Natura"""
        stats = {'products_found': 0, 'products_saved': 0, 'errors': 0, 'duplicates': 0}
        
        # URLs de categorias que podem ter produtos Natura
        category_urls = [
            "https://cosmos.bluesoft.com.br/categorias/cosmeticos",
            "https://cosmos.bluesoft.com.br/categorias/perfumaria",
            "https://cosmos.bluesoft.com.br/categorias/higiene-pessoal",
            "https://cosmos.bluesoft.com.br/categorias/cuidados-pessoais",
            "https://cosmos.bluesoft.com.br/produtos?categoria=cosmeticos",
            "https://cosmos.bluesoft.com.br/produtos?categoria=perfumaria"
        ]
        
        for category_url in category_urls:
            if stats['products_saved'] >= max_products:
                break
                
            try:
                self.stdout.write(f"   🔍 Explorando categoria: {category_url}")
                sb.open(category_url)
                sb.sleep(delay)
                
                # Extrair produtos da categoria
                products = self.extract_all_products_from_current_page(sb)
                
                # Filtrar apenas produtos Natura
                natura_products = [p for p in products if 'natura' in p['description'].lower()]
                
                self.stdout.write(f"   📦 Encontrados {len(natura_products)} produtos Natura nesta categoria")
                
                stats['products_found'] += len(natura_products)
                
                # Processar produtos Natura
                for product_data in natura_products:
                    if stats['products_saved'] >= max_products:
                        break
                        
                    try:
                        if not dry_run:
                            result = self.save_product_data(product_data)
                            if result in ['saved', 'updated']:
                                stats['products_saved'] += 1
                            else:
                                stats['duplicates'] += 1
                        else:
                            self.stdout.write(f"   🧪 [DRY] {product_data['gtin']} - {product_data['description'][:50]}...")
                            stats['products_saved'] += 1
                    except Exception as e:
                        stats['errors'] += 1
                
                time.sleep(delay)
                
            except Exception as e:
                stats['errors'] += 1
                self.stdout.write(f"   ❌ Erro na categoria {category_url}: {e}")
        
        return stats
    
    def scroll_strategy(self, sb, delay, dry_run, max_products):
        """Estratégia 3: Scroll infinito na página da marca"""
        stats = {'products_found': 0, 'products_saved': 0, 'errors': 0, 'duplicates': 0}
        
        try:
            # Ir para página da marca
            brand_url = "https://cosmos.bluesoft.com.br/marcas/natura-11309"
            sb.open(brand_url)
            sb.sleep(5)
            
            seen_gtins = set()
            scroll_attempts = 0
            max_scrolls = 50
            
            while scroll_attempts < max_scrolls and stats['products_saved'] < max_products:
                # Extrair produtos da página atual
                current_products = self.extract_all_products_from_current_page(sb)
                
                # Filtrar produtos já vistos
                new_products = [p for p in current_products if p['gtin'] not in seen_gtins]
                
                if not new_products:
                    self.stdout.write(f"   ⚠️ Nenhum produto novo encontrado no scroll {scroll_attempts + 1}")
                    
                    # Tentar scroll mais agressivo
                    sb.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    sb.sleep(3)
                    
                    # Tentar clicar em botão "Carregar mais" se existir
                    load_more_selectors = [
                        'button[class*="load-more"]',
                        'button[class*="carregar"]',
                        'a[class*="load-more"]',
                        '.pagination .next',
                        '[data-action="load-more"]'
                    ]
                    
                    clicked_load_more = False
                    for selector in load_more_selectors:
                        try:
                            if sb.is_element_present(selector):
                                sb.click(selector)
                                sb.sleep(3)
                                clicked_load_more = True
                                self.stdout.write(f"   ✅ Clicou em 'Carregar mais': {selector}")
                                break
                        except:
                            continue
                    
                    if not clicked_load_more:
                        scroll_attempts += 1
                        if scroll_attempts >= 3:  # Se 3 scrolls sem novos produtos, parar
                            self.stdout.write("   🏁 Não há mais produtos para carregar")
                            break
                else:
                    scroll_attempts = 0  # Reset contador se encontrou produtos novos
                    
                    for product_data in new_products:
                        seen_gtins.add(product_data['gtin'])
                        
                        try:
                            if not dry_run:
                                result = self.save_product_data(product_data)
                                if result in ['saved', 'updated']:
                                    stats['products_saved'] += 1
                                    self.stdout.write(f"   ✅ Salvo: {product_data['gtin']} - {product_data['description'][:50]}...")
                                else:
                                    stats['duplicates'] += 1
                            else:
                                self.stdout.write(f"   🧪 [DRY] {product_data['gtin']} - {product_data['description'][:50]}...")
                                stats['products_saved'] += 1
                        except Exception as e:
                            stats['errors'] += 1
                
                stats['products_found'] = len(seen_gtins)
                
                # Scroll para baixo
                sb.execute_script("window.scrollBy(0, 800);")
                sb.sleep(delay)
        
        except Exception as e:
            stats['errors'] += 1
            self.stdout.write(self.style.ERROR(f"❌ Erro na estratégia de scroll: {e}"))
        
        return stats
    
    def extract_all_products_from_current_page(self, sb):
        """Extrai todos os produtos da página atual"""
        products = []
        
        try:
            soup = BeautifulSoup(sb.get_page_source(), 'html.parser')
            
            # Procurar por diferentes padrões de produtos
            product_selectors = [
                'div[class*="product"]',
                'div[class*="item"]',
                'li[class*="product"]',
                '[data-gtin]',
                '[data-ean]'
            ]
            
            containers = []
            for selector in product_selectors:
                found = soup.select(selector)
                if found:
                    containers.extend(found)
            
            # Remover duplicatas
            unique_containers = []
            seen_texts = set()
            for container in containers:
                text = container.get_text()[:100]
                if text not in seen_texts:
                    unique_containers.append(container)
                    seen_texts.add(text)
            
            for container in unique_containers:
                product_data = self.extract_single_product_data(container, sb.get_current_url())
                if product_data and product_data.get('gtin'):
                    products.append(product_data)
        
        except Exception as e:
            self.stdout.write(f"   ❌ Erro ao extrair produtos: {e}")
        
        return products
    
    def extract_single_product_data(self, container, current_url):
        """Extrai dados de um produto específico"""
        try:
            # GTIN/EAN
            gtin = None
            container_text = container.get_text()
            
            # Procurar por GTIN em atributos primeiro
            for attr in ['data-gtin', 'data-ean', 'data-code', 'data-id']:
                value = container.get(attr)
                if value and value.isdigit() and len(value) in [8, 12, 13, 14]:
                    gtin = value
                    break
            
            # Se não encontrou, procurar no texto
            if not gtin:
                gtin_patterns = [
                    r'GTIN[:\s-]*(\d{8,14})',
                    r'EAN[:\s-]*(\d{8,14})',
                    r'Código[:\s-]*(\d{8,14})',
                    r'\b(\d{13,14})\b',
                    r'\b(\d{12})\b',
                    r'\b(\d{8})\b'
                ]
                
                for pattern in gtin_patterns:
                    match = re.search(pattern, container_text, re.IGNORECASE)
                    if match:
                        potential_gtin = match.group(1)
                        if len(potential_gtin) in [8, 12, 13, 14]:
                            # Validação básica: não deve ser ano, preço, etc
                            if not re.match(r'^(19|20)\d{2}', potential_gtin):
                                gtin = potential_gtin
                                break
            
            if not gtin:
                return None
            
            # Descrição
            description = None
            desc_selectors = [
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                '.product-name', '.item-title', '.product-title',
                '[class*="title"]', '[class*="name"]'
            ]
            
            for selector in desc_selectors:
                elem = container.select_one(selector)
                if elem:
                    text = elem.get_text(strip=True)
                    if text and len(text) > 5 and len(text) < 300:
                        # Filtrar textos que não parecem ser nomes de produtos
                        if not re.match(r'^\d+$', text) and 'preço' not in text.lower():
                            description = text
                            break
            
            if not description:
                # Pegar o texto mais relevante
                texts = []
                for elem in container.find_all(['span', 'div', 'p', 'a']):
                    text = elem.get_text(strip=True)
                    if (text and 
                        len(text) > 10 and 
                        len(text) < 200 and 
                        not text.isdigit() and
                        'r$' not in text.lower() and
                        'preço' not in text.lower()):
                        texts.append(text)
                
                if texts:
                    description = max(texts, key=len)
            
            if not description:
                description = f"Produto GTIN {gtin}"
            
            return {
                'brand': 'Natura',
                'gtin': gtin,
                'description': description.strip()[:255],
                'source': 'bluesoft',
                'source_url': current_url
            }
            
        except Exception as e:
            return None
    
    def save_product_data(self, product_data):
        """Salva dados do produto na tabela staging"""
        try:
            obj, created = ExternalBarcodeCatalog.objects.get_or_create(
                gtin=product_data['gtin'],
                defaults={
                    'brand': product_data['brand'],
                    'description': product_data['description'],
                    'source': product_data['source'],
                    'source_url': product_data.get('source_url'),
                    'matched': False
                }
            )
            
            if created:
                return 'saved'
            else:
                # Atualizar descrição se for mais completa
                if len(product_data['description']) > len(obj.description):
                    obj.description = product_data['description']
                    obj.source_url = product_data.get('source_url') or obj.source_url
                    obj.updated_at = timezone.now()
                    obj.save(update_fields=['description', 'source_url', 'updated_at'])
                    return 'updated'
                return 'duplicate'
                
        except Exception as e:
            logger.error(f"Erro ao salvar GTIN {product_data['gtin']}: {e}")
            raise e
    
    def print_final_stats(self, stats):
        """Imprime estatísticas finais"""
        self.stdout.write(self.style.SUCCESS("\n" + "="*60))
        self.stdout.write(self.style.SUCCESS("📊 RELATÓRIO FINAL - BLUESOFT CRAWLER V2"))
        self.stdout.write(self.style.SUCCESS("="*60))
        self.stdout.write(f"🔍 Produtos encontrados: {stats['products_found']}")
        self.stdout.write(f"💾 Produtos salvos: {stats['products_saved']}")
        self.stdout.write(f"🔄 Duplicatas: {stats['duplicates']}")
        self.stdout.write(f"❌ Erros: {stats['errors']}")
        self.stdout.write(self.style.SUCCESS("="*60))