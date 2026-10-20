# Abonelik ve kapı kuralları

**Karar tarihi:** 2026-10-20 (kullanıcıyla). **Durum:** kurallar kesin, kod Faz 2'de.
Ayrıntılı geçmiş: `docs/devir/10-CORE-DODO-BASLANGIC.md` §10.

Bu belge iki tasarım oturumunun (kurulum v2, mobil) ve kodun **ortak kaynağıdır**.
Burada yazmayan bir davranış uydurulmaz; değişecekse önce bu belge değişir.

## 1 · Kurallar

| | Masaüstünden açılan işletme | Telefondan açılan işletme |
|---|---|---|
| Deneme nasıl başlar | Kurulumun son adımı **"7 gün ücretsiz başlat"** → Dodo ödeme sayfası, **kartla** | İşletme açıldığı an, **kartsız**, kendiliğinden |
| Süre | 7 gün | 7 gün |
| Deneme bitince | Dodo 8. gün kartı **otomatik** çeker, sistem açık kalır | Sistem **kapanır**; ödeme e-postadaki bağlantıyla web'de |
| Ödeme yeri | Web | Web (telefonun tarayıcısı da olur; Apple Pay dahil) |
| Ödeme alınamazsa | 2 gün ek süre → kapanır | Aynı |

- **Ayrım nasıl yapılır:** masaüstü kayıt `kaynak = 'web'` etiketi gönderir
  (e-posta kaydında kullanıcı verisinde, Apple/Google'da `create_own_business`
  parametresinde). **Etiketsiz açılan her işletme telefondandır** — yayındaki
  1.0.1 değişmeden bu kurala uyar.
- **Kapanınca:** veri OKUNUR, yeni kayıt YAZILAMAZ (randevu, müşteri, tahsilat,
  hizmet, personel); WhatsApp hatırlatmaları, online randevu ve personel
  uygulaması durur. **Ödeme sayfası hiçbir zaman kapanmaz.** Ayarlar açık kalır.
- **Etkilenmeyenler:** demo salon (`demo_manual`, süresiz) ve hediye üyeler
  (`comp_manual`, `ops/abonelik/hediye.sh`).
- **Deneme bir kez:** Dodo denemesi yalnız hiç aboneliği olmamış işletmeye
  verilir. Telefonun kartsız denemesini kullanan işletme paket alınca ücret
  hemen ya da kartsız denemenin kalan günü bitince çekilir (Faz 2.4).

## 2 · Telefon ve App Store (Apple kuralları, 2026-10-20'de okundu)

Telefon uygulaması **yalnız bilgi verir**. Satış, fiyat, plan adı, "web'den abone
olun" yazısı, ödeme sayfasına bağlantı ya da düğme YOK — Türkiye mağazasında
uygulama ve mağaza sayfası başka bir ödeme yoluna yönlendiremez (Guideline
3.1.1, 3.1.3; serbestlik yalnız ABD mağazasında).

**Ödeme iletişimi yalnız uygulamanın DIŞINDA, e-postayla** (Guideline 3.1.3
girişi bunu açıkça serbest bırakıyor):

| Ne zaman | E-posta | Bağlantı |
|---|---|---|
| Deneme başladı | Hoş geldiniz · bitiş tarihi | Abonelik sayfası |
| Bitmesine 3 gün | 3 gün kaldı | **Sihirli bağlantı** → paket ekranı |
| Bitti | Denemeniz bitti | Sihirli bağlantı |
| Bittikten 3 gün sonra | Son hatırlatma (sonra e-posta yok) | Sihirli bağlantı |
| Ödeme alınamadı | Son ödeme alınamadı | Kart güncelleme sayfası |

- **Sihirli bağlantı:** kısa süreli, tek kullanımlık otomatik giriş; bilgisayarı
  olmayan kişi telefonun tarayıcısında şifresiz paket ekranına gelir.
- **Apple gizli e-posta** (`…@privaterelay.appleid.com`): gönderen
  (`no-reply@lueratech.com` + alan adı) Apple Developer → *Sign in with Apple
  for Email Communication*'a KAYITLI olmalı; yoksa e-postalar geri döner.
- **Telefona giden bildirimler** yalnız durum söyler: "Son ödeme alınamadı.
  Ayrıntılar e-postanızda." ("kartınızı güncelleyin" DENMEZ.)

