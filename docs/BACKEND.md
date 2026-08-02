Excelente contexto — obrigado por colar **todo o backend real**.  
Dá para ver claramente que o seu `BACKEND.md` antigo ficou **muito técnico** e **não explica o negócio**, enquanto o código hoje já está **bem maduro como produto SaaS**.

Abaixo eu te entrego **um BACKEND.md atualizado**, **100% alinhado ao código atual**, unindo:

✅ Arquitetura técnica  
✅ Lógica de negócio  
✅ Regras invisíveis (proteções, curas automáticas, multi-tenant)  
✅ Fluxos reais (crawler → catálogo → estoque → venda → dashboard)  
✅ Linguagem clara (para devs e para você no futuro)

Você pode **copiar e colar direto como `BACKEND.md`**.

---

# BACKEND.md

## Visão Geral do Produto

Este backend sustenta um **SaaS de gestão de estoque inteligente para consultoras de beleza (Natura, Avon, Grupo Boticário)**.

O sistema combina:

- **Catálogo global automatizado** (alimentado por robôs)
- **Estoque privado por loja (multi-tenant)**
- **Controle por lote e validade**
- **Entrada por scanner (EAN / SKU)**
- **Venda, baixa, perdas e uso próprio**
- **Aprendizado automático via scraping**
- **Dashboard financeiro e operacional**
- **Planos Free / Pro com feature gates**

---

## Arquitetura de Negócio (Camadas)

```text
Robôs (Crawler)
        ↓
Catálogo Global (Product)
        ↓
Estoque da Loja (InventoryItem + Batches)
        ↓
Movimentações (StockTransaction)
        ↓
Vendas / Saídas (Sale, SaleItem)
        ↓
Dashboard / Vitrine / Admin
```

---

## 1. Catálogo Global (Camada Pública)

### Objetivo
Manter uma **base única e protegida de produtos oficiais**, compartilhada entre todas as lojas.

### Modelo: `Product`

Responsabilidades:
- Representa o **produto oficial** (Natura, Avon, Boticário…)
- Armazena preços de referência
- Centraliza imagens, descrições e categorias
- Serve como base para todas as lojas

Proteções importantes:
- `bar_code` e `natura_sku` são **únicos**
- Produtos oficiais podem ser **protegidos contra edição**
- Lojas **não podem “sujar”** o catálogo global

---

## 2. Robôs de Coleta (Crawler)

### Objetivo
Popular e manter atualizado o catálogo global automaticamente.

### Estratégia
- SeleniumBase com anti-bloqueio
- Navegação intercalada entre marcas
- Extração por padrões específicos de cada site
- Coleta de:
  - SKU
  - Nome
  - Preço
  - Imagem
  - Descrição
  - Categoria inteligente (`detect_category`)

### Regras de Negócio
- Nunca cria produto sem SKU válido
- Atualiza preço e histórico (`PriceHistory`)
- Evita páginas vazias e bloqueios
- Limita páginas para não estourar CI/CD

---

## 3. Multi-Tenant (Lojas)

### Modelo: `Store`

Cada usuário possui **uma loja isolada**.

Regras:
- Um usuário → uma loja
- Todos os dados privados são filtrados pela loja
- Nenhuma loja acessa dados de outra

Mixin-chave:
```python
TenantModelMixin
```

Ele garante:
- Filtro automático por loja
- Criação sempre vinculada à loja correta

---

## 4. Estoque da Loja

### Modelo: `InventoryItem`

Representa **o vínculo entre a loja e o produto global**.

Responsabilidades:
- Preço de custo da consultora
- Preço de venda
- Quantidade consolidada
- Estoque mínimo

Regra crítica:
> Uma loja só pode ter **um InventoryItem por produto**

---

## 5. Controle por Lote e Validade

### Modelo: `InventoryBatch`

Cada entrada gera um lote:

- Quantidade própria
- Código do lote (opcional)
- Data de validade

Benefícios:
- Controle de vencimento
- FIFO automático na venda
- Relatórios precisos

---

## 6. Entrada de Estoque (Scanner / Formulário)

### Endpoint
```
POST /stock/entry/
```

### Fluxo de Negócio

1. Usuário escaneia código ou informa dados
2. Sistema tenta identificar produto:
   - EAN → Produto existente
   - SKU → Produto existente
3. Se existir:
   - Produto protegido → só vincula
   - Produto local → pode enriquecer dados
4. Se não existir:
   - Cria produto local mínimo
5. Cria lote
6. Atualiza estoque consolidado
7. Registra transação (`ENTRADA`)

### Proteções Inteligentes
- Strings vazias → `NULL`
- Cura automática de nomes genéricos
- Evita violação de unicidade
- Tudo dentro de `transaction.atomic()`

---

## 7. Saídas / Vendas / Baixas

### Modelo: `Sale`

Tipos de operação:
- VENDA
- BRINDE
- PRESENTE
- PERDA
- USO_PROPRIO

### Regra de Baixa
- Primeiro lote a vencer (FIFO)
- Ou lote específico, se informado

### Registro Duplo
- `SaleItem` → histórico da venda
- `StockTransaction` → extrato contábil

---

## 8. Extrato de Movimentações

### Modelo: `StockTransaction`

É o **livro razão do estoque**.

Registra:
- Entrada
- Saída
- Ajuste
- Perda
- Uso próprio

Regra:
- Quantidade positiva = entrada
- Quantidade negativa = saída

---

## 9. Busca Inteligente de Produtos

### Endpoint
```
GET /products/lookup/
```

### Estratégia
1. Busca local (nome, EAN, SKU)
2. Se não achar:
   - Scraper Google Shopping
   - Natura
3. Aprende automaticamente:
   - Vincula EAN ↔ SKU
   - Cria produtos novos

Resultado:
> O sistema **fica mais inteligente a cada uso**

---

## 10. Vitrine Pública

### Endpoint
```
GET /public/{slug}
```

Exibe:
- Produtos disponíveis
- Preço correto (loja > oficial)
- Próxima validade
- WhatsApp da loja

---

## 11. Dashboard

Fornece:
- Capital investido
- Receita potencial
- Margem estimada
- Estoque baixo
- Distribuição por categoria

---

## 12. Autenticação

Suporta:
- Email + senha (JWT)
- Firebase (Google / Social)

Tokens:
- Access
- Refresh

---

## 13. Planos e Feature Gates

### Conceito
O backend informa ao frontend **o que está liberado**.

Exemplo:
- Scanner
- OCR de validade
- IA
- Vitrine
- Produtos ilimitados

Isso permite:
- Evolução sem refatoração
- Monetização clara

---

## 14. Painel Admin

Admins podem:
- Listar usuários
- Ver dados das lojas
- Alterar plano
- Gerenciar assinatura

---

## Conclusão

Este backend não é apenas técnico.  
Ele implementa **regras reais de negócio**, com:

✅ Proteções de dados  
✅ Multi-tenant real  
✅ Aprendizado automático  
✅ Controle fiscal e operacional  
✅ Base pronta para escalar  

---
