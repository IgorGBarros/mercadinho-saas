import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions, Alert } from 'react-native';
import {  CameraType, BarcodeScanningResult } from 'expo-camera'; // Correção na importação
import * as ImagePicker from 'expo-image-picker';
import { X, Zap, ZapOff, ImagePlus } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence } from 'react-native-reanimated';
import { Camera, FlashMode } from 'expo-camera';
// Importa os ícones do Lucide
// Nota: Certifique-se de ter instalado lucide-react-native e react-native-svg

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [flashMode, setFlashMode] = useState(FlashMode.off);
  const [cameraType, setCameraType] = useState(CameraType.back);
  const [error, setError] = useState<string>("");

  // Animação da mira
  const scanLineTop = useSharedValue(0);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();

    // Inicia a animação da linha de scan
    scanLineTop.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000 }),
        withTiming(0, { duration: 2000 })
      ),
      -1,
      true
    );
  }, []);

  const handleBarCodeScanned = ({ type, data }: BarcodeScanningResult) => {
    if (scanned) return;
    
    // Validação simples (apenas números e tamanho mínimo)
    if (/^\d{8,14}$/.test(data)) {
        setScanned(true);
        onScan(data);
    }
  };

  const toggleFlash = () => {
    setFlashMode(
      flashMode === Camera.Constants.FlashMode.off
        ? Camera.Constants.FlashMode.torch
        : Camera.Constants.FlashMode.off
    );
  };

  const pickImage = async () => {
    // Pede permissão para acessar a galeria
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão necessária', 'Precisamos de acesso à sua galeria para isso funcionar!');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, // Permite editar/recortar para ajudar no foco
      quality: 1,
    });

    if (!result.canceled) {
        // Nota: Ler código de barras de imagem estática no Expo requer uma lib extra
        // como 'expo-barcode-scanner' (deprecated) ou ML Kit via plugin.
        // Para simplificar neste exemplo, vamos simular ou você precisará instalar 'expo-barcode-scanner'
        // e usar BarCodeScanner.scanFromURLAsync(result.assets[0].uri)
        
        try {
            // Exemplo hipotético com expo-barcode-scanner (precisa instalar separadamente se não incluso na Camera)
            // const scanned = await BarCodeScanner.scanFromURLAsync(result.assets[0].uri);
            // if (scanned[0]) onScan(scanned[0].data);
            
            Alert.alert("Aviso", "Leitura de arquivo estático requer configuração adicional de ML Kit no React Native.");
        } catch (e) {
            setError("Não foi possível ler o código da imagem.");
        }
    }
  };

  // Estilo animado para a linha vermelha
  const animatedStyle = useAnimatedStyle(() => ({
    top: `${scanLineTop.value * 100}%`,
  }));

  if (hasPermission === null) {
    return <View style={styles.container}><Text style={styles.text}>Solicitando permissão de câmera...</Text></View>;
  }
  if (hasPermission === false) {
    return <View style={styles.container}><Text style={styles.text}>Sem acesso à câmera</Text><TouchableOpacity onPress={onClose}><Text style={styles.text}>Fechar</Text></TouchableOpacity></View>;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Scanner</Text>
        <View style={styles.headerControls}>
          <TouchableOpacity onPress={toggleFlash} style={[styles.iconButton, flashMode === Camera.Constants.FlashMode.torch && styles.iconButtonActive]}>
            {flashMode === Camera.Constants.FlashMode.torch ? 
                <ZapOff color="#000" size={24} /> : 
                <Zap color="#FFF" size={24} />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.iconButton}>
            <X color="#FFF" size={24} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Câmera */}
      <Camera
        style={styles.camera}
        type={cameraType}
        flashMode={flashMode}
        onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
        ratio="16:9"
      >
        {/* Overlay Escuro com Buraco */}
        <View style={styles.overlay}>
            <View style={styles.overlayTop} />
            <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanBox}>
                    <Animated.View style={[styles.scanLine, animatedStyle]} />
                </View>
                <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom}>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
        </View>
      </Camera>

      {/* Rodapé Upload */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
          <ImagePlus color="#000" size={24} />
          <Text style={styles.uploadButtonText}>Enviar Foto (Melhor Foco)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');
const boxSize = width * 0.7;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  text: {
    color: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50, // Safe area
    backgroundColor: 'rgba(0,0,0,0.8)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerControls: {
    flexDirection: 'row',
    gap: 15,
  },
  iconButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#333',
  },
  iconButtonActive: {
    backgroundColor: '#FFD700', // Amarelo
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: boxSize / 1.5, // Aspect ratio similar ao web
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  scanBox: {
    width: boxSize,
    height: boxSize / 1.5,
    borderWidth: 2,
    borderColor: 'red',
    borderRadius: 10,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    position: 'relative',
  },
  scanLine: {
    width: '100%',
    height: 2,
    backgroundColor: 'red',
    position: 'absolute',
    shadowColor: 'red',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    paddingTop: 20,
  },
  errorText: {
    color: '#FF6B6B',
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 10,
    borderRadius: 5,
  },
  footer: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#18181b', // zinc-900
  },
  uploadButton: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  uploadButtonText: {
    color: 'black',
    fontWeight: 'bold',
    fontSize: 16,
  },
});