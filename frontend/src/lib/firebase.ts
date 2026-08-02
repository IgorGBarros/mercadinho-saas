// src/lib/firebase.ts
//
// ⚠️ CORREÇÃO: este arquivo chamava initializeApp() por conta própria,
// sem saber que ../firebaseConfig.ts (o que a consultora já usa, via
// useAuth.tsx) já inicializa o Firebase assim que o app carrega. Os dois
// convivem no MESMO bundle (é uma SPA só) — se os dois tentassem
// inicializar, o segundo lançaria "Firebase: Firebase App named
// '[DEFAULT]' already exists (app/duplicate-app)" assim que alguém
// clicasse em "Continuar com Google" na tela do desenvolvedor.
//
// Agora reaproveita a MESMA instância de auth que firebaseConfig.ts já
// criou — um só Firebase App pro app inteiro, do jeito que o SDK espera.
import { GoogleAuthProvider, GithubAuthProvider, Auth, signInWithPopup } from "firebase/auth";
import { auth } from "../firebaseConfig";

let googleProviderInstance: GoogleAuthProvider | null = null;
let githubProviderInstance: GithubAuthProvider | null = null;

export function getFirebaseAuth(): Auth {
  return auth;
}

export function getGoogleProvider(): GoogleAuthProvider {
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.addScope("email");
    googleProviderInstance.addScope("profile");
  }
  return googleProviderInstance;
}

// ✅ GitHub — comum em produtos de API voltados pra desenvolvedores. Usa o
// mesmo projeto Firebase que a consultora já usa; só precisa habilitar o
// provedor "GitHub" no console do Firebase (Authentication > Sign-in method).
export function getGithubProvider(): GithubAuthProvider {
  if (!githubProviderInstance) {
    githubProviderInstance = new GithubAuthProvider();
    githubProviderInstance.addScope("user:email");
  }
  return githubProviderInstance;
}

export { signInWithPopup };