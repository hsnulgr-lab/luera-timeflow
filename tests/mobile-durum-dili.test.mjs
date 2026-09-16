import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
    ACTION_MAX_HEIGHT, ACTION_MIN_HEIGHT, BANNED_WORDS, MAX_ACTIONS,
    bannedIn, toneOf,
} from '../mobile/src/lib/durum.ts';

/**
 * DURUM DİLİ — `docs/design-reference/Luera Mobil - Durumlar.html`.
 *
 * Tur ÜRETİLMİŞTİ ve uygulanmadı. Bu arada canlıya geçerken sekiz ayrı durum
 * bloğu elle yazıldı; her biri kendi bağlamında doğru görünen ölçülerle,
 * hiçbiri ötekine bakmadan. Ölçüldüğünde:
 *
 *   • üç ayrı düğme puntosu, iki ayrı yükseklik (34 / 40) — turun aralığı 52–60
 *   • aynı eylem için üç kelime
 *   • AĞIRLIK TERS: adisyon kaybını söyleyen blok (34), listenin geç geldiğini
 *     söyleyenden (40) küçüktü
 *   • ve turun AÇIKÇA yasakladığı "kayıt" kelimesi kullanılmıştı
 *
 * Bu dosya kuralları ölçüyor, çünkü gözden kaçan tam olarak onlardı.
 */

const MOBILE = new URL('../mobile/', import.meta.url).pathname;
const read = (p) => readFileSync(join(MOBILE, p), 'utf8');
/** Yorumlar elenir: kural EKRANA çıkan metne ait, açıklamaya değil. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Personelin gördüğü her dosya. */
function screens() {
    const out = [];
    for (const dir of ['app/personel', 'app/(staff-flow)', 'app/(auth)/staff']) {
        for (const f of readdirSync(join(MOBILE, dir))) {
            if (f.endsWith('.tsx')) out.push(`${dir}/${f}`);
        }
    }
    // `durum.ts` TARANMIYOR: yasaklı listenin kendisi orada yaşıyor.
    out.push('src/components/Durum.tsx', 'src/lib/writeFailure.ts');
    return out;
}

/**
 * MÜDÜRÜN gördüğü her dosya.
 *
 * Personelden AYRI bir liste, çünkü ikisinin boşluk durumu ayrı: personel
 * tarafında Personel 09 turundan gelen beş metin biliniyor ve hoş görülüyor
 * (aşağıdaki `KNOWN`), müdür tarafında ise BİR TANE BİLE yok.
 *
 * Tarama müdür ekranlarına, oraya tek bir durum metni yazılmadan ÖNCE
 * açıldı. Sebep basit: boşluksuz bir liste temiz tutulur, boşluklu bir liste
 * büyür.
 */
function managerScreens() {
    const out = [];
    for (const dir of ['app/mudur', 'app/(manager-flow)', 'app/(auth)/manager', 'app/(ortak)/profil']) {
        for (const f of readdirSync(join(MOBILE, dir), { recursive: true })) {
            if (String(f).endsWith('.tsx')) out.push(`${dir}/${f}`);
        }
    }
    out.push('src/lib/managerDurum.ts');
    return out;
}

// ── Yasaklı sözlük ──────────────────────────────────────────────────────────

test('yasaklı sözlük turun listesiyle AYNI', () => {
    // `Durumlar.html` · Ortak kurallar: "Teknik kelime yok: 'senkronize',
    // 'kayıt', 'sunucu', 'hata kodu' hiçbir ekranda geçmiyor."
    assert.deepEqual([...BANNED_WORDS].sort(), ['hata kodu', 'kayıt', 'senkronize', 'sunucu']);
});

test('kök eşleşmesi çekimli hâlleri de yakalıyor', () => {
    // Dar bir eşleşme "kayıtlar" ve "sunucuya"yı kaçırırdı.
    assert.deepEqual(bannedIn('3 kayıt gönderilemedi'), ['kayıt']);
    assert.deepEqual(bannedIn('Sunucuya yazılamadı'), ['sunucu']);
    assert.deepEqual(bannedIn('kayıtlı müşteri yok'), ['kayıt']);
    assert.deepEqual(bannedIn('Adisyon gönderilemedi'), []);
});

