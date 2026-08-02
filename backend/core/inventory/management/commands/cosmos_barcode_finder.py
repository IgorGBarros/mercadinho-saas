# inventory/management/commands/cosmos_barcode_finder_fixed.py
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
    help = 'Cosmos Barcode Finder - VERSÃO OTIMIZADA (máx 3 GTINs por produto)'
    
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
        
        self.stdout.write(self.style.WARNING(f"🔍 Cosmos Barcode Finder - VERSÃO OTIMIZADA"))
        
        # Se for teste de produto específico
        if test_product:
            try:
                product = Product.objects.get(natura_sku=test_product)
                self.test_single_product(product, delay, dry_run)
                return
            except Product.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"❌ Produto {test_product} não encontrado"))
                return
        
    # ✅ QUERY MELHORADA - mais explícita
        query = Q(brand__iexact=brand)
        
        if skip_existing:
            # Pular produtos que JÁ têm código de barras
            query &= (Q(bar_code__isnull=True) | Q(bar_code=''))
            self.stdout.write(f"🔒 Modo seguro: processando apenas produtos SEM código de barras")
        else:
            self.stdout.write(f"⚠️ Processando TODOS os produtos (incluindo os que já têm código)")
        
        products = Product.objects.filter(query).order_by('id')[:limit]
        
        # ✅ ESTATÍSTICAS MAIS CLARAS
        total_products = Product.objects.filter(brand__iexact=brand).count()
        products_with_barcode = Product.objects.filter(brand__iexact=brand, bar_code__isnull=False).count()
        products_without_barcode = total_products - products_with_barcode
        
        self.stdout.write(f"📊 Estatísticas da marca {brand}:")
        self.stdout.write(f"   Total: {total_products} produtos")
        self.stdout.write(f"   Com código: {products_with_barcode}")
        self.stdout.write(f"   Sem código: {products_without_barcode}")
        self.stdout.write(f"   Selecionados: {products.count()}")
        
        stats = {
            'processed': 0,
            'found_barcodes': 0,
            'cloudflare_blocks': 0,
            'errors': 0,
            'very_high_confidence': 0,
            'high_confidence': 0,
            'medium_confidence': 0,
            'low_confidence': 0,
            'alternatives_saved': 0  # ✅ NOVO: contar alternativas
        }
        
        with SB(uc=True, headless=True, page_load_strategy="eager") as sb:
            sb.driver.set_page_load_timeout(90)
            
            for product in products:
                try:
                    result = self.search_product_smart(sb, product, delay, dry_run)
                    
                    stats['processed'] += 1
                    
                    if result['cloudflare_blocked']:
                        stats['cloudflare_blocks'] += 1
                        self.stdout.write(self.style.ERROR(
                            f"🛡️ [{stats['processed']}/{limit}] {product.natura_sku} - Bloqueado pelo Cloudflare"
                        ))
                    elif result['found']:
                        stats['found_barcodes'] += 1
                        stats['alternatives_saved'] += result.get('alternatives_saved', 0)
                        
                        # Contar por nível de confiança
                        confidence = result.get('confidence', 'low')
                        if confidence == 'very_high':
                            stats['very_high_confidence'] += 1
                        elif confidence == 'high':
                            stats['high_confidence'] += 1
                        elif confidence == 'medium':
                            stats['medium_confidence'] += 1
                        else:
                            stats['low_confidence'] += 1
                        
                        alt_info = f" +{result.get('alternatives_saved', 0)}alt" if result.get('alternatives_saved', 0) > 0 else ""
                        
                        self.stdout.write(self.style.SUCCESS(
                            f"✅ [{stats['processed']}/{limit}] {product.natura_sku} - "
                            f"GTIN: {result['gtin']} ({confidence}){alt_info}"
                        ))
                    else:
                        self.stdout.write(
                            f"❌ [{stats['processed']}/{limit}] {product.natura_sku} - "
                            f"Sem GTIN encontrado"
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
            result = self.search_product_smart(sb, product, delay, dry_run, debug=True)
            
            if result['cloudflare_blocked']:
                self.stdout.write(self.style.ERROR("🛡️ Bloqueado pelo Cloudflare"))
            elif result['found']:
                self.stdout.write(self.style.SUCCESS(
                    f"✅ GTIN encontrado: {result['gtin']} (confiança: {result.get('confidence', 'N/A')})"
                ))
                self.stdout.write(f"🔍 Termo usado: '{result.get('search_term', 'N/A')}'")
                self.stdout.write(f"📋 Alternativas salvas: {result.get('alternatives_saved', 0)}")
                if result.get('all_gtins'):
                    self.stdout.write(f"📋 Todos os GTINs: {result['all_gtins']}")
            else:
                self.stdout.write(self.style.ERROR(f"❌ GTIN não encontrado"))
    
    def search_product_smart(self, sb, product, delay, dry_run, debug=False):
        """Busca inteligente com extração melhorada"""
        result = {
            'found': False, 
            'gtin': None, 
            'cloudflare_blocked': False,
            'confidence': None,
            'search_term': None,
            'all_gtins': [],
            'alternatives_saved': 0
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
                with open(f"debug_search_{product.natura_sku}.html", "w", encoding="utf-8") as f:
                    f.write(page_source)
                self.stdout.write(f"   💾 HTML salvo para debug")
            
            # ✅ USAR O ALGORITMO INTELIGENTE COM SCORES
            gtin_analysis = self.extract_gtins_with_context_intelligent(page_source, product, debug)
            
            if gtin_analysis['gtins']:
                result['found'] = True
                result['gtin'] = gtin_analysis['best_gtin']
                result['confidence'] = gtin_analysis['confidence']
                result['all_gtins'] = gtin_analysis['gtins']
                
                if not dry_run:
                    # ✅ USAR MÉTODO OTIMIZADO COM SCORES
                    alternatives_saved = self.save_barcode_result_optimized(
                        product, 
                        gtin_analysis['best_gtin'], 
                        gtin_analysis['confidence'],
                        search_term,
                        gtin_analysis['gtins'],
                        gtin_analysis['scores']  # ✅ PASSAR OS SCORES
                    )
                    result['alternatives_saved'] = alternatives_saved
            
        except Exception as e:
            if debug:
                self.stdout.write(f"   ❌ Erro: {e}")
        
        return result
    
    def extract_gtins_with_context_intelligent(self, html_content, product, debug=False):
        """✅ ALGORITMO DE SCORING INTELIGENTE - COM RETORNO DE SCORES"""
        analysis = {
            'gtins': [],
            'best_gtin': None,
            'confidence': 'low',
            'scores': {}  # ✅ ADICIONAR SCORES
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
            # ✅ Filtrar APENAS EAN-13 válidos
            valid_gtins = []

            for gtin in found_gtins:
                # ✅ Regra 1: precisa ter EXATAMENTE 13 dígitos
                if len(gtin) != 13:
                    continue

                # ✅ Regra 2: só números
                if not gtin.isdigit():
                    continue

                # ✅ Regra 3: evitar anos / lixo óbvio
                if re.match(r'^(19|20)\d{11}$', gtin):
                    continue

                # ✅ Regra 4: evitar exemplos fake
                if gtin in ['0000000000000', '1234567890123']:
                    continue

                valid_gtins.append(gtin)
            
            # Remover duplicatas mantendo ordem
            unique_gtins = list(dict.fromkeys(valid_gtins))
            
            if debug:
                self.stdout.write(f"   🔢 GTINs válidos encontrados: {len(unique_gtins)}")
            
            if not unique_gtins:
                return analysis
            
            # ✅ ALGORITMO DE SCORING INTELIGENTE
            gtin_scores = {}
            
            # Extrair informações do produto
            product_name_lower = product.name.lower()
            product_words = self.normalize_text(product.name).lower().split()
            
            # Identificar palavras-chave importantes
            important_words = []
            volume_info = {'number': None, 'unit': None}
            
            for word in product_words:
                if len(word) > 2 and word not in ['produto', 'natura']:
                    important_words.append(word)
            
            # Extrair informação de volume/tamanho
            volume_match = re.search(r'(\d+)\s*(ml|g|mg)', product_name_lower)
            if volume_match:
                volume_info['number'] = volume_match.group(1)
                volume_info['unit'] = volume_match.group(2)
            
            if debug:
                self.stdout.write(f"   🎯 Palavras importantes: {important_words}")
                self.stdout.write(f"   📏 Volume detectado: {volume_info['number']} {volume_info['unit']}")
            
            for gtin in unique_gtins:
                score = 0
                match_details = []
                
                # Encontrar contextos onde este GTIN aparece
                gtin_elements = soup.find_all(text=re.compile(gtin))
                
                for elem_text in gtin_elements:
                    parent = elem_text.parent
                    if not parent:
                        continue
                    
                    # Pegar contexto amplo (4 níveis acima)
                    context_text = ""
                    current = parent
                    
                    for level in range(4):
                        if current:
                            context_text += " " + current.get_text()
                            current = current.parent
                        else:
                            break
                    
                    context_lower = context_text.lower()
                    
                    # ✅ PONTUAÇÃO INTELIGENTE
                    
                    # 1. Todas as palavras importantes presentes (PESO MUITO ALTO)
                    words_found = [word for word in important_words if word in context_lower]
                    if len(words_found) == len(important_words):
                        score += 50  # Todas as palavras = match perfeito
                        match_details.append(f"Todas palavras ({len(words_found)}) +50")
                    else:
                        score += len(words_found) * 10  # Cada palavra = 10 pontos
                        if words_found:
                            match_details.append(f"Palavras {words_found} +{len(words_found)*10}")
                    
                    # 2. Volume/tamanho EXATO (PESO ALTÍSSIMO)
                    if volume_info['number'] and volume_info['unit']:
                        volume_pattern = f"{volume_info['number']}.*{volume_info['unit']}"
                        if re.search(volume_pattern, context_lower):
                            score += 100  # Volume exato = match quase certo
                            match_details.append(f"Volume exato {volume_info['number']}{volume_info['unit']} +100")
                        elif volume_info['number'] in context_lower:
                            score += 20  # Só o número
                            match_details.append(f"Número do volume {volume_info['number']} +20")
                        elif volume_info['unit'] in context_lower:
                            score += 10  # Só a unidade
                            match_details.append(f"Unidade {volume_info['unit']} +10")
                    
                    # 3. Marca Natura (PESO ALTO)
                    if 'natura' in context_lower:
                        score += 30
                        match_details.append("Marca Natura +30")
                    
                    # 4. Evitar produtos relacionados mas diferentes
                    # Penalizar se for pincel, refil, etc.
                    penalty_words = ['pincel', 'refil', 'ref', 'comp', 'compacto']
                    for penalty_word in penalty_words:
                        if penalty_word in context_lower:
                            score -= 20
                            match_details.append(f"Penalidade '{penalty_word}' -20")
                    
                    # Penalizar se for de outra marca
                    other_brands = ['fenzza', 'kb maq']
                    for brand in other_brands:
                        if brand in context_lower:
                            score -= 30
                            match_details.append(f"Outra marca '{brand}' -30")
                    
                    # 5. Tipo de produto correto
                    if any(tipo in context_lower for tipo in ['deo parfum', 'desodorante', 'perfume']):
                        if any(tipo in product_name_lower for tipo in ['deo', 'desodorante', 'perfume']):
                            score += 25
                            match_details.append("Tipo produto correto +25")
                    
                    # 6. Estrutura HTML de produto
                    parent_classes = parent.get('class', [])
                    if any('product' in str(cls).lower() for cls in parent_classes):
                        score += 5
                        match_details.append("Estrutura produto +5")
                    
                    # 7. Similaridade geral (peso menor)
                    similarity = SequenceMatcher(None, product_name_lower, context_lower).ratio()
                    similarity_points = int(similarity * 20)
                    score += similarity_points
                    if similarity_points > 5:
                        match_details.append(f"Similaridade {similarity:.2f} +{similarity_points}")
                
                gtin_scores[gtin] = max(0, score)  # Score nunca negativo
                
                if debug and score > 0:
                    self.stdout.write(f"   🔢 GTIN {gtin}: {score} pontos")
                    for detail in match_details[:5]:  # Mostrar top 5 detalhes
                        self.stdout.write(f"      • {detail}")
            
            if debug and gtin_scores:
                sorted_scores = sorted(gtin_scores.items(), key=lambda x: x[1], reverse=True)
                self.stdout.write(f"\n   🏆 RANKING FINAL:")
                for i, (gtin, score) in enumerate(sorted_scores[:5]):
                    confidence_level = "MUITO ALTA" if score >= 100 else "ALTA" if score >= 50 else "MÉDIA" if score >= 20 else "BAIXA"
                    self.stdout.write(f"      {i+1}. {gtin}: {score} pontos ({confidence_level})")
            
            # ✅ SELECIONAR MELHOR GTIN COM CRITÉRIOS RIGOROSOS
            if gtin_scores:
                best_gtin = max(gtin_scores, key=gtin_scores.get)
                best_score = gtin_scores[best_gtin]
                
                # Critérios de confiança
                if best_score >= 100:
                    confidence = 'very_high'
                elif best_score >= 50:
                    confidence = 'high'
                elif best_score >= 20:
                    confidence = 'medium'
                elif best_score >= 10:
                    confidence = 'low'
                else:
                    confidence = 'very_low'
                
                if debug:
                    self.stdout.write(f"\n   🎯 RESULTADO FINAL:")
                    self.stdout.write(f"      GTIN: {best_gtin}")
                    self.stdout.write(f"      Score: {best_score}")
                    self.stdout.write(f"      Confiança: {confidence}")
                
                analysis['gtins'] = unique_gtins
                analysis['best_gtin'] = best_gtin
                analysis['confidence'] = confidence
                analysis['scores'] = gtin_scores  # ✅ RETORNAR SCORES
            
        except Exception as e:
            if debug:
                self.stdout.write(f"   ❌ Erro na análise: {e}")
        
        return analysis
    
    def save_barcode_result_optimized(self, product, best_gtin, confidence, search_term, all_gtins, gtin_scores):
        """✅ VERSÃO SEGURA: Só preenche bar_code se estiver NULL"""
        alternatives_saved = 0
        
        try:
            print(f"🔄 Salvando GTIN {best_gtin} para produto {product.natura_sku}")
            
            # ✅ 1. SALVAR APENAS O MELHOR GTIN
            obj, created = ExternalBarcodeCatalog.objects.get_or_create(
                gtin=best_gtin,
                defaults={
                    'brand': product.brand,
                    'description': product.name,
                    'source': f'cosmos_optimized_{confidence}',
                    'matched': True,
                    'searched_product_sku': product.natura_sku,
                    'searched_product_name': product.name,
                    'search_term_used': search_term,
                    'confidence_level': confidence
                }
            )
            
            # Se já existia, atualizar
            if not created:
                obj.searched_product_sku = product.natura_sku
                obj.searched_product_name = product.name
                obj.search_term_used = search_term
                obj.confidence_level = confidence
                obj.source = f'cosmos_optimized_{confidence}'
                obj.updated_at = timezone.now()
                obj.save(update_fields=[
                    'searched_product_sku', 'searched_product_name', 
                    'search_term_used', 'confidence_level', 'source', 'updated_at'
                ])
            
            print(f"✅ GTIN principal salvo: created={created}")
            
            # ✅ 2. SALVAR NO MÁXIMO 2 ALTERNATIVAS (apenas se muito relevantes)
            if gtin_scores and len(all_gtins) > 1:
                best_score = gtin_scores.get(best_gtin, 0)
                
                # Ordenar GTINs por score (excluindo o melhor)
                other_gtins = [(gtin, gtin_scores.get(gtin, 0)) for gtin in all_gtins if gtin != best_gtin]
                other_gtins.sort(key=lambda x: x[1], reverse=True)
                
                for gtin, score in other_gtins:
                    # ✅ CRITÉRIOS SUPER RIGOROSOS para alternativas
                    if (alternatives_saved < 2 and        # Máximo 2 alternativas
                        score >= 30 and                   # Score mínimo alto
                        score >= (best_score * 0.75)):    # Pelo menos 75% do melhor score
                        
                        try:
                            ExternalBarcodeCatalog.objects.get_or_create(
                                gtin=gtin,
                                defaults={
                                    'brand': product.brand,
                                    'description': f"[ALT-{score}] {product.name}",
                                    'source': f'cosmos_alt_relevant',
                                    'matched': False,
                                    'searched_product_sku': product.natura_sku,
                                    'searched_product_name': product.name,
                                    'search_term_used': search_term,
                                    'confidence_level': f'alternative_{score}'
                                }
                            )
                            alternatives_saved += 1
                            print(f"✅ Alternativa relevante salva: {gtin} (score: {score})")
                        except Exception:
                            pass  # Ignorar erros de duplicata
                    else:
                        print(f"⏭️ GTIN {gtin} ignorado (score: {score}, critério não atendido)")
            
            # ✅ 3. SALVAR NO PRODUTO - APENAS SE bar_code FOR NULL
            if confidence in ['very_high', 'high', 'medium']:
                # ✅ VERIFICAÇÃO CRÍTICA: só preencher se bar_code for NULL
                if not product.bar_code:  # ← PROTEÇÃO ADICIONADA
                    product.bar_code = best_gtin
                    product.save(update_fields=['bar_code'])
                    print(f"✅ Código de barras salvo no produto {product.natura_sku}")
                else:
                    print(f"🔒 Produto {product.natura_sku} já tem código de barras: {product.bar_code} (não sobrescrito)")
            else:
                print(f"⚠️ Confiança baixa ({confidence}) - não salvo no produto")
            
        except Exception as e:
            print(f"❌ Erro ao salvar GTIN {best_gtin}: {e}")
            logger.error(f"Erro ao salvar GTIN {best_gtin} para produto {product.natura_sku}: {e}")
        
        return alternatives_saved
    
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
        """✅ Estatísticas com controle de alternativas"""
        self.stdout.write(self.style.SUCCESS("\n" + "="*70))
        self.stdout.write(self.style.SUCCESS("📊 RELATÓRIO FINAL - VERSÃO OTIMIZADA"))
        self.stdout.write(self.style.SUCCESS("="*70))
        self.stdout.write(f"📊 Produtos processados: {stats['processed']}")
        self.stdout.write(f"✅ GTINs principais encontrados: {stats['found_barcodes']}")
        self.stdout.write(f"🔄 Alternativas relevantes salvas: {stats['alternatives_saved']}")
        self.stdout.write(f"📈 Total de registros: {stats['found_barcodes'] + stats['alternatives_saved']}")
        self.stdout.write(f"🚀 Confiança muito alta: {stats['very_high_confidence']}")
        self.stdout.write(f"🎯 Confiança alta: {stats['high_confidence']}")
        self.stdout.write(f"🔍 Confiança média: {stats['medium_confidence']}")
        self.stdout.write(f"⚠️ Confiança baixa: {stats['low_confidence']}")
        self.stdout.write(f"🛡️ Bloqueios Cloudflare: {stats['cloudflare_blocks']}")
        self.stdout.write(f"❌ Erros: {stats['errors']}")
        
        if stats['processed'] > 0:
            success_rate = (stats['found_barcodes'] / stats['processed']) * 100
            high_quality_rate = ((stats['very_high_confidence'] + stats['high_confidence']) / stats['processed']) * 100
            avg_records_per_product = (stats['found_barcodes'] + stats['alternatives_saved']) / stats['processed']
            
            self.stdout.write(f"📈 Taxa de sucesso: {success_rate:.1f}%")
            self.stdout.write(f"🎯 Taxa alta qualidade: {high_quality_rate:.1f}%")
            self.stdout.write(f"📊 Média registros/produto: {avg_records_per_product:.1f}")
        
        self.stdout.write(self.style.SUCCESS("="*70))
        
        # Estimativa para todos os produtos
        if stats['processed'] > 0:
            avg_per_product = (stats['found_barcodes'] + stats['alternatives_saved']) / stats['processed']
            estimated_total = int(3676 * avg_per_product)
            self.stdout.write(f"💡 Estimativa para 3676 produtos: ~{estimated_total} registros")