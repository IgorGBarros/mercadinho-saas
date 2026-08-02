/**
 * Demo/mock data for the test account (demo-token).
 * Provides realistic Natura product examples so all pages render with content.
 */

import type { InventoryItem, Movement, Profile, InventoryBatch } from "../lib/api";

// ── Inventory Items ──
export const DEMO_INVENTORY: InventoryItem[] = [
  {
    id: "d1", barcode: "7891033784561", product_name: "Kaiak Tradicional Masculino 100ml", custom_name: null, category: "Perfumaria",
    quantity: 12, min_quantity: 5, cost_price: 78.90, sale_price: 134.90, official_price: 134.90,
    sale_type: null, expiry_date: "2026-08-15", expiry_photo_url: null, image_url: null, sku: "83451",
    is_available_storefront: true, created_at: "2025-11-01T10:00:00Z", updated_at: "2026-02-20T14:00:00Z",
  },
  {
    id: "d2", barcode: "7891033619283", product_name: "Luna Intenso Feminino 50ml", custom_name: null, category: "Perfumaria",
    quantity: 8, min_quantity: 3, cost_price: 115.00, sale_price: 189.90, official_price: 189.90,
    sale_type: null, expiry_date: "2027-01-10", expiry_photo_url: null, image_url: null, sku: "74320",
    is_available_storefront: true, created_at: "2025-12-05T09:30:00Z", updated_at: "2026-03-01T11:00:00Z",
  },
  {
    id: "d3", barcode: "7891033055012", product_name: "Tododia Cereja e Avelã 400ml", custom_name: null, category: "Corpo",
    quantity: 3, min_quantity: 5, cost_price: 22.50, sale_price: 39.90, official_price: 39.90,
    sale_type: null, expiry_date: "2026-06-20", expiry_photo_url: null, image_url: null, sku: "41256",
    is_available_storefront: true, created_at: "2025-10-15T08:00:00Z", updated_at: "2026-02-28T16:00:00Z",
  },
  {
    id: "d4", barcode: "7891033032891", product_name: "Chronos Antissinais 30+ 30ml", custom_name: null, category: "Rosto",
    quantity: 6, min_quantity: 3, cost_price: 55.00, sale_price: 94.90, official_price: 94.90,
    sale_type: null, expiry_date: "2026-05-30", expiry_photo_url: null, image_url: null, sku: "62104",
    is_available_storefront: true, created_at: "2025-11-20T07:15:00Z", updated_at: "2026-01-15T10:00:00Z",
  },
  {
    id: "d5", barcode: "7891033047210", product_name: "Lumina Shampoo Cabelos Lisos 300ml", custom_name: null, category: "Cabelos",
    quantity: 15, min_quantity: 8, cost_price: 18.00, sale_price: 32.90, official_price: 32.90,
    sale_type: null, expiry_date: "2026-12-01", expiry_photo_url: null, image_url: null, sku: "50312",
    is_available_storefront: false, created_at: "2026-01-10T13:00:00Z", updated_at: "2026-03-05T09:00:00Z",
  },
  {
    id: "d6", barcode: "7891033091205", product_name: "Faces Batom Hidratante Rosa Natural", custom_name: null, category: "Maquiagem",
    quantity: 2, min_quantity: 4, cost_price: 12.50, sale_price: 21.90, official_price: 21.90,
    sale_type: null, expiry_date: "2026-04-10", expiry_photo_url: null, image_url: null, sku: "33087",
    is_available_storefront: true, created_at: "2025-09-08T11:00:00Z", updated_at: "2026-02-10T08:00:00Z",
  },
  {
    id: "d7", barcode: "7891033102301", product_name: "Ekos Castanha Sabonete Líquido 250ml", custom_name: null, category: "Corpo",
    quantity: 20, min_quantity: 10, cost_price: 15.90, sale_price: 28.90, official_price: 28.90,
    sale_type: null, expiry_date: "2027-03-15", expiry_photo_url: null, image_url: null, sku: "80145",
    is_available_storefront: true, created_at: "2026-01-20T10:30:00Z", updated_at: "2026-03-06T14:30:00Z",
  },
  {
    id: "d8", barcode: "7891033088901", product_name: "Essencial Exclusivo Masculino 100ml", custom_name: null, category: "Perfumaria",
    quantity: 4, min_quantity: 3, cost_price: 95.00, sale_price: 159.90, official_price: 159.90,
    sale_type: null, expiry_date: "2027-06-01", expiry_photo_url: null, image_url: null, sku: "71503",
    is_available_storefront: true, created_at: "2025-12-12T15:00:00Z", updated_at: "2026-02-25T12:00:00Z",
  },
  {
    id: "d9", barcode: "7891033076543", product_name: "Plant Gel de Limpeza Facial 150ml", custom_name: null, category: "Rosto",
    quantity: 1, min_quantity: 3, cost_price: 25.00, sale_price: 44.90, official_price: 44.90,
    sale_type: null, expiry_date: "2026-04-25", expiry_photo_url: null, image_url: null, sku: "59821",
    is_available_storefront: false, created_at: "2025-10-01T09:00:00Z", updated_at: "2026-03-02T11:00:00Z",
  },
  {
    id: "d10", barcode: "7891033065432", product_name: "Natura Homem Desodorante Spray 100ml", custom_name: null, category: "Corpo",
    quantity: 25, min_quantity: 10, cost_price: 14.00, sale_price: 24.90, official_price: 24.90,
    sale_type: null, expiry_date: "2027-02-28", expiry_photo_url: null, image_url: null, sku: "44890",
    is_available_storefront: true, created_at: "2026-02-01T08:00:00Z", updated_at: "2026-03-07T16:00:00Z",
  },
  {
    id: "d11", barcode: "7891033054321", product_name: "Aquarela Shine Gloss Labial 5ml", custom_name: null, category: "Maquiagem",
    quantity: 10, min_quantity: 5, cost_price: 16.00, sale_price: 29.90, official_price: 29.90,
    sale_type: null, expiry_date: "2026-09-15", expiry_photo_url: null, image_url: null, sku: "28756",
    is_available_storefront: true, created_at: "2026-01-05T14:00:00Z", updated_at: "2026-03-04T10:00:00Z",
  },
  {
    id: "d12", barcode: "7891033043210", product_name: "Ekos Maracujá Óleo Trifásico 150ml", custom_name: null, category: "Corpo",
    quantity: 7, min_quantity: 4, cost_price: 32.00, sale_price: 54.90, official_price: 54.90,
    sale_type: null, expiry_date: "2026-11-20", expiry_photo_url: null, image_url: null, sku: "67203",
    is_available_storefront: true, created_at: "2025-11-28T12:00:00Z", updated_at: "2026-02-18T09:00:00Z",
  },
];

