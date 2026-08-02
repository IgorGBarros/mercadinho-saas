import { useState } from "react";
import { stockApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "@/components/ui/use-toast"; // ✅ Importar useToast original para evitar dependência circular

export interface StockEntryData {
  bar_code: string;
  quantity: number;
  cost_price?: number;
  sale_price?: number;
  batch_code?: string;
  expiration_date?: string | null;
  name?: string;
  category?: string;
  natura_sku?: string | null;
  brand?: string; // ✅ JÁ EXISTE - mantém
  // campos complementares visuais
  expiry_photo_url?: string | null;
  lookup_source?: string | null;
  existing_item_id?: string | null;
}

export function useStockEntry() {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  async function saveEntry(data: StockEntryData) {
    if (!user) throw new Error("Usuário não autenticado");
    
    setLoading(true);
    try {
      // 🔥 CORREÇÃO: Incluir campo brand no payload
      const response = await stockApi.create({
        bar_code: data.bar_code,
        natura_sku: data.natura_sku || "",
        name: data.name || "Produto sem nome",
        category: data.category || "Geral",
        brand: data.brand || "", // ✅ ADICIONAR este campo
        quantity: Number(data.quantity),
        cost_price: Number(data.cost_price ?? 0),
        sale_price: Number(data.sale_price ?? 0),
        batch_code: data.batch_code || "",
        expiration_date: data.expiration_date
          ? `${data.expiration_date.length === 7 ? `${data.expiration_date}-01` : data.expiration_date}`
          : undefined,
      });

      toast({
        title: "Estoque Atualizado!",
        description: `+${data.quantity} un. de ${data.name || "Produto"} registradas.`,
      });

      return response; 
      
    } catch (err: any) {
      console.error("❌ Falha ao salvar entrada:", err);
      
      // ✅ MELHOR tratamento de erro para debug
      let errorMessage = "Falha ao registrar entrada de estoque.";
      
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data?.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      // ✅ Log detalhado para debug
      console.error("Dados enviados:", {
        bar_code: data.bar_code,
        natura_sku: data.natura_sku,
        name: data.name,
        category: data.category,
        brand: data.brand,
        quantity: data.quantity,
        cost_price: data.cost_price,
        sale_price: data.sale_price,
        batch_code: data.batch_code,
        expiration_date: data.expiration_date
      });
      
      toast({
        title: "Erro de Validação",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return { loading, saveEntry };
}