# Yayın öncesi genel kontrol ve hata avı — Luera TimeFlow mobil 1.0.1

Sen Luera TimeFlow'un mobil uygulamasını App Store'a ikinci kez (1.0.1)
göndermeden önce **genel bir kontrol ve hata avı** yapacaksın. 1.0 mağazada
(2026-10-07, derleme 4, `9993086`). O günden beri `tek-kisilik` dalında büyük
bir iş birikti: üçüncü kabuk (tek kişilik işletme), kumandanın sade adisyonu
(Personel 15, iki kabukta), bildirim rotaları, kayıp telefonun bağını koparma,
Bugün kartı, Gün'ün katlı "Bitenler"i ve daha fazlası. Bu turun amacı mağaza
hakeminden ve gerçek müşteriden ÖNCE kırığı bulmak.

## 0 · Önce oku (sırayla)

1. `docs/devir/08-TEK-KISILIK-DEVIR.md` — §0, §1 (kullanıcının duran emri),
   §2, §6 (deploy durumu), §7 (para yazan akışın kuralları), §8 (dersler),
   §9 (bilinçli ayrışmalar — bunları hata diye raporlama), §10 (değişmez
   kısıtlar), §41–§49 (son turlar).
2. `mobile/AGENTS.md` — kod okumadan önce zorunlu.
3. `docs/mobil-app-store-denetim-raporu.md` ve
   `docs/apple-yeniden-gonderim-ADIM-ADIM.md` — 1.0'ın denetimi ve hakem dersleri.
4. Hafıza notları (varsa): `app_store_yolu`, `uretim_paketi_kirikti`,
   `dev_only_cokme_transform`, `main_tek_kisilik_icerir`, `kayit_smtp_kirik`.

## 1 · Kurallar

- **Önce SALT OKUMA.** Bu turda hiçbir dosyayı değiştirme, commit atma,
  deploy etme. Çıktı bir bulgu listesi. Düzeltmeye kullanıcı onayıyla, ayrı
  bir adımda geçilecek.
- **ssh, deploy ve göç komutlarını kullanıcı çalıştırır.** Sen komutu ver,
  çıktısını iste. **Simülatör YASAK**, doğrulama fiziksel telefonda Expo Go
  ile. Xcode yalnız açık yayın emriyle.
- **Kanıtsız bulgu yok.** Her bulgu için: dosya:satır, çalıştırdığın komut ve
  çıktısı ya da yeniden üretme adımları. Kanıtlayamadığını "doğrulanmadı"
  diye işaretle; tahmini gerçek gibi yazma.
- **§9'daki bilinçli ayrışmaları ve kullanıcı kararlarını yeniden önerme**
  (ör. `hourRange`, T2 takvim, komşu iş şeridi, picker, maske kalktı).
- Karar gerektiren her şeyi **soru olarak** sor (AskUserQuestion); kendin
  karar verme.
- Para yolunda (§7) tek bir kuralı bile gevşeten öneri yapma.

## 2 · Kontrol listesi

### A · Kod sağlığı (hepsini çalıştır, çıktıyı yaz)
- `npm test` (kök) — kaç geçti / kırık / atlandı.
- `cd mobile && npx tsc --noEmit`.
- Lint: değişen dosyalarda yeni bulgu var mı (önceki sayılarla karşılaştır).
- **Üretim paketi (ZORUNLU):** `cd mobile && npm run start:prod`
  (`--no-dev --minify`) — kullanıcı telefonda açar, soğuk girişten geçer.
  `__DEV__`'e bağlı kod, dinamik import, yalnız geliştirmede çalışan
  doğrulamalar (bkz. `uretim_paketi_kirikti`, `dev_only_cokme_transform`).
- Çalışma ağacında **geçici tanı satırı** kaldı mı: `grep -rn "tanı-tahsilat\|GEÇİCİ TANI" mobile/`
  — mağaza derlemesine GİRMEMELİ.
- Sır taraması: izlenen `.env`, anahtar, `service_role` yok.