// ── Movements ──
export const DEMO_MOVEMENTS: Movement[] = [
  // Entradas (últimos meses)
  { id: "m1", product_id: "d1", batch_id: null, product_name: "Kaiak Tradicional Masculino 100ml", barcode: "7891033784561", movement_type: "entrada", quantity: 10, unit_price: 78.90, sale_type: null, notes: "Pedido ciclo 01/2026", profit: null, created_at: "2026-01-05T10:00:00Z" },
  { id: "m2", product_id: "d2", batch_id: null, product_name: "Luna Intenso Feminino 50ml", barcode: "7891033619283", movement_type: "entrada", quantity: 5, unit_price: 115.00, sale_type: null, notes: "Pedido ciclo 01/2026", profit: null, created_at: "2026-01-05T10:05:00Z" },
  { id: "m3", product_id: "d5", batch_id: null, product_name: "Lumina Shampoo Cabelos Lisos 300ml", barcode: "7891033047210", movement_type: "entrada", quantity: 15, unit_price: 18.00, sale_type: null, notes: "Pedido ciclo 02/2026", profit: null, created_at: "2026-02-03T09:00:00Z" },
  { id: "m4", product_id: "d7", batch_id: null, product_name: "Ekos Castanha Sabonete Líquido 250ml", barcode: "7891033102301", movement_type: "entrada", quantity: 20, unit_price: 15.90, sale_type: null, notes: "Reposição", profit: null, created_at: "2026-02-10T11:00:00Z" },
  { id: "m5", product_id: "d10", batch_id: null, product_name: "Natura Homem Desodorante Spray 100ml", barcode: "7891033065432", movement_type: "entrada", quantity: 30, unit_price: 14.00, sale_type: null, notes: "Pedido ciclo 03/2026", profit: null, created_at: "2026-03-01T08:30:00Z" },
  { id: "m6", product_id: "d1", batch_id: null, product_name: "Kaiak Tradicional Masculino 100ml", barcode: "7891033784561", movement_type: "entrada", quantity: 5, unit_price: 78.90, sale_type: null, notes: "Reposição", profit: null, created_at: "2026-02-15T14:00:00Z" },

  // Saídas — vendas
  { id: "m10", product_id: "d1", batch_id: null, product_name: "Kaiak Tradicional Masculino 100ml", barcode: "7891033784561", movement_type: "saida", quantity: 3, unit_price: 134.90, sale_type: "venda", notes: "Cliente Maria", profit: 168.00, created_at: "2026-01-20T16:00:00Z" },
  { id: "m11", product_id: "d2", batch_id: null, product_name: "Luna Intenso Feminino 50ml", barcode: "7891033619283", movement_type: "saida", quantity: 2, unit_price: 189.90, sale_type: "venda", notes: "Cliente Ana", profit: 149.80, created_at: "2026-01-25T18:00:00Z" },
  { id: "m12", product_id: "d5", batch_id: null, product_name: "Lumina Shampoo Cabelos Lisos 300ml", barcode: "7891033047210", movement_type: "saida", quantity: 3, unit_price: 32.90, sale_type: "venda", notes: null, profit: 44.70, created_at: "2026-02-14T10:00:00Z" },
  { id: "m13", product_id: "d7", batch_id: null, product_name: "Ekos Castanha Sabonete Líquido 250ml", barcode: "7891033102301", movement_type: "saida", quantity: 5, unit_price: 28.90, sale_type: "venda", notes: "Kit presente", profit: 65.00, created_at: "2026-02-20T15:00:00Z" },
  { id: "m14", product_id: "d10", batch_id: null, product_name: "Natura Homem Desodorante Spray 100ml", barcode: "7891033065432", movement_type: "saida", quantity: 5, unit_price: 24.90, sale_type: "venda", notes: null, profit: 54.50, created_at: "2026-03-05T12:00:00Z" },
  { id: "m15", product_id: "d8", batch_id: null, product_name: "Essencial Exclusivo Masculino 100ml", barcode: "7891033088901", movement_type: "saida", quantity: 1, unit_price: 159.90, sale_type: "venda", notes: "Cliente João", profit: 64.90, created_at: "2026-03-03T17:00:00Z" },

  // Vendas esta semana (2-8 março 2026) para milestone + top semanal
  { id: "m16", product_id: "d1", batch_id: null, product_name: "Kaiak Tradicional Masculino 100ml", barcode: "7891033784561", movement_type: "saida", quantity: 2, unit_price: 134.90, sale_type: "venda", notes: "Cliente Pedro", profit: 112.00, created_at: "2026-03-06T10:00:00Z" },
  { id: "m17", product_id: "d2", batch_id: null, product_name: "Luna Intenso Feminino 50ml", barcode: "7891033619283", movement_type: "saida", quantity: 1, unit_price: 189.90, sale_type: "venda", notes: "Cliente Carla", profit: 74.90, created_at: "2026-03-06T15:00:00Z" },
  { id: "m18", product_id: "d4", batch_id: null, product_name: "Chronos Antissinais 30+ 30ml", barcode: "7891033032891", movement_type: "saida", quantity: 3, unit_price: 94.90, sale_type: "venda", notes: "Kit skincare", profit: 119.70, created_at: "2026-03-07T09:30:00Z" },
  { id: "m19", product_id: "d12", batch_id: null, product_name: "Ekos Maracujá Óleo Trifásico 150ml", barcode: "7891033043210", movement_type: "saida", quantity: 2, unit_price: 54.90, sale_type: "venda", notes: null, profit: 45.80, created_at: "2026-03-07T14:00:00Z" },
  { id: "m24", product_id: "d11", batch_id: null, product_name: "Aquarela Shine Gloss Labial 5ml", barcode: "7891033054321", movement_type: "saida", quantity: 4, unit_price: 29.90, sale_type: "venda", notes: "Revenda loja", profit: 55.60, created_at: "2026-03-08T08:00:00Z" },
  { id: "m25", product_id: "d7", batch_id: null, product_name: "Ekos Castanha Sabonete Líquido 250ml", barcode: "7891033102301", movement_type: "saida", quantity: 3, unit_price: 28.90, sale_type: "venda", notes: null, profit: 39.00, created_at: "2026-03-08T11:00:00Z" },

  // Saídas — outros tipos
  { id: "m20", product_id: "d3", batch_id: null, product_name: "Tododia Cereja e Avelã 400ml", barcode: "7891033055012", movement_type: "saida", quantity: 2, unit_price: null, sale_type: "presente", notes: "Presente mãe", profit: null, created_at: "2026-02-08T09:00:00Z" },
  { id: "m21", product_id: "d6", batch_id: null, product_name: "Faces Batom Hidratante Rosa Natural", barcode: "7891033091205", movement_type: "saida", quantity: 1, unit_price: null, sale_type: "brinde", notes: "Brinde cliente fiel", profit: null, created_at: "2026-01-30T14:00:00Z" },
  { id: "m22", product_id: "d9", batch_id: null, product_name: "Plant Gel de Limpeza Facial 150ml", barcode: "7891033076543", movement_type: "saida", quantity: 1, unit_price: null, sale_type: "uso_proprio", notes: null, profit: null, created_at: "2026-02-22T08:00:00Z" },
  { id: "m23", product_id: "d11", batch_id: null, product_name: "Aquarela Shine Gloss Labial 5ml", barcode: "7891033054321", movement_type: "saida", quantity: 1, unit_price: null, sale_type: "perda", notes: "Produto danificado", profit: null, created_at: "2026-03-01T11:00:00Z" },

  // Entradas mais antigas para gráfico de timeline
  { id: "m30", product_id: "d3", batch_id: null, product_name: "Tododia Cereja e Avelã 400ml", barcode: "7891033055012", movement_type: "entrada", quantity: 10, unit_price: 22.50, sale_type: null, notes: "Pedido ciclo 10/2025", profit: null, created_at: "2025-10-15T08:00:00Z" },
  { id: "m31", product_id: "d4", batch_id: null, product_name: "Chronos Antissinais 30+ 30ml", barcode: "7891033032891", movement_type: "entrada", quantity: 8, unit_price: 55.00, sale_type: null, notes: "Pedido ciclo 11/2025", profit: null, created_at: "2025-11-20T07:00:00Z" },
  { id: "m32", product_id: "d6", batch_id: null, product_name: "Faces Batom Hidratante Rosa Natural", barcode: "7891033091205", movement_type: "entrada", quantity: 6, unit_price: 12.50, sale_type: null, notes: null, profit: null, created_at: "2025-09-08T11:00:00Z" },
  { id: "m33", product_id: "d12", batch_id: null, product_name: "Ekos Maracujá Óleo Trifásico 150ml", barcode: "7891033043210", movement_type: "entrada", quantity: 10, unit_price: 32.00, sale_type: null, notes: "Pedido ciclo 12/2025", profit: null, created_at: "2025-12-01T10:00:00Z" },
  { id: "m34", product_id: "d4", batch_id: null, product_name: "Chronos Antissinais 30+ 30ml", barcode: "7891033032891", movement_type: "saida", quantity: 2, unit_price: 94.90, sale_type: "venda", notes: null, profit: 79.80, created_at: "2025-12-20T16:00:00Z" },
  { id: "m35", product_id: "d12", batch_id: null, product_name: "Ekos Maracujá Óleo Trifásico 150ml", barcode: "7891033043210", movement_type: "saida", quantity: 3, unit_price: 54.90, sale_type: "venda", notes: "Cliente Paula", profit: 68.70, created_at: "2026-01-15T13:00:00Z" },
];

