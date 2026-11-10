# Devir 14 · Neler kaldı (2026-10-21 sabah · §0 2026-11-10)

Bütün açık işlerin tek listesi. Kaynaklar: devir 10 §11 (abonelik açılışı),
devir 13 §8 (e-posta denemeleri), `docs/yapilacaklar.md` (en son 2026-10-20
gece güncellendi; birkaç maddenin durumu değişmiş olabilir — çelişkide
buradaki ve devir 10/13 kazanır).

## 0 · Güncel sıra (2026-11-04)

> §1–§5 21 Ekim'de, açılıştan ÖNCE yazıldı. Açılış 23 Ekim'de yapıldı (Dodo
> Live, ENFORCE ve abonelik e-postaları AÇIK); §1'in çoğu artık geçmişte.
> Çelişkide bu bölüm kazanır.

1. ✅ **"Müşteriler nereden geliyor?" (Kaynak Defteri, Aşama 1) — CANLIDA
   2026-11-10** (main `e38db4f`). Göç 135 canlıda (önce ROLLBACK'li kuru
   koşu), `public-booking` yüklendi, Coolify Deploy yapıldı; canlı pakette
   panel ve çipler doğrulandı. Kalan: canlıda gerçek bir izli randevuyla
   (`/book/<slug>?n=instagram`) Analiz panelinde satırın çıktığını görmek.
   Plan: `~/.claude/plans/enumerated-squishing-breeze.md`.

   **Dal toplaması (2026-11-10):** `tek-kisilik` dalındaki her şey main'e
   taşındı — müşteri sayfaları (`ae61080`), tek kişilik düzeltmesi · göç 141
   (`ca81984`), Kaynak Defteri. Ana klasör artık `main`'de. **`tek-kisilik`
   dalı EMEKLİ**: silinmedi, üstüne iş yapılmaz; yeni iş main'den açılır.

   ⚠️ **Fonksiyon yükleme dersi:** `scripts/deploy-functions.sh` çalıştığı
   klasörün `_shared`'ını `--delete` ile eşitler. Klasör main'de değilse
   (eski dal) canlı `_shared` geriye düşer ve WhatsApp bozulur. Yüklemeden
   önce `git branch --show-current` → `main` olmalı.
2. **WhatsApp günü — Cuma 6 Kasım.** Ön koşul: Claude kredisi + bot için ayrı
   numara (kişisel numara iki kez düştü). O güne kadar WhatsApp'a dokunulmaz.
