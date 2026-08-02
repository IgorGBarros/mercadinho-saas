import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider, useAuth } from './src/hooks/useAuth';
import Toast from 'react-native-toast-message';

// Screens
import AuthScreen from './src/screens/AuthScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import ProductListScreen from './src/screens/ProductListScreen'; // Ensure this is imported
import ProductFormScreen from './src/screens/ProductFormScreen'; // Ensure this is imported
import StockWizardScreen from './src/screens/StockWizardScreen'; // Ensure this is imported
import WithdrawProductScreen from './src/screens/WithdrawProductScreen'; // Ensure this is imported
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

function AppNavigation() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null; // Or a loading spinner
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            
            {/* Add these missing screens here: */}
            <Stack.Screen name="ProductList" component={ProductListScreen} />
            <Stack.Screen name="ProductForm" component={ProductFormScreen} />
            <Stack.Screen name="StockWizard" component={StockWizardScreen} />
            <Stack.Screen name="WithdrawProduct" component={WithdrawProductScreen} />
            
            <Stack.Screen name="Settings" component={SettingsScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <AppNavigation />
      <Toast />
    </AuthProvider>
  );
}