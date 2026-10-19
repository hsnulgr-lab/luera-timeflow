# Devir 12 · Kurulum v2 + paralel oturumun notu (2026-10-19 → 20)

**Yazıldı:** 2026-10-20 gece, "Giriş v4" oturumunun sonunda (limit doldu).
Bu notu okuyan oturum devir 10'un (Core + Dodo) oturumu olabilir. Önce bunu,
sonra gerekirse `docs/kurulum-v2-claude-design-prompt.md`'yi oku.

## 1 · Bu oturumda yapılanlar

1. **Telefon Giriş v4.** Apple + Google ile giriş, köprü, kayıt kodu, kodla
   şifre yenileme, Profil › Hesap.
   - Commit'ler: `660002b` ve `2896b91` (açık temada pasif düğmeler görünür,
     "Gir" → "Giriş yap"). İkisi de main'e gönderilmiş.
   - Apple ve Google telefonda (geliştirme derlemesi) çalıştı.
   - Ayrıntı ve kalanlar: devir 11 § Mobil v4.
2. **Core + Dodo denetimi ve teşhis:** devir 10 §7–9. Kök sebep: Dodo ucu
   Eylül'de devre dışı kalmıştı. Onarımı devir 10'un oturumu yaptı (`36f0f02`
   ve sonrası).
3. **Lemon Squeezy kontrolü (Gmail, salt okunur; hiçbir mail gönderilmedi).**
   - Başvuru reddedilmemiş: 21 Haziran'daki 4 KYB sorusu cevapsız kalmış.
   - LS Stripe'a eriyor ("Sold through Link, LLC"). Stripe Managed Payments
     Türkiye'deki satıcıyı desteklemiyor.
   - **Sonuç: Dodo'da kalınıyor.** Hafıza: `lemon_squeezy_basvurusu`.
4. **Kurulum sihirbazı v2: brief yazıldı ve Claude Design'a GÖNDERİLDİ**
   (kullanıcı, 2026-10-20 gece). **Tasarım bekleniyor.**
   - Brief: `docs/kurulum-v2-claude-design-prompt.md`
   - Ekler: `~/Downloads/18 ekim v2/kurulum-ekleri/` (+ `.zip`)
   - Beklenen çıktı: `Luera Masaustu - Kurulum v2.html`
   - Kullanıcı kararı: **"çok az adım, az ve öz".** Akış 3 ekran + bitiş:
     - K1 İşletmeniz: ad · 13 sektör · Yalnız ben / Ekibim var
     - K2 Hizmetler ve saatler: hazır liste + hazır saat düzeni
     - K3 WhatsApp: atlanabilir
     - B Bitti: randevu adresi + Kopyala, özet, 3 öneri
   - Sihirbazdan çıkanlar (varsayılanla kurulur, Ayarlar'dan değişir):
     karşılama ekranı, adres/telefon/harita/logo, randevu aralığı (30 dk),
     hizmet rengi, ayrı kaynak ekranı, ekip rolleri.
5. `docs/yapilacaklar.md` §3B güncellendi: brief + bulunan 6 kusur.

## 2 · Tasarım gelince: uygulamada DÜZELTİLECEK kusurlar (koddan doğrulandı)

1. **İşletme adı alanı yanlış dolu açılıyor.**
   - E-postayla kayıtta `settings.business_name` = e-posta adresi.
     `LoginPage` `signUp`'a ad göndermiyor; 121'deki
     `COALESCE(name, email)` adresi yazıyor.
   - Apple/Google'da alanda kişinin kendi adı duruyor.
   - Sihirbaz bu değerlerle doldurmamalı; alan boş açılmalı.
2. **"Yalnız ben" telefona yansımıyor.** `set_business_mode` (göç 108)
   çağrılmıyor → `organizations.solo` false kalıyor ve sahibin personel
   satırı açılmıyor → telefon tek kişilik kabuğu (`/tek`) açmıyor.
3. **Randevu adresi (slug) hiç oluşmuyor.** Sihirbaz sormuyor, sunucu da
   üretmiyor. Bitişteki "linki paylaş" boş sayfaya gidiyor.
   - Yeni tasarımda adres addan üretilir: `slugify`, `useOrgProfile`.
   - Adres alınmışsa (`23505`) sonuna "-2" eklenir.
4. **Ödemeden dönüşte hiçbir şey söylenmiyor.** İlk alımda Dodo
   `/kurulum?checkout=success` adresine döndürüyor. Brief'te iki bant var:
   Ş2a (abonelik okundu) ve Ş2b (henüz gelmedi).
5. **Olmayan özellik vaadi:** "Davet gönderilmedi" ve "giriş davetlerini tek
   tuşla gönderirsiniz" yazıyor. Böyle bir davet yok; kaldırılacak.
6. **Sayılar tutarsız:** karşılama "üç şey / 6 dakika" diyor, sihirbaz 7
   ekran soruyor, şerit 10 dk hesaplıyor.

Dokunulacak dosyalar:
- `src/pages/SetupWizardPage.tsx` + `setupWizard.css` (baştan)
- `src/lib/setupProgress.ts`: **tek ilerleme kaynağı.** Yeni adım anahtarları
  ve "tamam" kuralları buraya; `tests/setup-progress.test.mjs` güncellenir.
- `src/components/layout/SetupBanner.tsx`
- `Layout.tsx`: brief tam ekran odak öneriyor; bugün menü daraltılmış.

Korunacak sözleşmeler:
- Her ekran "Devam"da kaydeder.
- `?adim=` ile kaldığı yerden açılır.
- Var olan hizmet listesi hazır setle ezilmez.
- Köprüden gelende kaydetme `orgId` ister (`refreshOrg`, `195f9cf`).

## 3 · Commit durumu (2026-10-20 gece)

- **Bu oturumun commit'siz dosyaları:**
  - `docs/kurulum-v2-claude-design-prompt.md` (yeni)
  - `docs/yapilacaklar.md` (§3B)
  - bu dosya
- `docs/devir/10-CORE-DODO-BASLANGIC.md`'nin son bölümü **devir 10
  oturumunun** işi.
- `site/` takipsiz; bu oturumun değil, dokunulmadı.
- Commit/push yalnız kullanıcı isteyince.

## 4 · Sıradaki (kullanıcının sırası)

1. **1.0.1 Release:** Salı 20 ya da Çarşamba 21 Ekim, 09:00–11:00
   (kullanıcı basar). Ardından 7 gün kademeli yayın izlenir.
   - Telefonunda şu an geliştirme derlemesi var. Yayını görmek için
     TimeFlow'u silip App Store'dan yeniden yüklemesi gerek.
2. **Devir 10:** Test 1 son kontrol (ekranda 26 Ekim) → Test 2–5 (portal,
   iptal ve vazgeçme, ikinci alım 409, hesap silme) → ENFORCE + mobil kayıt
   kararı → Dodo Live.
3. **Kurulum v2:** tasarım gelince kare kare brief'le karşılaştır → uygula.
4. 1.0.2 paketi (`docs/yapilacaklar.md` §3).
