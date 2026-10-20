// E-posta logosunu üretir: "luera" + turuncu "timeflow" hapı.
//   node scripts/eposta-logo.mjs   → public/eposta/logo-timeflow.png
//
// Neden resim: e-posta programları sitenin yazı tipini (Hanken Grotesk)
// güvenilir yüklemez; marka yazıyla çizilseydi her programda başka görünürdü.
// Çizim scripts/eposta-logo.html'de — uygulamadaki LueraTimeflowMark'ın
// (src/components/brand/LueraTimeflowMark.tsx) geometrisi, kenar çubuğunun
// oranlarıyla (hap 0.5556, yazı 0.62 — kullanıcı kararı 2026-10-20). 36 px,
// 3× çözünürlük, kartın beyaz zemini (koyu kipte saydam logo kaybolurdu).
// E-postada 146 × 30 px görünür (supabase/functions/abonelik-eposta/eposta.ts,
// scripts/eposta-sablonlari.mjs). Marka değişirse iki dosya + bu betik.
//
// Chrome bu Mac'te kurulu olmalı; yazı tipi Google Fonts'tan gelir (internet).
// Yayına çıkması için masaüstü deploy'u gerekir (dosya sitede durur).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sayfa = fileURLToPath(new URL('./eposta-logo.html', import.meta.url));
const hedef = fileURLToPath(new URL('../public/eposta/logo-timeflow.png', import.meta.url));

const dom = execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'eposta-logo-'))}`,
    '--virtual-time-budget=15000', '--dump-dom', `file://${sayfa}`,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

const m = dom.match(/<pre id="out">PNG (\d+)x(\d+) data:image\/png;base64,([A-Za-z0-9+/=]+)<\/pre>/);
if (!m) {
    // Yazı tipi yüklenmediyse sistem yazısıyla çizilmiş bir logo YAZILMAZ.
    console.error('Logo üretilemedi:', dom.match(/<pre id="out">([^<]*)/)?.[1] ?? 'çıktı yok');
    process.exit(1);
}
writeFileSync(hedef, Buffer.from(m[3], 'base64'));
console.log(`public/eposta/logo-timeflow.png yazıldı (${m[1]}×${m[2]} px)`);
