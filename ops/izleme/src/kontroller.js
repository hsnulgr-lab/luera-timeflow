// Luera dış izleme — saf mantık. Cloudflare Worker'ı (index.js) ve yerel
// deneme (dene.mjs) bunu kullanır; ağ ve depo dışarıdan verilir ki test
// edilebilsin.
//
// Neden var: 2026-10-16'da Hostinger'ın çekirdek yaması VPS 1'i yeniden
// başlattı; dönüşte supabase-auth kabı ölü kaldı ve giriş/kayıt ~45 dk
// çalışmadı. Masaüstü ve veritabanı 200 döndüğü için hiçbir şey alarm
// vermedi, sorunu kullanıcı kendisi buldu. İzleme bu yüzden Hostinger'ın
// DIŞINDA koşar: aynı sağlayıcıdaki bir makine aynı olayda onunla düşerdi.

export const ZAMAN_ASIMI_MS = 10_000;
// İlk hata alarm değildir: 20 sn sonra bir kez daha denenir. Tek bir
// kopuk paket telefonu çaldırmasın.
export const TEKRAR_BEKLE_MS = 20_000;
// Kapalı kalan servis için saatte bir hatırlatma; arası sessiz.
export const HATIRLAT_MS = 60 * 60_000;
// VPS 1'deki kontrollerden bu kadarı AYNI ANDA düşerse ayrı ayrı değil,
// "sunucu yanıt vermiyor" diye tek bildirim gider.
const VPS1_ESIK = 3;

export const uyku = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Önem → bildirim önceliği (ntfy ölçeği; Pushover'a `pushoverOnceligi` çevirir).
 *   acil   — bütün salonlar etkileniyor: sessiz modu deler, onaylanana dek çalar
 *   yuksek — bir kısmı etkileniyor: bir kez sesli
 *   sessiz — müşteriyi etkilemiyor: uyandırmaz
 * Kullanıcı kararı (2026-10-17): "her sabah gelen sessiz olsun, VPS çökünce
 * gerçek bildirim gelsin".
 */
const ONCELIK = { acil: 5, yuksek: 4, sessiz: 2 };

/**
 * İzlenen beş adres (+ anahtar verilmişse Dodo ucu, 2026-10-19). Her biri 2026-10-17'de elle denendi ve bugünkü
 * cevabı beklenen değer olarak yazıldı. Metinler gece 3'te okunacak:
 * önce ne bozuldu, sonra kim etkileniyor, sonra ne yapılır — teknik en sonda.
 */
export function kontroller(env) {
    const sb = String(env.SUPABASE_URL).replace(/\/$/, '');
    return [
        {
            id: 'giris', ad: 'Giriş', grup: 'vps1', onem: 'acil',
            baslik: 'Giriş çalışmıyor — kimse giriş yapamıyor',
            etki: 'Salonlar ve personel uygulamaya da masaüstüne de giremiyor, yeni kayıt açılamıyor. Açık oturumlar çalışmaya devam ediyor.',
            yap: "Claude'a \"giriş alarmı\" yaz. 16 Ekim'deki gibi giriş servisi yeniden başlarken takılmış olabilir.",
            // Kong anahtarsız isteği 401 ile keser; anahtar başlıkta gider, adreste değil.
            url: `${sb}/auth/v1/health`, headers: { apikey: env.SUPABASE_ANON_KEY },
            beklenen: 200, icerik: 'GoTrue',
        },
        {
            id: 'veri', ad: 'Veritabanı', grup: 'vps1', onem: 'acil',
            baslik: 'Veritabanı yanıt vermiyor — uygulama veri alamıyor',
            etki: 'Uygulama ve masaüstü randevuları getiremiyor; randevu sayfasından randevu alınamıyor.',
            yap: "Claude'a \"veritabanı alarmı\" yaz. Hostinger panelinde VPS 1'in açık olduğuna bak.",
            // Rezervasyon sayfasının kendi okuması: Kong + fonksiyon çalıştırıcısı +
            // Postgres tek istekte. Yalnız okur, hiçbir şey yazmaz.
            url: `${sb}/functions/v1/public-booking`, method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'profile', slug: env.DEMO_SLUG }),
            beklenen: 200, icerik: '"business"',
        },
        {
            id: 'personel', ad: 'Personel servisi', grup: 'vps1', onem: 'acil',
            baslik: 'Personel servisi çalışmıyor — personel telefonları durdu',
            etki: 'Personel telefonları randevuları göremiyor, işlem başlatamıyor. Müdür uygulaması etkilenmiyor.',
            yap: "Claude'a \"personel servisi alarmı\" yaz.",
            // Jetonsuz istek 401 + invalid_token döner: fonksiyon açılabiliyor
            // demek. Açılamazsa (2026-10-11'deki remind gibi) 5xx gelir.
            url: `${sb}/functions/v1/staff-api`,
            beklenen: 401, icerik: 'invalid_token',
        },
        {
            id: 'masaustu', ad: 'Masaüstü', grup: 'vps1', onem: 'yuksek',
            baslik: 'Masaüstü açılmıyor',
            etki: 'timeflow.lueratech.com açılmıyor. Telefon uygulaması çalışmaya devam ediyor.',
            yap: "Claude'a \"masaüstü alarmı\" yaz; Coolify'da masaüstü uygulamasının durumuna bakılır.",
            url: env.DESKTOP_URL, beklenen: 200, icerik: 'id="root"',
        },
        {
            id: 'site', ad: 'lueratech.com', grup: 'framer', onem: 'sessiz',
            baslik: 'lueratech.com açılmıyor',
            etki: "Tanıtım sitesi (Framer) açılmıyor. TimeFlow'u ve müşterileri etkilemiyor.",
            yap: "Acil değil. Framer'ın durum sayfasına bak; sabah da olur.",
            url: env.SITE_URL, beklenen: 200,
        },
        // Anahtar yoksa kontrol hiç yok: kurulum bitene kadar alarm üretmesin.
        ...(env.DODO_READONLY_KEY ? [dodoKontrolu(env, sb)] : []),
    ];
}

