#!/usr/bin/env node
//
// Dodo ürünleri — BU BİLGİSAYARDAN çalışır, Dodo'ya her istek VPS 1'den gider.
//
//   node ops/abonelik/dodo-urun.mjs liste             Dodo'daki abonelik ürünleri + bugünkü harita
//   node ops/abonelik/dodo-urun.mjs olustur           yeni fiyatlı 6 ürün — KURU: ne açılacağını basar
//   node ops/abonelik/dodo-urun.mjs olustur uygula    açar; zaten açılmış olanı yeniden açmaz
//   node ops/abonelik/dodo-urun.mjs harita            yeni haritayı bugünküyle yan yana basar — KURU
//   node ops/abonelik/dodo-urun.mjs harita uygula     app_secrets.DODO_PRODUCT_MAP'i değiştirir
//   node ops/abonelik/dodo-urun.mjs harita geri       bir önceki haritaya döner
//
// Canlı kipte (DODO_API_BASE test değilse) yazan komutlar sona `canli` ister.
//
// Anahtar VPS'ten çıkmaz: her bağlantıda veritabanından okunur, curl'e başlık
// dosyasıyla verilir; ne bu bilgisayara ne ekrana gelir. Ürün kimlikleri sır
// değil (devir 10'da yazılı).
//
// Haritayı değiştirmek (`harita uygula`) ödeme sayfasının çektiği tutarı
// HEMEN değiştirir: masaüstünde aynı fiyatlar canlıda değilken yapılmaz.
// Eski abonelikler eski ürünlerinde, eski fiyatla kalır; eski ürünlere
// dokunulmaz.
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/** Bu fiyat turunun damgası: ürünler metadata'sında, yeniden açmayı önler. */
export const SURUM = '2026-10';
/** Yıllık = 10 ay ("2 ay bedava"), tek çekim. */
export const YILLIK_AY = 10;

// Aylık tutarlar (TL, KDV dahil). Kimlikler (baslangic/pro/isletme) Dodo
// haritası, Core ve hediye betiğiyle ortak — değişmez, yalnız görünen ad.
const AYLIK = [
    ['baslangic', 'Tek kişilik', 799],
    ['pro', 'Ekip', 1299],
    ['isletme', 'İşletme', 1999],
];

export const PAKETLER = AYLIK.flatMap(([plan, ad, aylik]) => [
    { plan, ad, anahtar: `${plan}_monthly`, donem: 'Aylık', aralik: 'Month', tl: aylik },
    { plan, ad, anahtar: `${plan}_yearly`, donem: 'Yıllık', aralik: 'Year', tl: aylik * YILLIK_AY },
]);

export const urunAdi = (p) => `TimeFlow - ${p.ad} · ${p.donem}`;

export function urunGovdesi(p, sablon) {
    const sp = sablon?.price ?? {};
    const donem = p.aralik === 'Month'
        ? 'aylık abonelik. Her ay yenilenir'
        : 'yıllık abonelik, 12 ay 10 ay fiyatına. Yılda bir yenilenir';
    return {
        name: urunAdi(p),
        description: `Luera TimeFlow · ${p.ad} paketi · ${donem}; istediğiniz zaman iptal edebilirsiniz.`,
        tax_category: sablon?.tax_category ?? 'saas',
        ...(sablon?.brand_id ? { brand_id: sablon.brand_id } : {}),
        metadata: { uygulama: 'timeflow', harita: p.anahtar, surum: SURUM },
        price: {
            type: 'recurring_price',
            currency: 'TRY',
            price: p.tl * 100,
            ...(typeof sp.discount === 'number' ? { discount: 0 } : {}),
            payment_frequency_count: 1,
            payment_frequency_interval: p.aralik,
            // Abonelik süresi eski üründen: yenileme davranışı denenmiş olan.
            subscription_period_count: sp.subscription_period_count ?? 20,
            subscription_period_interval: sp.subscription_period_interval ?? 'Year',
            tax_inclusive: true,
            // Deneme ödeme sayfasından (dodo-checkout · trial_period_days); üründe 0.
            trial_period_days: 0,
            purchasing_power_parity: false,
        },
    };
}

const fiyatAyrinti = (u) => u?.price_detail ?? (typeof u?.price === 'object' ? u.price : null);
const kurus = (u) => fiyatAyrinti(u)?.price ?? (typeof u?.price === 'number' ? u.price : null);
const paraBirimi = (u) => fiyatAyrinti(u)?.currency ?? u?.currency ?? null;
const aralik = (u) => fiyatAyrinti(u)?.payment_frequency_interval ?? null;

