# Luera TimeFlow Mobil — Master Prompt

İki ayrı prompt var ve **sırayla** kullanılacak:

- **BÖLÜM A → Claude Design.** Görsel tasarımı üretir (tek HTML, tüm ekranlar ve durumlar).
- **BÖLÜM B → Codex.** A'dan çıkan tasarımı Expo/React Native uygulamasına çevirir.

B'yi A bitmeden çalıştırmayın: Codex'e "tasarımı sen uydur" demek, mevcut
mobilin başına geleni tekrarlamak olur (dil dağılır, her ekran başka bir ürün
gibi görünür).

## Kararlar (kullanıcı onaylı, 2026-08-09)

| Konu | Karar |
|---|---|
| Teknoloji | **Expo / React Native** — gerçek native, iOS 26 Liquid Glass materyali |
| Kapsam | **Tüm mobil**: müdür cep paneli + personel kumandası |
| Cam kullanımı | **Yalnız kabuk** — tab bar ve üst bar cam; içerik düz ve sıcak |
| Kumanda yetenekleri | İşlemi başlat/bitir + sayaç · hizmet ve malzeme ekleme · adisyonu kasaya gönderme · kendi cirosu (açılıp kapanabilir) |

## Başlamadan kapatılması gereken beş ön koşul

Bunlar tasarımı engellemez ama **uygulama çalışmaz**; Codex'e geçmeden önce
kapatın:

1. **`082_staff_auth.sql` uygulanmadı.** Personel kimliği sunucuda doğrulanmıyor;
   bugün PIN hash'i tarayıcıya iniyor.
2. **`083` hiç yazılmadı** — `staff.pin` sütununun istemciden gizlenmesi. 082'nin
   kendi notu "StaffLogin staff-api'ye geçerken AYNI ANDA uygulanmalı" diyor.
3. **`staff-api` şu an `{"error":"not_configured"}` dönüyor** (STAFF_JWT sırrı
   yok). Mevcut uçlar: `device.pair`, `roster`, `session.start`,
   `me`/`session.refresh`. Kumandanın ihtiyaç duyacağı işlem uçları (başlat,
   bitir, kalem ekle, adisyon gönder) **henüz yok, yazılacak.**
4. **Push bildirimi native'de çalışmaz.** `send-push` Web Push (VAPID) kullanıyor;
   iOS uygulaması APNs ister. Expo Push Token'ı ayrı bir kanal olarak eklenecek.
5. **Apple Developer hesabı** ($99/yıl) ve TestFlight kurulumu — pilotta personel
   telefonlarına dağıtımın tek yolu.

---
---

# BÖLÜM A — CLAUDE DESIGN PROMPTU

