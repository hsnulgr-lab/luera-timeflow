#!/usr/bin/env node
//
// Dodo canlı kipe geçiş — BU BİLGİSAYARDAN çalışır.
//
//   node ops/abonelik/dodo-canli.mjs durum     sunucudaki Dodo ayarları (sır değeri basılmaz)
//   node ops/abonelik/dodo-canli.mjs hazirla   KURU: canlı anahtarı dener, canlı webhook'u arar, planı basar
//   node ops/abonelik/dodo-canli.mjs gec       canlı webhook'u açar (yoksa), sırrını alır; adres + anahtar + sır yazılır
//   node ops/abonelik/dodo-canli.mjs geri      test kipine döner (gec'in aldığı yedekten)
//
// Kullanıcıdan istenen TEK şey canlı API anahtarı (Dodo → Live → Developer →
// API Keys, yazma yetkili), bu bilgisayarda ~/.luera-dodo-canli.env içinde:
//   DODO_API_KEY=...
// Webhook'u betik açar (test kipindeki ucun olay listesiyle) ve imza sırrını
// Dodo'dan kendisi okur: panelden sır kopyalanmaz.
//
// Hiçbir sır ekrana, komut satırına ya da sohbete çıkmaz: anahtar dosyadan
// okunur, sunucuya ssh'ın GİRDİSİNDEN (psql'e SQL olarak) gider; canlı Dodo
// çağrıları bu bilgisayardan başlıkla yapılır.
//
// `gec` ile ürün haritası arasında ödeme sayfası çalışmaz (harita test
// ürünlerini gösterir, canlı Dodo onları tanımaz): hemen ardından
//   node ops/abonelik/dodo-urun.mjs olustur uygula canli
//   node ops/abonelik/dodo-urun.mjs harita uygula canli
// Sıra ve geri alma: docs/devir/16-CANLIYA-GECIS.md.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dodo, testKipiMi } from './dodo-urun.mjs';
import { dodoUcuDurumu } from '../izleme/src/kontroller.js';

export const CANLI_TABAN = 'https://live.dodopayments.com';
export const UC = 'https://supabase.timeflow.lueratech.com/functions/v1/dodo-webhook';
// Ortamdan değiştirilebilir yalnız sahte sunucuyla sınamak için.
const CANLI = process.env.DODO_CANLI_TABAN || CANLI_TABAN;
const DOSYA = process.env.DODO_CANLI_DOSYA || `${homedir()}/.luera-dodo-canli.env`;
const DB = 'supabase-db-t6yi63jbebvj6c7oo7yjofnt';
const SSH = ['-i', `${homedir()}/.ssh/luera_vps`, '-o', 'BatchMode=yes', 'root@76.13.4.164'];

// SQL'e tırnak, ters bölü ya da boşluk giremez: değer '…' içine olduğu gibi
// yazılır, bu biçimler dışında hiçbir şey sunucuya gitmez.
export const anahtarGecerli = (k) => /^[A-Za-z0-9_.-]{20,200}$/.test(String(k ?? ''));
export const sirGecerli = (s) => /^whsec_[A-Za-z0-9+/=]{16,200}$/.test(String(s ?? ''));

