// Sunucunun mesaj kalıplarını telefona birebir kopyalar (bkz. src/lib/waShared/KAYNAK.md).
// Çalıştırma: node mobile/scripts/sync-wa-shared.mjs
import { copyFileSync } from 'node:fs';

const FILES = ['messages', 'tr', 'slots', 'identity', 'hitap'];
for (const f of FILES) {
    const from = new URL(`../../supabase/functions/_shared/booking/${f}.ts`, import.meta.url);
    const to = new URL(`../src/lib/waShared/${f}.ts`, import.meta.url);
    copyFileSync(from, to);
    console.log(`kopyalandı: ${f}.ts`);
}
