# Devir 16 · Canlıya geçiş (açılış günü)

**Karar (kullanıcı, 2026-10-22):** testler biter bitmez canlıya geçilir —
saat ve gün fark etmez. Bu belge o anın tek sırası. Her komut kullanıcının
Terminal panelinde, onayıyla. Kod hazır; açılış günü yalnız komut çalışır.

**Ön koşul (testler, Dodo TEST):** yeni fiyatlarla uçtan uca alım (tek
çalışanlı işletme Tek kişilik alır, iki çalışanlıda kart pasif) ·
masaüstünden yeni kayıt "7 gün ücretsiz dene" görüyor (devir 14 §1.A).
✅ Ekip yıllık sayfası telefonda TRY 12,990.00 / yıl, vergi dahil
(2026-10-22 01:28). ✅ Test 1 (2026-10-22, işletme `6e206ea8…`, masaüstü
yeni kayıt): Ayarlar "Aktif aboneliğiniz yok", iki personelde Tek kişilik
pasif; birini pasif yapınca alım → Dodo `subscription.active` + ₺0
`payment.succeeded` + `updated`, üçü `applied`, ürün yeni haritada (Ekip
aylık `pdt_0NqFJdmgjgV9efKcXBYaE`), deneme 7 gün (Dodo 29 Eki; aynada +3 gün
tolerans → 1 Kas, bilerek). KUSUR bulundu ve kodda düzeltildi (deploy
bekliyor): ilk alım her zaman `/kurulum`'a dönüyordu (onaysız sihirbaz 1.
adım) ve `/settings?tab=billing` yönlenirken `checkout=success` düşüyordu —
`tests/odeme-donusu.test.mjs`. Apple Pay TEST kipinde görünmedi — Dodo belgesi ödeme
yöntemlerini "hesap doğrulanıp canlı kip açılınca" sayıyor; deneme açılışta,
adım 9'da (Safari + Cüzdan'da kart).

## 0 · Kullanıcının elle yaptığı (5 dk)

1. **Canlı API anahtarı:** Dodo → sol altta **Canlı Mod** → Geliştirici →
   API Keys → yeni anahtar, ad `Luera TimeFlow`, **yazma yetkisi AÇIK**.
   Önce bu komutu çalıştır, soru gelince anahtarı **soruya** yapıştır:
   `read -rs "K?Dodo canlı API anahtarı: " && echo && printf 'DODO_API_KEY=%s\n' "$K" > ~/.luera-dodo-canli.env && chmod 600 ~/.luera-dodo-canli.env && unset K && echo yazildi`
