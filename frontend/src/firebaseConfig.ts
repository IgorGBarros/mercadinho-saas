// src/firebaseConfig.ts
import { initializeApp, FirebaseApp, FirebaseOptions } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup,
  Auth
} from 'firebase/auth';

// ✅ VALIDAÇÃO: Verifica se as variáveis essenciais existem
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;

if (!apiKey || !authDomain || !projectId) {
  console.error('❌ Firebase config inválida:');
  console.error('  - VITE_FIREBASE_API_KEY:', apiKey ? '✓' : '✗ (vazia)');
  console.error('  - VITE_FIREBASE_AUTH_DOMAIN:', authDomain ? '✓' : '✗ (vazia)');
  console.error('  - VITE_FIREBASE_PROJECT_ID:', projectId ? '✓' : '✗ (vazia)');
  console.error('\n💡 Solução:');
  console.error('  1. Verifique se .env.local existe em frontend/');
  console.error('  2. Certifique-se que as variáveis começam com VITE_');
  console.error('  3. Reinicie o servidor: npm run dev');
}

// Configuração do Firebase
const firebaseConfig: FirebaseOptions = {
  apiKey,
  authDomain,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// ✅ Inicializa apenas se tiver config válida
let app: FirebaseApp;
let auth: Auth;
let googleProvider: GoogleAuthProvider;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  console.log('✅ Firebase inicializado com sucesso');
} catch (error) {
  console.error('❌ Erro ao inicializar Firebase:', error);
  // Fallback para não quebrar o app em dev
  auth = {} as Auth;
  googleProvider = {} as GoogleAuthProvider;
}

export { auth, googleProvider, signInWithPopup };