/** Dodo'nun abonelik olaylarını almak için şart olanlar (filtre varsa). */
export const DODO_GEREKLI_OLAYLAR = ['subscription.active', 'subscription.renewed', 'subscription.on_hold'];

/**
 * Dodo webhook ucu açık mı? (2026-10-19)
 *
 * Eylül'de TimeFlow'un webhook'u günlerce 500 döndü; Dodo ucu KENDİLİĞİNDEN
 * devre dışı bıraktı ve 8 hafta tek abonelik olayı gelmedi — kimse görmedi.
 * Uç kapalıyken TimeFlow tarafında her şey sağlıklı görünür: sorun ancak
 * Dodo'ya sorulunca anlaşılır.
 *
 * SALT OKUNUR Dodo anahtarıyla (`DODO_READONLY_KEY`) `GET /webhooks`. Yazma
 * yetkili anahtar Worker'a konmaz. 30 dakikada bir (Dodo API'sini 2 dakikada
 * bir yormasın). Dodo'nun kendi kesintisi alarm değildir (bilinmiyor);
 * anahtarın reddi alarmdır — izleme kör kalmış demektir.
 */
function dodoKontrolu(env, sb) {
    const base = String(env.DODO_API_BASE || 'https://test.dodopayments.com').replace(/\/$/, '');
    const hedef = `${sb}/functions/v1/dodo-webhook`;
    return {
        id: 'dodo', ad: 'Dodo ucu', grup: 'dodo', onem: 'yuksek', aralikDk: 30,
        baslik: 'Dodo bildirim ucu kapalı — abonelik olayları gelmiyor',
        etki: "Ödeme ve yenileme bildirimleri TimeFlow'a ulaşmıyor. Abonelik kapısı açıkken ödeyen salon yenileme gününde kilitlenir.",
        yap: "Dodo → Developer → Webhooks → TimeFlow ucu → Enable. Sonra Claude'a \"Dodo ucu alarmı\" yaz (aradaki olaylar Recover ile geri alınır).",
        url: `${base}/webhooks?limit=100`,
        headers: { authorization: `Bearer ${env.DODO_READONLY_KEY}` },
        belirsizAgHatasi: true,
        degerlendir: (status, metin) => dodoUcuDurumu(status, metin, hedef),
    };
}