/**
 * Ürün bu fiyat turunun bu paketi mi — tutar doğru mu ayrıca bakılır.
 * Önce metadata; liste metadata'yı göndermezse ad + tutar (yoksa ikinci
 * çalıştırma aynı ürünü yeniden açardı).
 */
function buTurun(u, anahtar) {
    const m = u?.metadata;
    if (m && Object.keys(m).length) return m.uygulama === 'timeflow' && m.surum === SURUM && m.harita === anahtar;
    const p = PAKETLER.find((x) => x.anahtar === anahtar);
    return u?.name === urunAdi(p) && kurus(u) === p.tl * 100;
}

export function urunUygunMu(u, p) {
    const sorun = [];
    if (kurus(u) !== p.tl * 100) sorun.push(`tutar ${kurus(u)} kuruş, beklenen ${p.tl * 100}`);
    if (paraBirimi(u) !== 'TRY') sorun.push(`para birimi ${paraBirimi(u)}`);
    const ar = aralik(u);
    if (ar && ar !== p.aralik) sorun.push(`dönem ${ar}`);
    return sorun;
}

/**
 * Dodo listesinden her paketin yeni ürününü bulur.
 * { anahtar → { urun, sorun[] } }; birden çok aday varsa sorun olarak döner.
 */
export function eslestir(liste) {
    const sonuc = {};
    for (const p of PAKETLER) {
        const adaylar = liste.filter((u) => buTurun(u, p.anahtar));
        if (adaylar.length === 0) { sonuc[p.anahtar] = { urun: null, sorun: [] }; continue; }
        const sorun = adaylar.length > 1 ? [`${adaylar.length} ürün var: ${adaylar.map((u) => u.product_id).join(', ')}`] : [];
        sonuc[p.anahtar] = { urun: adaylar[0], sorun: [...sorun, ...urunUygunMu(adaylar[0], p)] };
    }
    return sonuc;
}

/** Eşleşmeden yeni harita; eksik ya da sorunlu paket varsa hata. */
export function yeniHarita(esles) {
    const harita = {};
    const hatalar = [];
    for (const p of PAKETLER) {
        const e = esles[p.anahtar];
        if (!e?.urun) hatalar.push(`${p.anahtar}: yeni ürün yok (önce: olustur uygula)`);
        else if (e.sorun.length) hatalar.push(`${p.anahtar}: ${e.sorun.join('; ')}`);
        else harita[p.anahtar] = e.urun.product_id;
    }
    return { harita, hatalar };
}

export const testKipiMi = (taban) => /\/\/test\./.test(String(taban));

// ── VPS ──────────────────────────────────────────────────────────────────

const SSH = ['-i', `${homedir()}/.ssh/luera_vps`, '-o', 'BatchMode=yes', 'root@76.13.4.164', 'bash', '-s'];
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

// Uzak betik `bash -s` ile STDIN'den okunur: stdin okuyan her komut betiğin
// kalanını yutar, bu yüzden docker ve curl </dev/null ile. İstekler
// betiğin içindeki here-doc'ta: yol ve gövde uzak kabuğa argüman olarak
// gitmez (? ve & orada yorumlanırdı); gövde base64.
// Kabuk metninde `${…}` YOK: şablon dizesinde JavaScript onu kendisi açar.
const UZAK_BAS = String.raw`set -euo pipefail
DB=supabase-db-t6yi63jbebvj6c7oo7yjofnt
q() { docker exec -u postgres "$DB" psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -c "$1" </dev/null; }
TABAN="$(q "select rtrim(coalesce((select value from app_secrets where key = 'DODO_API_BASE'), 'https://test.dodopayments.com'), '/')")"
echo "@@taban $TABAN"
echo "@@harita $(q "select coalesce((select value from app_secrets where key = 'DODO_PRODUCT_MAP'), '{}')" | tr -d '\n')"
`;