*(Aşağıdaki metni olduğu gibi Claude Design'a yapıştırın.)*

Bir mobil uygulamanın **tam arayüz tasarımını** yap. Türkçe. iOS öncelikli.

## Ürün

**Luera TimeFlow** — Türkiye'deki küçük randevulu işletmeler için randevu ve
işletme yönetimi yazılımı. Aynı çekirdek 13 sektöre bürünüyor: güzellik salonu,
kuaför, berber, estetik kliniği, diş hekimi, sağlık kliniği, fizyoterapi, dövme
stüdyosu, avukatlık, danışmanlık, spor salonu, gelinlikçi, restoran.

Masaüstü sürümü çalışıyor ve satışa hazır. Bu tasarım **mobili sıfırdan** kuruyor.

## İki ayrı kullanıcı, iki ayrı mod

Uygulama tek ama içinde **iki mod** var ve ikisi bambaşka insanlar için:

**1. MÜDÜR MODU — "cep masaüstü".** İşletme sahibi. Salonda değilken bile her
şeyi görmek ister: bugün ne kadar ciro oldu, kaç randevu var, kim geldi kim
gelmedi, kasada ne bekliyor. Bilgi yoğun ama telefonda okunabilir olmalı.

**2. PERSONEL MODU — "kumanda".** Kuaför, hekim, estetisyen. Elleri dolu,
ayakta, çoğu zaman tek elle ve müşterinin yanında bakıyor. **Bu bir yönetim
paneli değil, bir kumanda:** üç dokunuşta işini bitirmeli. Ekranda ne kadar az
şey varsa o kadar iyi. Personel yalnız KENDİ randevularını görür.

Mod değiştirme müdürün elinde; personel kendi moduna kilitlidir.

## Kullanıcı gerçeği — tasarımı bu belirlesin

- **Teknik değiller.** 40–55 yaş sık. "Alan", "kayıt", "senkronize" gibi yazılım
  dili kullanma.
- **Tek elle, ayakta, kötü ışıkta.** Ana eylemler başparmak bölgesinde (ekranın
  alt üçte biri) olmalı; kritik butonu üst köşeye koyma.
- **Islak/eldivenli parmak.** Dokunma hedefi en az 44×44 pt, tercihen 50.
- **Zaman baskısı var.** Müşteri karşıda bekliyor. Onay diyaloğu ancak geri
  alınamaz bir işlemde çıkar.
- **Bağlantı kopar.** Salonun bodrum katında sinyal yoktur; arayüz "kaydedildi"
  demeden önce gerçekten kaydettiğinden emin olmalı, olamıyorsa bunu söylemeli.

## Tasarım dili — Liquid Glass, ama YALNIZ KABUKTA

iOS 26'nın Liquid Glass materyali kullanılacak. **Kritik kısıt: cam yalnız
kroma uygulanır, içeriğe değil.**

- **CAM OLAN:** yüzen alt tab bar, üst başlık çubuğu, modal sheet'lerin tutamağı,
  ve varsa yüzen aksiyon butonu.
- **CAM OLMAYAN:** kartlar, listeler, formlar, tablolar, metin blokları. Bunlar
  düz, opak, sıcak yüzeyler.

Gerekçe pazarlık konusu değil: bulanık zemin üzerindeki metnin kontrastı düşer
ve hedef kitlemiz 40–55 yaş. Apple'ın kendi kullanımı da böyle — cam navigasyon
katmanıdır, içerik katmanı değil.

Cam davranışı: kaydırınca tab bar küçülür ve içerik altından geçerken renk alır;
aktif sekme camın içinde kayan bir vurgu olarak hareket eder. Erişilebilirlikte
"saydamlığı azalt" açıksa cam **opak bir yüzeye düşer** — bu hâli de tasarla.

## Renkler — ürünün mevcut paleti

Sıcak-nötr krem/kahve. Turuncu **tek** vurgu rengi, bol kullanılmaz.

**Aydınlık:** zemin `#F3ECE0` · yüzey `#FAF7F3` · yüzey2 `#F0E9DF` · kart
`#FFFDFB` · metin `#0E0E0E` · ikincil metin `rgba(14,14,14,.52)` · kenarlık
`rgba(14,14,14,.10)` · turuncu `#FF5A1F` · koyu turuncu `#E8430F` · yeşil
`#2D8F32` · amber `#B87A00` · kırmızı `#C94040`

**Karanlık:** zemin `#120E08` · yüzey `#1C1710` · yüzey2 `#252015` · kart
`#241E16` · metin `#F3EDE3` · ikincil metin `rgba(243,237,227,.58)` · kenarlık
`rgba(243,237,227,.11)` · turuncu `#FF5A1F` · açık turuncu `#FF7A45` · yeşil
`#5FBF64` · amber `#D9A43B` · kırmızı `#E07272`

İkisini de tasarla. Cam katmanın tint'i bu paletten alınır (turuncu değil, nötr).

**Yazı tipi:** Hanken Grotesk (yedek Inter, system-ui). Başlıklar 800 ağırlık ve
sıkı harf aralığı (-0.03em); gövde 15–16 pt, 500–600.

**Emoji kullanma.** Sade çizgi ikonlar (1.7 kalınlık, yuvarlak uç).

## Tasarlanacak ekranlar

### Ortak kabuk
1. **Tab bar** — en fazla 5 sekme. Müdür ve personel için ayrı sekme setleri.
   Kaydırınca küçülen hâlini de göster.
2. **Üst bar** — işletme adı/kullanıcı, bildirim zili, mod değiştirici (müdür).
3. **Bottom sheet** — yarım ve tam yükseklik varyantları.

### PERSONEL MODU (kumanda) — asıl iş burada
4. **Giriş** — cihaz eşleştirme kodu → personel listesinden kendini seç → 4
   haneli PIN. Üç adım, her biri tek ekran. Yanlış PIN'de kilitlenme uyarısı.
5. **Bugün (ana ekran)** — ekranın yarısını **sıradaki randevu** kaplar: müşteri
   adı, hizmet, saat, tek büyük buton *"İşleme başla"*. Altında günün kalan
   randevuları küçük satırlar hâlinde. Devam eden bir işlem varsa en üstte canlı
   sayaçlı bir şerit.
6. **Randevu detayı** — müşteri bilgisi, hizmet, süre, not; müşteri kartına geçiş.
7. **DEVAM EDEN İŞLEM** *(en önemli ekran)* — büyük canlı süre sayacı; üç eylem:
   *hizmet ekle*, *malzeme ekle*, *not/fotoğraf ekle*; altta tek belirgin buton
   *"İşlemi bitir"*. Eklenen kalemler liste hâlinde ve tutar canlı güncellenir.
8. **Hizmet ekleme sheet'i** — arama + sık kullanılanlar; fiyat ve süre görünür.
9. **Malzeme ekleme sheet'i** — miktarlı ("2 tüp boya"). Stoktan düşecek.
10. **İşlemi bitir → özet** — yapılanlar, toplam tutar, *"Adisyonu kasaya gönder"*.
    Gönderdikten sonra ne olduğunu açıkça söyleyen bir onay ekranı.
11. **Müşteri kartı** — geçmiş işlemler, notlar, kalan paket/seans, **risk
    bayrağı** (alerji, hamilelik gibi — dikkat çekmeli ama korkutmamalı).
12. **Benim performansım** — günlük/aylık ciro, işlem sayısı, prim. **Bu ekran
    kapatılabilir olacak**: bazı işletme sahipleri personeller arası kıyas
    istemiyor. Kapalıyken sekme hiç görünmez, "yetkiniz yok" demez.
13. **Profil** — bildirim izni, tema, çıkış.

### MÜDÜR MODU (cep paneli)
14. **Bugünün akışı** — ciro, doluluk oranı, gelen/gelmeyen, bekleyen adisyon,
    WhatsApp botunun durumu. Kart ızgarası, tek bakışta okunur.
15. **Takvim** — gün görünümü, personel sütunları; telefonda yatay kaydırma.
16. **Hızlı randevu oluştur** — müşteri ara/ekle → hizmet → gün → saat. Dört adım.
17. **Müşteriler** — arama, son gelenler, müşteri kartı.
18. **Kasa** — bekleyen adisyonlar, tahsilat alma, günün özeti.
19. **Bildirimler** — yeni randevu, iptal, ödeme, WhatsApp devri.
20. **Ayarlar** — işletme, personel, WhatsApp, abonelik.

## Tasarlanacak DURUMLAR (mutlu yol yetmez)

- **Yükleniyor** — iskelet (skeleton), boş beyaz ekran değil.
- **Boş** — "bugün randevunuz yok" hâli; ne yapılacağını söylesin.
- **Çevrimdışı** — üstte ince bant; hangi işlemlerin sıraya alındığı görünsün.
- **Hata** — kaydedilemedi; tekrar dene butonu.
- **İzin** — bildirim izni isteme ekranı (neden gerektiğini bir cümleyle anlat).
- **Kilitli** — abonelik bitmiş; ödeme duvarının mobil hâli.
- **Erişilebilirlik** — "saydamlığı azalt" ve büyük yazı tipi açıkken tab bar.

## Ölçüler ve teslim

- Cihaz: **393 × 852 pt** (iPhone 16 Pro). Güvenli alanları göster (üst 59,
  alt 34). Küçük telefon (375 × 667) için sıkışan yerleri ayrıca belirt.
- **REACT NATIVE'E TAŞINACAK — bunu bilerek tasarla:**
  - Yalnız **flexbox** kullan. CSS grid, float, `position: sticky` YOK.
  - Gölge yerine mümkün olduğunca kenarlık ve yüzey farkı kullan (RN'de gölge
    platformlar arası tutarsız).
  - Metin kırpma, satır sayısı sınırı gibi şeyleri açıkça belirt.
- Çıktı: **tek, kendi kendine yeten HTML dosyası.** Inline CSS, harici font/CDN
  yok. Tüm ekranları **telefon çerçeveleri içinde, alt alta ve etiketli** göster
  ("Personel 07 — Devam eden işlem", "Durum: çevrimdışı"). Sekmeli prototip
  yapma; hepsini aynı anda görmem gerekiyor.
- Cam efektini HTML'de `backdrop-filter` ile taklit et ve **hangi katmanın cam
  olduğunu bir not satırıyla işaretle** — native tarafta gerçek materyalle
  değiştirilecek.

## Ton

Sakin, net, güven veren. Kutlama yok ("Harika iş!"), abartı yok. Personel
kumandasında **her ekran tek bir soruya cevap versin**; ikinci bir şey soruyorsa
o ekran ikiye bölünmeli.

---
---

# BÖLÜM B — CODEX PROMPTU

*(A'dan çıkan HTML hazır olduktan sonra, bu metni Codex'e verin.)*

## Görev

`Luera TimeFlow Mobil.html` tasarımını **Expo / React Native** uygulamasına
çevir. Tasarım dosyası tek kaynaktır: ölçüler, renkler, boşluklar ve akış oradan
gelir; kendinden yeni ekran uydurma.

## Depo ve kurulum

- Mevcut depo: `~/Desktop/luera-timeflow` (React 19 + Vite web uygulaması).
- Mobil uygulama **`mobile/` klasöründe ayrı bir Expo projesi** olarak kurulacak;
  web tarafına dokunma.
- **Expo SDK 54+**, **Expo Router v6**, TypeScript, `strict: true`.
- Saf mantık paylaşılacak, kopyalanmayacak. Web tarafındaki şu dosyalar
  doğrudan import edilir (gerekirse `mobile/tsconfig.json`'a path alias ekle):
  `src/lib/sectorProfiles.ts`, `src/lib/staffPermissions.ts`,
  `src/lib/plans.ts`, `supabase/functions/_shared/entitlement.ts`.
  Bu dosyalar bilinçli olarak saftır — React, DOM ve Deno bağımlılığı yoktur.

## Liquid Glass — gerçek materyal, taklidi değil

- Tab bar: **Expo Router `NativeTabs`**. iOS 26'da Liquid Glass, iOS 18 ve
  altında klasik tab bar, Android'de Material 3 — üçü de kendiliğinden.
- Diğer cam yüzeyler (üst bar, sheet tutamağı): **`expo-glass-effect`** →
  `<GlassView glassEffectStyle="regular" isInteractive tintColor={...}>`.
  Birden çok cam yüzey yan yanaysa `<GlassContainer>` ile birleştir.
- **`isLiquidGlassAvailable()` KONTROLÜ ZORUNLU.** false dönüyorsa opak yüzeye
  düş; `GlassView` eski iOS'ta sessizce düz `View`'a dönüyor ama biz o hâlde
  kenarlık ve zemin vermezsek kabuk görünmez olur.
- `AccessibilityInfo.isReduceTransparencyEnabled()` açıksa cam KULLANMA. Bu bir
  tercih değil, okunabilirlik şartı.
- Camı içerik kartlarına uygulama. Tasarımda hangi katmanın cam olduğu
  işaretli; o listenin dışına çıkma.

## Kimlik ve veri

**İki ayrı kimlik var, karıştırma:**

- **Müdür**: Supabase oturumu (`@supabase/supabase-js`, `AsyncStorage` ile
  kalıcı). RLS zaten org bazlı; müdür web'deki verinin aynısını görür.
- **Personel**: **`staff-api` edge fonksiyonu**, Supabase oturumu DEĞİL.
  Mevcut uçlar: `device.pair`, `roster`, `session.start`, `me`,
  `session.refresh`. Personelin cihazına org sahibinin oturumunu koymak, ayrılan
  çalışanın erişimini kesilemez yapar — bu yüzden dar API var.
- Kumandanın işlem uçları **henüz yok, sen yazacaksın** (aynı dosyada, aynı
  desende): `visit.start`, `visit.addItem`, `visit.finish`, `visit.toCashier`.
  Hepsi token'daki `staff_id` ve `org` ile sınırlı çalışmalı; gövdeden gelen
  kimliğe asla güvenme.
- **Abonelik kapısı mobilde de geçerli.** `staff-api` zaten `checkAccess`
  çağırıyor; müdür tarafında `org_entitlement` okunup kilitliyse ödeme duvarının
  mobil hâli gösterilir.

## Çevrimdışı davranış — kumandanın en kritik parçası

Salonun bodrumunda sinyal yok. Personel "işlemi bitir"e bastığında istek
düşerse, veri KAYBOLMAMALI.

- Yazma işlemleri **iyimser** uygulanır ve yerel bir kuyruğa yazılır
  (AsyncStorage). Bağlantı gelince sırayla gönderilir.
- Her isteğe **istemci tarafında üretilen bir idempotency anahtarı** koy; tekrar
  gönderim çift kayıt oluşturmasın. (Web tarafındaki `wa_inbound_seen` deseni
  aynı problemi çözüyor, ona bak.)
- Arayüz "kaydedildi" demeden önce ya sunucudan onay almalı ya da "sıraya
  alındı, bağlantı gelince gönderilecek" demeli. Yalan söyleyen bir onay,
  hiç onay vermemekten kötüdür.

## Bildirimler

`send-push` **Web Push (VAPID)** kullanıyor; iOS uygulamasında çalışmaz.
`expo-notifications` ile Expo Push Token alınacak ve `push_subscriptions`
tablosuna **ayrı bir kanal** olarak yazılacak (`kind: 'expo'`), `send-push` de
o kanala Expo Push API üzerinden gönderecek. Mevcut web aboneliklerini bozma.

## Kod kuralları (bu depo için)

- Yorumlar **Türkçe** ve **NEDEN**'i anlatır, ne yaptığını değil. Bir kararın
  arkasında canlıda yaşanmış bir olay varsa onu yaz.
- Sektöre göre değişen her şey **registry dosyalarından** okunur; bileşenin
  içinde `if (sector === 'dis')` yazma. Bu kuralın 13 sektörlük bir sebebi var.
- Saf mantık (süre hesabı, tutar toplama, durum makinesi) React'ten ayrı
  dosyalarda dursun ve `node --test` ile test edilsin — depoda 510 test bu
  desende yazıldı, `tests/` klasörüne bak.
- Para ve süre biçimlendirmesi tek yerde; üç ekranda üç farklı biçim çıkmasın.
- Dokunma hedefi 44 pt altına düşmesin.

## Teslim sırası

Tek seferde her şeyi yazma. Şu sırayla ilerle ve her adımda çalışır bir şey bırak:

1. Expo projesi + tasarım jetonları (renk, tipografi, boşluk) + tab bar kabuğu.
2. Personel girişi (cihaz eşleştirme → PIN) ve `staff-api` istemcisi.
3. Personel: Bugün → Randevu detayı → **Devam eden işlem** → Bitir → Adisyon.
4. Çevrimdışı kuyruğu ve idempotency.
5. Müşteri kartı, performans ekranı (kapatılabilir).
6. Müdür modu: Bugünün akışı → Takvim → Kasa → Müşteriler.
7. Bildirimler (Expo Push) ve abonelik duvarı.

Her adım sonunda: `npx tsc --noEmit`, `node --test`, ve simülatörde ekran
görüntüsü.