const sonEgik = (u) => String(u ?? '').replace(/\/+$/, '');

/**
 * `GET /webhooks` cevabı → { ok, ayrinti } ya da { bilinmiyor, ayrinti }.
 * Bilinmiyor = Dodo'nun kendi sorunu; bu tur sayılmaz, durum değişmez.
 */
export function dodoUcuDurumu(status, metin, hedef) {
    if (status === 401 || status === 403) {
        return { ok: false, ayrinti: `izleme anahtarı reddedildi (HTTP ${status}) — uç durumu bilinmiyor` };
    }
    if (status === 429 || status >= 500) return { bilinmiyor: true, ayrinti: `Dodo API'si cevap vermedi (HTTP ${status})` };
    if (status !== 200) return { ok: false, ayrinti: `beklenmeyen cevap (HTTP ${status})` };
    let liste;
    try { liste = JSON.parse(metin); } catch { return { bilinmiyor: true, ayrinti: 'Dodo cevabı okunamadı' }; }
    const uclar = (Array.isArray(liste?.data) ? liste.data : []).filter((w) => sonEgik(w?.url) === sonEgik(hedef));
    if (!uclar.length) {
        return liste?.done === false
            ? { bilinmiyor: true, ayrinti: 'uç listesi tek sayfaya sığmadı' }
            : { ok: false, ayrinti: "TimeFlow ucu Dodo'da kayıtlı değil" };
    }
    const acik = uclar.filter((w) => w.disabled !== true);
    if (!acik.length) return { ok: false, ayrinti: 'Dodo ucu devre dışı bıraktı' };
    const filtre = acik[0].filter_types;
    if (Array.isArray(filtre) && filtre.length) {
        const eksik = DODO_GEREKLI_OLAYLAR.filter((o) => !filtre.includes(o));
        if (eksik.length) return { ok: false, ayrinti: `uç şu olayları almıyor: ${eksik.join(', ')}` };
    }
    return { ok: true, ayrinti: '' };
}

/** Bu turda koşacak mı? `aralikDk` olan kontrol yalnız o dakikalarda (00, 30…). */
export function siraGeldiMi(k, zaman) {
    if (!k.aralikDk) return true;
    return Math.floor(zaman / 60_000) % k.aralikDk === 0;
}

/** Tek deneme. Hiçbir zaman fırlatmaz; sonucu döner. Ayrıntı sade Türkçe. */
export async function kontrolEt(k, fetchImpl, zamanAsimiMs = ZAMAN_ASIMI_MS) {
    const bas = Date.now();
    const sonuc = (ok, ayrinti) => ({ id: k.id, ok, ayrinti, ms: Date.now() - bas });
    try {
        const res = await fetchImpl(k.url, {
            method: k.method ?? 'GET',
            headers: { 'user-agent': 'luera-izleme/1', ...k.headers },
            body: k.body,
            redirect: 'follow',
            signal: AbortSignal.timeout(zamanAsimiMs),
        });
        const metin = await res.text();
        if (k.degerlendir) {
            const d = k.degerlendir(res.status, metin);
            return d.bilinmiyor ? { ...sonuc(false, d.ayrinti), bilinmiyor: true } : sonuc(d.ok, d.ayrinti ?? '');
        }
        if (res.status !== k.beklenen) {
            return sonuc(false, res.status >= 500
                ? `sunucu cevap verdi ama servis kapalı (HTTP ${res.status})`
                : `beklenmeyen cevap (HTTP ${res.status})`);
        }
        if (k.icerik && !metin.includes(k.icerik)) return sonuc(false, 'sayfa açıldı ama içerik beklenen gibi değil');
        return sonuc(true, '');
    } catch (e) {
        const zaman = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        const r = sonuc(false, zaman ? `sunucu ${zamanAsimiMs / 1000} sn içinde cevap vermedi` : 'sunucuya hiç ulaşılamıyor');
        // Dışarıdaki bir API'ye (Dodo) ulaşılamaması bizim servisimizin
        // kapalı olduğu anlamına gelmez.
        return k.belirsizAgHatasi ? { ...r, bilinmiyor: true } : r;
    }
}

