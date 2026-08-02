import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, FlatList, 
  ActivityIndicator, Alert, TextInput, Image 
} from 'react-native';
import { 
  ArrowLeft, Plus, Search, Edit, Trash2, Package, 
  ScanBarcode, ImageOff, AlertTriangle 
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Product, productService } from '../lib/productService';
// Se usar react-native-toast-message, importe aqui. Usarei Alert.

export default function ProductListScreen() {
  const navigation = useNavigation<any>();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await productService.list();
      setProducts(data);
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Falha ao carregar lista.");
    } finally {
      setLoading(false);
    }
  };

  // Recarrega a lista sempre que a tela ganha foco (voltar da edição/criação)
  useFocusEffect(
    useCallback(() => {
      loadProducts();
    }, [])
  );

  const handleDelete = (id: number) => {
    Alert.alert(
      "Excluir Produto",
      "Tem certeza? Essa ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        { 
          text: "Excluir", 
          style: "destructive",
          onPress: async () => {
            try {
              await productService.delete(id);
              setProducts(prev => prev.filter(p => p.id !== id));
            } catch {
              Alert.alert("Erro", "Não foi possível excluir.");
            }
          }
        }
      ]
    );
  };

  const formatMoney = (val?: number | string) => {
    const num = Number(val);
    if (isNaN(num)) return "R$ 0,00";
    return `R$ ${num.toFixed(2).replace('.', ',')}`;
  };

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.bar_code?.includes(search) ||
      p.category.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }: { item: Product }) => {
    const displayPrice = item.sale_price || item.price || 0;
    const isLowStock = item.quantity <= item.min_quantity;

    return (
      <View style={styles.card}>
        {/* Imagem */}
        <View style={styles.imageContainer}>
          {item.image_url ? (
            <Image 
              source={{ uri: item.image_url }} 
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.placeholderImage}>
              <ImageOff color="#ccc" size={24} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
            <View style={styles.rowBetween}>
                <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                {isLowStock && <AlertTriangle size={16} color="#F59E0B" />}
            </View>
            
            <Text style={styles.productMeta} numberOfLines={1}>
                {item.category} • SKU: {item.natura_sku || '-'}
            </Text>

            <View style={[styles.rowBetween, { marginTop: 8 }]}>
                <View style={styles.row}>
                    <View style={[styles.badge, item.quantity > 0 ? styles.badgeGreen : styles.badgeRed]}>
                        <Text style={[styles.badgeText, item.quantity > 0 ? styles.textGreen : styles.textRed]}>
                            {item.quantity} un
                        </Text>
                    </View>
                    <Text style={styles.priceText}>{formatMoney(displayPrice)}</Text>
                </View>

                <View style={styles.actions}>
                    <TouchableOpacity 
                        onPress={() => navigation.navigate('ProductForm', { id: item.id })}
                        style={styles.actionBtn}
                    >
                        <Edit size={18} color="#666" />
                    </TouchableOpacity>
                    <TouchableOpacity 
                        onPress={() => handleDelete(item.id!)}
                        style={styles.actionBtn}
                    >
                        <Trash2 size={18} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.row}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
                <ArrowLeft color="#666" size={24} />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
                <Text style={styles.title}>Estoque</Text>
                <Text style={styles.subtitle}>{products.length} itens</Text>
            </View>
        </View>
        
        <View style={styles.row}>
            {/* Botão de Scan pode abrir um Modal ou navegar para tela de form com foco no scan */}
            <TouchableOpacity 
                style={[styles.headerBtn, { marginRight: 8 }]}
                onPress={() => navigation.navigate('ProductForm')} // Simplificado: vai pro form novo
            >
                <ScanBarcode color="#333" size={20} />
            </TouchableOpacity>
            
            <TouchableOpacity 
                style={[styles.headerBtn, styles.primaryBtn]}
                onPress={() => navigation.navigate('StockWizard')}
            >
                <Plus color="#FFF" size={20} />
                <Text style={styles.primaryBtnText}>Entrada</Text>
            </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Search color="#9CA3AF" size={20} style={styles.searchIcon} />
        <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nome, código..."
            value={search}
            onChangeText={setSearch}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
            <ActivityIndicator size="large" color="#F47920" />
            <Text style={{ marginTop: 10, color: '#666' }}>Carregando estoque...</Text>
        </View>
      ) : (
        <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
                <View style={styles.centerEmpty}>
                    <Package color="#ddd" size={64} />
                    <Text style={styles.emptyText}>Nenhum produto encontrado</Text>
                </View>
            }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: 50, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E5E7EB'
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { padding: 4 },
  title: { fontSize: 18, fontWeight: 'bold', color: '#111' },
  subtitle: { fontSize: 12, color: '#666' },
  
  headerBtn: { 
    flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 8, 
    borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFF' 
  },
  primaryBtn: { backgroundColor: '#F47920', borderColor: '#F47920', gap: 6, paddingHorizontal: 12 },
  primaryBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    margin: 16, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5E7EB'
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 48, fontSize: 14 },

  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  card: {
    flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, 
    padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, elevation: 1
  },
  imageContainer: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  image: { width: '100%', height: '100%' },
  placeholderImage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  
  infoContainer: { flex: 1, marginLeft: 12, justifyContent: 'center' },
  productName: { fontSize: 14, fontWeight: '600', color: '#111', flex: 1 },
  productMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  
    badge: { 
    paddingHorizontal: 8, 
    paddingVertical: 2, 
    borderRadius: 12, 
    marginRight: 8 
  },
  // Add this:
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  badgeGreen: { backgroundColor: '#DCFCE7' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  textGreen: { color: '#166534', fontSize: 10, fontWeight: 'bold' },
  textRed: { color: '#991B1B', fontSize: 10, fontWeight: 'bold' },
  
  priceText: { fontSize: 14, fontWeight: 'bold', color: '#111' },
  
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { padding: 4 },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerEmpty: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 16, color: '#9CA3AF' }
});