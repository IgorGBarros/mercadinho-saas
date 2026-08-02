# inventory/management/commands/cosmos_barcode_finder_tracked.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db.models import Q
from inventory.models import Product, ExternalBarcodeCatalog
from seleniumbase import SB
from bs4 import BeautifulSoup
import re
import time
import random
import unicodedata
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Cosmos Barcode Finder - COM RASTREAMENTO COMPLETO'
    
    def add_arguments(self, parser):
        parser.add_argument('--brand', type=str, default='Natura', help='Marca para processar')
        parser.add_argument('--limit', type=int, default=10, help='Limite de produtos para processar')
        parser.add_argument('--delay', type=float, default=8.0, help='Delay entre buscas')
        parser.add_argument('--dry-run', action='store_true', help='Apenas simular')
        parser.add_argument('--skip-existing', action='store_true', help='Pular produtos que já têm código de barras')
        parser.add_argument('--test-product', type=str, help='Testar com um produto específico (natura_sku)')
    
    def handle(self, *args, **options):
        brand = options['brand']
        limit = options['limit']
        delay = options['delay']
        dry_run = options['dry_run']
        skip_existing = options['skip_existing']
        test_product = options['test_product']
        
        self.stdout.write(self.style.WARNING(f"🔍 Cosmos Barcode Finder - COM RASTREAMENTO"))
        
        # Se for teste de produto específico
        if test_product:
            try:
                product = Product.objects.get(natura_sku=test_product)
                self.test_single_product(product, delay, dry_run)
                return
            except Product.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"❌ Produto {test_product} não encontrado"))
                return
        
        # Buscar produtos
        query = Q(brand__iexact=brand)
        if skip_existing:
            query &= (Q(bar_code__isnull=True) | Q(bar_code=''))
        
        products = Product.objects.filter(query).order_by('id')[:limit]
        
        self.stdout.write(f"📦 Encontrados {products.count()} produtos para processar")
        
        stats = {
            'processed': 0,
            'found_barcodes': 0,
            'cloudflare_blocks': 0,
            'errors': 0,
            'high_confidence': 0,
            'medium_confidence': 0,
            'low_confidence': 0
        }
        
        with SB(uc=True, headless=True, page_load_strategy="eager") as sb:
            sb.driver.set_page_load_timeout(90)
            
            for product in products:
                try:
                    result = self.search_product_with_tracking(sb, product, delay, dry_run)
                    
                    stats['processed'] += 1
                    
                    if result['cloudflare_blocked']:
                        stats['cloudflare_blocks'] += 1
                        self.stdout.write(self.style.ERROR(
                            f"🛡️ [{stats['processed']}/{limit}] {product.natura_sku} - Bloqueado pelo Cloudflare"
                        ))
                    elif result['found']:
                        stats['found_barcodes'] += 1
                        
                        # Contar por nível de confiança
                        confidence = result.get('confidence', 'low')
                        if confidence == 'high':
                            stats['high_confidence'] += 1
                        elif confidence == 'medium':
                            stats['medium_confidence'] += 1
                        else:
                            stats['low_confidence'] += 1
                        
                        self.stdout.write(self.style.SUCCESS(
                            f"✅ [{stats['processed']}/{limit}] {product.natura_sku} - "
                            f"GTIN: {result['gtin']} ({confidence}) - "
                            f"Termo: '{result.get('search_term', 'N/A')}'"
                        ))
                    else:
                        self.stdout.write(
                            f"❌ [{stats['processed']}/{limit}] {product.natura_sku} - "
                            f"Sem GTIN (termo: '{result.get('search_term', 'N/A')}')"
                        )
                    
                    # Delay variável
                    sleep_time = delay + random.uniform(1.0, 3.0)
                    time.sleep(sleep_time)
                    
                except Exception as e:
                    stats['errors'] += 1
                    self.stdout.write(self.style.ERROR(
                        f"❌ [{stats['processed'] + 1}/{limit}] Erro no produto {product.natura_sku}: {e}"
                    ))
                    time.sleep(delay * 1.5)
        
        self.print_stats(stats)
    
    def test_single_product(self, product, delay, dry_run):
        """Testa busca para um produto específico"""
        self.stdout.write(f"🧪 Testando produto: {product.natura_sku} - {product.name}")
        
        with SB(uc=True, headless=False, page_load_strategy="eager") as sb:
            result = self.search_product_with_tracking(sb, product, delay, dry_run, debug=True)
            
            if result['cloudflare_blocked']:
                self.stdout.write(self.style.ERROR("🛡️ Bloqueado pelo Cloudflare"))
            elif result['found']:
                self.stdout.write(self.style.SUCCESS(
                    f"✅ GTIN encontrado: {result['gtin']} (confiança: {result.get('confidence', 'N/A')})"
                ))
                self.stdout.write(f"🔍 Termo usado: '{result.get('search_term', 'N/A')}'")
                if result.get('all_gtins'):
                    self.stdout.write(f"📋 Todos os GTINs: {result['all_gtins']}")
            else:
                self.stdout.write(self.style.ERROR(f"❌ GTIN não encontrado (termo: '{result.get('search_term', 'N/A')}')"))
    
    def search_product_with_tracking(self, sb, product, delay, dry_run, debug=False):
        """Busca com rastreamento completo"""
        result = {
            'found': False, 
            'gtin': None, 
            'cloudflare_blocked': False,
            'confidence': None,
            'search_term': None,
            'all_gtins': []
        }
        
        try:
            # Acessar página inicial
            sb.open("https://cosmos.bluesoft.com.br/")
            sb.sleep(random.uniform(3.0, 5.0))
            
            # Verificar Cloudflare
            page_title = sb.get_title()
            if "access denied" in page_title.lower() or "cloudflare" in page_title.lower():
                result['cloudflare_blocked'] = True
                return result
            
            sb.sleep(3)
            
            # Preparar busca
            search_term = self.prepare_search_term(product.name)
            result['search_term'] = search_term
            
            if debug:
                self.stdout.write(f"   🔍 Termo de busca: '{search_term}'")
            
            # Realizar busca
            success = self.perform_search(sb, search_term, debug)
            
            if not success:
                return result
            
            # Aguardar resultados
            sb.sleep(random.uniform(4.0, 6.0))
            
            # Verificar bloqueio após busca
            current_title = sb.get_title()
            if "access denied" in current_title.lower() or "cloudflare" in current_title.lower():
                result['cloudflare_blocked'] = True
                return result
            
            # Extrair GTINs
            page_source = sb.get_page_source()
            
            if debug:
                with open(f"debug_tracked_{product.natura_sku}.html", "w", encoding="utf-8") as f:
                    f.write(page_source)
                self.stdout.write(f"   💾 HTML salvo para debug")
            
            # Análise de GTINs
            gtin_analysis = self.extract_gtins_with_context(page_source, product, debug)
            
            if gtin_analysis['gtins']:
                result['found'] = True
                result['gtin'] = gtin_analysis['best_gtin']
                result['confidence'] = gtin_analysis['confidence']
                result['all_gtins'] = gtin_analysis['gtins']
                
                if not dry_run:
                    self.save_barcode_with_tracking(
                        product, 
                        gtin_analysis['best_gtin'], 
                        gtin_analysis['confidence'],
                        search_term,
                        gtin_analysis['gtins']
                    )
            
        except Exception as e:
            if debug:
                self.stdout.write(f"   ❌ Erro: {e}")
        
        return result
    
    def save_barcode_with_tracking(self, product, best_gtin, confidence, search_term, all_gtins):
        """Salva resultado com rastreamento completo"""
        try:
            # ✅ SALVAR O GTIN PRINCIPAL COM RASTREAMENTO COMPLETO
            obj, created = ExternalBarcodeCatalog.objects.get_or_create(
                gtin=best_gtin,
                defaults={
                    'brand': product.brand,
                    'description': product.name,
                    'source': f'cosmos_tracked_{confidence}',
                    'matched': True,
                    # ✅ CAMPOS DE RASTREAMENTO
                    'searched_product_sku': product.natura_sku,
                    'searched_product_name': product.name,
                    'search_term_used': search_term,
                    'confidence_level': confidence
                }
            )
            
            # Se já existia, atualizar campos de rastreamento
            if not created:
                obj.searched_product_sku = product.natura_sku
                obj.searched_product_name = product.name
                obj.search_term_used = search_term
                obj.confidence_level = confidence
                obj.source = f'cosmos_tracked_{confidence}'
                obj.updated_at = timezone.now()
                obj.save(update_fields=[
                    'searched_product_sku', 'searched_product_name', 
                    'search_term_used', 'confidence_level', 'source', 'updated_at'
                ])
            
            # ✅ SALVAR OUTROS GTINs ENCONTRADOS COMO ALTERNATIVAS
            for gtin in all_gtins:
                if gtin != best_gtin:  # Não duplicar o principal
                    ExternalBarcodeCatalog.objects.get_or_create(
                        gtin=gtin,
                        defaults={
                            'brand': product.brand,
                            'description': f"[ALT] {product.name}",  # Marcar como alternativa
                            'source': f'cosmos_alternative_{confidence}',
                            'matched': False,  # Não matched automaticamente
                            'searched_product_sku': product.natura_sku,
                            'searched_product_name': product.name,
                            'search_term_used': search_term,
                            'confidence_level': 'alternative'
                        }
                    )
            
            # Salvar no produto apenas se confiança alta ou média
            if confidence in ['high', 'medium']:
                product.bar_code = best_gtin
                product.save(update_fields=['bar_code'])
            
        except Exception as e:
            logger.error(f"Erro ao salvar GTIN {best_gtin} para produto {product.natura_sku}: {e}")
    
    # ... (resto dos métodos permanecem iguais: extract_gtins_with_context, prepare_search_term, etc.)
    
    def extract_gtins_with_context(self, html_content, product, debug=False):
        """Extrai GTINs analisando o contexto para encontrar o mais relevante"""
        analysis = {
            'gtins': [],
            'best_gtin': None,
            'confidence': 'low'
        }
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            page_text = soup.get_text()
            
            # Padrões para encontrar GTINs
            gtin_patterns = [
                r'GTIN/EAN:\s*(\d{8,14})',  # Padrão específico do Cosmos
                r'GTIN[:\s-]*(\d{8,14})',
                r'EAN[:\s-]*(\d{8,14})',
                r'Código[:\s-]*(\d{8,14})',
                r'\b(\d{13,14})\b'  # GTINs de 13-14 dígitos
            ]
            
            found_gtins = []
            for pattern in gtin_patterns:
                matches = re.findall(pattern, page_text, re.IGNORECASE)
                found_gtins.extend(matches)
            
            # Filtrar GTINs válidos
            valid_gtins = []
            for gtin in found_gtins:
                if (len(gtin) in [8, 12, 13, 14] and 
                    not re.match(r'^(19|20)\d{2}', gtin) and  # Não é ano
                    not re.match(r'^0+$', gtin) and           # Não é só zeros
                    gtin not in ['1234567890123']):           # Não é exemplo
                    valid_gtins.append(gtin)
            
            # Remover duplicatas mantendo ordem
            unique_gtins = list(dict.fromkeys(valid_gtins))
            
            if debug:
                self.stdout.write(f"   🔢 GTINs válidos encontrados: {len(unique_gtins)}")
                if unique_gtins:
                    self.stdout.write(f"   📋 Lista: {unique_gtins[:10]}")
            
            if not unique_gtins:
                return analysis
            
            # Analisar contexto de cada GTIN
            gtin_scores = {}
            product_words = self.normalize_text(product.name).lower().split()
            
            for gtin in unique_gtins:
                score = 0
                
                # Encontrar elementos HTML que contêm este GTIN
                gtin_elements = soup.find_all(text=re.compile(gtin))
                
                for elem_text in gtin_elements:
                    parent = elem_text.parent
                    if not parent:
                        continue
                    
                    # Pegar contexto (elemento pai e irmãos)
                    context_elements = [parent]
                    
                    # Adicionar elementos próximos
                    for sibling in parent.find_next_siblings()[:2]:
                        context_elements.append(sibling)
                    for sibling in parent.find_previous_siblings()[:2]:
                        context_elements.append(sibling)
                    
                    # Analisar contexto
                    context_text = ""
                    for elem in context_elements:
                        context_text += " " + elem.get_text().lower()
                    
                    # Pontuar baseado na similaridade
                    context_words = context_text.split()
                    word_matches = sum(1 for word in product_words if word in context_words)
                    score += word_matches * 2
                    
                    # Pontuar se contém "natura"
                    if "natura" in context_text:
                        score += 10
                    
                    # Pontuar se está em estrutura de produto
                    parent_classes = parent.get('class', [])
                    if any('product' in str(cls).lower() for cls in parent_classes):
                        score += 5
                    
                    # Pontuar similaridade do nome
                    similarity = SequenceMatcher(None, 
                                               self.normalize_text(product.name).lower(),
                                               context_text).ratio()
                    score += similarity * 20
                
                gtin_scores[gtin] = score
            
            if debug and gtin_scores:
                sorted_scores = sorted(gtin_scores.items(), key=lambda x: x[1], reverse=True)
                self.stdout.write(f"   🎯 Top 5 GTINs por score:")
                for i, (gtin, score) in enumerate(sorted_scores[:5]):
                    self.stdout.write(f"      {i+1}. {gtin} (score: {score:.1f})")
            
            # Selecionar melhor GTIN
            if gtin_scores:
                best_gtin = max(gtin_scores, key=gtin_scores.get)
                best_score = gtin_scores[best_gtin]
                
                # Determinar confiança
                if best_score >= 15:
                    confidence = 'high'
                elif best_score >= 5:
                    confidence = 'medium'
                else:
                    confidence = 'low'
                
                analysis['gtins'] = unique_gtins
                analysis['best_gtin'] = best_gtin
                analysis['confidence'] = confidence
            
        except Exception as e:
            if debug:
                self.stdout.write(f"   ❌ Erro na análise de GTINs: {e}")
        
        return analysis
    
    def perform_search(self, sb, search_term, debug=False):
        """Realiza a busca no site"""
        try:
            search_selectors = [
                "#search-input",
                "input[name='q']",
                "input[type='search']",
                "input[placeholder*='Pesquise']"
            ]
            
            search_field = None
            for selector in search_selectors:
                if sb.is_element_present(selector):
                    search_field = selector
                    break
            
            if not search_field:
                if debug:
                    self.stdout.write("   ❌ Campo de busca não encontrado")
                return False
            
            sb.click(search_field)
            sb.sleep(0.5)
            sb.clear(search_field)
            sb.sleep(0.5)
            sb.type(search_field, search_term)
            sb.sleep(1)
            sb.press_keys(search_field, '\n')
            
            if debug:
                self.stdout.write(f"   ✅ Busca realizada com sucesso")
            
            return True
            
        except Exception as e:
            if debug:
                self.stdout.write(f"   ❌ Erro na busca: {e}")
            return False
    
    def prepare_search_term(self, product_name):
        """Prepara termo de busca otimizado"""
        term = self.normalize_text(product_name)
        
        stop_words = ['produto', 'natura', 'ml', 'g', 'unidade', 'un', 'cx', 'caixa']
        words = term.split()
        filtered_words = [w for w in words if w.lower() not in stop_words and len(w) > 2]
        
        important_words = filtered_words[:3]
        
        return ' '.join(important_words)
    
    def normalize_text(self, text):
        """Normaliza texto"""
        if not text:
            return ""
        
        text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
        text = re.sub(r'[^A-Za-z0-9 ]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
        
        return text
    
    def print_stats(self, stats):
        """Imprime estatísticas detalhadas"""
        self.stdout.write(self.style.SUCCESS("\n" + "="*70))
        self.stdout.write(self.style.SUCCESS("📊 RELATÓRIO FINAL - COSMOS BARCODE FINDER COM RASTREAMENTO"))
        self.stdout.write(self.style.SUCCESS("="*70))
        self.stdout.write(f"📊 Produtos processados: {stats['processed']}")
        self.stdout.write(f"✅ GTINs encontrados: {stats['found_barcodes']}")
        self.stdout.write(f"🎯 Alta confiança: {stats['high_confidence']}")
        self.stdout.write(f"🔍 Média confiança: {stats['medium_confidence']}")
        self.stdout.write(f"⚠️ Baixa confiança: {stats['low_confidence']}")
        self.stdout.write(f"🛡️ Bloqueios Cloudflare: {stats['cloudflare_blocks']}")
        self.stdout.write(f"❌ Erros: {stats['errors']}")
        
        if stats['processed'] > 0:
            success_rate = (stats['found_barcodes'] / stats['processed']) * 100
            self.stdout.write(f"📈 Taxa de sucesso: {success_rate:.1f}%")
        
        self.stdout.write(self.style.SUCCESS("="*70))
        self.stdout.write("💡 Para ver detalhes dos GTINs encontrados:")
        self.stdout.write("   python manage.py shell")
        self.stdout.write("   >>> from inventory.models import ExternalBarcodeCatalog")
        self.stdout.write("   >>> ExternalBarcodeCatalog.objects.filter(searched_product_sku__isnull=False).order_by('-created_at')[:10]")