export function istekBetigi(istekler) {
    const satirlar = istekler.map(([y, yol, govde]) => `${y} ${yol} ${govde === undefined ? '-' : b64(JSON.stringify(govde))}`);
    return UZAK_BAS + String.raw`ANAHTAR="$(q "select value from app_secrets where key = 'DODO_API_KEY'")"
[ "$(printf '%s' "$ANAHTAR" | wc -c)" -ge 20 ] || { echo "HATA: DODO_API_KEY yok" >&2; exit 1; }
CEVAP="$(mktemp)"
trap 'rm -f "$CEVAP"' EXIT
while read -r YONTEM YOL GOVDE; do
    [ -n "$YONTEM" ] || continue
    if [ "$GOVDE" = "-" ]; then
        KOD="$(curl -sS -m 30 -o "$CEVAP" -w '%{http_code}' -X "$YONTEM" \
            -H @<(printf 'Authorization: Bearer %s\n' "$ANAHTAR") "$TABAN$YOL" </dev/null)" || KOD=000
    else
        KOD="$(curl -sS -m 30 -o "$CEVAP" -w '%{http_code}' -X "$YONTEM" \
            -H @<(printf 'Authorization: Bearer %s\n' "$ANAHTAR") -H 'Content-Type: application/json' \
            --data-binary @<(printf '%s' "$GOVDE" | base64 -d) "$TABAN$YOL" </dev/null)" || KOD=000
    fi
    echo "@@yanit $KOD $YONTEM $YOL"
    tr -d '\n' < "$CEVAP"; echo
done <<'ISTEKLER'
${satirlar.join('\n')}
ISTEKLER
unset ANAHTAR
`;
}

export function haritaBetigi(islem, harita) {
    const yazma = islem === 'uygula'
        ? String.raw`YENI="$(printf '%s' '${b64(JSON.stringify(harita))}' | base64 -d)"
docker exec -i -u postgres "$DB" psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -v yeni="$YENI" -f - <<'SQL'
begin;
insert into app_secrets (key, value)
select 'DODO_PRODUCT_MAP_ONCEKI', value from app_secrets where key = 'DODO_PRODUCT_MAP'
on conflict (key) do update set value = excluded.value, updated_at = now();
update app_secrets set value = :'yeni', updated_at = now() where key = 'DODO_PRODUCT_MAP';
commit;
SQL`
        : String.raw`docker exec -i -u postgres "$DB" psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -f - <<'SQL'
do $$ begin
  if not exists (select 1 from app_secrets where key = 'DODO_PRODUCT_MAP_ONCEKI') then
    raise exception 'DODO_PRODUCT_MAP_ONCEKI yok — geri dönülecek harita yok';
  end if;
end $$;
update app_secrets set value = (select value from app_secrets where key = 'DODO_PRODUCT_MAP_ONCEKI'),
       updated_at = now()
where key = 'DODO_PRODUCT_MAP';
SQL`;
    return UZAK_BAS + yazma + '\necho "@@sonra $(q "select value from app_secrets where key = \'DODO_PRODUCT_MAP\'" | tr -d \'\\n\')"\n';
}

/** Uzak çıktıyı ayırır: { taban, harita, sonra, yanitlar: [{ kod, yontem, yol, govde }] }. */
export function cikti(metin) {
    const r = { taban: null, harita: {}, sonra: null, yanitlar: [] };
    const json = (s) => { try { return JSON.parse(s); } catch { return s; } };
    let son = null;
    for (const satir of metin.split('\n')) {
        let m;
        if ((m = satir.match(/^@@taban (.*)$/))) r.taban = m[1];
        else if ((m = satir.match(/^@@harita (.*)$/))) r.harita = json(m[1]);
        else if ((m = satir.match(/^@@sonra (.*)$/))) r.sonra = json(m[1]);
        else if ((m = satir.match(/^@@yanit (\d+) (\S+) (\S+)$/))) {
            son = { kod: Number(m[1]), yontem: m[2], yol: m[3], govde: '' };
            r.yanitlar.push(son);
        } else if (son && satir) son.govde += satir;
    }
    for (const y of r.yanitlar) y.govde = json(y.govde);
    return r;
}

