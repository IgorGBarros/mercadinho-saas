

---

# DATABASE.md

## Visão Geral

O banco de dados sustenta um **SaaS multi-tenant de gestão de estoque para consultoras**, com:

- Catálogo global compartilhado
- Estoque isolado por loja
- Controle por lote e validade
- Histórico completo de movimentações
- Vendas e baixas auditáveis
- Autenticação e permissões desacopladas (Supabase/Auth)

O design prioriza:

- **Integridade referencial**
- **Isolamento por loja**
- **Auditabilidade**
- **Escalabilidade**

---

## Diagrama Conceitual Simplificado

```text
CustomUser
   │
   └── Store
         │
         ├── InventoryItem ─── Product
         │         │
         │         └── InventoryBatch
         │
         ├── Sale ─── SaleItem ─── Product
         │                     └── InventoryBatch
         │
         └── StockTransaction ─── Product
                               └── InventoryBatch
```

---

## 1. Usuários

### Tabela: `inventory_customuser`

Representa o **usuário da aplicação** (consultora ou admin).

Campos principais:
- `email` (único)
- `name`
- Flags: `is_active`, `is_staff`, `is_superuser`

Regra de negócio:
- Um usuário **pode ter apenas uma loja**
- Autenticação pode vir de senha tradicional ou Firebase

---

## 2. Loja (Tenant)

### Tabela: `inventory_store`

Representa o **negócio da consultora**.

Campos:
- `user_id` → vínculo 1:1 com usuário
- `name`, `slug`
- `plan` (`free` / `pro`)
- `storefront_enabled`
- Dados de assinatura (gateway, datas)

Regras:
- Isolamento total dos dados por loja
- Todas as entidades privadas dependem de `store_id`
- Exclusão em cascata ao remover usuário [1]

---

## 3. Catálogo Global

### Tabela: `inventory_product`

É o **catálogo oficial compartilhado** entre todas as lojas.

Campos-chave:
- `bar_code` (EAN, único)
- `natura_sku` (único)
- `name`, `brand`, `category`
- `official_price`
- `image_url`, `description`
- `min_quantity`

Regras de negócio:
- Produtos oficiais **não pertencem a uma loja**
- Servem como base para qualquer estoque
- Protegidos contra alterações indevidas
- Alimentados por robôs e busca inteligente

Constraints importantes:
- Unicidade de `bar_code` e `natura_sku` [1]

---

## 4. Histórico de Preços (Crawler)

### Tabela: `inventory_pricehistory`

Registra **cada preço coletado pelos robôs**.

Campos:
- `product_id`
- `price`
- `captured_at`

Função:
- Auditoria de variação de preços
- Base futura para análises e alertas

Relacionamento:
- N:1 com `inventory_product` [1]

---

## 5. Estoque da Loja

### Tabela: `inventory_inventoryitem`

Representa o **estoque consolidado de um produto dentro de uma loja**.

Campos:
- `store_id`
- `product_id`
- `cost_price`
- `sale_price`
- `total_quantity`
- `min_quantity`

Regra crítica:
> Uma loja só pode ter **um InventoryItem por produto**

Constraint:
- `unique (store_id, product_id)` [1]

---

## 6. Lotes e Validade

### Tabela: `inventory_inventorybatch`

Representa **lotes físicos reais**.

Campos:
- `item_id`
- `quantity`
- `batch_code`
- `expiration_date`
- `entry_date`

Regras de negócio:
- Cada entrada gera ao menos um lote
- Vendas usam FIFO por validade
- Permite controle sanitário e perdas

Relacionamento:
- N:1 com `inventory_inventoryitem` [1]

---

## 7. Movimentações de Estoque (Extrato)

### Tabela: `inventory_stocktransaction`

É o **livro razão do estoque**.

Campos:
- `store_id`
- `product_id`
- `batch_id` (opcional)
- `transaction_type`
- `quantity` (positivo = entrada, negativo = saída)
- `unit_cost`, `unit_price`
- `description`
- `created_at`

Tipos:
- ENTRADA
- VENDA
- PERDA
- BRINDE
- USO_PROPRIO
- AJUSTE

Regra de ouro:
> **Nada altera estoque sem gerar uma StockTransaction**

Relacionamentos protegidos por FKs [1]

---

## 8. Vendas e Saídas

### Tabela: `inventory_sale`

Representa uma **operação de saída agrupada**.

Campos:
- `store_id`
- `transaction_type`
- `total_amount`
- `client_name`
- `payment_method`
- `notes`
- `created_at`

Tipos de venda:
- VENDA
- PRESENTE
- BRINDE
- PERDA
- USO_PROPRIO

---

### Tabela: `inventory_saleitem`

Itens individuais da venda.

Campos:
- `sale_id`
- `product_id`
- `batch_id`
- `quantity`
- `unit_price_sold`
- `unit_cost_at_time`

Regras:
- Sempre vinculado a uma `Sale`
- Sempre gera uma `StockTransaction`
- Mantém snapshot financeiro para relatórios

---

## 9. Logs de Robô

### Tabela: `inventory_crawlerlog`

Registra falhas e tentativas do crawler.

Campos:
- `sku`
- `status_code`
- `error_message`
- `retry_count`
- `created_at`

Uso:
- Debug
- Monitoramento
- Retentativas automáticas

---

## 10. Integridade e Segurança

### Foreign Keys

O banco é **fortemente normalizado**:

- Nenhuma venda sem loja
- Nenhum lote sem item
- Nenhuma movimentação sem produto
- Cascatas bem definidas [1]

### Identidades

- Todas as tabelas usam `IDENTITY / SEQUENCE`
- Compatível com PostgreSQL e Supabase

---

## 11. Multi-Tenant na Prática

Como o isolamento acontece:

- Todas as tabelas privadas têm `store_id`
- Queries sempre filtram por loja
- FK impede cruzamento de dados
- Base pronta para RLS (Row Level Security)

---

## Conclusão

O banco de dados foi modelado para:

✅ Suportar crescimento  
✅ Garantir integridade  
✅ Refletir regras reais de negócio  
✅ Permitir auditoria completa  
✅ Servir tanto backend quanto BI  

Ele não é apenas técnico — **ele codifica o negócio**.

---

