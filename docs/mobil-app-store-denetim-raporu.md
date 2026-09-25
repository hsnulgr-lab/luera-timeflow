# Mobil Uygulama · App Store Öncesi Denetim Raporu

**Tarih:** 2026-09-25 · **Kapsam:** `mobile/` (Expo SDK 57, RN 0.86), mobilin
bağlandığı Supabase veritabanı, edge fonksiyonları, App Store gereksinimleri.
**Yöntem:** Her iddia bu oturumda ölçüldü ya da koddan okundu. Ölçülemeyenler
"doğrulanmadı" diye işaretli ve kontrol komutu §6'da.

---

## 0 · Karar özeti

**Kod tarafı yayına yakın.**
- 2683 testte hata yok.
- TypeScript temiz.
- Mağaza JS paketi tek parça derleniyor ve ilk ekranda çöken hata kalmadı.
- Veritabanı erişimi doğru tasarlanmış: RLS tam, personel dar uçtan giriyor.

**Engellerin çoğu kodda değil, mağaza hazırlığında:** metinler, ekran
görüntüleri, derleme, hakem notu eksikleri.

**Kodda ret riski taşıyan 4 şey var:**
1. Çökme ağı (ErrorBoundary) yok.
2. "Şifremi unuttum" çalışmıyor ama "gönderildi" diyor.
3. WhatsApp "Yaz" düğmesi bağlı olmayan salonda da görünüyor.
4. Kayıt ekranında var olmayan bir "Kullanım Koşulları"na atıf var.

| Öncelik | Sayı | Anlamı |
|---|---|---|
| 🔴 Kritik | 4 | Bunlar olmadan gönderilemez |
| 🟠 Yüksek | 6 | Ret riski ya da kullanıcıya yanlış bilgi |
| 🟡 Orta | 7 | Yayın sonrası ilk sürümde düzeltilmeli |
| ⚪ Düşük | 4 | Temizlik |

---

## 1 · Ölçülenler — kanıt tablosu

| Kontrol | Sonuç | Nasıl |
|---|---|---|
| Test paketi | ✅ 2683 test · 0 hata · 7 bilerek atlanıyor | `npm test` |
| TypeScript (mobil) | ✅ temiz | `tsc --noEmit` |
| Mağaza JS paketi | ✅ tek parça 6.1 MB Hermes, ayrı parça yok | `expo export --platform ios` |
| Expo uygunluk | ⚠️ 13 paket yama sürümü geride | `expo-doctor` |
| Nihai Info.plist | ✅ Face ID metni Türkçe, şifreleme beyanı `false`, izleme izni yok | `expo config --type introspect` |
| İkonlar | ✅ 1024×1024, saydamlık yok (açık/koyu/tinted) | `sips` |
| Üretim ortam değişkenleri | ✅ expo.dev'de 4/4 tanımlı, yerelle birebir aynı | `eas env:list production` |
| Gizlilik / destek sayfası | ✅ ikisi de canlıda 200 | `curl` |
| Takip/analitik SDK | ✅ yok (31 bağımlılık) | `package.json` |
| Arayüzde "yakında/beta/test" metni | ✅ yok | tarama |
| RLS (statik) | ✅ 20 tablonun hepsinde açık, anonim kural yok | migration analizi |
| RLS (canlı) | ⏳ **doğrulanmadı**, otomatik kip canlı okumayı engelledi | §6 komut 1 |
| Canlı şema ↔ mobil | ⏳ **doğrulanmadı** | §6 komut 2 |
| Canlı fonksiyon ↔ depo | ⏳ **doğrulanmadı** | §6 komut 3 |

---

## 2 · Bulgular

### 🔴 Kritik — göndermeden önce şart

**K1 · Mağaza metinleri yok.** → ✅ 2026-09-25: yazıldı, `app-store-connect-metinleri.md` §0.
- Açıklama, alt başlık, anahtar kelimeler, tanıtım metni, kategori, telif
  satırı ve yaş derecelendirmesi cevapları hiç yazılmadı.