3. **Google Play'e yayın** (kullanıcı, 2026-11-04) — Türkiye'de telefonların
   çoğu Android. Temel hazır: paket adı `ai.luera.timeflow`, Android ikonu,
   Google girişi Android'i biliyor, Apple düğmesi Android'de gizli. Eksikler:
   - Google Play Console geliştirici hesabı (tek seferlik 25 $). Şirket yok →
     kişisel hesap. Google'ın kişisel hesap kuralı: üretime çıkmadan önce en
     az 12 test kullanıcısıyla 14 gün kapalı test (başlarken güncel kuralı
     teyit et). Bu süre yüzünden hesap ERKEN açılmalı.
   - Android bildirimleri için Firebase (FCM) anahtarı → Expo'ya yüklenir.
   - Google girişi için Android istemcisi (Play imza anahtarının SHA-1'iyle,
     Google Cloud'da).
   - Mağaza sayfası: açıklama, ekran görüntüleri, "Veri güvenliği" formu,
     gizlilik bağlantısı. Fiyat / plan / "web'den abone olun" geçmez (App
     Store'daki kuralın aynısı).
   - `eas.json`'a Android gönderim ayarı. `--no-dev` üretim paketi denemesi
     ZORUNLU (dinamik import dersi).
   - Bilinen sınır: Apple ile kaydolmuş kullanıcı Android'de Apple ile
     giremez.
   - **PLAN OLUŞTURULACAK** (bkz. madde 9).
4. **Kartvizit** (kullanıcı, 2026-11-04) — basılı kartvizit. Karar
   bekleyenler: hangi marka öne (Luera mı, TimeFlow mu — sitede ajans önde,
   TimeFlow onun ilk ürünü), ad / unvan, telefon, `info@lueratech.com`,
   `lueratech.com`, QR (siteye ya da indirme sayfasına). Tasarım → baskı.
   Pilot salon ziyaretlerinden önce hazır olmalı.
5. ✅ **Planla ile kıyas — YAPILDI 2026-11-04** → `docs/rakip/planla-2026-11-04.md`
   (asıl site planla.co; deneme hesabı içeriden gezildi). Öne çıkan: Planla
   randevu sayısına göre fiyatlıyor (100/300/sınırsız → 1.190/1.690/2.690,
   yıllıkta indirim yok); 3 kişilik salonda TimeFlow belirgin ucuz. Onlardan
   alınacak ilk fikir: hizmete özel "randevu öncesi" notu (lazer niş). Sırada
   aynı yöntemle: RandevuNet, SalonAppy, Kolay Randevu, Fresha.
6. **3 pilot salon** (büyüme planı, onay bekliyor) — kartvizit ve Planla
   kıyası bunun hazırlığı.
7. **Pushover ~16 Kasım** — 4,99 $ alınmazsa sabah 09:00 alarmı susar.
8. ✅ `booking-manage` yüklemesi — YAPILDI 2026-11-10 (müşteri randevu
   yönetim sayfasının logo / telefon / harita düğmeleri; ayar sahibin
   satırından okunmaya devam ediyor).
9. **Planla'dan çıkan eksikler — her biri için PLAN OLUŞTURULACAK
   (kullanıcı, 2026-11-04).** Kod yok; önerilen sırayla, planın cevaplayacağı
   sorular:
   1. **Hizmete özel "randevu öncesi" notu** — hizmet ayarında isteğe bağlı
      alan ("lazerden 1 gün önce tıraş olun"), WhatsApp onay mesajına eklenir.
      Plan: hangi mesajlara eklenir (onay, 24 saat hatırlatması); masaüstü +
      telefon hizmet formu; uzunluk sınırı.
   2. **Google Play** — bkz. madde 3. Plan: Play Console hesabı (12 test
      kullanıcısı × 14 gün), FCM, Android Google girişi, mağaza sayfası.
   3. **Destek erişimi** — Ayarlar'da "Luera ekibine süreli erişim ver"
      anahtarı. Plan: süre sınırı, kim ne yaptı kaydı, salonun erişimi geri
      alması. Pilot salonlardan ÖNCE.
   4. **Google/Apple takvim bağlantısı** — yalnız tek yönlü (personelin
      telefon takvimine abonelik bağlantısı); iki yönlü eşitleme YOK. Düşük
      öncelik.
   5. **Şube** — öneri: şimdi değil; çok şubeli ödeyen müşteri gelince (§5,
      hafıza `timeflow_sube_deferred`). Plan o gün yapılır.
   6. **Pazar yeri + sadakat** — öneri: yapılmayacak. Ayrı ürün işi ve
      "müşteri sizin" vaadine ters. Sadakat puanı ileride küçük bir ek olarak
      konuşulabilir.

   Kural: yeni özellik takvim / randevu penceresi / kasa ekranlarına alan
   EKLEMEZ; Ayarlar'da açılıp kapanır (Planla'nın "özellik anahtarı" fikri).
10. **Görünürlük ve büyüme (kullanıcı, 2026-11-04)** → ayrıntı, taslaklar ve
    açık sorular: `docs/buyume/2026-11-04-gorunurluk.md`.
    - **Google Play** — madde 3 ve 9.2.
    - **LinkedIn** — kişisel profil "Luera Kurucusu" + Luera şirket sayfası.
      Hesabı kullanıcı açar; metin taslakları hazır. Beklenen: şehir,
      başlama tarihi, dil, ekip.
    - **Instagram + Meta reklamı (tek iş), tam otonom "ajans gibi"** —
      kullanıcı yalnız kontrol eder: bütçe tavanı ve yeni harcama onayı
      kullanıcıda, geri kalanı sistemde. Tam otomasyon için Meta işletme
      doğrulaması → şirket gerekir; o güne kadar Claude hazırlar, kullanıcı
      yayımlar. Cevap bekleyen: kimin reklamı (Luera mı, salonlar mı), aylık
      test bütçesi, tıklayan nereye gider, pilot sırası.
    - **Blog: her gün yazı (SEO + GEO)** — lueratech.com içinde; 30 günlük
      konu takvimi → günlük otomatik taslak → haftalık toplu onay → günde bir
      yayın; seri boş içerik YOK. Kullanıcı: Search Console + Framer izni.
    - **YouTube** — sonra konuşulacak.

---

**Bugünün gerçeği (21 Ekim):** abonelik e-postaları + sihirli bağlantı CANLIDA, gönderim
anahtarı (`ABONELIK_EPOSTA`) KAPALI → tarama kuru. ENFORCE KAPALI. Dodo TEST
kipinde. Dal `tek-kisilik`, son commit `6a115d1` (push yok). Yerel denetim:
`npm test` 3347 / 0 hata, `tsc` temiz.

**Önerilen sıradaki adım (21 Ekim):** §1.A'nın ilk maddesi — ödeme alınamayan salon
akışı. Açılıştan önce doğrulanmamış en riskli akış.

## 1 · Abonelik — açılışa kadar (sırayla)

### A · Denenmemiş akışlar (Dodo TEST, test kartıyla; kullanıcıyla)
1. ✅ **Ödeme alınamayan salon — DENENDİ (2026-10-21 23:04–23:21 TR,
   Test Salon 3 / LOU, `sub_0NqAkdNmfOq9iAjyV0OP0`):** web "Kartı güncelle"
   → Dodo'nun yenilemede reddedilen test kartı `4000 0000 0000 0341` (₺0
   doğrulama geçti) → Dodo panelinde "Sonraki fatura tarihi" 20:16 UTC →
   TRY 599 **Başarısız** → Dodo doğrudan **on_hold** (past_due'ya uğramadı,
   `past_due_ends_at: null`) → webhook teslim → ayna ek süre, Dodo son gün
   vermediği için kendi 2 günü (23 Eki 23:16). `eposta.sh dene … odeme` →
   e-posta geldi ("Son ödemeniz alınamadı · LOU için … · son gün 23 Ekim
   Cuma 23:16 · Kartımı güncelle", yanıt info@) → düğme → telefonda girişsiz
   "Ödemeniz alınamadı · 1 gün 23 saat" → "Kartı güncelle" → 4242 → Dodo
   **borcu HEMEN çekti** (TRY 599 Başarılı, 20:21) → abonelik **Aktif**,
   sonraki 21 Kas; olaylar update_payment_method · updated · payment.succeeded
   · active · renewed, uç %0 hata. Telefon bildirimi: Expo Go'da gözlenmedi
   (kayıt bakılmadı). Dönüş ekranı (`kaynak=eposta&kart=1`) görüntüsü
   alınmadı.
2. ✅ **E-postadan paket alma — DENENDİ (2026-10-21 23:49–23:57 TR):** Apple ile
   ("E-postamı gizle") telefondan yeni işletme `7552d6c1…` → `dene uc_gun` → düğme → plan →
   test kartı → "Denemeniz başladı"; Dodo `payment.succeeded` ₺0 · `subscription.active`
   applied → deneme · Pro · aylık, bitiş 28 Ekim. Teyit bekleyen tek nokta: dönüş
   ekranında Kurulum/uygulama düğmesi olmadığı. Eski metin: telefondan YENİ bir işletme aç
   (kartsız deneme; Test Salon 3 artık Dodo'da) → `dene uc_gun` → düğme →
   plan seç → test kartı → dönüş `/abonelik?checkout=success&kaynak=eposta`
   → "Denemeniz başladı" fişi, Kurulum/uygulama düğmesi YOK.
3. ✅ **Apple gizli adres — DENENDİ (2026-10-21 23:53 TR):** `…@privaterelay.appleid.com`
   alıcıya `dene uc_gun` → defterde `gonderildi`, e-posta gelen kutusuna ULAŞTI. Eski metin:
   Apple ile "E-postamı gizle"
   seçilerek açılmış hesaba `dene` → relay iletiyor mu. Bugüne kadarki
   denemeler iCloud'un gerçek adresine gitti.
4. **Apple Pay** (devir 10 §11 C.1): telefonun Safari'sinde Dodo ödeme
   sayfasında çıkıyor mu.
5. **Masaüstünden yeni kayıt** (devir 10 §11 C.4): abonelik satırı YOK (web
   etiketi) → Ayarlar "Aktif aboneliğiniz yok · 7 gün ücretsiz dene".

### B · Kullanıcının kararını bekleyenler
- **İç hesaplar:** furkanhasan@luera.ai (bitiş 2026-09-12) ve
  nisanur@luera.ai (2026-09-29) → hediye (`ops/abonelik/hediye.sh ver …`) mi,
  kilit mi. Abonelik satırı olmayan 2 işletme gerçek salon mu, test mi
  (salt okunur sorguyla bakılır).
- **Test kalıntıları:** Test Salon 3 ve furkan@luera.ai'nin test
  abonelikleri Live'a geçince ne olacak (aynadaki test kimlikleri Live'da
  "yok" sayılır — kod hazır, karar değil).

### C · Tasarım bekleyen
- **Kurulum v2** son adımı "7 gün ücretsiz başlat" (Dodo, kartla) — devir 12.
  Gelmeden ENFORCE açılırsa geçici akış: kurulum biter → kapı `/abonelik`e
  atar → "Planınızı seçin, 7 gün ücretsiz" (çalışır, ideal değil).

### D · Açılış günü (sırayla, her adım kullanıcı onayıyla — devir 10 §11 E)
1. Ölçüm: `ops/abonelik/kontrol-oku.sql` (kim kilitlenir).
2. İç hesaplar ve test kalıntıları (§1.B kararlarıyla).
3. `ops/abonelik/acilis-deneme.sql` kuru → `-v uygula=1`.
4. **Dodo Live:** işletme doğrulaması · Live ürünleri taban **TRY**
   (YENİ FİYATLAR 2026-10-22: aylık 799/1.299/1.999, yıllık 7.990/12.990/19.990 —
   `ops/abonelik/dodo-urun.mjs ... canli`, devir 15), yerel kural YOK, vergi
   dahil · Live API anahtarı + webhook sırrı + `DODO_API_BASE` (live) +
   `DODO_PRODUCT_MAP` canlı kimlikler (`app_secrets`, sohbete yapıştırmadan)
   · Live'da webhook ucu (aynı adres) · dış izleme Worker'ı (`ops/izleme`)
   Live'a.
5. `ops/abonelik/eposta.sh ac` (Live ile birlikte; TEST'teyken durur).
6. **ENFORCE** sakin saatte: `app_secrets.ENTITLEMENT_ENFORCE = 'true'` +
   Coolify'da `VITE_ENTITLEMENT_ENFORCE=true` → Deploy. Geri alma:
   `update app_secrets set value='false' where key='ENTITLEMENT_ENFORCE';`
7. İlk gün izleme: kilitlenen var mı · webhook hata oranı %0 mı · e-posta
   defteri (`eposta.sh durum`).

### E · App Store
- Sonraki sürümün inceleme notu: "TimeFlow salonlara satılan bir web
  hizmetidir; uygulamada satın alma ya da yönlendirme yoktur; ödeme bilgisi
  e-postayla gider; demo hesap süresiz aktif."
- Mağaza açıklaması ve ekran görüntülerinde fiyat / plan / "web'den abone
  olun" geçmediği kontrol edilecek (yapılmadı).

### F · Açılışı engellemeyen abonelik borçları (devir 10 §11 G)
- Plan değiştirme yok (Dodo Change Plan): aktif aboneye "Planı değiştir" /
  "Yıllığa geç" 409 → destek e-postası.
- Fatura bilgisi (VKN / vergi dairesi) toplanmıyor · kartın son 4 hanesi
  gösterilmiyor · Dodo ödeme sayfası teması.
- Core Studio parolası değişecek (devir 10 §9).
- furkan@luera.ai test kipinde 4 aktif abonelik (eskiler 9/12 Kasım'da
  yenilenince kapanır).

## 2 · Telefon uygulaması
- **1.0.1 yayını:** "Release This Version" 20–21 Ekim 09–11'e planlıydı,
  ardından 7 günlük kademeli izleme. Yapılıp yapılmadığı bu belgeye
  yazılırken bilinmiyordu — kullanıcıya sor.
- **1.0.2:** Ayarlar yeniden tasarımı + "Hesabı sil" (Claude Design) ·
  kilit ekranında bekleme geri sayımı (Live Activity) · "Bekleme kur"da
  bildirim izni ön sorusu · çevrimdışı BAŞLAT → `items_stale` kusuru ·
  personelde "oturum kapandı" metni · personel müşteri dosyasında paket
  halkası · gizlilik metninin yeni hâli (`631bf04`, yurt dışı aktarım
  kararını bekliyor) · mağaza ekran görüntüleri.
- **Küçük ama önemli:** info@lueratech.com dışarıdan hiç denenmedi · çökme
  takibi (Sentry) yok.

## 3 · Masaüstü
- Genel tasarım turu + yeni Kurulum sihirbazı ekranı (yapilacaklar §3B).
- Lint'te yeni tek bulgu: `src/components/beauty/BeautySessionModal.tsx`
  (seans penceresi işi, küçük).

## 4 · Ayrı oturumların işleri
- **WhatsApp:** salonun hat QR eşleştirmesi bekliyor ("connecting" süzgeci
  düzeltmesi 2026-10-11'de deploy edildi).
- **Altyapı:** `supabase.lueratech.com` (LeadFlow/CallFlow) 503 · VPS 1'de
  kullanılmayan Supabase yığını (`eopb02…`; yedek → Stop → bekle → sil).
- Luera sitesi + ekosistem + Instagram planı.

## 5 · Tarihe bağlı ya da büyüdükçe gerekecek
- **Pushover denemesi ~16 Kasım'da biter** — $4.99 alınmazsa sabah 09:00
  alarm mesajı susar.
- **Yedeğin dış kopyası + geri yükleme provası yok** — yedek VPS'in kendi
  diskinde; sunucu giderse yedek de gider.
- **Sunucu kurtarma tek sayfası yok** — bilgi hafıza notlarına dağılmış.
- `settings` işletme başına değil kullanıcı başına (ikinci müdür eklenince
  ayarlar kaybolur → `unique(organization_id)`) · personel verisi sunucuda
  ayrılmıyor (istemci süzüyor) · masaüstü en çok 500 randevu satırı
  (`src/hooks/useReservations.ts:205`) · şube desteği ve Core API
  anahtarları · KVKK metni işletme başına değil.
- Mobil↔masaüstü denetiminin 2. turu (ilki 2026-09-27) · Paketler'deki
  "ödenmedi"nin masaüstü bakiyesiyle aynı olup olmadığı · mağaza paketinin
  sessizce sahte veriye düşebilmesi (`mobile/src/api/session.ts:24`).

## Kurallar (değişmedi)
- Komutlar (ssh, deploy, göç) kullanıcının Terminal panelinde, onayıyla.
- Elle yapılan her iş açarak anlatılır: ne · neden · nasıl · ne görmeli ·
  bana ne söylesin.
- Commit/push yalnız kullanıcı isteyince; `site/` commit'e girmez.
- Coolify'da Deploy, Restart DEĞİL. `_shared` değiştiyse fonksiyonlar
  ARGÜMANSIZ yüklenir. Göçler önce kuru koşu.
