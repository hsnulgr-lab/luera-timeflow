/**
 * Hız 1 — müdür ve tek kişilik kabukta gereksiz ağ ve çizim yükü.
 *
 * Kaynak sözleşmesi: her madde kodda bir iz bırakıyor ve bu dosya o izin
 * geri gitmediğini doğruluyor. Ölçümler (önce → sonra) commit mesajında.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../mobile/${path}`, import.meta.url), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const hook = strip(read('src/lib/managerRead.ts'));
const salon = strip(read('src/lib/salonDay.ts'));
const flowDay = strip(read('src/lib/managerFlowDay.ts'));
const create = strip(read('src/lib/managerCreate.ts'));
const source = strip(read('src/lib/managerSource.ts'));
const store = strip(read('src/state/managerDay.tsx'));
const book = strip(read('app/(manager-flow)/musteriler.tsx'));

/** `useFocusEffect(useCallback(() => { ... }, [deps]))` gövdesi. */
function focusBody(src) {
    const start = src.indexOf('useFocusEffect(useCallback(() => {');
    assert.ok(start >= 0, 'odak efekti yok');
    return src.slice(start, src.indexOf('}, [', start + 40) + 30);
}

// ── 1 · Odakta olmayan ekran okumuyor ───────────────────────────────────────

for (const [name, src, fn] of [['useManagerRead', hook, 'run'], ['useSalonDay', salon, 'read']]) {
    test(`${name}: yoklama sayacı YALNIZ odak efektinin içinde`, () => {
        const body = focusBody(src);
        assert.match(body, /setInterval\(\(\) => \{[\s\S]{0,120}\}, POLL_MS\)/);
        // Odak efektinin DIŞINDA POLL_MS'li bir sayaç kalmadı.
        const outside = src.replace(body, '');
        assert.doesNotMatch(outside, /POLL_MS\)/);
        // Odak kaybında sayaç sökülüyor ve ekran "odakta değil" sayılıyor.
        assert.match(body, /return \(\) => \{[\s\S]*?focused\.current = false;[\s\S]*?readSinceBlur\.current = false;[\s\S]*?clearInterval\(id\)/);
    });

    test(`${name}: zil ve öne dönüş odakta okutur, değilse KİRLİ işaretler`, () => {
        assert.match(src, new RegExp(`const nudge = useCallback\\(\\(\\) => \\{\\s*if \\(focused\\.current\\) void ${fn}\\(false\\);\\s*else dirty\\.current = true;`));
        assert.match(src, /if \(next === 'active'\) nudge\(\);/);
        assert.match(src, /useLiveSignal\(nudge, true, /);
        // Zil artık doğrudan okumuyor.
        assert.doesNotMatch(src, new RegExp(`useLiveSignal\\(useCallback\\(\\(\\) => \\{ void ${fn}\\(false\\)`));
    });

    test(`${name}: odağa dönüşte TEK okuma — kuruluş okumasıyla çift değil`, () => {
        const body = focusBody(src);
        assert.match(body, new RegExp(`if \\(dirty\\.current \\|\\| !readSinceBlur\\.current\\) void ${fn}\\(false\\);`));
        // Her okuma "odaktan sonra okundu" der ve kiri siler.
        assert.match(src, new RegExp(`const ${fn} = useCallback\\(\\(visible: boolean\\) => \\{[\\s\\S]{0,160}readSinceBlur\\.current = true;\\s*dirty\\.current = false;`));
    });

    test(`${name}: gezinme nesnesi kuruluş okumasının bağımlılığı DEĞİL`, () => {
        // Yığın değişince yeniden üretiliyor; bağımlılık olsaydı her itişte okurdu.
        assert.match(src, new RegExp(`void ${fn}\\(true\\);[\\s\\S]{0,120}navRef\\.current\\.isFocused\\(\\)[\\s\\S]{0,60}\\}, \\[${fn}\\]\\);`));
    });
}

test('kök sağlayıcı: veriyi kullanmayan sekmede okuma odak dışı sayılıyor', () => {
    assert.match(hook, /const active = options\.active !== false;/);
    assert.match(focusBody(hook), /if \(!active\) \{\s*readSinceBlur\.current = false;\s*return undefined;/);
    assert.match(hook, /\}, \[run, poll, active\]\)\);/);
    assert.match(store, /const IDLE_TABS: ReadonlySet<string> = new Set\(\['calendar', 'profile', 'isletme'\]\);/);
    assert.match(store, /useManagerFlowDay\(useDayInUse\(\)\)/);
    // Akış/Gün, Randevu ve Kasa sağlayıcıyı okuyor — listede OLMAMALI.
    for (const tab of ['index', 'create', 'cash']) {
        assert.doesNotMatch(store.match(/IDLE_TABS[^;]*;/)[0], new RegExp(`'${tab}'`));
    }
    assert.match(flowDay, /useManagerRead\(read, EMPTY, \{ tables: BOOKING_TABLES, active \}\)/);
});

// ── 2 · Ayar satırı turda bir kez ───────────────────────────────────────────