- App Store Connect bunlar olmadan göndermeye izin vermez.

**K2 · Ekran görüntüleri yok.** Kullanıcının telefonu iPhone Air; 6.9″ grubunda, 1260×2736 kabul ediliyor, doğrudan telefondan çekilir.
- iPhone 6.9″ gerekiyor (1320×2868 ya da 1290×2796; Pro Max veya Plus
  modelden çekilir).
- `supportsTablet: false` olduğu için iPad görüntüsü gerekmiyor.
- Demo tohumu 10:30–17:00 arasında çalıştırılmalı, yoksa akış boş görünür.

**K3 · Üretim derlemesi ve TestFlight yapılmadı.**
- 20 dosya commit edilmemiş, 2 commit push edilmemiş.

**K4 · Hakem notunda üç eksik** (`docs/app-store-connect-metinleri.md`):
- **Personel modu anlatılmıyor.** Karşılama ekranında "Burada çalışıyorum"
  var ve kod istiyor. Ekip kodları 15 dakika geçerli (`staff-api`
  `TEAM_CODE_TTL_MINUTES`), sabit bir kod yazılamaz. Hakemin kendisinin
  izleyeceği yol yazılmalı: Profil → Personel → **Telefon bağla** → kod →
  Profil → Hesap → **Oturumu kapat** → "Burada çalışıyorum" → kod →
  "Siz kimsiniz?" → PIN.
- **Demo hesabını silmek bütün demo salonu siler.** Tek sahip olduğu için
  işletmenin tamamı cascade ile gider (`account-delete`). Hakemler silmeyi
  sık dener. Not "silmeyi yeni açtığınız bir hesapla deneyin" demeli.
- **WhatsApp bağlı değil.** Demo salonda WhatsApp hattı yok. "Yaz"a basan
  hakem "Salonun WhatsApp'ı bağlı değil" görür. Ya not bunu açıklamalı ya da
  Y3 düzeltilmeli; ikisi birden en iyisi.

### 🟠 Yüksek — ret riski ya da yanlış bilgi

**Y1 · Kök düzende ErrorBoundary yok.**
- `app/` ve `src/` içinde tek bir `ErrorBoundary` yok.
- Üretimde yakalanmamış bir çizim hatası, "Bir şey ters gitti" ekranı yerine
  uygulamayı kapatır. Apple'ın 1 numaralı ret sebebi çökme (2.1).
- Ucuz bir sigorta: tek dosya ve bir test.

**Y2 · "Şifremi unuttum" ölü ama "gönderildi" diyor.**
- Sunucuda SMTP yok, e-posta gitmiyor.
- `recoverManagerPassword` hesap sızdırmamak için her durumda başarı dönüyor
  (`src/api/auth.ts:212`).
- Hakem denerse 2.1 riski doğar. Gerçek kullanıcı ise hesabına bir daha
  giremez.
- **Karar senin:** SMTP kurmak (tavsiye) ya da dürüst bir ekran koymak.

**Y3 · WhatsApp bağlantısı kodda sabit `true`.**
- `src/lib/mockSend.ts:28` `WA_CONNECTED = true`.
- "Yaz" gözü her salonda çiziliyor, bağlı hattı olmayanda 5 saniye sonra hata
  veriyor.
- Hata dürüst, uygulama çökmüyor, ama hakem gözünde "çalışmayan özellik".
- Durum sunucudan okunmalı (`whatsapp-proxy` `state`/`health`), bağlı değilse
  göz gizlenmeli.

**Y4 · Kayıt ekranında bağlantısız hukuk metni.**
- `signup/account.tsx:137`: "Devam ederek **Kullanım Koşulları** ve
  **Gizlilik Politikası**'nı kabul ediyorsunuz."
- Kod içindeki not "URL henüz yok" diyor, ama gizlilik sayfası artık canlıda.
- **Kullanım Koşulları sayfası hiç yok.** Var olmayan bir metne onay almak
  hukuken zayıf.
