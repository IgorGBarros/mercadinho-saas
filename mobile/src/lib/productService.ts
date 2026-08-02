export interface Product {
  id?: number;
  name: string;
  bar_code: string;
  natura_sku?: string; // <--- ADICIONE ISTO
  
  category: string;
  price: number;
  sale_price?: number;
  official_price?: number; // <--- ADICIONE ISTO TAMBÉM (Vem do suggestion)
  cost_price: number;
  
  min_quantity: number;
  description: string;
  image_url?: string;
  
  // Estoque
  quantity: number;
  batch_code?: string;
  expiration_date?: string;
  
  created_at?: string;
  updated_at?: string;
}

export interface LookupData {
  local?: Product;
  remote?: {
    name: string;
    sale_price: number;
    description: string;
    bar_code: string;
  };
  price_diff?: boolean;
  msg?: string;
}

export interface ProductLookupResponse {
  found: boolean;
  source: 'local' | 'remote' | null;
  data: LookupData | Partial<Product>;
}

// --- CONFIGURAÇÃO API ---
import Constants from 'expo-constants';
// Usa a variável de ambiente ou localhost por padrão
// @ts-ignore (para evitar erro de tipagem se o arquivo d.ts não estiver ok)
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || "http://192.168.1.9:8000";

async function apiRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        // Adicione Token aqui se tiver autenticação futura:
        // "Authorization": `Token ${localStorage.getItem("token")}`,
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      // Tenta ler o erro do backend se houver
      const errorText = await response.text();
      throw new Error(`API Error ${response.status}: ${errorText || response.statusText}`);
    }

    if (response.status === 204) return null as T;
    return response.json();
  } catch (error) {
    console.error(`Falha na requisição: ${endpoint}`, error);
    throw error;
  }
}

// --- SERVICE REAL ---

export const productService = {
  
  // 1. LISTAR TODOS
  list: async () => {
    const data = await apiRequest<Product[]>("/api/products/");
    // Normaliza os dados para o frontend (usa sale_price se price não vier)
    return data.map(p => ({ 
      ...p, 
      price: p.sale_price || p.price || 0 
    }));
  },

  // 2. PEGAR UM (Edição)
  get: async (id: number) => {
    const data = await apiRequest<Product>(`/api/products/${id}/`);
    return { ...data, price: data.sale_price || data.price || 0 };
  },

  // 3. BUSCA INTELIGENTE (Google/Local)
  lookupByEan: async (ean: string) => {
    return apiRequest<ProductLookupResponse>(`/api/products/lookup/?ean=${ean}`);
  },

  // 4. CRIAR PRODUTO + ESTOQUE
  create: async (product: Omit<Product, "id">) => {
    // Formata o payload para o Django Serializer (que espera inventory_data aninhado ou campos específicos)
    // Baseado no seu serializer atual que aceita campos planos e converte:
    return apiRequest<Product>("/api/products/", { 
      method: "POST", 
      body: JSON.stringify({
          ...product,
          sale_price: product.price, // Garante envio do nome correto
          // Se seu serializer espera inventory_data aninhado:
          inventory_data: {
              quantity: product.quantity,
              batch_code: product.batch_code,
              expiration_date: product.expiration_date
          },
          // Se seu serializer espera campos planos (depende da sua implementação do passo 3):
          quantity: product.quantity,
          batch_code: product.batch_code,
          expiration_date: product.expiration_date
      }) 
    });
  },
  // 4. NOVA FUNÇÃO DE ENTRADA DE ESTOQUE (Usa a view inteligente)
  addStock: async (data: any) => {
    return apiRequest("/stock/entry/", {
      method: "POST",
      body: JSON.stringify({
        bar_code: data.bar_code,
        quantity: data.quantity,
        sale_price: data.price, // mapeia price -> sale_price
        cost_price: data.cost_price,
        batch_code: data.batch_code,
        expiration_date: data.expiration_date
      })
    });
  },
  // 5. ATUALIZAR
  update: async (id: number, product: Partial<Product>) => {
    return apiRequest<Product>(`/api/products/${id}/`, { 
      method: "PATCH", 
      body: JSON.stringify({ 
        ...product, 
        sale_price: product.price 
      }) 
    });
  },

  // 6. DELETAR
  delete: async (id: number) => {
    return apiRequest<void>(`/api/products/${id}/`, { method: "DELETE" });
  },

  // 7. COMPATIBILIDADE (Opcional)
  getByBarcode: async (barcode: string) => {
    const res = await apiRequest<ProductLookupResponse>(`/api/products/lookup/?ean=${barcode}`);
    if (res.found && res.source === 'local') {
        // Cast forçado porque sabemos a estrutura do local
        const data = res.data as LookupData;
        return data.local as Product;
    }
    throw new Error("Produto não encontrado.");
  },
};