/** İlk hata bir kez daha denenir; ikincisi de düşerse kapalı sayılır. */
export async function denetle(k, fetchImpl, uyu = uyku, bekleMs = TEKRAR_BEKLE_MS) {
    const ilk = await kontrolEt(k, fetchImpl);
    if (ilk.ok) return ilk;
    await uyu(bekleMs);
    return kontrolEt(k, fetchImpl);
}

export function sure(ms) {
    const dk = Math.max(1, Math.round(ms / 60_000));
    if (dk < 60) return `${dk} dk`;
    const sa = Math.floor(dk / 60);
    const kalanDk = dk % 60;
    if (sa < 24) return kalanDk ? `${sa} sa ${kalanDk} dk` : `${sa} sa`;
    const gun = Math.floor(sa / 24);
    const kalanSa = sa % 24;
    return kalanSa ? `${gun} gün ${kalanSa} sa` : `${gun} gün`;
}

/** İstanbul saati (UTC+3, yaz saati yok) — "02:10". Ek almasın diye yalın. */
export function saat(zaman) {
    return new Date(zaman + 3 * 3600_000).toISOString().slice(11, 16);
}

/** 09:00 İstanbul = 06:00 UTC (Türkiye 2016'dan beri yaz saati uygulamıyor). */
export function sabahMi(zaman) {
    const d = new Date(zaman);
    return d.getUTCHours() === 6 && d.getUTCMinutes() === 0;
}

const kacis = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Gövde iki biçimde: düz (ntfy) ve HTML (Pushover: "Etkisi"/"Ne yap" kalın,
 * teknik satır gri). satirlar: [etiket|null, metin]; teknik: en alttaki satırlar.
 */
function govde(satirlar, teknik = []) {
    const duz = [...satirlar.map(([e, m]) => (e ? `${e}: ${m}` : m)), ...teknik].join('\n');
    const html = [
        ...satirlar.map(([e, m]) => (e ? `<b>${kacis(e)}:</b> ${kacis(m)}` : kacis(m))),
        ...teknik.map((t) => `<font color="#8e8e93">${kacis(t)}</font>`),
    ].join('\n');
    return { message: duz, html };
}

const enYuksek = (idler, ad) => Math.max(...idler.map((id) => ONCELIK[ad[id].onem]));
const sunucuMu = (idler, ad) => idler.filter((id) => ad[id].grup === 'vps1').length >= VPS1_ESIK;

function dusmeBildirimi(dusen, ad, simdi) {
    const idler = dusen.map((s) => s.id);
    const baslangic = `Başladı ${saat(simdi)}`;
    if (sunucuMu(idler, ad)) {
        return {
            title: "Sunucu kapalı — TimeFlow'un hiçbir parçası çalışmıyor",
            ...govde([
                ['Etkisi', 'Uygulama, masaüstü ve randevu sayfası açılmıyor.'],
                ['Ne yap', "Hostinger panelinde VPS 1'e bak. Sunucu dönünce önce girişi kontrol et (16 Ekim'de dönüşte giriş kapalı kalmıştı)."],
            ], [baslangic, ...dusen.map((s) => `${ad[s.id].ad}: ${s.ayrinti}`)]),
            priority: ONCELIK.acil, tags: ['rotating_light'],
        };
    }
    if (dusen.length === 1) {
        const k = ad[dusen[0].id];
        return {
            title: k.baslik,
            ...govde([['Etkisi', k.etki], ['Ne yap', k.yap]], [`${baslangic} · ${dusen[0].ayrinti}`]),
            priority: ONCELIK[k.onem], tags: ['rotating_light'],
        };
    }
    return {
        title: `${dusen.length} servis çalışmıyor`,
        ...govde([
            ...dusen.map((s) => [null, `• ${ad[s.id].baslik}. ${ad[s.id].etki}`]),
            ['Ne yap', "Claude'a \"izleme alarmı\" yaz."],
        ], [baslangic, ...dusen.map((s) => `${ad[s.id].ad}: ${s.ayrinti}`)]),
        priority: enYuksek(idler, ad), tags: ['rotating_light'],
    };
}