### B · Para ve veri doğruluğu (en yüksek öncelik)
- Tahsilat (`visit.collect`): §7'nin on kuralı kodda hâlâ geçerli mi.
- **Açık hata:** "Tahsilat kaydedilmedi. Kasaya bir şey yazılmadı." telefonda
  bir kez görüldü (kalem ekledikten hemen sonra tahsil). Şüphe: 0,7 sn'lik
  otomatik yazma (`saveVisitItems`) ile gönderimin (`sendVisitToCash`) iyimser
  kilit yarışı (`items_stale`). Kodu oku, yarışın mümkün olup olmadığını
  kanıtla ya da çürüt; yeniden üretme adımı öner.
- Sade adisyonun "Toplam"ı (`adisyonSade.sadeTotal`) ile sunucunun tahsil
  ettiği tutar (`visit.collect`: hizmet + Σ fiyat×adet) her durumda aynı mı:
  çoklu hizmet (`custom_fields.hizmetler`), katalog dışı kalem, malzeme,
  adet 20, silinmek üzere olan satır.
- Ekipte hizmet ücreti `visit.charge`, tek kişilikte `fetchServiceCharge` —
  iki yol aynı sayıyı veriyor mu.
- Kalem kaydı: geri çıkınca kayıp, çift cihaz, çevrimdışı kuyruk.

### C · Akışlar (telefonda denenmemişleri listele, deneme planı yaz)
Devir §16–§49'daki "telefonda denenmedi" maddelerini topla ve her birine
2–4 adımlık bir deneme yaz. Özellikle: bildirime dokununca doğru ekran
(müdür / tek kişilik / personel / bekleme), sade adisyon iki kabukta (ekip
personeli hesabıyla da), "Bitenler" katlı satırı, Bugün kartı koyu tema,
kayıp telefonun bağını koparma, son kalemin "Geri al"ı, gün cetveli,
"Personeli çağır".

### D · Apple incelemesi
- **Kayıttaki mod sorusu** ("Yalnız ben / Ekibim var"): `main` tek kişilik
  kabuğunu içeriyor; mağazaya girecek mi? Kullanıcıya sor.
- 5.1.1(v) hesap silme yolu çalışıyor mu.
- **Şifre sıfırlama ölü** (SMTP yok) ama uygulama "gönderildi" diyor —
  2.1 / doğruluk riski; ne yapılacağını kullanıcıya sor.
- 3.1.1: uygulama içinden satın almaya yönlendirme yok (abonelik metni,
  fiyat, bağlantı).
- 5.1.2(i): üçüncü taraf yapay zekâya (Gemini/Groq) giden veri — uygulama
  içinde ve gizlilik metninde açıkça yazıyor mu; yayımlanmamış gizlilik
  metninin kararı bekliyor (devir §40).
- App Privacy beyanı 1.0'dan bu yana değişen veri türleriyle (cihaz kaydı
  `staff_devices`, bildirim) hâlâ doğru mu.
- Hakem hesabı (demo salon) yeni kabuklarla gezilebilir mi; hakem notu
  güncellenmeli mi.
- `app.json`: sürüm 1.0.1, `usesNonExemptEncryption`, privacy manifest,
  Face ID / bildirim izin metinleri.

### E · Yayın hazırlığı
- Push durumu: `tek-kisilik` ve `main` origin'in kaç commit önünde.
- Canlı sunucu kodu = depo mu (son deploy'lar §6).
- EAS production ortam değişkenleri (`EXPO_PUBLIC_AUTH_MODE=live`), anon
  anahtar rolü.
- Ekran görüntüleri / mağaza metni yeni özellikleri anlatıyor mu (tek kişilik).

## 3 · Çıktı biçimi

Tek bir rapor, şu sırayla:
1. **🔴 Yayın engeli** — düzeltilmeden gönderilmemeli.
2. **🟠 Yayından önce düzeltilmeli** — engel değil ama hakem/müşteri görür.
3. **🟡 Sonraya** — bilinen borç.
4. **❓ Kullanıcının kararı** — soru listesi.
5. **📱 Telefon deneme planı** — madde madde.

Her bulgu: başlık · kanıt (dosya:satır / komut çıktısı) · etki · önerilen
düzeltme · tahmini büyüklük. Rapor bitince düzeltmeye **kendiliğinden
geçme**; kullanıcıya hangi bulguyla başlayacağını sor.
