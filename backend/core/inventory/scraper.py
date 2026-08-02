import requests
from bs4 import BeautifulSoup
from fake_useragent import UserAgent
import re
from decimal import Decimal
import difflib # Biblioteca para comparar similaridade de texto

# --- FUNÇÕES AUXILIARES ---

def detect_category(name):
    """
    Define a categoria baseada em palavras-chave no nome do produto.
    """
    name_lower = name.lower()
    
    if any(x in name_lower for x in ['colônia', 'parfum', 'toilette', 'deo corporal', 'perfume']): return "Perfumaria"
    if any(x in name_lower for x in ['shampoo', 'condicionador', 'máscara', 'cabelo']): return "Cabelos"
    if any(x in name_lower for x in ['sabonete', 'hidratante', 'creme', 'óleo', 'desodorante', 'polpa']): return "Corpo e Banho"
    if any(x in name_lower for x in ['batom', 'base', 'corretivo', 'pó', 'rimel', 'delineador']): return "Maquiagem"
    if any(x in name_lower for x in ['mamãe', 'bebê', 'infantil', 'criança']): return "Infantil"
    if any(x in name_lower for x in ['barba', 'homem', 'masculino']): return "Homem"
        
    return "Geral"

def extract_sku_from_url(url):
    if not url: return None
    match = re.search(r'NATBRA-(\d+)', url)
    if match: return match.group(1)
    return None

