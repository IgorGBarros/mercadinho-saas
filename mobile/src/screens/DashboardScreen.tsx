import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { 
  Package, TrendingDown, DollarSign, BarChart3, 
  ScanBarcode, ArrowDownCircle, List, PieChart, Plus 
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DashboardScreen({ navigation }: any) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Estoque Natura</Text>
          <Text style={styles.headerSubtitle}>Gestão inteligente</Text>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>Total Produtos</Text>
               <Package size={20} color="#F47920" />
            </View>
            <Text style={styles.statValue}>47</Text>
            <Text style={styles.statSub}>SKUs ativos</Text>
          </View>
          
          <View style={styles.statCard}>
            <View style={styles.statHeader}>
               <Text style={styles.statLabel}>Valor Investido</Text>
               <DollarSign size={20} color="#10B981" />
            </View>
            <Text style={styles.statValue}>R$ 24k</Text>
            <Text style={styles.statSub}>Custo total</Text>
          </View>
        </View>

        {/* Quick Actions Grid */}
        <View style={styles.actionsGrid}>
          <ActionBtn 
            onPress={() => navigation.navigate('ProductForm')} // Ajustado para rota de cadastro
            icon={ScanBarcode} 
            label="Cadastrar" 
            desc="Scan" 
            primary 
          />
          <ActionBtn 
            onPress={() => navigation.navigate('WithdrawProduct')} 
            icon={ArrowDownCircle} 
            label="Baixa" 
            desc="Saída" 
          />
          <ActionBtn 
            onPress={() => navigation.navigate('ProductList')} 
            icon={List} 
            label="Estoque" 
            desc="Lista" 
          />
          <ActionBtn 
            onPress={() => navigation.navigate('Dashboard')} // Já estamos aqui, mas mantendo consistência
            icon={PieChart} 
            label="Dash" 
            desc="Gráficos" 
          />
          <ActionBtn 
            onPress={() => navigation.navigate('ProductForm')} // Cadastro manual
            icon={Plus} 
            label="Manual" 
            desc="Novo" 
          />
        </View>

        {/* Botão de Ação Principal (Scan Rápido) */}
        <TouchableOpacity 
          style={styles.mainActionBtn}
          onPress={() => navigation.navigate('StockWizard')}
        >
          <ScanBarcode color="#FFF" size={24} />
          <Text style={styles.mainActionText}>Entrada Rápida (Scan)</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

// Componente Auxiliar de Botão
interface ActionBtnProps {
  onPress: () => void;
  icon: any;
  label: string;
  desc: string;
  primary?: boolean;
}

function ActionBtn({ onPress, icon: Icon, label, desc, primary }: ActionBtnProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.actionBtn,
        primary ? styles.actionBtnPrimary : styles.actionBtnDefault
      ]}
    >
      <View style={[styles.iconContainer, primary ? styles.iconContainerPrimary : styles.iconContainerDefault]}>
        <Icon size={20} color={primary ? "#FFF" : "#F47920"} />
      </View>
      <View>
        <Text style={[styles.actionLabel, primary && styles.textWhite]}>{label}</Text>
        <Text style={[styles.actionDesc, primary && styles.textWhite70]}>{desc}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB', // gray-50
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827', // gray-900
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280', // gray-500
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB', // gray-100
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 4,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionBtn: {
    width: '30%', // Aproximadamente 3 colunas
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    minHeight: 100,
    justifyContent: 'center',
  },
  actionBtnDefault: {
    backgroundColor: '#FFF',
    borderColor: '#E5E7EB',
  },
  actionBtnPrimary: {
    backgroundColor: '#F47920', // Primary Natura
    borderColor: '#F47920',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerDefault: {
    backgroundColor: '#FFF7ED', // orange-50
  },
  iconContainerPrimary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  actionDesc: {
    fontSize: 10,
    color: '#6B7280',
  },
  textWhite: {
    color: '#FFF',
  },
  textWhite70: {
    color: 'rgba(255,255,255,0.7)',
  },
  mainActionBtn: {
    backgroundColor: '#F47920',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#F47920',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  mainActionText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});