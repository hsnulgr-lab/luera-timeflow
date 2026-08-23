import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * Müdür oturumu — yalnız MÜDÜR modunda kullanılır.
 *
 * Personel cihazında Supabase kimliği YOKTUR ve olmayacak: personelin elindeki
 * tek şey cihaz ve personel token'ıdır, veriye `staff-api` üzerinden erişir.
 * Bu ayrım güvenliğin temeli — personel telefonuna Supabase oturumu koymak,
 * RLS org seviyesinde olduğu için salonun tüm verisini o telefona açardı.
 *
 * Müdür ise masaüstündeki hesabın aynısıyla girer; ona org seviyesinde erişim
 * zaten tanımlı.
 *
 * Anon anahtar gizli değil: web istemcisine de aynısı iniyor. Yetkiyi RLS
 * veriyor, anahtar değil.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
    auth: {
        storage: AsyncStorage,
        // Oturum cihazda kalır: müdür her açılışta şifre yazmasın.
        persistSession: true,
        autoRefreshToken: true,
        // Mobilde URL yok; oturum bağlantıdan okunmaya çalışılmasın.
        detectSessionInUrl: false,
    },
});
