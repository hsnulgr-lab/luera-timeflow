// Yerel deneme: beş kontrolü BU bilgisayardan bir kez koşar ve tabloyu basar.
// Bildirim göndermez. `--bildirim` verilirse ayarlı kanallara (Pushover, ntfy)
// tek bir deneme mesajı atar — telefon tarafını sınamak için.
//
//   node ops/izleme/dene.mjs
//   node ops/izleme/dene.mjs --bildirim
//   node ops/izleme/dene.mjs --ornek     (giriş alarmının örneği, NORMAL öncelikle)
//
// Kanal sırları ~/.luera-izleme.env'den (KEY=VALUE, depo dışında) ve
// ~/.luera-izleme-konu'dan okunur; ekrana basılmaz.
//
// Adresler wrangler.toml'daki [vars]'tan okunur (tek kaynak). Anahtar
// ortamda yoksa mobile/.env'deki anon anahtar kullanılır; ekrana basılmaz.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { kontroller, kontrolEt, gonder, kanallar, karar } from './src/kontroller.js';

const burasi = (p) => new URL(p, import.meta.url);

const toml = readFileSync(burasi('./wrangler.toml'), 'utf8');
const vars = Object.fromEntries(
    [...toml.slice(toml.indexOf('[vars]')).split('\n[')[0].matchAll(/^(\w+)\s*=\s*"([^"]*)"/gm)]
        .map((m) => [m[1], m[2]]),
);

let anahtar = process.env.SUPABASE_ANON_KEY;
if (!anahtar) {
    try {
        const env = readFileSync(burasi('../../mobile/.env'), 'utf8');
        anahtar = env.match(/^EXPO_PUBLIC_SUPABASE_ANON_KEY=["']?([^"'\n]+)/m)?.[1];
    } catch { /* yoksa giriş kontrolü 401 ile düşer, tabloda görünür */ }
}

const oku = (yol) => { try { return readFileSync(`${homedir()}/${yol}`, 'utf8'); } catch { return ''; } };
const sirlar = Object.fromEntries(
    [...oku('.luera-izleme.env').matchAll(/^([A-Z_]+)=(.*)$/gm)].map((m) => [m[1], m[2].trim()]),
);
const env = {
    ...vars, ...sirlar, SUPABASE_ANON_KEY: anahtar,
    NTFY_TOPIC: process.env.NTFY_TOPIC || oku('.luera-izleme-konu').trim() || undefined,
};
const sonuclar = await Promise.all(kontroller(env).map((k) => kontrolEt(k, (...a) => fetch(...a))));
for (const s of sonuclar) {
    console.log(`${s.ok ? '✓' : '✗'} ${s.id.padEnd(9)} ${String(s.ms).padStart(5)} ms  ${s.ayrinti}`);
}

if (process.argv.includes('--bildirim')) {
    const ad = kanallar(env).map((k) => k.ad);
    if (!ad.length) {
        console.error('Ayarlı bildirim kanalı yok (~/.luera-izleme.env ya da ~/.luera-izleme-konu).');
        process.exit(1);
    }
    const ayakta = sonuclar.filter((s) => s.ok).length;
    const gitti = await gonder({
        title: `Deneme · ${ayakta}/${sonuclar.length} ayakta`,
        message: 'Bu mesaj bilgisayardan elle gönderildi. Telefona geldiyse kanal doğru kurulmuş.',
        priority: 3, tags: ['test_tube'],
    }, env, (...a) => fetch(...a));
    console.log(`Kanallar: ${ad.join(', ')} → ${gitti ? 'en az biri iletti.' : 'HİÇBİRİ iletemedi.'}`);
}

if (process.argv.includes('--ornek')) {
    // Gerçek karar mantığından geçen bir giriş düşüşü; yalnız öncelik normale
    // çekilir ki örnek, acil alarm gibi 5 dk'da bir yeniden çalmasın.
    const liste = kontroller(env);
    const sahte = liste.map((k) => (k.id === 'giris'
        ? { id: k.id, ok: false, ayrinti: 'sunucu cevap verdi ama servis kapalı (HTTP 503)' }
        : { id: k.id, ok: true, ayrinti: '' }));
    const [alarm] = karar({ basladi: 'x', kapali: {} }, sahte, Date.now(), liste).bildirimler;
    const gitti = await gonder({ ...alarm, title: `ÖRNEK · ${alarm.title}`, priority: 3 }, env, (...a) => fetch(...a));
    console.log(gitti ? 'Örnek alarm gönderildi.' : 'Örnek alarm GİDEMEDİ.');
}

process.exit(sonuclar.every((s) => s.ok) ? 0 : 1);
