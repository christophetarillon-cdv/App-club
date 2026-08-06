import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const CREDENTIALS_KEY = 'cdcv_biometric_credentials';
const BIOMETRIC_ENABLED_KEY = 'cdcv_biometric_enabled';

export const isBiometricAvailable = async (): Promise<boolean> => {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  return LocalAuthentication.isEnrolledAsync();
};

export const getBiometricLabel = async (): Promise<string> => {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'Face ID';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'Empreinte digitale';
  }
  return 'Biométrie';
};

export const isBiometricEnabled = async (): Promise<boolean> => {
  const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
  return val === 'true';
};

export const saveBiometricCredentials = async (email: string, password: string): Promise<void> => {
  await SecureStore.setItemAsync(CREDENTIALS_KEY, JSON.stringify({ email, password }));
  await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
};

export const getBiometricCredentials = async (): Promise<{ email: string; password: string } | null> => {
  const raw = await SecureStore.getItemAsync(CREDENTIALS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export const disableBiometric = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(CREDENTIALS_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
};

export const authenticateWithBiometric = async (): Promise<boolean> => {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Identifiez-vous pour accéder à CDCV',
    cancelLabel: 'Annuler',
    fallbackLabel: 'Mot de passe',
    disableDeviceFallback: false,
  });
  return result.success;
};