function hatirlatmaBildirimi(hatirlat, ad, simdi) {
    const idler = hatirlat.map((s) => s.id);
    // Acil olan saatte bir yine sesli çalar; diğerleri sessiz hatırlatır.
    const priority = enYuksek(idler, ad) >= ONCELIK.acil ? 4 : ONCELIK.sessiz;
    if (hatirlat.length === 1) {
        const s = hatirlat[0];
        const k = ad[s.id];
        return {
            title: `${k.ad} hâlâ çalışmıyor · ${sure(simdi - s.since)}`,
            ...govde([['Etkisi', k.etki], ['Ne yap', k.yap]], [`Başladı ${saat(s.since)} · ${s.ayrinti}`]),
            priority, tags: ['rotating_light'],
        };
    }
    return {
        title: `${hatirlat.length} servis hâlâ çalışmıyor`,
        ...govde(hatirlat.map((s) => [null, `• ${ad[s.id].ad}: ${sure(simdi - s.since)} oldu (başladı ${saat(s.since)})`])),
        priority, tags: ['rotating_light'],
    };
}

function duzelmeBildirimi(duzelen, ad, simdi) {
    const idler = duzelen.map((s) => s.id);
    const priority = enYuksek(idler, ad) > ONCELIK.sessiz ? 3 : ONCELIK.sessiz;
    const aralik = (s) => `${sure(simdi - s.since)} kapalı kaldı (${saat(s.since)} – ${saat(simdi)}).`;
    if (duzelen.length === 1) {
        return { title: `${ad[duzelen[0].id].ad} yeniden çalışıyor`, ...govde([[null, aralik(duzelen[0])]]), priority, tags: ['white_check_mark'] };
    }
    return {
        title: sunucuMu(idler, ad) ? 'Sunucu yeniden çalışıyor' : `${duzelen.length} servis yeniden çalışıyor`,
        ...govde(duzelen.map((s) => [null, `• ${ad[s.id].ad}: ${aralik(s)}`])),
        priority, tags: ['white_check_mark'],
    };
}

/**
 * Önceki durum + bu turun sonuçları → yeni durum ve gidecek bildirimler.
 * Durum yalnız kapalı servisleri tutar; değişiklik yoksa depoya yazılmaz
 * (KV ücretsiz planda günde 1000 yazma).
 */
export function karar(onceki, sonuclar, simdi, liste) {
    const ad = Object.fromEntries(liste.map((k) => [k.id, k]));
    const kapali = { ...(onceki?.kapali ?? {}) };
    const yeniDusen = [];
    const hatirlat = [];
    const duzelen = [];

    for (const s of sonuclar) {
        const eski = kapali[s.id];
        if (!s.ok && !eski) {
            kapali[s.id] = { since: simdi, sonUyari: simdi };
            yeniDusen.push(s);
        } else if (!s.ok && simdi - eski.sonUyari >= HATIRLAT_MS) {
            kapali[s.id] = { ...eski, sonUyari: simdi };
            hatirlat.push({ ...s, since: eski.since });
        } else if (s.ok && eski) {
            delete kapali[s.id];
            duzelen.push({ ...s, since: eski.since });
        }
    }

    const bildirimler = [];
    if (yeniDusen.length) bildirimler.push(dusmeBildirimi(yeniDusen, ad, simdi));
    if (hatirlat.length) bildirimler.push(hatirlatmaBildirimi(hatirlat, ad, simdi));
    if (duzelen.length) bildirimler.push(duzelmeBildirimi(duzelen, ad, simdi));

    return {
        sonraki: { ...onceki, kapali },
        bildirimler,
        degisti: yeniDusen.length + hatirlat.length + duzelen.length > 0,
    };
}

