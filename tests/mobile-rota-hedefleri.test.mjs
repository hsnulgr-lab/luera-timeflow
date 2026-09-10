import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/**
 * Gidilen her adresin KARŞILIĞI var mı.
 *
 * Dört rota aylarca kırık durdu ve hiçbir test görmedi: `(manager)` ve
 * `(staff)` bir zamanlar GRUPTU, `mudur/` ve `personel/` diye gerçek
 * segmentlere çevrildi ama dört `pathname` eski adıyla kaldı. Biri müşteri
 * kartındaki "Randevu ver" — kartın en büyük düğmesi.
 *
 * `typedRoutes` kapalı olduğu için `tsc` bu literalleri denetlemiyor; bu
 * dosya onun yerine geçiyor.
 */

const APP = fileURLToPath(new URL('../mobile/app', import.meta.url));

function walk(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (/\.tsx?$/.test(entry)) out.push(full);
    }
    return out;
}

const files = walk(APP);

/**
 * Adresi karşılaştırılabilir hâle getirir.
 *
 * İki şey eleniyor: grup segmentleri (`(auth)` gibi — adrese girmiyorlar) ve
 * değişken segmentin ADI. `/personel/[id]` ile `` `/personel/${staffId}` ``
 * aynı rotadır; ad üzerinden karşılaştırmak, dosyadaki parametreyi yeniden
 * adlandıran birini kırık rota sanmak olurdu.
 */
const normalize = (path) => {
    const kept = path
        .split('/')
        .filter((part) => part && !/^\(.*\)$/.test(part))
        .map((part) => (/^\[.*\]$/.test(part) || /^\$\{.*\}$/.test(part) ? '[*]' : part));
    return `/${kept.join('/')}`;
};

/** Dosya yolundan rota adresi. `_layout` ve `+not-found` rota değil. */
const routes = new Set();
for (const full of files) {
    const rel = relative(APP, full).replace(/\.tsx?$/, '');
    const base = rel.split('/').at(-1);
    if (base.startsWith('_') || base.startsWith('+')) continue;
    const withoutIndex = base === 'index' ? rel.slice(0, -'index'.length) : rel;
    routes.add(normalize(withoutIndex) || '/');
}

/**
 * Kodda geçen adres literalleri.
 *
 * `href` de sayılıyor: giriş akışı `<Redirect href="…" />` ile geziyor ve o
 * yol atlanırsa hem kırık bir Redirect görünmez kalır hem de giriş ekranları
 * "hiçbir yerden gidilmiyor" sanılır.
 */
const LITERAL = /(?:pathname:\s*|href=\{?\s*|router\.(?:push|replace|navigate)\(\s*)['"`](\/[^'"`]*)['"`]/g;
const targets = new Map();
for (const full of [...files, ...walk(fileURLToPath(new URL('../mobile/src', import.meta.url)))]) {
    const src = readFileSync(full, 'utf8');
    for (const match of src.matchAll(LITERAL)) {
        const where = relative(fileURLToPath(new URL('../mobile', import.meta.url)), full);
        if (!targets.has(match[1])) targets.set(match[1], []);
        targets.get(match[1]).push(where);
    }
}

test('rota literalleri gerçekten toplanıyor', () => {
    // Desen boşa düşerse bu dosya hiçbir şeyi korumaz.
    assert.ok(targets.size >= 20, `yalnız ${targets.size} adres bulundu — desen bozulmuş olabilir`);
    assert.ok(routes.size >= 20, `yalnız ${routes.size} rota bulundu`);
});

test('gidilen HER adresin bir dosyası var', () => {
    const broken = [];
    for (const [target, where] of targets) {
        // Sorgu ve çapa parçaları adresin kendisi değil.
        const clean = normalize(target.split('?')[0].split('#')[0]) || '/';
        if (!routes.has(clean)) broken.push(`${target} (${where.join(', ')})`);
    }
    assert.deepEqual(broken, [], `kırık rota:\n  ${broken.join('\n  ')}`);
});

test('eski GRUP adları hiçbir adreste kalmadı', () => {
    // `(manager)` ve `(staff)` artık yok; `(manager-flow)` ve `(staff-flow)` var.
    for (const target of targets.keys()) {
        assert.doesNotMatch(target, /\((manager|staff)\)/, `${target} eski grup adını taşıyor`);
    }
});

// ── Öksüz ekran ─────────────────────────────────────────────────────────────

test('gidilmeyen bir ekran dosyada DURMUYOR', () => {
    // `appointment → visit → finish → sent` zinciri 1592 satırdı ve hiçbir
    // yerden açılmıyordu: `kumanda.tsx` aynı işi devralmıştı. Ama deep-link
    // ile hâlâ açılıyor ve SAHTE veri çiziyordu.
    //
    // Muafiyet listesi bilinçli: kabuk dosyaları, girişin kendi akışı
    // (kendi içinde `Redirect` ile geziliyor) ve ürün kararı bekleyen
    // `kazanc` (sekmeden çıkarıldı ama silinmedi — Faz 7).
    // Sekme ekranlarına `router.push` ile gidilmiyor: onları NativeTabs
    // çiziyor. Kabuk düzenlerindeki tetikleyici adları da "gidiliyor" sayılır.
    const tabs = new Set();
    for (const shell of ['mudur', 'personel']) {
        const layout = readFileSync(join(APP, shell, '_layout.tsx'), 'utf8');
        for (const m of layout.matchAll(/NativeTabs\.Trigger name="([a-z]+)"/g)) {
            tabs.add(m[1] === 'index' ? `/${shell}` : `/${shell}/${m[1]}`);
        }
    }
    assert.ok(tabs.size >= 8, `sekme adları okunamadı (${tabs.size})`);

    // Açılış ekranı ve ürün kararı bekleyen `kazanc` (sekmeden çıkarıldı ama
    // SİLİNMEDİ — Faz 7) dışarıda.
    const EXEMPT = /^\/$|^\/kazanc$/;
    const reached = new Set([...targets.keys()].map((t) => normalize(t.split('?')[0]) || '/'));
    for (const tab of tabs) reached.add(tab);
    const orphans = [...routes].filter((r) => !reached.has(r) && !EXEMPT.test(r));
    assert.deepEqual(orphans, [], `hiçbir yerden gidilmeyen ekran:\n  ${orphans.join('\n  ')}`);
});