2. **İzleme anahtarı (salt okunur):** aynı yerde ikinci anahtar, ad
   `Luera İzleme`, **yazma yetkisi KAPALI** → `~/.luera-izleme.env`'deki
   `DODO_READONLY_KEY` satırı bununla değişir (ops/izleme/README.md "Dodo
   ucu" adım 2; eski test satırını sil).

Webhook'u panelde AÇMA, sırrını KOPYALAMA: betik açar ve okur.

## 1 · Sıra

**Durum (2026-10-23 01:05):** Faz 4 testleri bitti (devir 15). Adım 1 ✅
(sırlar TEST'te, 8 ayna satırı, satırsız 2 işletme). Adım 2 ✅ kullanıcı
kararı: iç hesaplar süresiz Ekip hediye — furkanhasan@luera.ai (`4795b1ce`),
nisanur@luera.ai (`ad8d9dc9`); satırsız iki işletme de bizim (kullanıcı) →
onlara da süresiz Ekip: "Fu Ni" hsnulgr@gmail.com (`8418f10d`), "Nisa Özer"
ozern8102@gmail.com (`15a7e5d2`). Adım 3 kuru koşu artık 0 satır — kimse
açılış denemesi almıyor; adım 12'den HEMEN önce kuru koşu bir kez daha
(arada açılan işletme olursa). Adım 4 ✅ canlı anahtar geçerli (65 kr.).
**Adım 5–7 ✅ (2026-10-23 ~01:30): sunucu CANLI Dodo'da**; canlı uç
`ep_3L4LAW7OakIm2XlctJN6crgZmTE` (12 olay); test değerleri `DODO_TEST_*`'ta.
Canlı ürünler (vergi `saas`, marka hesabın varsayılanı "Luera"):
baslangic `pdt_0NqJvbY0I5WdijfmHOtrJ` / `pdt_0NqJvbejIWLTNteGU1pnn`, pro
`pdt_0NqJvbjWwt6kdrEl1saCC` / `pdt_0NqJvbnAs2xcgdfTE8okl`, isletme
`pdt_0NqJvbqo0GSv0W8F5nY9n` / `pdt_0NqJvbw3b2Ux5Mu1GwDe2` (aylık / yıllık);
eski harita `DODO_PRODUCT_MAP_ONCEKI`'de. Adım 8 ✅ canlı ödeme sayfası
"Luera · TimeFlow - Tek kişilik · Aylık · TRY 799.00 / ay, satış vergisi
dahil", test işareti yok. Adım 10 ✅ izleme canlıda (`wrangler.toml` live,
salt okunur canlı anahtar; yerel `dene.mjs` 6/6 ✓, sürüm `fc467b7f`).
Adım 9 ✅ gerçek kart (hsnulgr+canli@gmail.com, Tek kişilik aylık):
bugün TRY 0.00, deneme 29 Eki; ayna `trial · baslangic` (canlı
`subscription.updated` imzası geçti, 01:40); kullanıcı deneme içinde iptal
etti (01:48, "dönem sonunda sona erecek"). Apple Pay iPhone Safari'de YOK
(yalnız Kart) — sonraya: Dodo Ayarlar › Ödeme Yöntemleri + Cüzdan kartı,
olmazsa Dodo desteğine TRY/Türkiye. Adım 11 ✅ kuru 0 → `eposta.sh ac`
(ABONELIK_EPOSTA = true, ~02:10). Adım 12 öncesi: açılış denemesi kuru 0,
11 ayna satırının hepsi `enforce_acilsa = t`, satırsız işletme 0.
**Adım 12 ✅ KİLİT AÇIK (2026-10-23 ~02:25):** önce Coolify
`VITE_ENTITLEMENT_ENFORCE=true` (build değişkeni) + Deploy → canlı paket
`index-OIiszaBy.js`'de `"true".trim()==="true"`; sonra
`app_secrets.ENTITLEMENT_ENFORCE = 'true'` → `has_timeflow_access` false
dönen işletme 0. **Adım 13 ✅** lueratech.com fiyat tablosu (Framer
bileşeni Pricing/Comparison table, sürüm `3f1ae8439`): Tek kişilik ₺799 /
Ekip ₺1.299 / İşletme ₺1.999, yıllıkta ₺666 / ₺1.083 / ₺1.666 + "Yılda
tek ödeme", "2 ay bedava", özellikler plans.ts'den ("yakında" satırları
kalktı); canlıda doğrulandı. Eski değerler
`~/Downloads/luera-site-gorseller/fiyat-2026-10-yedek.json`. "Planı seç"
düğmeleri ÖDEME ÖNCE (kullanıcı kararı: kayıt ekranı yok, "panel hemen
açılsın"; `e26730e`, göç 127, Framer sürümü `7b6ade06e`):
`timeflow.lueratech.com/satin-al?plan=<id>&cycle=<monthly|yearly>` →
doğrudan Dodo (7 gün) → `/hosgeldin` → hesap Dodo e-postasıyla kendiliğinden
açılır, tek kullanımlık jetonla şifresiz giriş → kurulum ya da ana sayfa.
E-postanın hesabı varsa abonelik ona eklenir, giriş istenir; oturumu olan
`/abonelik?plan=…` yoluna gider. Canlıda 24 düğme denetlendi (aylık + yıllık),
`/satin-al` Dodo'yu açtı (ödeme yok). Önceki sürüm `763f3eb7f` kayıt ekranına
(`/login?mode=signup…`) gidiyordu. **Uçtan uca gerçek kart ✅ (11:39–11:46):**
gizli pencere, site → Ekip · Yıllık → Dodo (hsnulgr+satinal@gmail.com, bugün
₺0) → `/hosgeldin` → şifresiz giriş → kurulum + "Denemeniz başladı". Talep
`a29551d1` bağlandı 11:41:40 (`user_created` t, damga doğru), giriş jetonu
11:41:45, ayna `trial · pro · yearly` (bitiş 2 Kas = sonraki tahsilat + 3 gün
tolerans). Bildirimler: 3 × subscription `applied`; ₺0 `payment.succeeded`
aynı saniyede geldiği için `no_org` — zararsız (denemede ödeme bildirimi
aynayı değiştirmez; sonraki tahsilatlar `dodo_subscription_id` ile bulunur).
Kullanıcı Ayarlar › Abonelik'ten iptal etti → `subscription.updated`
`applied`, `cancel_at_period_end` t (11:45:51). Hesabın bilinen şifresi yok:
sonradan "Şifremi unuttum" (hoş geldin e-postasına bağlantı = sonraya).
Kullanılmamış iki talep (`618d0455`, `0220a85c`) Claude'un denemeleri, 2
günde düşer. Öbür modüllerin "Bilgi alın" düğmeleri
/contact'ta AÇIKÇA sabit (miras alıyorlardı — DERS: replikada ana varyantla
aynı değeri SET etmek geçersiz kalır, önce ana değişmeli). **Adım 14 ✅
ilk gün (2026-10-24 00:30 TR, hepsi salt okunur):** e-posta anahtarı açık,
Dodo CANLI, tarama 15 dk'da bir `mod=gercek`, hata 0; açılıştan beri vadesi
gelen e-posta yok (defterde yalnız 21 Eki'nin `uc_gun` denemesi).
`kontrol-oku.sql`: 8 sır tam, 12 işletmenin 12'sinde ayna satırı, kilitli 0
(gerçek müşteri henüz yok: iç, test, demo). Açılıştan beri 5 Dodo bildirimi,
hepsi işlendi (tek `no_org` = deneme ₺0 ödemesi, yukarıda). Core kopyası 22
olayın 22'si (3'ü bir yeniden denemeyle; 01:40'taki `subscriptions_active_unique`
hatası kendiliğinden geçti). Fonksiyon günlüğü 24 saat: dodo-webhook /
dodo-satin-al / dodo-checkout / abonelik-eposta hata 0; açılış saatinde
02:17'de iki "Kartı güncelle" 404'ü — test aboneliği canlı Dodo'da yok,
beklenen. Dış izleme `dene.mjs` 6/6 ✓ (çalışma kopyasından koşunca
`giris` 401 verir: orada `mobile/.env` yok — ana klasörden koş). **Test
abonelikli dört iç hesap → süresiz Ekip hediye (kullanıcı, 2026-10-24
00:49):** s6bdnhtckh@privaterelay.appleid.com (`7552d6c1`, eski
`sub_0NqFDk3OyGaepfj7wMdUT`), furkanhasanulger@icloud.com (`6e206ea8`,
`sub_0NqJ9kuMHie2DEl2cRopc`), furkan.ulger@icloud.com (`d0accc3e`,
`sub_0NqJYs7XquYNPJPWZ2Oas`), furkan@luera.ai (`108fa88a`,
`sub_0Nq6pIgpSbpoBlj0OqLIQ`). 31 Eki – 23 Kas arası kilitleneceklerdi (test
kipi aboneliği, canlı Dodo tanımaz). `hediye.sh` süren Dodo aboneliği
gördüğü için reddederdi → tek seferlik betik (kuru → `-v uygula=1`): aynı
yazım + `dodo_*` ve planlanan değişiklik alanları NULL; koruma: aboneliğin
son olayı canlıya geçişten (01:30) önce ve sonrasında bildirim yok. Kuru ve
gerçek dört korumayı da geçti; `hediye.sh liste` 8 hediye. Dodo TEST'teki
abonelikler orada sürer (sahte para; bildirimleri canlı sırla reddedilir).
Ödeme sayfası TimeFlow turuncusunda ✅
(`87f3b5f`, dodo-checkout yüklü, md5 eşleşti): `customization.theme_config`
light/dark → `button_primary #FF5A1F`, yazı `#0E0E0E`, odak çerçevesi
turuncu; canlı Dodo'da denendi. Düğme form dolunca turuncuya döner (boşken
Dodo'nun gri "ikincil" hali). Doğrudan /buy bağlantısı yeşil kalır. Test kalıntıları (furkanhasanulger@icloud.com,
furkan.ulger@icloud.com, Apple relay hesabı, furkan@luera.ai) TEST Dodo
aboneliğiyle bitişlerine kadar açık (§3).