function uzak(betik) {
    const r = spawnSync('ssh', SSH, { input: betik, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.status !== 0) throw new Error(`VPS'teki betik ${r.status} ile bitti`);
    return cikti(r.stdout);
}

const dodo = (istekler) => uzak(istekBetigi(istekler));

function basarili(y, ne) {
    if (y.kod >= 200 && y.kod < 300) return y.govde;
    throw new Error(`${ne}: Dodo ${y.kod} — ${typeof y.govde === 'string' ? y.govde.slice(0, 300) : JSON.stringify(y.govde).slice(0, 300)}`);
}

const LISTE_YOLU = '/products?recurring=true&page_size=100';

function liste() {
    const r = dodo([['GET', LISTE_YOLU]]);
    const govde = basarili(r.yanitlar[0], 'ürün listesi');
    const items = govde?.items ?? [];
    if (items.length >= 100) console.warn('UYARI: 100 ürün geldi — liste sayfalı, fazlası görünmüyor olabilir.');
    return { ...r, items };
}

const tl = (k) => (k == null ? '?' : `${(k / 100).toLocaleString('tr-TR')} TL`);

function urunSatiri(u) {
    const d = fiyatAyrinti(u) ?? {};
    const deneme = d.trial_period_days ? ` · ürün denemesi ${d.trial_period_days} gün!` : '';
    const vergi = (d.tax_inclusive ?? u.tax_inclusive) ? 'vergi dahil' : 'VERGİ HARİÇ';
    return `${u.product_id}  ${(u.name ?? '').padEnd(30)} ${tl(kurus(u)).padStart(12)} ${paraBirimi(u) ?? '?'} /${aralik(u) ?? '?'} · ${vergi}${deneme}`;
}

function kipYaz(taban) {
    console.log(`Dodo kipi: ${testKipiMi(taban) ? 'TEST' : 'CANLI'} (${String(taban).replace(/^https?:\/\//, '')})`);
}

function kipKapisi(taban, args) {
    if (!testKipiMi(taban) && !args.includes('canli')) {
        console.error('DURDU: Dodo CANLI kipte. Gerçek ürün açılır / gerçek harita değişir.');
        console.error('       Bilerek yapılıyorsa komutun sonuna `canli` ekle.');
        process.exit(1);
    }
}

function komutListe() {
    const r = liste();
    kipYaz(r.taban);
    console.log('\n── Bugünkü harita (ödeme sayfası bunları satar)');
    for (const [k, id] of Object.entries(r.harita)) {
        const u = r.items.find((x) => x.product_id === id);
        console.log(`  ${k.padEnd(18)} ${u ? urunSatiri(u) : `${id}  (listede YOK — arşivde mi?)`}`);
    }
    console.log(`\n── Dodo'daki abonelik ürünleri (${r.items.length})`);
    for (const u of r.items) {
        const yeni = PAKETLER.find((p) => buTurun(u, p.anahtar));
        console.log(`  ${urunSatiri(u)}${yeni ? `   ← yeni: ${yeni.anahtar}` : ''}`);
    }
    // Şablon ayrıntısı: yeni ürünler bunların ayarını devralır.
    const ids = [...new Set(Object.values(r.harita))];
    if (ids.length) {
        const s = dodo(ids.map((id) => ['GET', `/products/${encodeURIComponent(id)}`]));
        console.log('\n── Haritadaki ürünlerin ayarları (yeni ürünler bunları devralır)');
        for (const y of s.yanitlar) {
            if (y.kod !== 200) { console.log(`  ${y.yol}: Dodo ${y.kod}`); continue; }
            const u = y.govde; const p = u.price ?? {};
            console.log(`  ${u.product_id}  vergi kategorisi ${u.tax_category} · abonelik süresi ${p.subscription_period_count} ${p.subscription_period_interval} · ödeme her ${p.payment_frequency_count} ${p.payment_frequency_interval} · indirim ${p.discount ?? p.discount_bps ?? 0} · PPP ${p.purchasing_power_parity ? 'açık' : 'kapalı'} · fiyat modu ${u.pricing_mode ?? 'yok'}`);
        }
    }
}

function komutOlustur(args) {
    const r = liste();
    kipYaz(r.taban);
    kipKapisi(r.taban, args);
    const esles = eslestir(r.items);
    const eksik = PAKETLER.filter((p) => !esles[p.anahtar].urun);
    const sablonIds = [...new Set(eksik.map((p) => r.harita[p.anahtar]).filter(Boolean))];
    const sablonlar = {};
    if (sablonIds.length) {
        const s = dodo(sablonIds.map((id) => ['GET', `/products/${encodeURIComponent(id)}`]));
        for (const y of s.yanitlar) if (y.kod === 200) sablonlar[y.govde.product_id] = y.govde;
    }
    console.log('');
    for (const p of PAKETLER) {
        const e = esles[p.anahtar];
        if (e.urun) console.log(`  ${p.anahtar.padEnd(18)} VAR   ${urunSatiri(e.urun)}${e.sorun.length ? `  ⚠ ${e.sorun.join('; ')}` : ''}`);
    }
    const govdeler = eksik.map((p) => [p, urunGovdesi(p, sablonlar[r.harita[p.anahtar]])]);
    for (const [p, g] of govdeler) {
        const sablon = r.harita[p.anahtar];
        console.log(`  ${p.anahtar.padEnd(18)} AÇILACAK  "${g.name}"  ${tl(g.price.price)} TRY /${g.price.payment_frequency_interval} · vergi dahil · deneme 0 · abonelik süresi ${g.price.subscription_period_count} ${g.price.subscription_period_interval}${sablonlar[sablon] ? ` (ayarlar ${sablon}'dan)` : ' (eski ürün okunamadı — varsayılan ayar)'}`);
    }
    if (!govdeler.length) { console.log('\nAçılacak ürün yok — altısı da var.'); return; }
    if (!args.includes('uygula')) {
        console.log(`\nKURU: hiçbir şey açılmadı. Açmak için: node ops/abonelik/dodo-urun.mjs olustur uygula${testKipiMi(r.taban) ? '' : ' canli'}`);
        console.log(`Örnek gövde (${govdeler[0][0].anahtar}):\n${JSON.stringify(govdeler[0][1], null, 2)}`);
        return;
    }
    const a = dodo(govdeler.map(([, g]) => ['POST', '/products', g]));
    a.yanitlar.forEach((y, i) => {
        const [p] = govdeler[i];
        if (y.kod >= 200 && y.kod < 300) console.log(`  ✓ ${p.anahtar.padEnd(18)} ${y.govde.product_id}`);
        else console.log(`  ✗ ${p.anahtar.padEnd(18)} Dodo ${y.kod} — ${JSON.stringify(y.govde).slice(0, 300)}`);
    });
    // Doğrulama Dodo'nun kendi listesinden: ne yazdığımıza değil ne kaydettiğine bakılır.
    const { harita, hatalar } = yeniHarita(eslestir(liste().items));
    if (hatalar.length) { console.error(`\nEKSİK:\n  ${hatalar.join('\n  ')}`); process.exit(1); }
    console.log(`\nAltısı Dodo'da, tutarlar doğru. Yeni harita (henüz YAZILMADI):\n${JSON.stringify(harita, null, 2)}`);
}

function komutHarita(args) {
    if (args.includes('geri')) {
        // Geri dönüş her kipte serbest: bozuk haritadan kaçış yolu.
        const r = uzak(haritaBetigi('geri'));
        kipYaz(r.taban);
        console.log(`Harita geri alındı. Şimdi:\n${JSON.stringify(r.sonra, null, 2)}`);
        return;
    }
    const r = liste();
    kipYaz(r.taban);
    const { harita, hatalar } = yeniHarita(eslestir(r.items));
    console.log('\n  paket              bugün                        →  yeni');
    for (const p of PAKETLER) console.log(`  ${p.anahtar.padEnd(18)} ${String(r.harita[p.anahtar] ?? '—').padEnd(28)} →  ${harita[p.anahtar] ?? '—'}`);
    if (hatalar.length) { console.error(`\nHarita kurulamıyor:\n  ${hatalar.join('\n  ')}`); process.exit(1); }
    if (!args.includes('uygula')) {
        console.log(`\nKURU: harita değişmedi. Masaüstünde yeni fiyatlar CANLIDAYKEN: node ops/abonelik/dodo-urun.mjs harita uygula${testKipiMi(r.taban) ? '' : ' canli'}`);
        return;
    }
    kipKapisi(r.taban, args);
    const w = uzak(haritaBetigi('uygula', harita));
    const tamam = JSON.stringify(w.sonra) === JSON.stringify(harita);
    console.log(tamam
        ? '\n✓ DODO_PRODUCT_MAP yazıldı; ödeme sayfası artık yeni ürünleri satar. Eskisi DODO_PRODUCT_MAP_ONCEKI\'de (geri: harita geri).'
        : `\n✗ Yazılan harita beklenenden farklı:\n${JSON.stringify(w.sonra)}`);
    if (!tamam) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const [islem = 'liste', ...args] = process.argv.slice(2);
    try {
        if (islem === 'liste') komutListe();
        else if (islem === 'olustur') komutOlustur(args);
        else if (islem === 'harita') komutHarita(args);
        else {
            console.error('Kullanım: node ops/abonelik/dodo-urun.mjs liste | olustur [uygula] | harita [uygula | geri]');
            process.exit(1);
        }
    } catch (e) {
        console.error(`HATA: ${e.message}`);
        process.exit(1);
    }
}