test('akış okuması ayar satırını TEK kez okuyor', () => {
    assert.equal((flowDay.match(/fetchOrgSettings\(/g) ?? []).length, 1);
    assert.match(flowDay, /fetchOrgSettings\('sector, business_name, working_hours, risk_rules'\)/);
    // Çalışma saati ve risk kuralları aynı satırdan; ikinci okuma yok.
    assert.match(flowDay, /openMinutesOf\(settings\?\.working_hours, dateISO\)/);
    assert.match(flowDay, /settings\?\.risk_rules,/);
    const ctx = source.slice(source.indexOf('export async function fetchDayContext'), source.indexOf('export function openMinutesOf'));
    assert.doesNotMatch(ctx, /fetchOrgSettings/);
    assert.doesNotMatch(source, /export async function fetchOpenMinutes/);
});

test('paylaşım İSTEK İÇİ — kalıcı ayar önbelleği yok', () => {
    // Salon değişince taşınacak bir şey kalmasın: modül düzeyinde ayar tutan
    // değişken yok; tek modül önbelleği org kararı ve `forgetOrg` onu siliyor.
    assert.doesNotMatch(source, /^let \w*[Ss]ettings/m);
    assert.match(source, /export function forgetOrg\(\): void \{\s*cached = null;/);
});

test('tolerans kolonu istenmiyor; randevu kurma varsayılanı kullanıyor', () => {
    assert.doesNotMatch(source + flowDay + create, /arrival_tolerance_min|fetchArrivalTolerance/);
    assert.match(create, /toleranceMin: DEFAULT_ARRIVAL_TOLERANCE_MIN,/);
});

test('randevu kurmanın ayarı: org satırı tek sorguda (sahip + konum)', () => {
    const fn = source.slice(source.indexOf('export async function fetchCreateSettings'), source.indexOf('export async function fetchStaffSchedules'));
    assert.match(fn, /from\('organizations'\)\.select\('owner_id, maps_url'\)/);
    assert.doesNotMatch(fn, /fetchOrgSettings/);
    // Sahibin satırı yoksa en eskiye düşme kuralı ortak yardımcıda.
    const helper = source.slice(source.indexOf('async function settingsRowOf'));
    assert.match(helper.slice(0, 900), /\.eq\('user_id', ownerId\)[\s\S]*?\.order\('created_at', \{ ascending: true \}\)/);
});

// ── 3 · Müşteri defteri randevu zilinde inmiyor ─────────────────────────────

test('defter ayrı okuma: yalnız customers zili ve odağa dönüş', () => {
    const light = create.slice(create.indexOf('const readLight'), create.indexOf('const readBook'));
    assert.doesNotMatch(light, /fetchCustomerBook/);
    assert.match(light, /fetchServerNow\(\),/);
    assert.match(create, /useManagerRead<Light \| null>\(readLight, null, \{ poll: false, tables: BOOKING_TABLES \}\)/);
    assert.match(create, /useManagerRead<Book \| null>\(readBook, null, \{ poll: false, tables: BOOK_TABLES \}\)/);
    assert.match(create, /const BOOK_TABLES = \['customers'\] as const;/);
    // Uygunluk/çakışma verisi (gün) zille tazelenmeye devam ediyor.
    assert.match(create, /useManagerRead\(read, NO_DAY, \{ tables: BOOKING_TABLES \}\)/);
    // Ekran tek bir hâl görüyor.
    assert.match(create, /light\.state === 'error' \|\| book\.state === 'error' \? 'error'/);
});

// ── 4 · Şelale ──────────────────────────────────────────────────────────────

test('müşteri bağlamı bütün okumayı beklemiyor — randevu + ayar gelince başlıyor', () => {
    assert.match(flowDay, /const contextP = Promise\.all\(\[flowP, settingsP\]\)\.then\(/);
    assert.match(flowDay, /contextP\.catch\(\(\) => undefined\);/);
    assert.match(flowDay, /const context = await contextP;/);
});

// ── 5 · Müşteriler listesi sanal ────────────────────────────────────────────

test('müşteri defteri FlatList ile çiziliyor, arama ertelenmiş', () => {
    assert.match(book, /<FlatList\s+data=\{shown\}\s+keyExtractor=\{keyOf\}\s+renderItem=\{renderRow\}/);
    assert.match(book, /const keyOf = \(row: ManagerBookRow\) => row\.id;/);
    assert.match(book, /const Row = memo\(function Row\(/);
    assert.match(book, /initialNumToRender=\{\d+\}/);
    assert.match(book, /windowSize=\{\d+\}/);
    assert.match(book, /const deferredQuery = useDeferredValue\(query\);/);
    assert.match(book, /rows\.filter\(\(row\) => bookMatches\(row, deferredQuery\)\)/);
    assert.doesNotMatch(book, /ScrollView/);
    assert.doesNotMatch(book, /shown\.map\(/);
    // Görünüm aynı: kap boşlukları ve satırın kendi alt çizgisi duruyor.
    assert.match(book, /paddingHorizontal: M\.padX,\s*paddingBottom: M\.bottomInset \+ insets\.bottom,/);
    assert.match(book, /borderBottomWidth: last \? 0 : 1,/);
    assert.match(book, /last=\{index === lastIndex\}/);
});