- Düzeltme: gizlilik bağlantısını ekle; koşulları ya kaldır ya da sayfasını yaz.

**Y5 · Geliştirici hesabının türü bilinmiyor.** ❓
- Yönerge 5.1.1(ix): sağlık gibi düzenlenmiş alanlarda hizmet veren ya da
  hassas veri tutan uygulamalar **tüzel kişilik** hesabından gönderilmeli.
- TimeFlow diş ve klinik sektörlerini destekliyor ve sağlık notu tutuyor.
- Hesap bireyselse ret riski orta.
- **Karar (2026-09-25):** Hesap **bireysel**, şirket (Ltd/A.Ş.) yok; Apple
  şahıs şirketini de bireysel sayıyor. Uygulama **salon odaklı** gönderiliyor:
  - Mobil kayıttan Diş ve Klinik çıkarıldı. Klinikler web'den kaydolur,
    telefona mevcut hesaplarıyla girer.
  - Hakem notu ve mağaza metinleri salon/güzellik diliyle yazılıyor.
  - **Health etiketi dürüstçe kalıyor.**
  - 5.1.1(ix) reddi gelirse şirket hesabına geçilir.
  - Kilit: `mobile-auth-live.test.mjs`.

**Y6 · Canlıdaki fonksiyonların depoyla aynı olduğu doğrulanmadı.**
- Hafızada `staff-api` için iki ayrı "deploy bekliyor" notu var (Apple
  Eşiği, Paket sat · Müdür 35).
- Personel modunun tamamı `staff-api`'ye bağlı. Mobil yeni bir uç çağırıp
  sunucu eskiyse, hakem personel modunda hata görür.
- Komut §6'da (salt okunur).

### 🟡 Orta — ilk güncellemede

| # | Bulgu | Neden önemli |
|---|---|---|
| O1 | 13 Expo paketi yama sürümü geride (expo 57.0.20→.25, router .19→.23 …) | Hata düzeltmeleri; derleme zaten sıfırdan yapılacak |
| O2 | Müdür oturumu şifresiz AsyncStorage'da (`src/lib/supabase.ts`); personel anahtarları Keychain'de | Müdür anahtarı bütün salona, sağlık notları dahil, erişiyor |
| O3 | Uygulama dili App Store'da **"English"** görünecek (`CFBundleDevelopmentRegion` en, tr yerelleştirme yok) | Arayüz tamamen Türkçe; mağaza sayfası yanıltıcı olur |
| O4 | Çökme/hata görünürlüğü yok (Sentry yok) | Mağazadaki kullanıcıda çıkan JS hatasını kimse görmez |
| O5 | Demo müşteri telefonları gerçek hat biçiminde (`0532 100 00 00` …) | Hakem "Ara"ya basabilir; WhatsApp bağlanırsa hatırlatma gerçek numaraya gider |
| O6 | `ENTITLEMENT_ENFORCE` açılınca mobilden kaydolan kişi ödeme yapmadan kullanamayan bir hesaba düşer | Sonraki sürüm incelemelerinde 3.1 sorusu doğabilir; strateji kararı |
| O7 | Hesap silme Core'a ulaşamazsa 502 ile durur (`account-delete`) | Core bir kez erişilemez olmuştu (billing hafızası); o an hakem silemez |

### ⚪ Düşük

- **D1** · Nihai Info.plist'te dev-client kalıntıları var: İngilizce
  `NSLocalNetworkUsageDescription` ("Expo Dev Launcher…"), `NSAllowsArbitraryLoads: true`.
  Üretimde istem hiç çıkmıyor.
- **D2** · 18 font dosyası (~1.2 MB) pakette; yalnız kullanılan ağırlıklar
  yeter.
- **D3** · iPhone uygulamaları hakemlerce iPad'de uyumluluk kipinde de
  açılabiliyor. TestFlight'ta bir kez bakılmalı.
