import React, { useState } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, ScrollView, TextInput, Alert 
} from 'react-native';
import { X, Check, ScanBarcode, ShoppingBag, User as UserIcon, Gift, DollarSign, Package, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react-native';
import { api } from '../services/api';
import BarcodeScanner from '../components/BarcodeScanner'; // Seu componente nativo

// Enum dos tipos de venda
type SaleType = "venda" | "uso_proprio" | "presente";

interface WithdrawData {
  barcode: string;
  product_id: number;
  product_name: string;
  category: string;
  current_quantity: number;
  cost_price: number;
  withdraw_qty: number;
  sale_price: number | null;
  sale_type: SaleType;
}

const SALE_TYPES: { value: SaleType; label: string; icon: any; desc: string }[] = [
  { value: "venda", label: "Venda", icon: ShoppingBag, desc: "Venda para cliente" },
  { value: "uso_proprio", label: "Uso Próprio", icon: UserIcon, desc: "Consumo pessoal" },
  { value: "presente", label: "Presente", icon: Gift, desc: "Doação ou brinde" },
];

export default function WithdrawProductScreen({ navigation }: any) {
  const [step, setStep] = useState(0);
  const [showScanner, setShowScanner] = useState(true);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [data, setData] = useState<WithdrawData>({
    barcode: "",
    product_id: 0,
    product_name: "",
    category: "",
    current_quantity: 0,
    cost_price: 0,
    withdraw_qty: 1,
    sale_price: null,
    sale_type: "venda",
  });

  // 1. Lógica de Scan
  const handleBarcodeScan = async (barcode: string) => {
    setShowScanner(false);
    setNotFound(false);
    setData((p) => ({ ...p, barcode }));

    try {
      // Busca inventário
      const response = await api.get("/inventory/");
      // Filtra localmente (idealmente backend filtra)
      const inventory = response.data;
      const item = inventory.find((i: any) => i.product.bar_code === barcode);

      if (item) {
        setData((p) => ({
          ...p,
          product_id: item.id,
          product_name: item.product.name,
          category: item.product.category || "Geral",
          current_quantity: item.total_quantity,
          cost_price: Number(item.cost_price),
          sale_price: Number(item.sale_price > 0 ? item.sale_price : item.product.official_price),
        }));
        setStep(1);
        Alert.alert("Encontrado", `${item.product.name} — ${item.total_quantity} un.`);
      } else {
        setNotFound(true);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Falha ao consultar estoque.");
    }
  };

  // Cálculo de Margem
  const margin = (data.sale_price && data.cost_price)
    ? (((data.sale_price - data.cost_price) / data.cost_price) * 100).toFixed(1)
    : null;

  // 2. Salvar
  const handleSave = async () => {
    setLoading(true);
    try {
      const transactionMap: Record<SaleType, string> = {
        "venda": "VENDA",
        "uso_proprio": "USO_PROPRIO",
        "presente": "PRESENTE"
      };

      const payload = {
        transaction_type: transactionMap[data.sale_type],
        payment_method: "DINHEIRO",
        items: [
          {
            bar_code: data.barcode,
            quantity: data.withdraw_qty,
            price_sold: data.sale_type === "venda" ? data.sale_price : 0
          }
        ]
      };

      await api.post("/sales/checkout/", payload);
      Alert.alert("Sucesso", "Baixa registrada!");
      navigation.goBack();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Erro ao processar baixa.";
      Alert.alert("Erro", msg);
    } finally {
      setLoading(false);
    }
  };

  // Componente de Linha para Resumo
  const Row = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton}>
          <X color="#666" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Baixa de Produto</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        {["Escanear", "Tipo & Preço", "Confirmar"].map((label, i) => (
          <View key={label} style={styles.progressStep}>
            <View style={[styles.progressCircle, i <= step ? styles.progressActive : styles.progressInactive]}>
              {i < step ? <Check color="#fff" size={16} /> : <Text style={styles.stepNum}>{i + 1}</Text>}
            </View>
            <Text style={[styles.progressText, i <= step && styles.textActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* STEP 0: SCAN */}
        {step === 0 && (
          <View>
            {showScanner ? (
              <View style={{ height: 400, borderRadius: 12, overflow: 'hidden' }}>
                  <BarcodeScanner onScan={handleBarcodeScan} onClose={() => navigation.goBack()} />
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.scanResult}>
                  <View style={styles.iconBox}>
                    <ScanBarcode color="#F47920" size={24} />
                  </View>
                  <View>
                    <Text style={styles.cardLabel}>Código Lido</Text>
                    <Text style={styles.monoText}>{data.barcode}</Text>
                  </View>
                </View>

                {notFound && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>Produto não encontrado no estoque.</Text>
                  </View>
                )}

                <TouchableOpacity onPress={() => { setShowScanner(true); setNotFound(false); }}>
                  <Text style={styles.linkText}>Escanear outro código</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* STEP 1: TYPE & PRICE */}
        {step === 1 && (
          <View style={styles.card}>
            <View style={styles.productInfo}>
              <Text style={styles.infoLabel}>Produto Identificado</Text>
              <Text style={styles.productName}>{data.product_name}</Text>
              <Text style={styles.stockInfo}>Estoque atual: {data.current_quantity} un.</Text>
            </View>

            {/* Quantidade */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Quantidade de Saída *</Text>
              <View style={styles.counter}>
                <TouchableOpacity 
                  style={styles.counterBtn}
                  onPress={() => setData(p => ({ ...p, withdraw_qty: Math.max(1, p.withdraw_qty - 1) }))}
                >
                  <Text style={styles.counterText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{data.withdraw_qty}</Text>
                <TouchableOpacity 
                  style={styles.counterBtn}
                  onPress={() => setData(p => ({ ...p, withdraw_qty: Math.min(p.current_quantity, p.withdraw_qty + 1) }))}
                >
                  <Text style={styles.counterText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tipo */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Motivo da Saída</Text>
              <View style={styles.grid}>
                {SALE_TYPES.map((t) => {
                   const Icon = t.icon;
                   const isSelected = data.sale_type === t.value;
                   return (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.typeCard, isSelected && styles.typeSelected]}
                      onPress={() => setData(p => ({ ...p, sale_type: t.value }))}
                    >
                      <Icon color={isSelected ? "#F47920" : "#666"} size={20} />
                      <Text style={[styles.typeText, isSelected && styles.textActive]}>{t.label}</Text>
                    </TouchableOpacity>
                   )
                })}
              </View>
            </View>

            {/* Preço (se Venda) */}
            {data.sale_type === "venda" && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Valor Cobrado (R$)</Text>
                <View style={styles.currencyInput}>
                   <DollarSign color="#666" size={16} />
                   <TextInput
                      style={styles.priceInput}
                      keyboardType="numeric"
                      value={data.sale_price ? String(data.sale_price) : ""}
                      onChangeText={(t) => setData(p => ({ ...p, sale_price: parseFloat(t) || null }))}
                      placeholder="0.00"
                   />
                </View>
                {margin && (
                    <View style={styles.row}>
                        <Text style={styles.helperText}>Custo: R$ {data.cost_price.toFixed(2)}</Text>
                        <Text style={[styles.helperText, Number(margin) >= 0 ? styles.textGreen : styles.textRed]}>
                            Margem: {margin}%
                        </Text>
                    </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* STEP 2: CONFIRM */}
        {step === 2 && (
          <View style={styles.card}>
            <View style={styles.scanResult}>
               <View style={styles.iconBox}><Package color="#F47920" size={24} /></View>
               <Text style={styles.headerTitle}>Resumo da Operação</Text>
            </View>

            <View style={styles.summaryBox}>
               <Row label="Produto" value={data.product_name} />
               <Row label="Saída" value={`${data.withdraw_qty} unidade(s)`} />
               <Row label="Estoque Final" value={`${data.current_quantity - data.withdraw_qty} un.`} />
               <View style={styles.divider} />
               <Row label="Tipo" value={SALE_TYPES.find(t => t.value === data.sale_type)?.label || ""} />
               
               {data.sale_type === "venda" && data.sale_price && (
                   <Row label="Valor Total" value={`R$ ${(data.sale_price * data.withdraw_qty).toFixed(2)}`} />
               )}
            </View>
          </View>
        )}

      </ScrollView>

      {/* Navigation Buttons */}
      {(step > 0 || (!showScanner && data.barcode && !notFound)) && (
        <View style={styles.footer}>
            <View style={styles.btnRow}>
                {step > 0 && (
                    <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(s => s - 1)}>
                        <ChevronLeft color="#000" size={20} />
                        <Text style={styles.btnTextSec}>Voltar</Text>
                    </TouchableOpacity>
                )}

                {step < 2 ? (
                    <TouchableOpacity 
                        style={styles.btnPrimary} 
                        onPress={() => setStep(s => s + 1)}
                        disabled={step === 0 && !data.product_id}
                    >
                        <Text style={styles.btnTextPri}>Próximo</Text>
                        <ChevronRight color="#FFF" size={20} />
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
                        {loading ? <Loader2 color="#FFF" /> : <Check color="#FFF" />}
                        <Text style={styles.btnTextPri}>Confirmar</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, paddingTop: 50, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E5E7EB'
  },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111' },
  iconButton: { padding: 4 },
  
  progressContainer: { flexDirection: 'row', padding: 16, gap: 4 },
  progressStep: { flex: 1, alignItems: 'center', gap: 4 },
  progressCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  progressActive: { backgroundColor: '#F47920' },
  progressInactive: { backgroundColor: '#E5E7EB' },
  stepNum: { fontSize: 12, fontWeight: 'bold', color: '#666' },
  progressText: { fontSize: 10, color: '#666' },
  textActive: { color: '#F47920', fontWeight: 'bold' },

  content: { padding: 16 },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', gap: 16 },
  
  scanResult: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  iconBox: { width: 40, height: 40, backgroundColor: '#FFF1E7', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  cardLabel: { fontSize: 12, color: '#666' },
  monoText: { fontFamily: 'monospace', fontSize: 16, fontWeight: 'bold', color: '#F47920' },
  
  errorBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8 },
  errorText: { color: '#EF4444', fontSize: 12 },
  linkText: { color: '#F47920', fontSize: 12, fontWeight: 'bold' },

  productInfo: { backgroundColor: '#F3F4F6', padding: 12, borderRadius: 8 },
  productName: { fontSize: 14, fontWeight: 'bold', color: '#111' },
  infoLabel: { fontSize: 10, color: '#666' },
  stockInfo: { fontSize: 12, color: '#666', marginTop: 4 },

  inputGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#111' },
  
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterBtn: { width: 40, height: 40, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  counterText: { fontSize: 18, fontWeight: 'bold' },
  counterValue: { fontSize: 18, fontWeight: 'bold', width: 40, textAlign: 'center' },

  grid: { flexDirection: 'row', gap: 8 },
  typeCard: { flex: 1, alignItems: 'center', gap: 6, padding: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8 },
  typeSelected: { borderColor: '#F47920', backgroundColor: '#FFF1E7' },
  typeText: { fontSize: 10, fontWeight: '500', color: '#666' },

  currencyInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 12, backgroundColor: '#FFF' },
  priceInput: { flex: 1, padding: 10, fontSize: 14, color: '#111' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowLabel: { fontSize: 12, color: '#666' },
  rowValue: { fontSize: 14, fontWeight: '500', color: '#111' },
  
  helperText: { fontSize: 10, color: '#999' },
  textGreen: { color: '#10B981' },
  textRed: { color: '#EF4444' },

  summaryBox: { backgroundColor: '#F9FAFB', padding: 12, borderRadius: 8, gap: 4 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 4 },

  footer: { padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderColor: '#E5E7EB' },
  btnRow: { flexDirection: 'row', gap: 12 },
  btnPrimary: { flex: 1, backgroundColor: '#F47920', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 8 },
  btnSecondary: { flex: 1, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 12, gap: 8 },
  btnTextPri: { color: '#FFF', fontWeight: 'bold' },
  btnTextSec: { color: '#111', fontWeight: 'bold' },
});