// DARKLINK — قفل التطبيق (v1.6.0)
// بصمة/وجه (expo-local-authentication) + رمز PIN احتياطي (4 أرقام).
// الـ PIN بيتخزن في SecureStore على الموبايل، وفي AsyncStorage على الويب
// (مفيش SecureStore على الويب — أقل أمانًا لكنه بديل مقبول).
// لو البصمة مش متاحة ومفيش PIN متعيّن، الميزة بتفضل مقفولة —
// مستحيل يتقفل التطبيق على المستخدم من غير طريقة فتح.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

const ENABLED_KEY = 'darklink:applock:enabled';
const PIN_KEY = 'darklink:applock:pin';

export async function isLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setLockEnabled(v: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, v ? '1' : '0');
  } catch {
    // تجاهل
  }
}

async function storePin(pin: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(PIN_KEY, pin);
    return;
  }
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

async function readPin(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return await AsyncStorage.getItem(PIN_KEY);
    return await SecureStore.getItemAsync(PIN_KEY);
  } catch {
    return null;
  }
}

export async function hasPin(): Promise<boolean> {
  return (await readPin()) !== null;
}

export async function setPin(pin: string): Promise<void> {
  await storePin(pin);
}

export async function clearPin(): Promise<void> {
  try {
    if (Platform.OS === 'web') await AsyncStorage.removeItem(PIN_KEY);
    else await SecureStore.deleteItemAsync(PIN_KEY);
  } catch {
    // تجاهل
  }
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = await readPin();
  return !!stored && stored === pin;
}

export async function biometricsAvailable(): Promise<{
  hardware: boolean;
  enrolled: boolean;
}> {
  try {
    if (Platform.OS === 'web') return { hardware: false, enrolled: false };
    const hardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = hardware
      ? await LocalAuthentication.isEnrolledAsync()
      : false;
    return { hardware, enrolled };
  } catch {
    return { hardware: false, enrolled: false };
  }
}

export async function authenticateBiometric(promptMessage?: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? 'Unlock DARKLINK',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}
