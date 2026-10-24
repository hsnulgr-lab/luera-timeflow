// Bildirimler — 2026-10-24.
// Kullanıcı eski siyah kutuları "çok vasat" buldu: Instagram gibi, emojisiz,
// az ve öz. Taslak A (Hap) seçildi, yeri "üstten ortada". Tek satırlık hap,
// ikon yok (yalnız hata/uyarı noktası), aynı anda tek bildirim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');

test('uygulama tek bildirim kabını kullanır: üstte ortada, tek hap', () => {
    const app = read('src/App.tsx');
    assert.match(app, /<AppToaster \/>/);
    assert.doesNotMatch(app, /<Toaster/);
    const t = read('src/components/AppToaster.tsx');
    assert.match(t, /position="top-center"/);
    assert.match(t, /visibleToasts=\{1\}/);
    assert.match(t, /success: null,\s*info: null,/);
    assert.match(t, /unstyled: true/);
});

test('hiçbir bildirimde emoji yok', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
    const bad = [];
    const walk = (dir) => {
        for (const f of readdirSync(dir)) {
            const p = join(dir, f);
            if (statSync(p).isDirectory()) { walk(p); continue; }
            if (!/\.(ts|tsx)$/.test(f)) continue;
            const s = readFileSync(p, 'utf8');
            if (!s.includes('sonner')) continue;
            for (const m of s.matchAll(/toast(?:\.\w+)?\(/g)) {
                let i = m.index + m[0].length, depth = 1;
                while (i < s.length && depth) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++; }
                if (emoji.test(s.slice(m.index, i))) bad.push(`${p.slice(root.length)}:${s.slice(0, m.index).split('\n').length}`);
            }
        }
    };
    walk(join(root, 'src'));
    assert.deepEqual(bad, []);
});

test('uzman bildirimleri isimle ve kısa', () => {
    const page = read('src/pages/StaffPage.tsx');
    assert.match(page, /toast\.success\(`\$\{payload\.name\} güncellendi`\)/);
    assert.match(page, /await deleteStaff\(m\.id, m\.name\);/);
    assert.match(read('src/hooks/useStaff.ts'), /toast\.success\(name \? `\$\{name\} ekipten çıkarıldı` : 'Ekipten çıkarıldı'\);/);
});