- **D4** · 7 test atlanıyor. Bilinçli olduğu varsayıldı, bakılmadı.

---

## 3 · App Store gereksinimleri — var / yok kıyası

### Derleme ve paket

| Gereksinim | Durum | Kanıt / not |
|---|---|---|
| Bundle ID | ✅ | `ai.luera.timeflow` |
| Sürüm / derleme numarası | ✅ | 1.0.0, EAS uzak kaynak + `autoIncrement` |
| EAS production profili | ✅ | `eas.json` |
| Üretim ortam değişkenleri | ✅ | 4/4, yerelle aynı |
| Şifreleme (export compliance) | ✅ | `ITSAppUsesNonExemptEncryption=false` |
| Privacy manifest | ✅ | 4 API gerekçesi |
| Face ID izin metni | ✅ | Türkçe |
| Gereksiz izin yok | ✅ | kamera/konum/rehber/fotoğraf yok |
| İkon | ✅ | 1024, saydamlık yok, koyu + tinted |
| Açılış ekranı | ✅ | açık/koyu |
| Üretim paketi açılıyor | 🟡 | yerelde derlendi; **telefonda `--no-dev` bekliyor** |
| Push (APNs anahtarı EAS'ta) | ⏳ | derlemede sorulur; TestFlight'ta bildirimle doğrulanacak |
| Çökme ağı | ❌ | Y1 |

### Yönergeler

| Yönerge | Durum | Not |
|---|---|---|
| 2.1 Demo hesap + dolu veri | ✅ | `demo@lueratech.com`, süresiz abonelik |
| 2.1 Çökme yok | ⚠️ | Y1 |
| 2.1 Çalışmayan özellik yok | ⚠️ | Y2, Y3 |
| 2.3 Doğru metaveri | ⏳ | K1, O3 |
| 3.1.3(f) Satın alma / dışarı çağrı yok | ✅ | `tests/apple-yonlendirme-yasagi.test.mjs` kilitli |
| 4.8 Sign in with Apple | ✅ gerekmiyor | üçüncü taraf giriş yok |
| 5.1.1(i) Gizlilik politikası (URL + uygulama içi) | ✅ | `gizlilik.html` 200, Profil → Yasal |
| 5.1.1(v) Hesap silme | ✅ | gerçek sunucu silmesi, telefonda denendi |
| 5.1.1(ix) Düzenlenmiş alan / tüzel kişilik | ❓ | Y5 |
| 5.1.2 Takip yok | ✅ | SDK yok |

### App Store Connect formları

| Alan | Durum | Kim |
|---|---|---|
| Uygulama kaydı + "Luera TimeFlow" adı müsait mi | ❓ | sen |
| App Privacy etiketleri | ✅ taslak hazır | forma sen girersin |
| Hakem notu | ⚠️ 3 ekleme (K4) | ben |
| Açıklama · alt başlık · anahtar kelime · tanıtım | ❌ | ben yazarım, sen onaylarsın |
| Destek URL | ✅ | `https://timeflow.lueratech.com/destek.html` |
| Gizlilik URL | ✅ | `https://timeflow.lueratech.com/gizlilik.html` |
| Kategori | ❌ | öneri: **İş** (birincil), **Verimlilik** (ikincil) |
| Yaş derecelendirmesi anketi | ❌ | ben taslak çıkarırım; beklenen 4+ |
| Telif satırı | ❌ | öneri: `2026 Luera` (hesap sahibinin adıyla) |
| Fiyat / bölge | ❌ | öneri: **Ücretsiz · yalnız Türkiye**. AB'de satış, DSA "tacir" beyanı ister |
| Ekran görüntüleri | ❌ | K2 |
| İnceleme iletişim bilgisi | ❌ | sen (ad, telefon, e-posta) |
| İçerik hakları | ❌ | "üçüncü taraf içerik yok" |

---

## 4 · Veritabanı bağlantısı — denetim

**Mimari doğru.**
- **Müdür:** Supabase Auth ile girer; RLS erişimi işletme (org) sınırında
  keser.
- **Personel:** Supabase kimliği hiç yok. Yalnız cihaz ve personel anahtarı
  var, ikisi de iOS Keychain'de. Veriye dar kapsamlı `staff-api` üzerinden
  erişiyor. Bu, personel telefonu kaybolduğunda bütün salonun açılmasını
  engelleyen doğru bir karar.
- **Anon anahtar** gizli değil ve öyle kullanılıyor. Yetkiyi RLS veriyor.

**RLS (statik, 112 migration taraması):**
- Mobilin dokunduğu 20 tablonun hepsinde RLS açık. Yazma ve okuma
  `auth_user_org_ids()` ile işletmeye bağlı.
- `init_database`'teki eski "kendi kaydını gör" kuralları 003'te kaldırılmış.
- `app_flags` giriş yapmış herkese açık okunuyor. Bu bilinçli: yalnız bayrak
  tutuyor.
- Hafızadaki 2026-06-19 canlı izolasyon kanıtıyla tutarlı.

**Mobilin yazma yolları** (hepsi RLS ya da `staff-api` arkasında):
- **Müdür yazıyor:**
  - `reservations`: oluştur, güncelle, iptal
  - `customers.notes`
  - `treatment_plans`: yalnız paket satışı
  - `settings`: saatler, bildirim tercihleri
  - `organizations.name`
- **Personel `staff-api` üzerinden yazıyor:** `visit.note`, `visit.items`
  (adisyon), `visit.formula`, `visit.start/finish`.

**Hesap silme:**
- Tek sahipse önce abonelik iptal ediliyor, sonra org siliniyor (33 yabancı
  anahtar cascade), en son giriş kaydı.
- Ortaksa yalnız kendi üyeliği gidiyor.
- Yalnız `owner` silebiliyor.
- Doğru sırada ve telefonda denendi.

**Doğrulanmayan üç şey** (canlı okuma gerekiyor, komutlar §6'da):
1. Anonim anahtarla canlı tablolardan satır gelmediği.
2. Mobilin kullandığı 095–107 şema nesnelerinin canlıda olduğu. Hafızada
   102 için çelişkili iki not var.
3. Canlıdaki 38 fonksiyon dosyasının depodakiyle aynı olduğu.

---

## 5 · Düzeltme planı

### Faz A · Kod (ben · ~3 saat · her madde testle)

| # | İş | Bulgu | Tahmin |
|---|---|---|---|
| A1 | Kök `ErrorBoundary`: Türkçe "Bir şey ters gitti · Tekrar dene" ekranı + test | Y1 | 30 dk |
| A2 | WhatsApp durumu sunucudan okunsun; bağlı değilse "Yaz" gözü gizlensin | Y3 | 60 dk |
| A3 | Kayıt metni: gizlilik bağlantısı; "Kullanım Koşulları" çıkarılsın ya da sayfası yazılsın | Y4 | 20 dk |
| A4 | "Şifremi unuttum": SMTP gelene kadar dürüst ekran (seçenek b) | Y2 | 30 dk |
| A5 | Türkçe yerelleştirme (`CFBundleDevelopmentRegion: tr`); mağazada "Türkçe" görünsün | O3 | 15 dk |
| A6 | Expo yama güncellemesi (`expo install --check`) + testler + yerel derleme | O1 | 20 dk |

A4'ün yerine **SMTP kurulumu** (seçenek a, tavsiye edilen) seçilirse:
- DNS kayıtlarını sen girersin (SPF/DKIM, lueratech.com).
- Supabase SMTP ayarları Coolify'dan yapılır. Bu yeni bir Restart demek:
  önce yedek, sakin saat, doğru yığın.

#### ✅ Faz A sonucu (2026-09-25 akşam · commit yok)

| # | Durum | Ne yapıldı | Kilit |
|---|---|---|---|
| A1 | ✅ | Kök `ErrorBoundary` eklendi. Kendi tema ve güvenli alan sağlayıcılarıyla çiziliyor, sistem açılış karesini kaldırıyor. "Bir şey ters gitti · Tekrar dene" | `tests/mobil-cokme-agi.test.mjs` |
| A2 | ✅ | `WA_CONNECTED` sabiti kalktı; durum `org_whatsapp`'tan odakta okunuyor. Bağlı değilse göz sönük; basınca "masaüstünde Ayarlar → WhatsApp'tan bağlanır" | `tests/mobil-whatsapp-durumu.test.mjs` |
| A3 | ✅ | "Gizlilik Politikası" gerçek bağlantı oldu; var olmayan "Kullanım Koşulları" çıkarıldı | `mobile-appstore-hazirlik` |
| A4 | ✅ | **Yeni bulgu kapatıldı:** müdürün Hesap › "Şifreyi değiştir" satırı da SMTP'siz e-posta ekranına gidiyordu. Artık telefonda e-postasız değişiyor (önce şu anki şifre soruluyor). "Şifremi unuttum" dürüst ekran gösteriyor; `EMAIL_RECOVERY_READY` SMTP gelince açılır | `tests/mobil-sifre-durustlugu.test.mjs` |
| A5 | ✅ | `CFBundleDevelopmentRegion: tr`, `CFBundleLocalizations: [tr]`, `locales/tr.json` → `tr.lproj` (geçici prebuild ile doğrulandı) | `mobile-appstore-hazirlik` |
| A6 | ⏸ | **Uygulanmadı, bilinçli.** 13 paketin çoğu native modül. Güncellemek telefondaki dev client'ı eskitir ve C2 (`--no-dev` kontrolü) güvenilmez olur. İlk sürüm test edilmiş sürümlerle çıkar; güncelleme yeni dev client derlemesiyle birlikte Faz E'ye | — |
| K4 | ✅ | Hakem notuna eklendi: silmeyi yeni hesapla deneme uyarısı, personel modunun yolu, WhatsApp açıklaması | `docs/app-store-connect-metinleri.md` |

**Doğrulama:**
- Tam paket 2699 test, 0 hata (16 test yeni).
- Her yeni test, hata geri konunca kırıldı.
- TypeScript temiz. Lint 462, taban değişmedi.
- Mağaza JS paketi tek parça (6.1 MB) ve yeni ekranları içeriyor.
- **Telefonda henüz denenmedi.** C2'de ve TestFlight'ta bakılacak ekranlar:
  - Hesap › Şifreyi değiştir
  - Giriş › Şifremi unuttum
  - Akış'ta sönük WhatsApp gözü
  - kayıt ekranındaki bağlantı

### Faz B · Canlı doğrulama (sen çalıştırırsın · ~10 dk)

§6'daki üç komut. Bir fark çıkarsa derlemeden **önce** kapatılır.

### Faz C · Derleme (sıra önemli)

1. **Commit'ler:** dört grup ve bu belgeler ayrı ayrı. Push kararı senin.
2. **Telefonda `npm run start:prod`:** uygulama açılmıyorsa derleme yok.
3. **`npx -y eas-cli@latest build --profile production --platform ios`:**
   APNs anahtarı sorulursa "evet".
4. **`npx -y eas-cli@latest submit --platform ios`:** derleme TestFlight'a
   gider.
5. **TestFlight'ta hakem yolu:**
   - kayıt, giriş, akış, takvim, randevu, kasa, müşteri
   - hesap silme
   - personel modu
   - push bildirimi gelişi
   - iPad'de bir bakış

### Faz D · Mağaza

1. Ekran görüntüleri: 10:30–17:00, demo tohumu, TestFlight derlemesinden.
2. App Store Connect: metinler, etiketler, hakem notu, yaş anketi,
   kategori, fiyat/bölge.
3. **Submit for Review.**

### Faz E · Yayın sonrası (v1.1)

- **O2** · Müdür oturumu Keychain'e (şifreli depo katmanı).
- **O4** · Sentry.
- **O5** · Demo numaraları.
- **O6** · Abonelik kapısı açıldığında mobil kayıt stratejisi.
- **O7** · Core erişilemezse hesap silme davranışı.
- **D1–D3.**

---

## 6 · Doğrulama komutları (salt okunur · sen çalıştırırsın)

### 1 · Canlı RLS sondası (Mac'te, VPS'e girmez)

Her satırda `[]` ya da bir izin hatası görülmeli. **Veri dönen tek bir satır
sızıntı demektir.**

```bash
cd ~/Projects/luera-timeflow/mobile && K=$(grep "^EXPO_PUBLIC_SUPABASE_ANON_KEY=" .env | cut -d= -f2-) && for t in reservations customers settings payments organizations services treatment_plans staff staff_time_off package_templates organization_members org_entitlement customer_packages app_flags push_subscriptions staff_device_codes staff_auth_log staff_write_log stock_movements queue_entries; do printf "%-22s %s\n" "$t" "$(curl -s -m 10 "https://supabase.timeflow.lueratech.com/rest/v1/$t?select=*&limit=1" -H "apikey: $K" -H "Authorization: Bearer $K" | head -c 90)"; done
```

### 2 · Canlı şema — mobilin beklediği 095–107 nesneleri

Her satır `VAR` demeli.

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -At' <<'SQL'
WITH fn(n) AS (SELECT p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public'),
col(t, c) AS (SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public')
SELECT rpad(n, 46) || CASE WHEN ok THEN 'VAR' ELSE '—— YOK ——' END FROM (VALUES
 ('095 fn server_now',                      EXISTS (SELECT 1 FROM fn WHERE n = 'server_now')),
 ('095 tbl app_flags',                      to_regclass('public.app_flags') IS NOT NULL),
 ('097 fn clear_stamps_on_reschedule',      EXISTS (SELECT 1 FROM fn WHERE n = 'clear_stamps_on_reschedule')),
 ('098 col reservations.no_show_at',        EXISTS (SELECT 1 FROM col WHERE t = 'reservations' AND c = 'no_show_at')),
 ('099 col staff_device_codes.multi_use',   EXISTS (SELECT 1 FROM col WHERE t = 'staff_device_codes' AND c = 'multi_use')),
 ('100 fn ring_org',                        EXISTS (SELECT 1 FROM fn WHERE n = 'ring_org')),
 ('102 tbl payment_void_log',               to_regclass('public.payment_void_log') IS NOT NULL),
 ('103 col push_subscriptions.device_id',   EXISTS (SELECT 1 FROM col WHERE t = 'push_subscriptions' AND c = 'device_id')),
 ('105 col settings.notification_prefs',    EXISTS (SELECT 1 FROM col WHERE t = 'settings' AND c = 'notification_prefs')),
 ('107 bildirim kuralı source''a bakıyor',  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'notify_push_on_reservation' AND prosrc LIKE '%NEW.source%'))
) AS v(n, ok);
SQL
```

### 3 · Canlı fonksiyonlar ↔ depo

Çıktıyı masaüstüne kaydeder. Sonra söyle, depodaki özetlerle karşılaştırayım.

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'cd /data/coolify/services/t6yi63jbebvj6c7oo7yjofnt/volumes/functions && find . -name "*.ts" | sort | xargs sha256sum | sed "s#  \./#  #"' > ~/Desktop/sunucu-fonksiyon-ozet.txt && wc -l ~/Desktop/sunucu-fonksiyon-ozet.txt
```

Beklenen fark: `_shared/wa.ts` ve `remind/index.ts`. Bunlar yerelde
değişti, deploy'ları bilinçli ertelendi. Sunucuda fazladan `main/index.ts`
(ve belki `hello/`) görülmesi de normal: bunlar Supabase'in kendi
yönlendiricisi. **Başka fark varsa** canlı sunucu depodan geri demektir.
