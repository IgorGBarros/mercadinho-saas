
import axios from 'axios';
import Constants from 'expo-constants';

// Em desenvolvimento, use o IP da sua máquina (ex: 192.168.1.15)
const API_URL = Constants.expoConfig?.extra?.apiUrl || "http://192.168.1.9:8000";

export const api = axios.create({
  baseURL: API_URL,
});