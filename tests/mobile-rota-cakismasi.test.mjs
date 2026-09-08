import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import test from 'node:test';

/**
 * Rota adresleri ÇAKIŞMAZ.
 *
 * Yaşanan hata: `(manager)` ve `(staff)` birer GRUPTU ve expo-router'da grup
 * adı adrese segment eklemez. Yani `app/(manager)/calendar.tsx` ile
 * `app/(staff)/calendar.tsx` aynı `/calendar` adresine düşüyordu — `/profile`
 * ve `/` de öyle. Telefonda sekmeler arasında gezerken personel müdür
 * kabuğuna, müdür personel kabuğuna atlıyordu; hangisinin çizileceği
 * yönlendiricinin o anki durumuna kalmıştı.
 *
 * Gruplar `mudur/` ve `personel/` diye gerçek segmentlere çevrildi. Bu test
 * aynı tuzağın bir daha kurulmamasını sağlıyor: yeni bir grup açıp içine
 * `calendar.tsx` koymak sessizce değil, burada patlar.
 */

const appDir = new URL('../mobile/app/', import.meta.url);

function walk(dir, prefix = '') {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const url = new URL(`${entry}${statSync(new URL(entry, dir)).isDirectory() ? '/' : ''}`, dir);
        if (entry.startsWith('.')) continue;
        if (statSync(new URL(entry, dir)).isDirectory()) {
            out.push(...walk(url, `${prefix}${entry}/`));
        } else if (entry.endsWith('.tsx') && entry !== '_layout.tsx') {
            out.push(`${prefix}${entry.replace(/\.tsx$/, '')}`);
        }
    }
    return out;
}

/** Grup parantezleri adresten düşer — çakışmanın sebebi tam olarak bu. */
const toHref = (file) => `/${file.replace(/\([^)]*\)\//g, '')}`;

test('iki dosya aynı adrese düşmüyor', () => {
    const seen = new Map();
    for (const file of walk(appDir)) {
        const href = toHref(file);
        const previous = seen.get(href);
        assert.equal(
            previous,
            undefined,
            `${href} iki dosyaya birden denk geliyor: ${previous} ve ${file}`,
        );
        seen.set(href, file);
    }
});

test('müdür ve personel kabukları ayrı segmentte', () => {
    const files = walk(appDir);
    assert.ok(files.some((f) => f.startsWith('mudur/')), 'mudur/ yok');
    assert.ok(files.some((f) => f.startsWith('personel/')), 'personel/ yok');
    assert.ok(!files.some((f) => f.startsWith('(manager)/') || f.startsWith('(staff)/')),
        'kabuklar yeniden gruba çevrilmiş');
});

test('kabuklar rolü doğruluyor', () => {
    const read = (p) => readFileSync(new URL(`../mobile/${p}`, import.meta.url), 'utf8');
    assert.match(read('app/mudur/_layout.tsx'), /useActorGate\('manager'\)/);
    assert.match(read('app/personel/_layout.tsx'), /useActorGate\('staff'\)/);
    // Yanlış kabukta ekran ÇİZİLMİYOR: sekmeler kurulmadan geri gidiliyor.
    assert.match(read('app/mudur/_layout.tsx'), /Redirect href="\/personel"/);
    assert.match(read('app/personel/_layout.tsx'), /Redirect href="\/mudur"/);
});

test('kabuklar geri kaydırmıyor', () => {
    // Kabuk bir sayfa değil, uygulamanın kendisi. Jest açıkken müdür
    // profilinden sağa kaydırınca alttan personel profili çıkıyordu.
    const root = readFileSync(new URL('../mobile/app/_layout.tsx', import.meta.url), 'utf8');
    for (const name of ['mudur', 'personel']) {
        assert.match(
            root,
            new RegExp(`name="${name}" options=\\{\\{ gestureEnabled: false \\}\\}`),
            `${name} kabuğunda geri jesti açık`,
        );
    }
});

test('kabuk kök yığının tek girdisi', () => {
    // Geri kaydırınca alttan aynı ekranın ya da öteki rolün kopyası
    // çıkıyordu: `enterShell` en yakın yığını temizliyor, kökte girdi
    // kalabiliyor. Kabuk ekrana geldiğinde kökü kendine indiriyor.
    for (const name of ['mudur', 'personel']) {
        const layout = readFileSync(
            new URL(`../mobile/app/${name}/_layout.tsx`, import.meta.url), 'utf8');
        // Kanca KENDİ kabuğunun adını alıyor — bkz. bir alttaki test.
        assert.match(layout, new RegExp(`useShellIsRoot\\('${name}'\\)`), name);
    }
    const hook = readFileSync(new URL('../mobile/src/lib/shellRoot.ts', import.meta.url), 'utf8');
    assert.match(hook, /useNavigation<RootNav>\('\/'\)/);
    assert.match(hook, /root\.reset\(/);
});

test('kabuk EN ÜSTTE değilken kök yığına dokunulmuyor', () => {
    // Telefonda görülen hata:
    //   The action 'GO_BACK' was not handled by any navigator.
    //
    // Kanca `routes[state.index]`i koşulsuz koruyordu, yani "en üstteki
    // rota" ne ise onu. Kabuk üstüne sayfa itilince SÖKÜLMÜYOR — sekmeler
    // takılı kalıyor ve yığın durumu değişince yeniden çiziliyor; efektin
    // bağımlılık dizisi de yok. O çizimde `[personel, kumanda]` yığını
    // `[kumanda]`ya iniyor, yani kabuk kumandanın ALTINDAN siliniyordu ve
    // "‹ Bugün" geri dönecek yer bulamıyordu.
    //
    // Kancanın işi kabuğu kök yapmak; en üstteki rotayı kök yapmak değil.
    const hook = readFileSync(new URL('../mobile/src/lib/shellRoot.ts', import.meta.url), 'utf8');
    assert.match(
        hook,
        /if \(current\.name !== shell\) return;/,
        'kabuk adı denetimi kalkmış: üstteki sayfa kabuğu silebilir',
    );
    // Denetim reset'ten ÖNCE olmalı; sonra gelirse hiçbir şey korumaz.
    assert.ok(
        hook.indexOf('current.name !== shell') < hook.indexOf('root.reset('),
        'denetim reset çağrısından sonra kalmış',
    );
    // Kabuk adı tipten geliyor: yeni bir kabuk eklenirse tsc uyarır.
    assert.match(hook, /export type ShellName = 'mudur' \| 'personel'/);
});