/** Kurulum mesajı ve her sabahki "izleme yaşıyor" mesajı — ikisi de SESSİZ. */
export function ozet(tur, sonuclar, kapali, simdi, liste) {
    const ad = Object.fromEntries(liste.map((k) => [k.id, k]));
    const ayakta = sonuclar.filter((s) => s.ok).length;
    const n = sonuclar.length;
    const dusen = sonuclar.filter((s) => !s.ok)
        .map((s) => [null, `• ${ad[s.id].ad}: ${kapali[s.id] ? `kapalı (${sure(simdi - kapali[s.id].since)}, başladı ${saat(kapali[s.id].since)})` : s.ayrinti}`]);
    const hepsi = 'Giriş, veritabanı, personel servisi, masaüstü ve site ayakta.'
        + (sonuclar.some((s) => s.id === 'dodo') ? ' Dodo bildirim ucu açık.' : '');
    const title = tur === 'basladi'
        ? `İzleme başladı · ${ayakta}/${n} ayakta`
        : dusen.length ? `Sabah durumu · ${ayakta}/${n} ayakta` : `Her şey çalışıyor · ${n}/${n}`;
    const son = tur === 'basladi'
        ? "Bundan sonra yalnız bir şey bozulunca ve her sabah 09:00'da sessizce haber verir."
        : "Bu mesaj her sabah 09:00'da sessizce gelir; gelmediği gün izlemenin kendisi durmuştur.";
    return {
        title,
        ...govde(dusen.length ? [...dusen, [null, son]] : [[null, `${hepsi} ${son}`]]),
        priority: ONCELIK.sessiz,
        tags: dusen.length ? ['warning'] : ['white_check_mark'],
    };
}

/**
 * ntfy konu adı biçimi. 2026-10-17 kurulumunda konu panodan (pbpaste)
 * okunuyordu; komutu kopyalamak panoyu ezdi ve konu yerine komut metni gitti
 * (ntfy: 400 "topic invalid"). Biçim baştan denetlenir, sessizce düşmez.
 */
export const KONU_BICIMI = /^[-_A-Za-z0-9]{1,64}$/;

/**
 * Pushover önceliği. Düşüş = acil (2): onaylanana dek 5 dk'da bir yeniden
 * çalar, en çok 1 saat; telefonda "Critical Alerts" açıksa sessiz modu da
 * deler. Hatırlatma yüksek (1), düzelme normal (0), sabah mesajı sessiz (-1).
 */
export function pushoverOnceligi(p) {
    if (p >= 5) return 2;
    if (p === 4) return 1;
    if (p <= 2) return -1;
    return 0;
}

const SIMGE = { rotating_light: '🔴', white_check_mark: '✅', warning: '⚠️', test_tube: '🧪' };
const simgeli = (b) => {
    const simge = (b.tags ?? []).map((t) => SIMGE[t]).find(Boolean);
    return simge ? `${simge} ${b.title}` : b.title;
};

/**
 * Asıl kanal (2026-10-17). ntfy.sh ücretsiz sürümü Cloudflare'in PAYLAŞILAN
 * çıkış adreslerinden gelen alarmı 429 ile reddetti — ücretsiz hesap jetonu
 * da çözmedi (ntfy `visitorID`: kullanıcı kimliği yalnız ücretli hesapta).
 * Pushover'ın sınırı kullanıcı başına (ayda 10.000), adrese bakmıyor.
 */
function pushover(b, env, fetchImpl) {
    const oncelik = pushoverOnceligi(b.priority ?? 3);
    const form = new URLSearchParams({
        token: env.PUSHOVER_TOKEN,
        user: env.PUSHOVER_USER,
        title: simgeli(b),
        message: b.html ?? b.message,
        priority: String(oncelik),
    });
    if (b.html) form.set('html', '1');
    if (oncelik === 2) {
        form.set('retry', '300');
        form.set('expire', '3600');
    }
    return fetchImpl('https://api.pushover.net/1/messages.json', {
        method: 'POST', body: form, signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
}

/** Yedek kanal: ntfy (geçebildiği zaman ikinci bildirim). JSON: başlıkta Türkçe sorun çıkmasın. */
function ntfy(b, env, fetchImpl) {
    return fetchImpl(env.NTFY_SERVER || 'https://ntfy.sh', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(env.NTFY_TOKEN ? { authorization: `Bearer ${env.NTFY_TOKEN}` } : {}),
        },
        body: JSON.stringify({ topic: env.NTFY_TOPIC, title: b.title, message: b.message, priority: b.priority, tags: b.tags }),
        signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
    });
}