**Mobil uygulamada abonelikle ilgili DEĞİŞİKLİK YAPILMAZ** (karar 2026-10-20):
deneme şeridi, abonelik satırı, kapalı ekran metni yeni sürüme girmez. Yayındaki
kapalı ekran (fiyatsız, bağlantısız, destek e-postalı) olduğu gibi kalır.

**Kalan risk (bilerek kabul edildi):** güncel 3.1.3(f) yalnız VoIP / bulut
depolama / e-posta / web barındırma sayıyor; işletmelere satılan hizmet
(3.1.3(c)) "tek kullanıcıya satış Apple içi satın almayla" diyor. Telefondan
kaydolan tek kişilik salon bu tarife en yakın kullanıcı. Apple bir gün Apple
içi satın alma isterse iki çıkış var: o grup için IAP eklemek ya da telefonda
yeni işletme açmayı kapatmak. Bugün ikisi de yapılmıyor.

**İnceleme notu (sonraki sürümler):** "TimeFlow salonlara satılan bir web
hizmetidir; uygulamada satın alma ya da yönlendirme yoktur; ödeme bilgisi
e-postayla gider. Demo hesap süresiz aktiftir." App Store açıklaması ve ekran
görüntülerinde fiyat / plan / web'den abonelik geçmez.

## 3 · Tasarım brief'leri

**Kurulum v2 (masaüstü, Claude Design):** son adım **"7 gün ücretsiz başlat"**.
Ne alınacağı (plan, deneme sonrası aylık tutar, 8. gün otomatik tahsilat,
deneme içinde iptal edilirse ücret yok) adımda AÇIKÇA yazar; düğme Dodo ödeme
sayfasını açar, dönüş `/kurulum?checkout=success`. Bu adımdan önce sistem
kilitlemez: kurulum sayfası kapının dışındadır.

**Mobil:** bu karar için tasarım İŞİ YOK (bkz. §2).

## 4 · Fazlar

1. ✅ Bu belge.
2. Sunucu ve masaüstü (telefona sürüm gerekmez):
   1. ✅ kodda — Telefondan açılan işletmeye kartsız 7 gün — göç 124 + masaüstü
      `web` etiketi.
   2. ✅ kodda — Kaydı olmayan / kartsız denemesi bitmiş işletmelere **açılış
      günü** 7 gün — `ops/abonelik/acilis-deneme.sql`.
   3. Kurulum sayfası kapı dışında (✅ kodda) + son adımda kartlı deneme
      (tasarım gelince).
   4. ✅ kodda — Kartsız denemedeki salon paket alabilir (`dodo-checkout`: engel
      yalnız Dodo aboneliği varken; kalan gün `cardlessTrialDaysLeft` → Dodo
      denemesi); `/abonelik` "Denemeniz sürüyor" paket ekranı (e-posta ve şerit
      buraya gelir); Ayarlar › Abonelik kartsız dalı; şerit kartlı/kartsız ayrı
      metin; "ödeme alınamadı" → kart sayfası. **Göç 124 bununla BİRLİKTE
      canlıya çıkar.**
   5. ✅ kodda (2026-10-21) — E-postalar + sihirli bağlantı: fonksiyon
      `abonelik-eposta` (15 dk'da bir cron; her e-posta işletme · tür · dönem
      başına BİR kez, defter göç 125), `/baglanti` sayfası, girişte
      `?sonra=abonelik`. Anahtar `ABONELIK_EPOSTA` kapalıyken KURU (Dodo Live
      ile açılır). Hatırlatmalar TR 09–21, hoş geldiniz ve ödeme her saat.
      Canlıya çıkış: devir 13 §4.
   6. ✅ kodda (2026-10-21) — "Ödeme alınamadı" bildirim metni nötr: "Son
      ödeme alınamadı. Ayrıntılar e-postanızda."
3. Kullanıcı: Apple gizli e-posta kaydı · kurulum v2 tasarımı · telefon
   tarayıcısında ödeme testi (Apple Pay dahil).
4. Mobil: yok.
5. Açılış (sırayla): kim kilitlenir ölçümü → iç hesapların ayıklanması (hediye
   ya da sil; demoya dokunulmaz) → `acilis-deneme.sql` → Dodo Live (taban TRY,
   yerel kural yok, canlı ürün kimlikleri) → sakin saatte
   `ENTITLEMENT_ENFORCE = 'true'` + masaüstü `VITE_ENTITLEMENT_ENFORCE=true`.
   Geri alma: `update app_secrets set value = 'false' where key = 'ENTITLEMENT_ENFORCE';`
