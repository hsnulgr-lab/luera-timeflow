import { toast } from 'sonner';

/**
 * Luera TimeFlow telefon uygulaması — personel buradan indirip ekip koduyla
 * ("Telefon bağla") girer. Kullanıcı kararı 2026-10-22: personel eklenince
 * uygulamayı indirmenin yolu ve bağlantısı verilsin.
 */
export const APP_STORE_URL = 'https://apps.apple.com/tr/app/luera-timeflow/id6816258771';

/** Personele iletmek için: WhatsApp'a, e-postaya yapıştırılır. */
export async function uygulamaBaglantisiniKopyala(): Promise<void> {
    try {
        await navigator.clipboard.writeText(APP_STORE_URL);
        toast.success('Uygulama bağlantısı kopyalandı', { description: 'Personelinize WhatsApp ya da e-postayla gönderebilirsiniz.' });
    } catch {
        // Pano izni yoksa bağlantı yeni sekmede açılır; adres çubuğundan alınır.
        window.open(APP_STORE_URL, '_blank', 'noopener');
    }
}

/** "Personel eklendi" bildirimi — uygulamanın yolu ve bağlantısıyla. */
export function personelEklendiBildirimi(kisi = 'Personel'): void {
    toast.success(`${kisi} eklendi`, {
        description: "Telefonuna Luera TimeFlow'u indirip Personel sayfasındaki \"Telefon bağla\" koduyla girer.",
        duration: 9000,
        action: { label: 'Bağlantıyı kopyala', onClick: () => { void uygulamaBaglantisiniKopyala(); } },
    });
}