/** Ayarlı kanallar, öncelik sırasıyla. */
export function kanallar(env) {
    const liste = [];
    if (env.PUSHOVER_TOKEN && env.PUSHOVER_USER) liste.push({ ad: 'pushover', gonder: pushover });
    if (env.NTFY_TOPIC && KONU_BICIMI.test(env.NTFY_TOPIC)) liste.push({ ad: 'ntfy', gonder: ntfy });
    return liste;
}

/**
 * Bildirimi bütün kanallara gönderir; EN AZ BİRİ iletirse gönderilmiş sayılır.
 * "Hepsi" şartı olsaydı ntfy'nin 429'u yüzünden Pushover her turda aynı
 * alarmı yeniden çalardı.
 */
export async function gonder(bildirim, env, fetchImpl) {
    let iletildi = false;
    for (const kanal of kanallar(env)) {
        try {
            const res = await kanal.gonder(bildirim, env, fetchImpl);
            if (res.ok) iletildi = true;
            else console.error(`izleme: ${kanal.ad} HTTP ${res.status}`);
        } catch (e) {
            console.error(`izleme: ${kanal.ad} ulaşılamadı (${e?.name ?? 'hata'})`);
        }
    }
    return iletildi;
}

/**
 * Bir tur: kontrol et → karar ver → bildir → (gerekirse) durumu yaz.
 * Bildirim gidemezse durum YAZILMAZ: bir sonraki tur aynı düşüşü yeniden
 * görür ve tekrar dener. Aksi hâlde "uyarıldı" sanılıp susulurdu.
 */
export async function calistir({ zaman, env, fetchImpl, uyu = uyku }) {
    if (env.NTFY_TOPIC && !KONU_BICIMI.test(env.NTFY_TOPIC)) {
        console.error('izleme: NTFY_TOPIC bir konu adı değil (yalnız harf, rakam, - ve _) — ntfy kanalı kapalı');
    }
    if (!env.SUPABASE_ANON_KEY || kanallar(env).length === 0) {
        console.error('izleme: SUPABASE_ANON_KEY ya da bildirim kanalı (PUSHOVER_TOKEN + PUSHOVER_USER / NTFY_TOPIC) eksik — tur atlandı');
        return { atlandi: true };
    }
    const liste = kontroller(env);
    const onceki = (await env.DURUM.get('durum', 'json')) ?? { basladi: null, kapali: {} };
    const tumu = await Promise.all(liste.filter((k) => siraGeldiMi(k, zaman)).map((k) => denetle(k, fetchImpl, uyu)));
    // Cevabı belirsiz olan (Dodo'nun kendi kesintisi) bu tur hiç sayılmaz:
    // ne düşüş ne düzelme — durum bir sonraki net cevaba kadar aynı kalır.
    const sonuclar = tumu.filter((s) => !s.bilinmiyor);
    const { sonraki, bildirimler, degisti } = karar(onceki, sonuclar, zaman, liste);

    let yaz = degisti;
    if (!onceki.basladi) {
        bildirimler.push(ozet('basladi', sonuclar, sonraki.kapali, zaman, liste));
        sonraki.basladi = new Date(zaman).toISOString();
        yaz = true;
    } else if (sabahMi(zaman)) {
        bildirimler.push(ozet('sabah', sonuclar, sonraki.kapali, zaman, liste));
    }

    let hepsiGitti = true;
    for (const b of bildirimler) {
        if (!(await gonder(b, env, fetchImpl))) hepsiGitti = false;
    }
    if (yaz && hepsiGitti) await env.DURUM.put('durum', JSON.stringify(sonraki));

    console.log(tumu.map((s) => `${s.id} ${s.ok ? 'ok' : s.bilinmiyor ? `BİLİNMİYOR (${s.ayrinti})` : `KAPALI (${s.ayrinti})`} ${s.ms}ms`).join(' · ')
        + (hepsiGitti ? '' : ' · BİLDİRİM GİDEMEDİ'));
    return { sonuclar, bildirimler, yazildi: yaz && hepsiGitti };
}