// ── Profile ──
export const DEMO_PROFILE: Profile = {
  id: "demo",
  display_name: "Consultora Teste",
  whatsapp_number: "5571999772054",
  storefront_enabled: true,
  store_slug: "demo",
  plan: "pro",
};

// ── Batches ──
export const DEMO_BATCHES: Record<string, InventoryBatch[]> = {
  d1: [
    { id: "b1", inventory_item_id: "d1", quantity: 7, cost_price: 78.90, expiry_date: "2026-08-15", expiry_photo_url: null, created_at: "2026-01-05T10:00:00Z" },
    { id: "b2", inventory_item_id: "d1", quantity: 5, cost_price: 78.90, expiry_date: "2026-11-20", expiry_photo_url: null, created_at: "2026-02-15T14:00:00Z" },
  ],
  d2: [
    { id: "b3", inventory_item_id: "d2", quantity: 8, cost_price: 115.00, expiry_date: "2027-01-10", expiry_photo_url: null, created_at: "2025-12-05T09:30:00Z" },
  ],
  d8: [
    { id: "b4", inventory_item_id: "d8", quantity: 4, cost_price: 95.00, expiry_date: "2027-06-01", expiry_photo_url: null, created_at: "2025-12-12T15:00:00Z" },
  ],
};

// ── Helper: check if demo mode ──
export function isDemoMode(): boolean {
  return localStorage.getItem("auth_token") === "demo-token";
}
