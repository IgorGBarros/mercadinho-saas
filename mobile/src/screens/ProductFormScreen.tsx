import React, { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, Modal, StyleSheet } from "react-native";
import { ArrowLeft, ScanBarcode, Save, Loader2, Package, Calendar, Camera as CameraIcon, X } from "lucide-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Camera } from "expo-camera"; // Substitui react-webcam
import { Product, productService } from "../lib/productService";
import { api } from "../services/api";
// Importe seu BarcodeScanner nativo aqui se já convertido
// import BarcodeScanner from "../components/BarcodeScanner"; 

const CATEGORIES = ["Perfumaria", "Corpo", "Rosto", "Cabelos", "Maquiagem", "Infantil", "Casa", "Outro"];

const emptyProduct: Product = {
  name: "",
  bar_code: "",
  natura_sku: "",
  category: "Perfumaria",
  price: 0,
  sale_price: 0,
  cost_price: 0,
  quantity: 0,
  min_quantity: 5,
  description: "",
  batch_code: "",
  expiration_date: ""
};

export default function ProductFormScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { id } = route.params as { id?: number } || {}; // Pega ID da rota
  const isEditing = Boolean(id);

  const [form, setForm] = useState<Product>(emptyProduct);
  const [loading, setLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Sugestões (Simplificado para Mobile: usar Modal ou Dropdown nativo)
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    if (id) {
      productService.get(Number(id)).then(setForm);
    }
  }, [id]);

  const handleChange = (field: keyof Product, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (isEditing) await productService.update(Number(id), form);
      else await productService.addStock(form);
      
      Alert.alert("Sucesso", "Produto salvo!");
      navigation.goBack();
    } catch {
      Alert.alert("Erro", "Falha ao salvar.");
    } finally {
      setLoading(false);
    }
  };

  // ... (Lógica de handleLookup e Scan adaptada) ...

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
            <ArrowLeft color="#000" size={24} />
        </TouchableOpacity>
        <Text style={styles.title}>{isEditing ? "Editar" : "Novo"} Produto</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Código de Barras */}
        <View style={styles.card}>
            <Text style={styles.label}>Código de Barras</Text>
            <View style={styles.row}>
                <TextInput 
                    style={[styles.input, { flex: 1 }]} 
                    value={form.bar_code}
                    onChangeText={t => handleChange("bar_code", t)}
                    placeholder="Escaneie..."
                />
                <TouchableOpacity style={styles.iconBtn} onPress={() => setShowScanner(true)}>
                    <ScanBarcode color="#000" size={20} />
                </TouchableOpacity>
            </View>
        </View>

        {/* Nome e Dados */}
        <View style={styles.card}>
            <Text style={styles.label}>Nome</Text>
            <TextInput 
                style={styles.input} 
                value={form.name}
                onChangeText={t => handleChange("name", t)}
            />
            
            <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Preço Venda</Text>
                    <TextInput 
                        style={styles.input} 
                        keyboardType="numeric"
                        value={String(form.price)}
                        onChangeText={t => handleChange("price", parseFloat(t))}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.label}>Custo</Text>
                    <TextInput 
                        style={styles.input} 
                        keyboardType="numeric"
                        value={String(form.cost_price)}
                        onChangeText={t => handleChange("cost_price", parseFloat(t))}
                    />
                </View>
            </View>
        </View>

        <TouchableOpacity 
            style={styles.saveBtn} 
            onPress={handleSave}
            disabled={loading}
        >
            {loading ? <Loader2 color="#FFF" /> : <Save color="#FFF" />}
            <Text style={styles.saveText}>Salvar</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal de Scanner (Simplificado) */}
      <Modal visible={showScanner} animationType="slide">
         {/* Aqui viria o seu BarcodeScanner nativo */}
         <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
             <Text>Scanner Aqui</Text>
             <TouchableOpacity onPress={() => setShowScanner(false)}>
                 <Text>Fechar</Text>
             </TouchableOpacity>
         </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 50, backgroundColor: '#FFF' },
  title: { fontSize: 18, fontWeight: 'bold', marginLeft: 16 },
  content: { padding: 16, gap: 16 },
  card: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, gap: 8 },
  label: { fontSize: 12, color: '#666', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 10, backgroundColor: '#E5E7EB', borderRadius: 8, marginLeft: 8 },
  saveBtn: { backgroundColor: '#F47920', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 20 },
  saveText: { color: '#FFF', fontWeight: 'bold' }
});