| # | Komut | Ne görmeli |
|---|---|---|
| 1 | `ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ops/abonelik/kontrol-oku.sql` | Kim kilitlenir; iç hesaplar |
| 2 | İç hesaplar: `ops/abonelik/hediye.sh ver <e-posta> 0 pro` (karar: devir 14 §1.B) | `hediye.sh liste`'de görünür |
| 3 | `acilis-deneme.sql` kuru, sonra `-v uygula=1` (komut dosyanın başında) | Satırsız işletmelere açılıştan 7 gün |
| 4 | `node ops/abonelik/dodo-canli.mjs hazirla` | `Canlı anahtar: geçerli` · `Canlı uç: AÇILACAK` · KURU |
| 5 | `node ops/abonelik/dodo-canli.mjs gec` | `✓ Sunucu CANLI Dodo'ya bağlı` |
| 6 | HEMEN `node ops/abonelik/dodo-urun.mjs olustur uygula canli` | 6 × ✓, "Altısı Dodo'da, tutarlar doğru" |
| 7 | HEMEN `node ops/abonelik/dodo-urun.mjs harita uygula canli` | `✓ DODO_PRODUCT_MAP yazıldı` |
| 8 | Canlı ödeme sayfası: `https://checkout.dodopayments.com/buy/<baslangic_monthly canlı kimliği>?quantity=1` (açılmazsa Dodo panelinde ürünün bağlantısı) | "TimeFlow - Tek kişilik · Aylık TRY 799.00", vergi dahil — ÖDEME YAPMA |
| 9 | Gerçek kartla tek deneme (önerilir): yeni bir işletmede Tek kişilik → 7 gün deneme, bugün ₺0 → Ayarlar'da "Deneme" → deneme içinde iptal. Aynı sayfayı iPhone **Safari**'de aç (Cüzdan'da kart olan telefon), ülke Türkiye: **Apple Pay** düğmesi var mı | `dodo_events`'te canlı `subscription.active` `applied` — canlı webhook imzası çalışıyor · Apple Pay görünüyor |
| 10 | İzleme: `ops/izleme/wrangler.toml` → `DODO_API_BASE = "https://live.dodopayments.com"` (Claude değiştirir) → `ops/izleme`'de `npx wrangler@4.147.0 secret bulk ~/.luera-izleme.env && npx wrangler@4.147.0 deploy` → `node ops/izleme/dene.mjs` | `✓ dodo` |
| 11 | `ops/abonelik/eposta.sh kuru` → `ops/abonelik/eposta.sh ac` | Kime ne gideceği; sonra `ABONELIK_EPOSTA = true` |
| 12 | ENFORCE: `app_secrets.ENTITLEMENT_ENFORCE = 'true'` + Coolify env `VITE_ENTITLEMENT_ENFORCE=true` → **Deploy** (Restart DEĞİL) | Denemesi/aboneliği olmayan salon `/abonelik` duvarına düşer |
| 13 | lueratech.com (Framer) fiyatları 799 / 1.299 / 1.999 · "Planı seç" → `/satin-al` | Düğme doğrudan Dodo'yu açar |
| 14 | İlk saat: `eposta.sh durum` · `kontrol-oku.sql` · dış izleme ✅ 2026-10-24 | Webhook hatası %0, beklenmeyen kilit yok |

5 ile 7 arasında ödeme sayfası çalışmaz (harita test ürünlerini gösterir,
canlı Dodo onları tanımaz) — ENFORCE kapalıyken zararsız, ama 6 ve 7
beklemeden. Adım 9'un tek ücreti yok: ilk alım 7 gün denemeli, iptal deneme
içinde.

## 2 · Geri alma

| Sorun | Komut |
|---|---|
| Canlı Dodo'da bir şey ters (ödeme, webhook) | `node ops/abonelik/dodo-canli.mjs geri` — adres, anahtar, sır VE harita test değerlerine döner (`DODO_TEST_*` yedeği; `gec` canlıyken yedeği ezmez) |
| Yalnız harita | `node ops/abonelik/dodo-urun.mjs harita geri` |
| Kilit yanlış | `update app_secrets set value = 'false' where key = 'ENTITLEMENT_ENFORCE';` + Coolify env false → Deploy |
| E-postalar | `ops/abonelik/eposta.sh kapa` |

`dodo-canli.mjs durum` her an: adres, sır uzunlukları, yedek var mı, ENFORCE,
e-posta anahtarı.

## 3 · Bilinenler

- **Deneme suistimali (yeni e-postayla tekrar tekrar 7 gün) — EN SONA
  BIRAKILDI (kullanıcı, 2026-10-22).** Bugünkü engel: deneme bitince kilit
  (ENFORCE, adım 12) + yeni hesap boş başlar. Konuşulacak seçenekler: aynı
  kartla ikinci deneme yok (Dodo'da kart izi yok; son 4 + ağ + son kullanma +
  sahip) · aynı telefondan ikinci deneme yok (Apple DeviceCheck, 1.0.2) ·
  telefonda da kartlı deneme.

- Test abonelikleri (Test Salon 3, furkan@luera.ai, 7552d6c1…) aynada
  bitiş tarihine kadar erişimli kalır; canlı Dodo onları tanımaz (kod
  `missing` sayar). Test kipindeki yenilemeleri artık canlı sırla
  imzalanmadığı için reddedilir — beklenen.
- Canlıdaki eski 6 ürün ($10/$30/$75) haritada değil; satılmaz. Arşivlemek
  isteğe bağlı (panel).
- Dodo hesabı "Bireysel" doğrulandı: ödemeler şahsa — vergi tarafı
  kullanıcının (mali müşavir).
- Betikler: `ops/abonelik/dodo-canli.mjs` (anahtar, uç, sır, yedek) ·
  `ops/abonelik/dodo-urun.mjs` (ürün, harita). Testler
  `tests/dodo-canli.test.mjs` (sahte Dodo + PGlite'ta gerçek SQL: açılış
  provası, ikinci geçiş yedeği ezmez, reddedilen anahtar hiçbir şey yazmaz,
  sır hiçbir argv'ye çıkmaz) — korumalar tek tek sökülünce düşüyor.
