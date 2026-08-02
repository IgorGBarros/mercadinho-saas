import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import {
  Package,
  TrendingDown,
  DollarSign,
  BarChart3,
  Plus,
  ScanBarcode,
  List,
  Settings as SettingsIcon,
  ArrowDownCircle,
  PieChart,
  MessageCircle // Ícone para o chat (se for um botão simples)
} from 'lucide-react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
// Se tiver o ChatAssistant adaptado para mobile (ex: Modal), importe aqui
// import ChatAssistant from '../components/ChatAssistant'; 

// Tipagem dos itens vindos da API
interface InventoryItem {
  id: number;
  product: {
    id: number;
    name: string;
    official_price: number;
  };
  total_quantity: number;
  min_quantity: number;
  cost_price: string | number;
  sale_price: string | number;
}

interface StatCard {
  label: string;
  value: string | number;
  icon: any;
  change: string;
  color?: string;
}

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estados para os dados do Dashboard
  const [stats, setStats] = useState<StatCard[]>([
    { label: "Total Produtos", value: "-", icon: Package, change: "..." },
    { label: "Unidades em Estoque", value: "-", icon: BarChart3, change: "..." },
    { label: "Estoque Baixo", value: "-", icon: TrendingDown, change: "..." },
    { label: "Valor Investido", value: "R$ -", icon: DollarSign, change: "..." },
  ]);

  const [lowStockItems, setLowStockItems] = useState<InventoryItem[]>([]);

  const fetchDashboardData = async () => {
    try {
      const { data } = await api.get<InventoryItem[]>("/inventory/");

      // 1. Cálculos de Totais
      const totalProdutos = data.length;
      const unidadesTotal = data.reduce((acc, item) => acc + item.total_quantity, 0);
      const valorTotal = data.reduce((acc, item) => {
        const custo = Number(item.cost_price) || 0;
        return acc + (custo * item.total_quantity);
      }, 0);

      // 2. Filtro de Estoque Baixo
      const criticalItems = data.filter(item => item.total_quantity <= item.min_quantity);

      // 3. Formatação de Moeda
      const valorFormatado = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      // Atualiza os Cards
      setStats([
        {
          label: "Total Produtos",
          value: totalProdutos,
          icon: Package,
          change: "SKUs ativos"
        },
        {
          label: "Unidades em Estoque",
          value: unidadesTotal,
          icon: BarChart3,
          change: "Total de itens"
        },
        {
          label: "Estoque Baixo",
          value: criticalItems.length,
          icon: TrendingDown,
          change: "Itens críticos",
          color: criticalItems.length > 0 ? "#EF4444" : "#F47920" // Red vs Primary
        },
        {
          label: "Valor Investido",
          value: valorFormatado,
          icon: DollarSign,
          change: "Custo total"
        },
      ]);

      setLowStockItems(criticalItems.slice(0, 5));
    } catch (error) {
      console.error("Erro ao carregar dashboard", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Carrega ao montar e ao focar na tela
  useEffect(() => {
    fetchDashboardData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Componente interno para Botões de Ação
  const ActionBtn = ({ onClick, icon: Icon, label, desc, primary }: any) => (
    <TouchableOpacity
      onPress={onClick}
      style={[
        styles.actionBtn,
        primary ? styles.actionBtnPrimary : styles.actionBtnSecondary
      ]}
    >
      <View style={[styles.iconContainer, primary ? styles.iconContainerPrimary : styles.iconContainerSecondary]}>
        <Icon size={20} color={primary ? "#FFF" : "#F47920"} />
      </View>
      <View>
        <Text style={[styles.actionLabel, primary && styles.textWhite]}>{label}</Text>
        <Text style={[styles.actionDesc, primary && styles.textWhiteOpac]}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <View style={styles.logoBox}>
            <Package color="#F47920" size={20} />
          </View>
          <View>
            <Text style={styles.appName}>Estoque Natura</Text>
            <Text style={styles.appSubtitle}>Gestão inteligente</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate("Settings")}
          style={styles.settingsBtn}
        >
          <SettingsIcon color="#666" size={24} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Loading */}
        {loading && !refreshing && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#F47920" />
            <Text style={styles.loadingText}>Carregando indicadores...</Text>
          </View>
        )}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <View key={index} style={styles.statCard}>
                <View style={styles.statHeader}>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Icon size={16} color={stat.color || "#6B7280"} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={[styles.statChange, { color: stat.color || "#F47920" }]}>
                  {stat.change}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.actionsGrid}>
          {/* Note: Ajuste as rotas conforme seu Stack Navigator */}
          <ActionBtn
            onClick={() => navigation.navigate("ProductForm")} // ou StockWizard
            icon={ScanBarcode}
            label="Cadastrar"
            desc="Scan"
            primary
          />
          <ActionBtn
            onClick={() => navigation.navigate("WithdrawProduct")}
            icon={ArrowDownCircle}
            label="Baixa"
            desc="Saída"
          />
          <ActionBtn
            onClick={() => navigation.navigate("ProductList")}
            icon={List}
            label="Estoque"
            desc="Lista"
          />
          <ActionBtn
            onClick={() => { /* navigation.navigate("DashboardAnalytics") */ }}
            icon={PieChart}
            label="Dash"
            desc="Gráficos"
          />
          <ActionBtn
            onClick={() => navigation.navigate("ProductForm")} // Manual
            icon={Plus}
            label="Manual"
            desc="Novo"
          />
        </View>

        {/* Low Stock Alert */}
        {lowStockItems.length > 0 ? (
          <View style={styles.alertCard}>
            <View style={styles.alertHeader}>
              <TrendingDown color="#EF4444" size={20} />
              <Text style={styles.alertTitle}>Estoque Baixo</Text>
            </View>
            
            <View style={styles.alertList}>
              {lowStockItems.map((item) => (
                <View key={item.id} style={styles.alertItem}>
                  <Text style={styles.alertItemName} numberOfLines={1}>{item.product.name}</Text>
                  <View style={styles.alertItemMeta}>
                    {/* Barra de progresso visual simulada */}
                    <View style={styles.progressBarBg}>
                      <View 
                        style={[
                          styles.progressBarFill, 
                          { width: `${Math.min((item.total_quantity / item.min_quantity) * 100, 100)}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.alertItemValue}>
                      {item.total_quantity}/{item.min_quantity}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          !loading && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Tudo sob controle! 🎉</Text>
            </View>
          )
        )}

        <Text style={styles.footerText}>
          💬 Toque no ícone para falar com a IA
        </Text>
      </ScrollView>

      {/* FAB Chat (Substituto do componente web ChatAssistant flutuante) */}
      {/* Se você já converteu o ChatAssistant.tsx, use-o aqui: <ChatAssistant /> */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={() => { /* Abrir Modal do Chat */ }}
      >
        <MessageCircle color="#FFF" size={28} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // Background claro
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50, // Safe Area aproximada
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF7ED', // Primary light
    justifyContent: 'center',
    alignItems: 'center',
  },
  appName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  appSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  settingsBtn: {
    padding: 8,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100, // Espaço para o FAB
  },
  loadingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: (width - 44) / 2, // 2 colunas com margem
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statChange: {
    fontSize: 10,
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  actionBtn: {
    width: (width - 48) / 3, // 3 colunas aproximado (ajuste conforme necessário)
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    minHeight: 100,
    justifyContent: 'center',
  },
  actionBtnPrimary: {
    backgroundColor: '#F47920', // Primary
    borderColor: '#F47920',
  },
  actionBtnSecondary: {
    backgroundColor: '#FFF',
    borderColor: '#E5E7EB',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerPrimary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  iconContainerSecondary: {
    backgroundColor: '#FFF7ED',
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  actionDesc: {
    fontSize: 10,
    color: '#6B7280',
  },
  textWhite: { color: '#FFF' },
  textWhiteOpac: { color: 'rgba(255,255,255,0.8)' },
  
  alertCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA', // Red light border
    overflow: 'hidden',
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#FEF2F2', // Red light bg
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  alertList: {
    padding: 16,
    gap: 12,
  },
  alertItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  alertItemName: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
    marginRight: 12,
  },
  alertItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 100,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#EF4444',
  },
  alertItemValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#EF4444',
    width: 30,
    textAlign: 'right',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    borderRadius: 12,
  },
  emptyStateText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  footerText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 24,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F47920',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#F47920',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  }
});