# --- SCRAPERS ESPECÍFICOS ---
def search_natura_official(query):
    """
    Busca interna da Natura. 
    RETORNA UMA LISTA DE CANDIDATOS.
    """
    print(f"   ↳ Buscando na Natura: '{query}'")
    url = f"https://www.natura.com.br/s/produtos?busca={query}"
    
    found_products = []
    
    try:
        ua = UserAgent()
        headers = {"User-Agent": ua.random, "Accept-Language": "pt-BR"}
        resp = requests.get(url, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
             # --- EXTRAÇÃO DO TOTAL DE RESULTADOS ---
            total_tag = soup.find('p', {'data-testid': 'search-total-results'})
            if total_tag:
                total_text = total_tag.get_text().strip()
                # Extrai apenas o número ("14 resultados..." -> 14)
                match_count = re.search(r'(\d+)', total_text)
                if match_count:
                    total_count = int(match_count.group(1))
                    print(f"      📊 Natura diz: {total_count} resultados encontrados.")
            else:
                print("      ℹ️ Tag de total não encontrada (pode ser 0 ou layout diferente).")
            # Pega todos os cards que tenham ID de produto (NATBRA-...)
            cards = soup.find_all('div', id=re.compile(r'NATBRA-\d+'))
            
            if not cards:
                print(f"      ❌ HTML parseado, mas ZERO cards encontrados.")
                return []

            print(f"      ✅ Natura retornou {len(cards)} resultados brutos.")
            
            for card in cards:
                try:
                    # Extrai SKU do ID do card
                    card_id = card.get('id')
                    sku_match = re.search(r'NATBRA-(\d+)', card_id)
                    if not sku_match: continue
                    sku = sku_match.group(1)

                    # Extrai Nome
                    name_tag = card.find(['h4', 'h3'])
                    if not name_tag: 
                        print(f"         ⚠️ SKU {sku} sem título (ignorado).")
                        continue
                    name = name_tag.get_text().strip()
                    
                    # Extrai Preço
                    price = 0.0
                    price_tag = card.find('span', id='product-price-por') or card.find('span', id='product-price')
                    if price_tag:
                        raw = price_tag.get_text().strip()
                        m = re.search(r'(\d{1,3}(\.\d{3})*,\d{2})', raw)
                        if m: price = float(m.group(1).replace('.', '').replace(',', '.'))
                    
                    print(f"         📦 Encontrado: {name} (SKU {sku}) - R$ {price}")

                    found_products.append({
                        "name": name,
                        "sale_price": price,
                        "natura_sku": sku,
                        "category": detect_category(name),
                        "description": f"Descoberto via busca '{query}'"
                    })
                except Exception as e:
                    print(f"         ❌ Erro ao processar card: {e}")
                    continue
        else:
            print(f"      ❌ Erro HTTP na Natura: {resp.status_code}")
                
    except Exception as e:
        print(f"      ⚠️ Erro Conexão Natura: {e}")
        
    return found_products

def refine_with_natura(product_name):
    """
    Recebe um nome genérico e tenta achar o oficial.
    """
    if not product_name: return None
    
    # 1. Limpeza e Simplificação
    clean_name = product_name.upper().strip()
    #clean_name = re.sub(r'[^a-zA-Z\s]', '', clean_name) # Remove números
    search_term = " ".join(clean_name.split()[:6]) # Pega 3 primeiras palavras
    
    print(f"   🔄 Refinando: Nome Original='{product_name}' -> Busca='{search_term}'")
    
    # 2. Busca Oficial
    results = search_natura_official(search_term)
    
    if results:
        best_match = None
        best_score = 0.0
        
        print(f"      🔎 Comparando similaridade com '{product_name}':")

        for prod in results:
            # Score de similaridade (0 a 1)
            score = difflib.SequenceMatcher(None, product_name.lower(), prod['name'].lower()).ratio()
            
            # Penaliza Refil
            if "refil" in prod['name'].lower() and "refil" not in product_name.lower():
                score -= 0.3
                print(f"         📉 Penalizado (Refil): {prod['name']}")
            
            # Bonifica volume igual (ex: 200ml)
            if "200" in product_name and "200" in prod['name']:
                score += 0.1
                print(f"         📈 Bonificado (Volume): {prod['name']}")

            print(f"         ⭐ Score Final: {score:.2f} -> {prod['name']}")
                
            if score > best_score:
                best_score = score
                best_match = prod
        
        if best_match and best_score > 0.35:
            print(f"      🏆 VENCEDOR: {best_match['name']} (SKU {best_match['natura_sku']})")
            best_match['all_results'] = results 
            return best_match
        else:
            print(f"      ❌ Nenhum produto atingiu score mínimo de 0.35")
            
    return None

def search_google_real(ean):
    """
    Busca no Google para encontrar SKU via data-offer-id.
    """
    query = f"{ean} natura"
    url_web = f"https://www.google.com/search?q={query}"
    
    print(f"   ↳ Tentando Google Web/Shopping: {ean}")
    
    ua = UserAgent()
    headers = {
        "User-Agent": ua.random,
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    
    try:
        resp = requests.get(url_web, headers=headers, timeout=10)
        
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            
            # TENTATIVA 1: SHOPPING (SKU)
            offer_tag = soup.find(attrs={"data-offer-id": re.compile(r"NATBRA-\d+")})
            if offer_tag:
                raw_id = offer_tag.get('data-offer-id')
                sku = raw_id.replace("NATBRA-", "")
                
                container = offer_tag.find_parent('div', class_='sh-dgr__content') or soup
                h3 = container.find('h3')
                name = h3.get_text().strip() if h3 else "Produto Natura"
                
                return {
                    "name": name,
                    "sale_price": 0.0,
                    "natura_sku": sku,
                    "bar_code": ean,
                    "category": detect_category(name),
                    "source": "google_match",
                    "description": "Match Google Shopping"
                }
            
            # TENTATIVA 2: SNIPPETS WEB
            snippets = soup.find_all('div', class_='VwiC3b') 
            if not snippets:
                snippets = soup.find_all('div', style=lambda value: value and '-webkit-line-clamp' in value)
                
            for snippet in snippets:
                text = snippet.get_text()
                if ean in text:
                    clean_text = text.replace(ean, '').replace('SKU:', '').replace('Código:', '').strip(' .-_')
                    potential_name = clean_text.split('R$')[0].split('. ')[0]
                    
                    if len(potential_name) > 5:
                        return {
                            "name": potential_name.strip(),
                            "sale_price": 0.0,
                            "bar_code": ean,
                            "category": detect_category(potential_name),
                            "description": f"Extraído do Google Web ({ean})",
                            "natura_sku": None,
                            "source": "google_snippet"
                        }
    except Exception as e:
        print(f"      ⚠️ Erro Google: {e}")
        
    return None
def refine_product_data(product_name):
    """
    Tenta encontrar o SKU Oficial usando o Nome.
    Estratégia:
    1. Busca Interna Natura (Rápida).
    2. Busca Google Shopping (Inteligente).
    """
    if not product_name: return None
    
    print(f"   🔄 Refinando dados para: '{product_name}'")

    # --- ESTRATÉGIA 1: NATURA OFICIAL (Nome Simplificado) ---
    clean_name = product_name.upper().replace('NATURA', '').strip()
    clean_name_simple = re.sub(r'[^a-zA-Z\s]', '', clean_name) # Remove números
    search_term = " ".join(clean_name_simple.split()[:3]) # 3 primeiras palavras
    
    natura_results = search_natura_official(search_term)
    
    if natura_results:
        # Lógica de melhor match (igual a anterior)
        best_match = None
        best_score = 0.0
        for prod in natura_results:
            score = difflib.SequenceMatcher(None, product_name.lower(), prod['name'].lower()).ratio()
            if "refil" in prod['name'].lower() and "refil" not in product_name.lower(): score -= 0.3
            if "200" in product_name and "200" in prod['name']: score += 0.1
            
            if score > best_score:
                best_score = score
                best_match = prod
        
        if best_match and best_score > 0.35:
            print(f"      🏆 Match Natura: {best_match['name']} (SKU {best_match['natura_sku']})")
            best_match['all_results'] = natura_results
            return best_match

    # --- ESTRATÉGIA 2: GOOGLE SHOPPING (Nome Completo) ---
    # Se a Natura falhou, o Google com certeza acha.
    print(f"      ⚠️ Natura falhou. Tentando Google com o nome...")
    google_res = search_google_real(f"{product_name} natura")
    
    if google_res and google_res.get('natura_sku'):
        print(f"      🏆 Match Google: SKU {google_res['natura_sku']} encontrado pelo nome!")
        return google_res

    print("      ❌ Refinamento falhou em todas as fontes.")
    return None

def search_fallback_sites(ean):
    print(f"   ↳ Tentando Fontes Alternativas: {ean}")
    
    urls = [
        (f"https://api.cosmos.bluesoft.com.br/produtos/{ean}", "cosmos_api"),
        (f"https://cosmos.bluesoft.com.br/produtos/{ean}", "cosmos"),
        (f"https://www.essenciaecor.com.br/codigo-de-barra/{ean}", "essencia"),
        (f"https://www.santocheiro.com.br/search-results?q={ean}", "santocheiro")
    ]
    
    ua = UserAgent()
    
    for url, source in urls:
        try:
            headers = {"User-Agent": ua.random}
            resp = requests.get(url, headers=headers, timeout=10)
            
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, 'html.parser')
                name = None
                
                if source == "cosmos_api":
                    desc_tag = soup.find('span', id="product_description")
                    if desc_tag: name = desc_tag.get_text().strip()

                elif source == "cosmos":
                    h1 = soup.find('h1', class_='page-header')
                    if h1: name = h1.get_text().strip()
                
                elif source == "essencia":
                    meta_title = soup.find('meta', property='og:title')
                    if meta_title: name = meta_title['content']
                    else:
                        h1 = soup.find('h1')
                        if h1: name = h1.get_text().strip()
                        
                elif source == "santocheiro":
                    meta_title = soup.find('meta', property='og:title')
                    if meta_title: name = meta_title['content']
                    if not name:
                        link = soup.find('a', attrs={'data-testid': 'linkElement'})
                        if link: name = link.get_text().strip()
                
                if name:
                    # Limpeza forte para ajudar na busca posterior
                    clean_name = name.replace(ean, '').replace('Natura', '').replace('| Santo Cheiro', '').strip(' -_')
                    if "Resultados" in clean_name or "Search" in clean_name: continue 
                    if len(clean_name) < 3: continue
                    
                    print(f"      ✅ Encontrado em {source}: {clean_name}")
                    
                    return {
                        "name": f"{clean_name}", 
                        "sale_price": 0.0,
                        "bar_code": ean,
                        "category": detect_category(clean_name),
                        "description": f"Fonte: {source.title()}",
                        "natura_sku": None,
                        "source": "catalog_match"
                    }
        except: pass
            
    return None

# --- ORQUESTRADOR ---

def search_google_shopping(ean):
    print(f"\n🔍 INICIANDO SCRAPER: {ean}")
    
    # 1. Tenta EAN direto na Natura (Busca Oficial retorna lista)
    natura_list = search_natura_official(ean)
    if natura_list:
        # Se buscou pelo EAN e achou algo, o primeiro é provavelmente o correto
        best = natura_list[0]
        best['bar_code'] = ean
        best['all_results'] = natura_list
        print("   ✅ Encontrado direto na Natura!")
        return best

    # 2. Tenta Google Shopping (Retorna SKU direto)
    res_google = search_google_real(ean)
    if res_google and res_google.get('natura_sku'):
        print("   ✅ Encontrado no Google Shopping!")
        return res_google

    # 3. Tenta Fontes Alternativas (Nome) -> Refina na Natura
    res_fallback = search_fallback_sites(ean)
    
    if res_fallback:
        name_found = res_fallback.get('name')
        
        # Tenta achar o SKU usando o nome encontrado
        refined_res = refine_with_natura(name_found)
        
        if refined_res and refined_res.get('natura_sku'):
            refined_res['bar_code'] = ean # Garante que o EAN original vá junto
            return refined_res
        
        # Se não conseguiu refinar, retorna o nome genérico do Cosmos
        return res_fallback
    if res_fallback:
        name_found = res_fallback.get('name')
        
        # Chama o novo refinador universal
        refined_res = refine_product_data(name_found)
        
        if refined_res and refined_res.get('natura_sku'):
            refined_res['bar_code'] = ean
            return refined_res
            
        return res_fallback
        
    print("❌ Nenhuma fonte encontrou o produto.")
    return None