test('HİÇBİR personel ekranı yasaklı kelime göstermiyor', () => {
    const found = [];
    for (const file of screens()) {
        const src = code(read(file));
        // Ekrana çıkan metin: dize değişmezleri ve JSX metni.
        const texts = [
            ...(src.match(/'[^'\n]{4,}'/g) ?? []),
            ...(src.match(/`[^`\n]{4,}`/g) ?? []),
            ...(src.match(/>[^<>{}\n]{4,}</g) ?? []),
            // KÖR NOKTA kapatıldı: `hint="Kayıt silinmiş…"` gibi ÇİFT TIRNAKLI
            // JSX öznitelikleri hiç taranmıyordu — ekrana çıkan metnin büyük
            // bir kısmı oradan geçiyor ve bu tarama onu hiç görmemişti.
            ...(src.match(/"[^"\n]{4,}"/g) ?? []),
        ];
        for (const t of texts) {
            for (const word of bannedIn(t)) found.push(`${file}  ${word}  →  ${t.trim()}`);
        }
    }
    /*
     * BOŞLUK · Personel 09 turunun kopyası
     *
     * Bu beş metin `Durumlar.html`ten ÖNCE, Personel 09 (Müşteriler) turunda
     * onaylanmış ve uygulanmış. Turun "kayıt" yasağı durum ekranları için
     * yazıldı; müşteri SAYACI ("10 KAYIT") teknik bir kelime değil, alan
     * dili — ama turun cümlesi "hiçbir ekranda" diyor.
     *
     * Çelişkiyi tek başıma çözmüyorum: onaylanmış bir turun metnini yeniden
     * yazmak kullanıcının kararı. Liste BÜYÜYEMEZ — yeni bir ihlal testi
     * kırar. Karar verilince buradan silinir.
     */
    const KNOWN = [
        "app/personel/customers.tsx  kayıt  →  'Kayıt randevudan doğuyor: ilk randevu oluşturulduğunda müşteri burada görünür.'",
        'app/personel/customers.tsx  kayıt  →  `${book.length} KAYIT`',
        'app/personel/customers.tsx  kayıt  →  >Salonda kayıtlı <',
        'app/personel/customers.tsx  kayıt  →  > ile eşleşen kayıt yok.<',
        'app/(staff-flow)/musteri.tsx  kayıt  →  `${label} — numara kayıtlı değil`',
        'app/(staff-flow)/musteri.tsx  kayıt  →  "Kayıt silinmiş ya da başka bir deftere taşınmış olabilir."',
    ];
    const fresh = found.filter((line) => !KNOWN.includes(line));
    assert.deepEqual(fresh, [], `turun yasakladığı kelime ekranda:\n  ${fresh.join('\n  ')}`);
    // Bilinen boşluk KAPANDIYSA bu test onu söylesin — liste eskimesin.
    const stale = KNOWN.filter((line) => !found.includes(line));
    assert.deepEqual(stale, [], `bu ihlaller düzelmiş, KNOWN listesinden silin:\n  ${stale.join('\n  ')}`);
});

// ── Ölçü ────────────────────────────────────────────────────────────────────

test('eylem ölçüsü turun aralığında', () => {
    // "en fazla iki eylem, ikisi de alt üçte birde ve 52–60 pt"
    assert.equal(ACTION_MIN_HEIGHT, 52);
    assert.equal(ACTION_MAX_HEIGHT, 60);
    assert.equal(MAX_ACTIONS, 2);
});

test('durum düğmeleri ELLE ölçülmüyor — hepsi tek kaynaktan', () => {
    // Beş kopyanın 40 pt'te donup kalmasının sebebi elle yazılmış olmasıydı.
    const durum = read('src/components/Durum.tsx');
    // Her eylem düğmesi ölçüsünü SABİTTEN alıyor; hiçbiri sayı yazmıyor.
    const actions = (durum.match(/minHeight: ACTION_MIN_HEIGHT/g) ?? []).length;
    assert.ok(actions >= 2, `eylem düğmeleri sabitten beslenmeli (${actions})`);
    /*
     * Dosyadaki TEK sayısal yükseklik şeridinki (44 — dokunma hedefinin iOS
     * alt sınırı). Geri kalan her şey sabitten geliyor.
     *
     * Şerit ayrı bir öge: ona 56 pt'lik düğme sokmak turu yanlış okumak
     * olurdu — "52–60" kuralı durum EKRANININ eylemleri için yazıldı, tek
     * satırlık bir haber şeridi için değil.
     */
    const literals = (durum.match(/minHeight: (\d+)/g) ?? []).map((m) => Number(m.match(/(\d+)/)[1]));
    assert.deepEqual(literals, [44],
        `elle yazılmış yükseklik: ${literals.join(', ')} — eylemler ACTION_MIN_HEIGHT'ten beslenmeli`);
});

test('ESKİ ölçüler geri sızmıyor', () => {
    // 34 ve 40 pt'lik durum düğmeleri turun altındaydı.
    for (const file of screens()) {
        const src = code(read(file));
        const near = src.match(/Tekrar dene|Listeyi tazele|Anladım/g) ?? [];
        if (near.length === 0) continue;
        assert.doesNotMatch(src, /height: 34, borderRadius: 17/, `${file}: eski 34 pt düğme`);
        assert.doesNotMatch(src, /height: 40, borderRadius: 20/, `${file}: eski 40 pt düğme`);
    }
});

test('blok ÜÇÜNCÜ eylemi çizmiyor', () => {
    const durum = read('src/components/Durum.tsx');
    assert.match(durum, /actions\.slice\(0, MAX_ACTIONS\)/);
});

// ── Ton ─────────────────────────────────────────────────────────────────────

test('kırmızı YALNIZ gerçekten başarısız olanda', () => {
    // "Amber — iş durmuyor demek: çevrimdışı, abonelik.
    //  Kırmızı — yalnız gerçekten başarısız olan işlemde."
    assert.equal(toneOf('lost'), 'red');
    for (const kind of ['offline', 'stale', 'unread', 'sending']) {
        assert.equal(toneOf(kind), 'amber', `${kind} kırmızı olmamalı`);
    }
});

test('gönderilemeyen işlem KIRMIZI çiziliyor', () => {
    // İlk yazımda amberdi ve öteki amber şeritlerden ayırt edilemiyordu —
    // en ciddi mesaj en sıradan görünüyordu.
    const today = code(read('app/personel/index.tsx'));
    const cut = today.slice(today.indexOf('function FailedWrites'));
    assert.match(cut.slice(0, 900), /tone="red"/);
    // Bayat adisyon ve çevrimdışı kopya AMBER kalmalı: iş durmuyor.
    const kumanda = code(read('app/(staff-flow)/kumanda.tsx'));
    const band = kumanda.slice(kumanda.indexOf('function ChangedBand'));
    assert.doesNotMatch(band.slice(0, 900), /tone="red"/);
});

// ── Tek aile ────────────────────────────────────────────────────────────────

test('sekiz kopya TEK aileye indi', () => {
    // Her ekranın kendi amber kutusunu elle çizmesi, ölçülerin ayrışmasının
    // sebebiydi.
    /*
     * İKİ İSTİSNA, ikisi de bilinçli:
     *
     *   Chip  (`kumanda.tsx`) bir DURUM ögesi değil — bekleme sayacının hapı.
     *   Band  (`kumanda.tsx`) Personel 11 turundan geliyor ve UYGULANMIŞ bir
     *         tasarım. `DurumBand`le birleştirmek üç ekranın görünümünü
     *         değiştirir; onaylanmış bir turu tek başıma yeniden yazmıyorum.
     *         Birleştirme kullanıcının kararı.
     *
     * Sayı BÜYÜYEMEZ: yeni bir elle çizilmiş amber kutu testi kırar.
     */
    const EXPECTED = 2;
    let handmade = 0;
    for (const file of screens()) {
        if (file.endsWith('Durum.tsx')) continue;
        handmade += (code(read(file)).match(/rgba\(217,164,59,0\.(11|12)\)/g) ?? []).length;
    }
    assert.equal(handmade, EXPECTED,
        `${handmade} elle çizilmiş amber kutu — beklenen ${EXPECTED} (Chip + Personel 11 Band)`);
});


// ── Müdür tarafı: boşluk YOK ────────────────────────────────────────────────

test('HİÇBİR müdür ekranı yasaklı kelime göstermiyor — istisnasız', () => {
    /*
     * Personel tarafındaki `KNOWN` listesinin müdür karşılığı YOK ve olmasın.
     *
     * Bu tarama müdür ekranlarına, oraya tek bir durum metni yazılmadan önce
     * açıldı; o an hepsi temizdi. Yani buradaki her düşüş YENİ bir ihlaldir
     * ve hoş görülecek bir geçmişi yok.
     */
    const found = [];
    for (const file of managerScreens()) {
        const src = code(read(file));
        const texts = [
            ...(src.match(/'[^'\n]{4,}'/g) ?? []),
            ...(src.match(/`[^`\n]{4,}`/g) ?? []),
            ...(src.match(/>[^<>{}\n]{4,}</g) ?? []),
            ...(src.match(/"[^"\n]{4,}"/g) ?? []),
        ];
        for (const t of texts) {
            for (const word of bannedIn(t)) found.push(`${file}  ${word}  →  ${t.trim()}`);
        }
    }
    assert.deepEqual(found, []);
});

test('müdür taraması GERÇEKTEN dosya okuyor', () => {
    // Boş bir liste her zaman geçer. Tarama yanlış klasöre bakıyorsa yukarıdaki
    // test sessizce yeşil kalırdı — tam olarak fark edilmeyecek türden bir arıza.
    const files = managerScreens();
    assert.ok(files.length >= 12, `müdür tarafında ${files.length} dosya bulundu`);
    assert.ok(files.some((f) => f.includes('mudur/index')));
    assert.ok(files.some((f) => f.includes('randevu/')));
    assert.ok(files.some((f) => f.includes('profil/')));
});