/** ~/.luera-dodo-canli.env → anahtar. Değer hiçbir hata metnine girmez. */
export function anahtarOku(dosya = DOSYA) {
    let metin;
    try { metin = readFileSync(dosya, 'utf8'); } catch {
        throw new Error(`${dosya} okunamadı. Anahtarı şu komutla yaz (soru gelince yapıştır):\n  read -rs "K?Dodo canlı API anahtarı: " && echo && printf 'DODO_API_KEY=%s\\n' "$K" > ~/.luera-dodo-canli.env && chmod 600 ~/.luera-dodo-canli.env && unset K && echo yazildi`);
    }
    const satir = metin.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('DODO_API_KEY=')).pop();
    const k = satir?.slice('DODO_API_KEY='.length).replace(/^["']|["']$/g, '');
    if (!anahtarGecerli(k)) throw new Error(`${dosya} içinde geçerli bir DODO_API_KEY=… satırı yok (harf, rakam, _ . - ; en az 20 karakter)`);
    return k;
}

const ANAHTARLAR = ['DODO_API_BASE', 'DODO_API_KEY', 'DODO_WEBHOOK_SECRET', 'DODO_PRODUCT_MAP'];
const liste = (xs) => xs.map((x) => `'${x}'`).join(', ');

/**
 * Test değerlerini DODO_TEST_*'a yedekler, canlı adres + anahtar + sırrı
 * yazar. Tek işlem; sunucu zaten canlıdaysa HİÇBİR ŞEY yazılmaz (yedek canlı
 * değerle ezilmesin — geri dönüş yolu o yedek).
 */
export function gecSql(anahtar, sir) {
    if (!anahtarGecerli(anahtar) || !sirGecerli(sir)) throw new Error('anahtar ya da sır biçimi geçersiz');
    return `begin;
do $$ begin
  if coalesce((select value from app_secrets where key = 'DODO_API_BASE'), 'https://test.dodopayments.com') not like '%//test.%' then
    raise exception 'DODO_API_BASE test değil — sunucu zaten canlı; yedek ezilmez, hiçbir şey yazılmadı';
  end if;
end $$;
insert into app_secrets (key, value)
select 'DODO_TEST_' || substr(key, 6), value from app_secrets where key in (${liste(ANAHTARLAR)})
on conflict (key) do update set value = excluded.value, updated_at = now();
insert into app_secrets (key, value) values ('DODO_TEST_API_BASE', coalesce((select value from app_secrets where key = 'DODO_API_BASE'), 'https://test.dodopayments.com'))
on conflict (key) do update set value = excluded.value, updated_at = now();
insert into app_secrets (key, value) values
  ('DODO_API_BASE', '${CANLI_TABAN}'),
  ('DODO_API_KEY', '${anahtar}'),
  ('DODO_WEBHOOK_SECRET', '${sir}')
on conflict (key) do update set value = excluded.value, updated_at = now();
commit;
${durumSql()}`;
}

/** DODO_TEST_* yedeğinden geri döner; yedek yoksa hiçbir şey yazılmaz. */
export function geriSql() {
    return `begin;
do $$ begin
  if not exists (select 1 from app_secrets where key = 'DODO_TEST_API_KEY') then
    raise exception 'DODO_TEST_* yedeği yok — geri dönülecek değer yok, hiçbir şey yazılmadı';
  end if;
end $$;
update app_secrets a set value = b.value, updated_at = now()
from app_secrets b
where a.key in (${liste(ANAHTARLAR)}) and b.key = 'DODO_TEST_' || substr(a.key, 6);
commit;
${durumSql()}`;
}

/** Salt okunur özet: adres ve bayraklar değeriyle, sırlar yalnız uzunlukla. */
export function durumSql() {
    const hepsi = [...ANAHTARLAR, ...ANAHTARLAR.map((k) => `DODO_TEST_${k.slice(5)}`), 'ENTITLEMENT_ENFORCE', 'ABONELIK_EPOSTA'];
    return `select key || '=' || case
  when key in ('DODO_API_BASE', 'DODO_TEST_API_BASE', 'ENTITLEMENT_ENFORCE', 'ABONELIK_EPOSTA') then value
  when key in ('DODO_PRODUCT_MAP', 'DODO_TEST_PRODUCT_MAP') then (select count(*) from json_object_keys(value::json))::text || ' paket'
  else length(value)::text || ' karakter' end
from app_secrets where key in (${liste(hepsi)}) order by key;`;
}

function psql(sql) {
    const r = spawnSync('ssh', [...SSH, `docker exec -i -u postgres ${DB} psql -U supabase_admin -d postgres -X -qtA -v ON_ERROR_STOP=1 -f -`],
        { input: sql, encoding: 'utf8' });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error((r.stderr || `psql ${r.status} ile bitti`).trim().split('\n').pop());
    return Object.fromEntries(r.stdout.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

async function canli(anahtar, yol, init = {}) {
    const res = await fetch(`${CANLI}${yol}`, {
        ...init,
        headers: { Authorization: `Bearer ${anahtar}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
    });
    const metin = await res.text();
    let govde = metin;
    try { govde = JSON.parse(metin); } catch { /* metin kalır */ }
    return { status: res.status, metin, govde };
}

const sonEgik = (u) => String(u ?? '').replace(/\/+$/, '');
const bizimUc = (liste) => (Array.isArray(liste?.data) ? liste.data : []).filter((w) => sonEgik(w?.url) === sonEgik(UC));
const olaylar = (w) => (Array.isArray(w?.filter_types) && w.filter_types.length ? w.filter_types.join(', ') : 'hepsi');

/** İki tarafın bugünkü hâli; hiçbir şey yazmaz. */
async function kesif(anahtar) {
    const s = dodo([['GET', '/webhooks?limit=100']]);
    const sunucuTest = testKipiMi(s.taban);
    const testUc = sunucuTest && s.yanitlar[0]?.kod === 200 ? bizimUc(s.yanitlar[0].govde).find((w) => w.disabled !== true) ?? null : null;

    const w = await canli(anahtar, '/webhooks?limit=100');
    if (w.status === 401 || w.status === 403) throw new Error(`canlı Dodo anahtarı reddetti (HTTP ${w.status}). Live kipinde, yazma yetkili anahtar mı? Test anahtarı canlıda geçmez.`);
    if (w.status !== 200) throw new Error(`canlı Dodo webhook listesi okunamadı (HTTP ${w.status})`);
    const p = await canli(anahtar, '/products?recurring=true&page_size=100');
    return {
        taban: s.taban, sunucuTest, testUc,
        canliUclar: bizimUc(w.govde), canliUcSayisi: Array.isArray(w.govde?.data) ? w.govde.data.length : 0,
        canliUrun: p.status === 200 ? (p.govde?.items ?? []).length : null,
    };
}

function planYaz(k, anahtar) {
    console.log(`Sunucu: ${k.sunucuTest ? 'TEST' : 'CANLI'} (${String(k.taban).replace(/^https?:\/\//, '')})`);
    console.log(`Canlı anahtar: geçerli (${anahtar.length} karakter) · canlıda ${k.canliUrun ?? '?'} abonelik ürünü, ${k.canliUcSayisi} webhook`);
    console.log(`Test ucu: ${k.testUc ? `${k.testUc.id} · olaylar: ${olaylar(k.testUc)}` : 'bulunamadı (canlı uç tüm olaylarla açılır)'}`);
    const acik = k.canliUclar.find((w) => w.disabled !== true);
    if (acik) console.log(`Canlı uç: VAR ${acik.id} · olaylar: ${olaylar(acik)}`);
    else if (k.canliUclar.length) console.log(`Canlı uç: VAR ama DEVRE DIŞI (${k.canliUclar.map((w) => w.id).join(', ')}) — Dodo Live → Webhooks'ta Enable`);
    else console.log(`Canlı uç: AÇILACAK → ${UC} · olaylar: ${olaylar(k.testUc)}`);
}

async function komutHazirla() {
    const anahtar = anahtarOku();
    const k = await kesif(anahtar);
    planYaz(k, anahtar);
    if (!k.sunucuTest) { console.log('\nSunucu zaten CANLI: gec çalışmaz (yedek ezilmesin). Geri: node ops/abonelik/dodo-canli.mjs geri'); return; }
    console.log(`\nKURU: hiçbir şey yazılmadı. gec şunları yapar:
  1. canlı uç yoksa açar, imza sırrını Dodo'dan okur
  2. sunucuda test değerlerini DODO_TEST_*'a yedekler
  3. DODO_API_BASE = ${CANLI_TABAN}, DODO_API_KEY, DODO_WEBHOOK_SECRET yazar (tek işlem)
  4. sunucudan canlı Dodo'ya bir okuma yapar (anahtar orada çalışıyor mu)
Hemen ardından ürünler + harita (dodo-urun.mjs … canli); arada ödeme sayfası çalışmaz.`);
}

async function komutGec() {
    const anahtar = anahtarOku();
    const k = await kesif(anahtar);
    planYaz(k, anahtar);
    if (!k.sunucuTest) throw new Error('sunucu zaten CANLI — hiçbir şey yapılmadı');

    let uc = k.canliUclar.find((w) => w.disabled !== true);
    if (!uc && k.canliUclar.length) throw new Error("canlı uç devre dışı — Dodo Live → Webhooks'ta Enable, sonra yeniden gec");
    if (!uc) {
        const filtre = k.testUc?.filter_types?.length ? { filter_types: k.testUc.filter_types } : {};
        const r = await canli(anahtar, '/webhooks', {
            method: 'POST',
            body: JSON.stringify({ url: UC, description: 'Luera TimeFlow', ...filtre, idempotency_key: 'timeflow-canli-uc' }),
        });
        if (r.status < 200 || r.status >= 300 || !r.govde?.id) throw new Error(`canlı uç açılamadı (HTTP ${r.status})`);
        uc = r.govde;
        console.log(`✓ Canlı uç açıldı: ${uc.id}`);
    }
    // Ucun açık ve gerekli olayları alıyor olması: dış izlemenin denetimiyle aynı.
    const l = await canli(anahtar, '/webhooks?limit=100');
    const d = dodoUcuDurumu(l.status, l.metin, UC);
    if (!d.ok) throw new Error(`canlı uç hazır değil: ${d.ayrinti}`);

    const s = await canli(anahtar, `/webhooks/${encodeURIComponent(uc.id)}/secret`);
    const sir = s.govde?.secret;
    if (s.status !== 200 || !sirGecerli(sir)) throw new Error(`canlı ucun imza sırrı okunamadı (HTTP ${s.status})`);

    const sonra = psql(gecSql(anahtar, sir));
    const tamam = sonra.DODO_API_BASE === CANLI_TABAN && sonra.DODO_API_KEY === `${anahtar.length} karakter`
        && sonra.DODO_WEBHOOK_SECRET === `${sir.length} karakter` && Boolean(sonra.DODO_TEST_API_KEY);
    console.log(`\nSunucu şimdi:\n  ${Object.entries(sonra).map(([a, b]) => `${a} = ${b}`).join('\n  ')}`);
    if (!tamam) throw new Error('yazılan değerler beklenenle uyuşmuyor — `durum`a bak; gerekirse `geri`');

    const v = dodo([['GET', '/products?page_size=1']]);
    if (testKipiMi(v.taban) || v.yanitlar[0]?.kod !== 200) {
        throw new Error(`sunucudan canlı Dodo okunamadı (HTTP ${v.yanitlar[0]?.kod}) — geri: node ops/abonelik/dodo-canli.mjs geri`);
    }
    console.log(`\n✓ Sunucu CANLI Dodo'ya bağlı; webhook imzası canlı uçtan.
ŞİMDİ (ödeme sayfası harita değişene kadar çalışmaz):
  node ops/abonelik/dodo-urun.mjs olustur uygula canli
  node ops/abonelik/dodo-urun.mjs harita uygula canli`);
}

function komutGeri() {
    const sonra = psql(geriSql());
    console.log(`Test kipine dönüldü:\n  ${Object.entries(sonra).map(([a, b]) => `${a} = ${b}`).join('\n  ')}`);
    if (sonra.ENTITLEMENT_ENFORCE === 'true' || sonra.ABONELIK_EPOSTA === 'true') {
        console.log('\nDİKKAT: ENFORCE ya da abonelik e-postaları AÇIK — test kipinde gerçek ödeme alınamaz. Kapat: devir 16 geri alma.');
    }
}

function komutDurum() {
    const d = psql(durumSql());
    console.log(Object.entries(d).map(([a, b]) => `${a} = ${b}`).join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const islem = process.argv[2] ?? 'durum';
    const is = { durum: komutDurum, hazirla: komutHazirla, gec: komutGec, geri: komutGeri }[islem];
    if (!is) {
        console.error('Kullanım: node ops/abonelik/dodo-canli.mjs durum | hazirla | gec | geri');
        process.exit(1);
    }
    try { await is(); } catch (e) {
        console.error(`HATA: ${e.message}`);
        process.exit(1);
    }
}
