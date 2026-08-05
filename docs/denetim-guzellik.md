# Güzellik Sektörü Denetimi

## 0. Özet

- **Kritik:** Hamilelik kontrendikasyonu yalnız `BeautySessionModal` içinde, hizmet adına regex uygulanarak çalışıyor; masaüstü genel takvim, mobil seans oluşturma, düzenleme ve paket satış yüzeyleri aynı müşteriye lazer/incelme seçilmesine izin veriyor (`src/components/beauty/BeautySessionModal.tsx:34-35`, `src/pages/CalendarPage.tsx:490-551`, `src/mobile/pages/MobileNewReservation.tsx:334-349`, `src/pages/BeautyPackages.tsx:845-881`).
- **Kritik:** Seansın ilk kez finansal olarak kapanması yanlış hesaplanıyor: `wasClosed`, `UPDATE ... RETURNING` ile gelen güncellenmiş satırdan okunuyor; dolayısıyla `becameClosed` hiçbir kapanışta `true` olamıyor ve recall ile tekrar-seans otomasyonu tetiklenmiyor (`src/hooks/useReservations.ts:685-707`, `src/hooks/useReservations.ts:747-755`, `src/hooks/useReservations.ts:763-803`).
- **Yüksek:** Güzellik paketleri masaüstünde `treatment_plans`, mobil müşteri kartında `customer_packages` kullanıyor; iki ayrı hak sayacı ve ayrıca bütün tamamlanan seanslara çalışan eski DB trigger'ı bulunuyor (`src/hooks/useOrgPackages.ts:22-27`, `src/mobile/pages/MobileCustomers.tsx:118-125`, `supabase/017_customer_packages.sql:32-61`).
- **Yüksek:** Profilde tekil “Seans” doğru, çoğul “Seanslar” eksik; güzellik takvim yüzü kaydı yok ve masaüstündeki premium kasa mobilde jenerik kasaya düşüyor (`src/lib/sectorProfiles.ts:120`, `src/lib/sectorProfiles.ts:22-25`, `src/lib/calendarSectorProfiles.ts:49-58`, `src/App.tsx:126`, `src/mobile/pages/MobileKasa.tsx:22-25`).
- **Orta/Yüksek:** Özel alanlar kaydediliyor fakat günlük seans yüzeylerinde üçü birlikte görünmüyor; buna ek olarak paket/kasa CSS'inde global seçiciler, hardcoded renkler, mor gradyan, glassmorphism, yanlış font ve 44 px altı hedefler var (`src/pages/BeautyCustomerPage.tsx:84-86`, `src/pages/CalendarPage.tsx:270-276`, `src/pages/beautyCash.css:47-68`, `src/pages/beautyCash.css:240-245`, `src/pages/beautyCash.css:615-619`).

## 1. Profil bütünlüğü

| Alan | Beklenen | Koddaki | Durum ✓/✗ |
|---|---|---|---|
| Anahtar | `guzellik` | Kayıt mevcut (`src/lib/sectorProfiles.ts:117`) | ✓ |
| Etiket | Güzellik / Salon | `Güzellik / Salon` (`src/lib/sectorProfiles.ts:118`) | ✓ |
| Modül seti | RANDEVU; `sira` kapalı | Ortak `RANDEVU`: randevu/personel/hizmet/kasa/analiz açık, masa/sıra kapalı (`src/lib/sectorProfiles.ts:95`, `src/lib/sectorProfiles.ts:119`) | ✓ |
| Tekil terminoloji | Randevu → Seans | `reservation: 'Seans'` (`src/lib/sectorProfiles.ts:120`) | ✓ |
| Çoğul terminoloji | Rezervasyonlar → Seanslar | `reservations` yazılmamış; `DEFAULT_LABELS.reservations = 'Rezervasyonlar'` değerine düşüyor (`src/lib/sectorProfiles.ts:22-25`, `src/lib/sectorProfiles.ts:120`) | ✗ |
| Yeni kayıt etiketi | Yeni seans | `newReservation: 'Yeni seans'` (`src/lib/sectorProfiles.ts:120`) | ✓ |
| Müşteri terminolojisi | Müşteri | Override yok; doğru varsayılana düşüyor (`src/lib/sectorProfiles.ts:22-24`, `src/lib/sectorProfiles.ts:120`) | ✓ |
| Personel rolü | Uzman; bakım, müşteri kaydı ve tahsilat | Etiket ve açıklama beklentiyle aynı (`src/lib/sectorProfiles.ts:121`) | ✓ |
| Masaüstü dashboard | `guzellikFace` → `GuzellikDashboard` | Profil anahtarı ve registry eşleşiyor (`src/lib/sectorProfiles.ts:122`, `src/pages/DashboardPage.tsx:34-47`) | ✓ |
| Mobil dashboard | Özel yüz yok; randevu yüzüne düşer | Registry'de `guzellikFace` yok, fallback `MobileRandevuHome` (`src/mobile/pages/MobileHome.tsx:21-26`, `src/mobile/pages/MobileHome.tsx:34-39`) | ✓ |
| Özel alanlar | Cilt tipi, alerji, hamilelik | Üç alan ve dört cilt seçeneği doğru (`src/lib/sectorProfiles.ts:123-128`) | ✓ |
| Kaynak tipi | Kabin | `resourceTypes: ['Kabin']` (`src/lib/sectorProfiles.ts:129`) | ✓ |
| Paketler | Açık | Nav'da güzellik/kuaför için görünür; kasa profili paket yeteneğini açıyor (`src/lib/nav.ts:33`, `src/lib/cashSectorProfiles.ts:44-47`) | ✓ |
| WhatsApp persona/audience | sıcak, samimi, şımartan / müşterimiz | Doğru (`src/lib/sectorProfiles.ts:130`) | ✓ |
| `serviceWord` / `servicePhrase` | bakım / bakımınızı | İkisi de doğru; “bakımınızı” Türkçe iyelik ve belirtme eki bakımından doğru (`src/lib/sectorProfiles.ts:130`) | ✓ |
| Emoji | ✨ | Doğru (`src/lib/sectorProfiles.ts:130`) | ✓ |
| Recall | bakım yenileme / 30 gün | Profil doğru (`src/lib/sectorProfiles.ts:130`), fakat çalışma zamanı bu varsayılanı takvime yazmıyor (`src/hooks/useReservations.ts:763-774`) | ✗ |
| Guardrail | Lazer/medikal işlem için gerekli | `guardrail` yok (`src/lib/sectorProfiles.ts:57-72`, `src/lib/sectorProfiles.ts:130`). Tıbbi uygunluk/teşhis üretmemesi ve profesyonel onay istemesi zorunlu kılınmalı. | ✗ |
| Takvim yüzü | Güzelliğe uygun yüz | `CALENDAR_PROFILES` içinde güzellik satırı yok; dört yüz de `genel`e düşüyor (`src/lib/calendarSectorProfiles.ts:35-40`, `src/lib/calendarSectorProfiles.ts:49-58`) | ✗ |
| Kasa profili | Ortak premium kasa | Güzellik profili mevcut, paket açık ve müşteri kartı doğru route'a gidiyor (`src/lib/cashSectorProfiles.ts:44-47`); masaüstü `BeautyCashRegister` seçiyor (`src/pages/KasaPage.tsx:210-218`) | ✓ |
| Nav | RANDEVU sayfaları + Paketler + Kasa + Stok; sıra yok | Modül/sector filtreleri doğru; fakat çoğul profil eksikliği nedeniyle sidebar “Rezervasyonlar” gösterir (`src/lib/nav.ts:24-39`, `src/lib/sectorProfiles.ts:120`) | ✗ |
| Hizmet seed'i | Salon hizmetleri ve recall günleri | Yalnız `dis` seed'i var; güzellikte lazer/incelme sınıflandırması ve hizmet bazlı `recallDays` başlangıcı yok (`src/lib/serviceSeeds.ts:27-45`) | ✗ |

### Mimari tek-kaynak ihlalleri

- Güzellik takvim tıklaması bileşen içinde `settings.sector === 'guzellik'` ile ayrılıyor; davranış `calendarSectorProfiles.ts` kaydından gelmeli (`src/pages/CalendarPage.tsx:252-262`).
- Müşteri ekranı `isBeauty` üretip “Müşteri Kartı” butonunu koşullu çiziyor; yüz seçimi `calendarSectorProfiles.ts` üzerinden yapılmalı (`src/pages/CustomersPage.tsx:63-67`, `src/pages/CustomersPage.tsx:344-347`).
- Paket yüzü bileşen içinde güzellik/kuaför listesiyle seçiliyor; saf bir yüz anahtarı `sectorProfiles.ts` veya saf bir paket-yüzü registry'sinden okunmalı (`src/pages/PackagesPage.tsx:57-78`).
- Güzelliğin kullandığı jenerik yüzlerde diş davranışı da doğrudan sektör koşullarıyla çözülüyor: rezervasyon kartları (`src/pages/ReservationsPage.tsx:190-192`, `src/pages/ReservationsPage.tsx:243-246`, `src/pages/ReservationsPage.tsx:316-317`, `src/pages/ReservationsPage.tsx:534-538`), takvim müşteri bağlamı (`src/pages/CalendarPage.tsx:1219-1224`), mobil müşteri detayı (`src/mobile/pages/MobileCustomers.tsx:143-183`, `src/mobile/pages/MobileCustomers.tsx:223-225`) ve mobil oluşturucu (`src/mobile/pages/MobileNewReservation.tsx:178-183`, `src/mobile/pages/MobileNewReservation.tsx:460-463`, `src/mobile/pages/MobileNewReservation.tsx:572-576`). Bunlar güzellikte `false` çalışsa da mimari kuralı ihlal ediyor.
- Ortak WhatsApp ve mobil tahsilat bileşenleri de sektör karşılaştırıyor; örnek isim/dağıtım yeteneği profilden gelmeli (`src/components/settings/WhatsAppTab.tsx:94`, `src/mobile/TahsilatSheet.tsx:46-49`).
- Diş route kapıları sayfa içinde tutulmuş; route/face registry'si yerine doğrudan sektör kontrolü var (`src/pages/DentalChartPage.tsx:158-159`, `src/pages/DentalVisitPage.tsx:1056`, `src/pages/PatientFilePage.tsx:221`).

## 2. Akış bulguları

### 2.1 Yeni müşteri → özel alanlar → seans ekranında görünürlük

**İzlenen dosyalar:** `src/lib/sectorProfiles.ts:123-128` → `src/components/CustomFieldsSection.tsx:15-51` → `src/pages/CustomersPage.tsx:148-174` / `src/mobile/NewCustomerSheet.tsx:10-35` → `src/hooks/useCustomers.ts:430-475` → `src/pages/CalendarPage.tsx:264-276` / `src/pages/BeautyCustomerPage.tsx:84-86`.

- **Çalışan bölüm — düşük:** Masaüstü ve mobil tam müşteri formları profil tanımlarını çiziyor, değerleri `custom_fields` alanına ekliyor/güncelliyor; DB kolonları da var (`src/pages/CustomersPage.tsx:149-170`, `src/mobile/NewCustomerSheet.tsx:14-35`, `src/hooks/useCustomers.ts:430-475`, `supabase/050_custom_fields.sql:7-12`).
- **BULGU — yüksek:** Hızlı müşteri ekleme yolları bu alanları hiç sormuyor: güzellik seans modalı yalnız ad/telefon kaydediyor (`src/components/beauty/BeautySessionModal.tsx:215-235`), paket satış drawer'ı boş `customFields` yazıyor (`src/pages/BeautyPackages.tsx:861-871`), rezervasyon hook'unun otomatik müşteri oluşturması alanları yazmıyor (`src/hooks/useReservations.ts:459-468`). Risk bilgisi en hızlı ve en sık kullanılan yollarda kayboluyor.
- **BULGU — yüksek:** Üç alan yalnız güzellik müşteri kartında birlikte görünür (`src/pages/BeautyCustomerPage.tsx:84-86`, `src/pages/BeautyCustomerPage.tsx:116-124`). Genel takvim yalnız alerji/ilaç/kronik listeler; cilt tipi ile hamileliği dışarıda bırakır (`src/pages/CalendarPage.tsx:270-276`, `src/pages/CalendarPage.tsx:1201-1217`). Mobil takvim ve mobil müşteri detayı bu alanları göstermiyor (`src/mobile/pages/MobileCalendar.tsx:99-110`, `src/mobile/pages/MobileCustomers.tsx:143-215`). Beklenen “seans ekranında görünürlük” tamamlanmamış.
- **BULGU — orta:** Jenerik müşteriler sayfası medikal uyarı noktasını yalnız alerji/ilaç/kronikten üretir; hamilelik görünmez ve gerçek güzellik kartına ulaşmak için ayrıca “Müşteri Kartı” tıklanır (`src/pages/CustomersPage.tsx:28-34`, `src/pages/CustomersPage.tsx:278-285`, `src/pages/CustomersPage.tsx:344-347`).

### 2.2 Hamilelik → lazer/incelme kontrendikasyonu

**İzlenen dosyalar:** `src/lib/sectorProfiles.ts:126-127` → `src/components/beauty/BeautySessionModal.tsx:34-35` → `src/components/beauty/BeautySessionModal.tsx:93-131` → `src/components/beauty/BeautySessionModal.tsx:353-416`.

- **Çalışan bölüm — düşük:** `BeautySessionModal`, hamile müşteri seçilince açık uyarı gösteriyor; eşleşen aktif paketleri ve tekil hizmetleri `disabled` yapıyor (`src/components/beauty/BeautySessionModal.tsx:97`, `src/components/beauty/BeautySessionModal.tsx:125-130`, `src/components/beauty/BeautySessionModal.tsx:353-357`, `src/components/beauty/BeautySessionModal.tsx:373-416`).
- **BULGU — kritik:** `/calendar` güzellikte jenerik `CalendarPage` olduğu için aynı kural uygulanmıyor; tüm hizmetler seçilebilir ve rezervasyon kaydedilebilir (`src/lib/calendarSectorProfiles.ts:49-58`, `src/pages/CalendarPage.tsx:490-551`). Mobil oluşturucu da hamileliği okumadan tüm hizmetleri seçtiriyor (`src/mobile/pages/MobileNewReservation.tsx:43-45`, `src/mobile/pages/MobileNewReservation.tsx:334-349`, `src/mobile/pages/MobileNewReservation.tsx:206-213`).
- **BULGU — kritik:** Var olan seansı masaüstü ve mobil düzenleme yüzeylerinden lazer/incelmeye değiştirmek mümkün; müşteri risk alanı okunmuyor (`src/components/reservations/EditReservationModal.tsx:75-93`, `src/components/reservations/EditReservationModal.tsx:222-243`, `src/mobile/ReservationSheet.tsx:73-96`, `src/mobile/ReservationSheet.tsx:165-170`).
- **BULGU — kritik:** Hamile müşteriye lazer paketi satışı engellenmiyor; satış drawer'ında müşteri `customFields` kontrolü yok (`src/pages/BeautyPackages.tsx:825-845`, `src/pages/BeautyPackages.tsx:848-881`). Müşteri kartı paketi sonradan “beklemede” gösterse de “Seansı Planla” butonunu kapatmıyor (`src/pages/BeautyCustomerPage.tsx:156-184`).
- **BULGU — yüksek:** Kural yapılandırılmış hizmet özelliği değil, Türkçe ad regex'i (`/lazer|incelme|zayıflama|g5/i`); “epilasyon” gibi adlar kaçabilir ve serbest metin paket adları yanlış sınıflanabilir (`src/components/beauty/BeautySessionModal.tsx:34-35`, `src/pages/BeautyCustomerPage.tsx:156-160`). Uygunluk metadatası tek kaynaktan gelmeli; yalnız UI adına güvenilmemeli.
- **BULGU — yüksek:** Veritabanında kontrendikasyonu uygulayan bir politika/trigger yok; mevcut rezervasyon guard'ı yalnız tenant, personel ve kaynak çakışmasını doğruluyor (`supabase/060_reservation_conflict_guard.sql:95-119`, `supabase/060_reservation_conflict_guard.sql:276-370`). UI bypass'ı doğrudan kalıcı kayda dönüşebilir.

### 2.3 Paket satışı → hak düşümü → kalan → yenileme

**İzlenen dosyalar:** `src/pages/BeautyPackages.tsx:83-97` → `src/hooks/useOrgPackages.ts:22-27` → `src/components/beauty/BeautySessionModal.tsx:91-102` → `src/hooks/useReservations.ts:722-745` → `src/pages/BeautyPackages.tsx:197-233` → `supabase/functions/remind/index.ts:393-443`.

- **Çalışan bölüm — orta:** Satış `treatment_plans` kaydı açıyor (`src/hooks/useOrgPackages.ts:83-110`); seans plana `paket_plan_id` ile bağlanıyor (`src/components/beauty/BeautySessionModal.tsx:243-277`); paket sayfası kullanılan/rezerve/kullanılabilir hakları ve bakiyeyi gösteriyor (`src/pages/BeautyPackages.tsx:167-233`). Otomatik yenileme işi tamamlanmış planı bir kez mesajlayıp `renewal_offered_at` damgalıyor (`supabase/functions/remind/index.ts:393-443`).
- **BULGU — yüksek:** Beklentideki `customer_packages` motoru masaüstü satışta kullanılmıyor. Mobil müşteri detayı `useCustomerPackages()` ile eski tabloyu okurken masaüstü güzellik yüzleri `treatment_plans` okuyor (`src/hooks/useCustomerPackages.ts:19-38`, `src/mobile/pages/MobileCustomers.tsx:118-125`, `src/mobile/pages/MobileCustomers.tsx:190-200`, `src/hooks/useOrgPackages.ts:22-45`). Masaüstünde satılan paket mobilde görünmez.
- **BULGU — yüksek:** Eski `customer_packages` trigger'ı müşteri tamamlanan her seansında en eski aktif paketten hak düşürüyor; hizmet veya `paket_plan_id` eşleşmesi aramıyor (`supabase/017_customer_packages.sql:32-61`). Eski kayıt varsa aynı tamamlama hem `treatment_plans` sayacını hem ilgisiz legacy paketi etkileyebilir.
- **BULGU — yüksek:** `treatment_plans` hak artışı read-modify-write ve fire-and-forget; atomik RPC/koşullu update değil. Eşzamanlı tamamlamalar artışı kaybedebilir veya çift sayabilir (`src/hooks/useReservations.ts:725-744`). Dashboard hemen ardından refresh çağırdığı için arka plandaki artıştan önce eski sayacı tekrar okuyabilir (`src/components/dashboard/GuzellikDashboard.tsx:386-392`).
- **BULGU — orta:** Paketler sayfasındaki manuel teklif damga yazar (`src/pages/BeautyPackages.tsx:319-334`), fakat güzellik müşteri kartındaki “Teklif Gönder” doğrudan `wa.me` linkidir ve damga yazmaz (`src/pages/BeautyCustomerPage.tsx:189-196`). Cron aynı paket için ayrıca otomatik teklif gönderebilir (`supabase/functions/remind/index.ts:409-436`).
- **BULGU — düşük:** Şablon CRUD'u `package_templates` üzerinde çalışıyor ve RLS/realtime tanımlı (`src/hooks/usePackageTemplates.ts:39-68`, `src/hooks/usePackageTemplates.ts:70-109`, `supabase/069_package_rights_and_templates.sql:42-80`); bu kısım kopuk değil.

### 2.4 Seans → kabin ataması → çakışma

**İzlenen dosyalar:** `src/lib/sectorProfiles.ts:129` → `src/pages/SettingsPage.tsx:650-688` → `src/components/beauty/BeautySessionModal.tsx:133-206` → `src/components/beauty/BeautySessionModal.tsx:243-265` → `supabase/060_reservation_conflict_guard.sql:316-380`.

- **Çalışan bölüm — düşük:** Kabinler ayarlardan ad/kapasiteyle yönetiliyor (`src/pages/SettingsPage.tsx:650-688`); güzellik modalı personel ve kabin seçtiriyor/otomatik atıyor (`src/components/beauty/BeautySessionModal.tsx:193-206`, `src/components/beauty/BeautySessionModal.tsx:428-438`). Kayıt `resource_id` gönderiyor (`src/components/beauty/BeautySessionModal.tsx:250-265`, `src/hooks/useReservations.ts:570-595`).
- **Çalışan bölüm — düşük:** DB guard tenant sınırını doğruluyor, kaynak satırını kilitliyor ve kapasite dolduğunda `23P01` üretiyor (`supabase/060_reservation_conflict_guard.sql:106-119`, `supabase/060_reservation_conflict_guard.sql:171-194`, `supabase/060_reservation_conflict_guard.sql:316-380`). Jenerik resolver da kapasiteyi dikkate alıyor (`src/lib/slotResolution.ts:147-169`).
- **BULGU — orta:** `BeautySessionModal.isBusy/autoResource` herhangi bir overlap'i “dolu” sayıyor; kaynak `capacity > 1` olsa bile ilk eşzamanlı seans sonrası kabini elemiş oluyor (`src/components/beauty/BeautySessionModal.tsx:193-206`). DB kapasiteye izin verdiği için UI gereğinden fazla slot kapatır (`supabase/060_reservation_conflict_guard.sql:316-370`).
- **BULGU — orta:** Bütün kabinler doluysa `autoResource` `undefined` döndürüyor; `canSave` kabini zorunlu tutmuyor ve kayıt kabinsiz oluşturuluyor (`src/components/beauty/BeautySessionModal.tsx:193-197`, `src/components/beauty/BeautySessionModal.tsx:241-265`). “Kabin ataması” sessizce atlanabilir.
- **BULGU — orta:** Güzellikte asıl `/calendar` yüzü, güzellik modalındaki otomatik kabin seçimini kullanmıyor; yalnız kullanıcı kaynak seçerse ortak resolver kontrol ediyor (`src/pages/CalendarPage.tsx:279-283`, `src/pages/CalendarPage.tsx:490-493`, `src/lib/calendarSectorProfiles.ts:49-58`). Günlük iki giriş yolu farklı davranıyor.

### 2.5 Seans tamamlama → kasa → tahsilat

**İzlenen dosyalar:** `src/lib/sessionPhase.ts:13-18` → `src/components/dashboard/GuzellikDashboard.tsx:386-417` → `src/pages/BeautyCashRegister.tsx:159-180` → `src/pages/BeautyCashRegister.tsx:378-425` → `src/pages/BeautyCashRegister.tsx:760-905`.

- **Çalışan bölüm — düşük:** “İşlemi bitir” `serviceEndedAt` ve `status='completed'` yazar (`src/lib/sessionPhase.ts:40-44`, `src/components/dashboard/GuzellikDashboard.tsx:883-885`). Ödenmemiş tamamlanan seans premium kasa kuyruğuna gelir (`src/pages/BeautyCashRegister.tsx:159-180`, `src/pages/BeautyCashRegister.tsx:1000-1024`); başarılı tahsilattan sonra `isPaid` güncellenir (`src/pages/BeautyCashRegister.tsx:826-905`). Pakete bağlı hizmet kalemi ₺0 hesaplanır (`src/pages/BeautyCashRegister.tsx:378-411`).
- **BULGU — kritik:** Dashboard seçili kartındaki “Ödeme al” premium kasayı bypass eder, yöntemi sabit `cash` yazar ve `addPayment` sonucunu kontrol etmeden seansı `isPaid:true` kapatır (`src/components/dashboard/GuzellikDashboard.tsx:395-407`, `src/components/dashboard/GuzellikDashboard.tsx:887-889`). Ödeme insert'i başarısız olsa bile seans ödenmiş görünebilir.
- **BULGU — yüksek:** Premium kasa bir veya birkaç payment satırını önce oluşturup sonra rezervasyonu kapatıyor; geri alma mantığı var (`src/pages/BeautyCashRegister.tsx:769-847`, `src/pages/BeautyCashRegister.tsx:881-899`). Ancak ödeme silme/rezervasyon geri açma da ayrı isteklerdir; ikinci geri alma başarısızlığında yalnız metin uyarısı kalır (`src/pages/BeautyCashRegister.tsx:884-895`). Tam atomik finansal işlem değildir.
- **BULGU — yüksek:** Mobil `/kasa`, beklenen ortak `BeautyCashRegister` yerine `MobileRandevuKasa` render eder (`src/App.tsx:126`, `src/mobile/pages/MobileKasa.tsx:22-25`). Mobil takvim ödeme için ayrı `TahsilatSheet` kullanır (`src/mobile/pages/MobileCalendar.tsx:130-150`); tutarlılık ve paket-karşılama seçenekleri masaüstüyle aynı değildir.
- **BULGU — yüksek:** Kapanış sonrası recall/tekrar-seans işlemleri, güncellenmiş `serverRow` üzerinden `wasClosed` hesaplandığı için çalışmaz (`src/hooks/useReservations.ts:685-707`, `src/hooks/useReservations.ts:747-755`). Tahsilatın kendisi kaydolsa bile akışın sonrası kopuktur.

### 2.6 Recall: 30 gün sonra bakım yenileme

**İzlenen dosyalar:** `src/lib/sectorProfiles.ts:130` → `src/hooks/useReservations.ts:747-774` → `supabase/functions/remind/index.ts:254-292` → `src/components/settings/WhatsAppTab.tsx:647-650`.

- **Tetikleyici:** İstemci, seans hem `completed` hem `isPaid` olduğunda eşleşen hizmetin `recallDays` değerini `customers.recall_date` alanına yazmayı amaçlıyor (`src/hooks/useReservations.ts:747-774`). Edge işlevi tarihe iki gün kala mesaj gönderip `recall_reminded_for` damgası yazıyor (`supabase/functions/remind/index.ts:254-292`).
- **BULGU — kritik:** `becameClosed` hatası nedeniyle tetikleyici fiilen çalışmıyor (`src/hooks/useReservations.ts:750-755`).
- **BULGU — yüksek:** Profildeki `comms.recall.afterDays: 30` yalnız mesaj/ayar önizlemesinde kullanılıyor; `recall_date` yazarken fallback değil. Kod yalnız hizmetin `recallDays` alanını kabul ediyor (`src/lib/sectorProfiles.ts:130`, `src/hooks/useReservations.ts:763-774`, `src/components/settings/WhatsAppTab.tsx:647-650`). Güzellik seed'i de olmadığından varsayılan 30 gün kurulmaz (`src/lib/serviceSeeds.ts:27-45`).
- **BULGU — orta:** Arayüzde görünürlük jenerik “Kontrol zamanı” filtresi/rozetidir; güzellikte “bakım yenileme” dili kullanılmaz ve dashboard'da recall kuyruğu yok (`src/pages/CustomersPage.tsx:120-127`, `src/pages/CustomersPage.tsx:192`, `src/components/dashboard/GuzellikDashboard.tsx:441-449`).
- **Çalışan bölüm — düşük:** Kullanıcı WhatsApp ayarından recall'ı kapatabilir; varsayılan açık ve edge `featureOn(..., 'recall')` kontrolü yapar (`src/hooks/useWhatsApp.ts:32-35`, `src/components/settings/WhatsAppTab.tsx:265-271`, `src/components/settings/WhatsAppTab.tsx:700-721`, `supabase/functions/remind/index.ts:258`).

## 3. Ekran envanteri

`B/Y/H` sırasıyla boş durum / yüklenme durumu / hata durumu demektir. `Kısmi`, yalnız alt bölümün veya yalnız modül/profil yükünün ele alındığını belirtir.

| Sayfa | Route | Bileşen | Sektöre özel? | Terminoloji ✓/✗ | Boş/Yükleniyor/Hata |
|---|---|---|---|---|---|
| Ana ekran — masaüstü | `/` | `GuzellikDashboard` (`src/pages/DashboardPage.tsx:34-47`) | Evet | ✗; sabit “randevu/randevusuz” metinleri (`src/components/dashboard/GuzellikDashboard.tsx:446`, `src/components/dashboard/GuzellikDashboard.tsx:584-589`) | B ✓; Y ✗; H ✗ — veri hook'larının durumları alınmıyor (`src/components/dashboard/GuzellikDashboard.tsx:56-59`, `src/components/dashboard/GuzellikDashboard.tsx:579-637`) |
| Ana ekran — mobil | `/` | `MobileRandevuHome` fallback (`src/mobile/pages/MobileHome.tsx:21-39`) | Jenerik | ✗ (`src/mobile/pages/MobileHome.tsx:61`, `src/mobile/pages/MobileHome.tsx:123`, `src/mobile/pages/MobileHome.tsx:153`) | B ✓; Y kısmi: yalnız modül skeleton'ı; H ✗ (`src/mobile/pages/MobileHome.tsx:31-47`, `src/mobile/pages/MobileHome.tsx:163`) |
| Takvim — masaüstü | `/calendar` | `CalendarPage` (`src/pages/sectorFaces.tsx:21-24`, `src/pages/sectorFaces.tsx:43-47`) | Jenerik | ✗ (`src/pages/CalendarPage.tsx:721`, `src/pages/CalendarPage.tsx:1080`, `src/pages/CalendarPage.tsx:1571`) | B ✓; Y kısmi/boş `null`; H ✗ (`src/pages/sectorFaces.tsx:43-47`, `src/pages/CalendarPage.tsx:1080`) |
| Takvim — mobil | `/calendar` | `MobileCalendar` (`src/pages/sectorFaces.tsx:38-41`, `src/pages/sectorFaces.tsx:64-68`) | Jenerik | ✗ (`src/mobile/pages/MobileCalendar.tsx:92-110`) | B ✓; Y kısmi/boş `null`; H ✗ (`src/pages/sectorFaces.tsx:64-68`, `src/mobile/pages/MobileCalendar.tsx:99-110`) |
| Yeni seans — masaüstü | `/new` | `/reservations` redirect (`src/App.tsx:118`) | — | — | B/Y/H — yönlendirme |
| Yeni seans — mobil | `/new` | `MobileNewReservation` (`src/App.tsx:118`) | Jenerik | ✗ (`src/mobile/pages/MobileNewReservation.tsx:243`, `src/mobile/pages/MobileNewReservation.tsx:290`, `src/mobile/pages/MobileNewReservation.tsx:509`) | B ✗; Y ✗; H yalnız toast (`src/mobile/pages/MobileNewReservation.tsx:43-45`, `src/mobile/pages/MobileNewReservation.tsx:181-220`) |
| Seans listesi — masaüstü/mobil | `/reservations` | `ReservationsPage` (`src/pages/sectorFaces.tsx:26-29`, `src/App.tsx:119`) | Jenerik | ✗ (`src/pages/ReservationsPage.tsx:360-387`, `src/pages/ReservationsPage.tsx:465-505`) | B ✓; Y ✗; H ✗ (`src/pages/ReservationsPage.tsx:58`, `src/pages/ReservationsPage.tsx:459-466`) |
| Müşteriler — masaüstü | `/customers` | `CustomersPage` (`src/pages/sectorFaces.tsx:31-34`, `src/pages/sectorFaces.tsx:57-61`) | Jenerik + sektör `if`i | ✗ (`src/pages/CustomersPage.tsx:193`, `src/pages/CustomersPage.tsx:217-230`, `src/pages/CustomersPage.tsx:358`) | B ✓ fakat ilk yüklemeden ayırt edilmiyor; Y ✗; H ✗ (`src/pages/CustomersPage.tsx:61`, `src/pages/CustomersPage.tsx:272-275`) |
| Müşteriler — mobil | `/customers` | `MobileCustomers` (`src/App.tsx:120`) | Jenerik | ✗ (`src/mobile/pages/MobileCustomers.tsx:89`, `src/mobile/pages/MobileCustomers.tsx:163`, `src/mobile/pages/MobileCustomers.tsx:215`) | B ✓; Y kısmi: içerik gizleniyor, skeleton yok; H ✗ (`src/mobile/pages/MobileCustomers.tsx:26-27`, `src/mobile/pages/MobileCustomers.tsx:54-66`) |
| Güzellik müşteri kartı | `/beauty-customer/:customerId` | `BeautyCustomerPage` (`src/App.tsx:124`) | Evet | ✓ | Alt bölümlerde B ✓; Y ✗; H ✗; yükleme ve bulunamadı aynı metin (`src/pages/BeautyCustomerPage.tsx:48-54`, `src/pages/BeautyCustomerPage.tsx:89-94`, `src/pages/BeautyCustomerPage.tsx:153-154`, `src/pages/BeautyCustomerPage.tsx:215`) |
| Paketler | `/packages` | `BeautyPackages` (`src/pages/PackagesPage.tsx:59-79`) | Evet | ✗ (`src/pages/BeautyPackages.tsx:567`, `src/pages/BeautyPackages.tsx:629`, `src/pages/BeautyPackages.tsx:651-654`) | B ✓; Y ✓; H ✗, hook yalnız console'a yazar (`src/pages/BeautyPackages.tsx:483-493`, `src/hooks/useOrgPackages.ts:40-46`) |
| Kasa — masaüstü | `/kasa` | `BeautyCashRegister` (`src/pages/KasaPage.tsx:210-218`) | Ortak premium, güzellik profilli | ✗ (`src/pages/BeautyCashRegister.tsx:411`, `src/pages/BeautyCashRegister.tsx:1070-1074`, `src/pages/BeautyCashRegister.tsx:1274`) | B ✓; Y ✗; H yalnız işlem içi (`src/pages/BeautyCashRegister.tsx:137-142`, `src/pages/BeautyCashRegister.tsx:1024`, `src/pages/BeautyCashRegister.tsx:1043-1048`, `src/pages/BeautyCashRegister.tsx:1254`) |
| Kasa — mobil | `/kasa` | `MobileRandevuKasa` (`src/mobile/pages/MobileKasa.tsx:22-25`) | Jenerik | ✓ (kasa metninde randevu görünmüyor) | B kısmi; Y ✗; H ✗ (`src/mobile/pages/MobileKasa.tsx:120-125`, `src/mobile/pages/MobileKasa.tsx:229`) |
| Stoklar | `/stock` | `StockPage` (`src/App.tsx:127`) | Jenerik | ✓ | B ✓; Y ✗; H kısmi: yalnız eksik tablo (`src/pages/StockPage.tsx:95`, `src/pages/StockPage.tsx:340-341`, `src/pages/StockPage.tsx:498-499`) |
| Personel — masaüstü | `/staff` | `StaffPage` (`src/App.tsx:131`) | Jenerik, rol profilli | ✗ “Ort. Randevu” (`src/pages/StaffPage.tsx:194`) | B ✓; Y ✓; H ✗ (`src/pages/StaffPage.tsx:106`, `src/pages/StaffPage.tsx:241-252`) |
| Personel — mobil | `/staff` | `MobileStaff` (`src/App.tsx:131`) | Jenerik, rol profilli | ✓ | B ✓; Y ✗; H ✗ (`src/mobile/pages/MobileStaff.tsx:42-45`, `src/mobile/pages/MobileStaff.tsx:102`) |
| Personel detayı | `/staff/:id` | `StaffDetailPage` (`src/App.tsx:132`) | Jenerik | ✗ (`src/pages/StaffDetailPage.tsx:122`) | B ✓; Y ✗; H ✗; yüklemede “bulunamadı” gösterebilir (`src/pages/StaffDetailPage.tsx:30-39`, `src/pages/StaffDetailPage.tsx:122`) |
| Analiz | `/analytics` | `AnalyticsPage` (`src/App.tsx:133`) | Jenerik | ✗ (`src/pages/AnalyticsPage.tsx:215`, `src/pages/AnalyticsPage.tsx:273`) | B ✓; Y ✓; H ✗ (`src/pages/AnalyticsPage.tsx:98`, `src/pages/AnalyticsPage.tsx:198-201`, `src/pages/AnalyticsPage.tsx:307`) |
| Ayarlar — masaüstü | `/settings` ve `?tab=booking` | `SettingsPage` (`src/App.tsx:134`) | Jenerik, profil tabanlı bölümler | ✗ (`src/pages/SettingsPage.tsx:531`, `src/pages/SettingsPage.tsx:563-565`, `src/pages/SettingsPage.tsx:870-920`) | Sayfa B/Y/H ✗; entegrasyon alt bölümünde hata var (`src/pages/SettingsPage.tsx:307`, `src/pages/SettingsPage.tsx:137`, `src/pages/SettingsPage.tsx:672`) |
| Ayarlar — mobil | `/settings` | `MobileSettings` (`src/App.tsx:134`) | Jenerik | ✓ görünen temel alanlarda | B/Y/H ✗ (`src/mobile/pages/MobileSettings.tsx:24`, `src/mobile/pages/MobileSettings.tsx:53-77`) |
| Kurulum | `/kurulum` | `ClinicSetupPage` (`src/App.tsx:135`) | Jenerik | ✗ “Randevu slotu” (`src/pages/ClinicSetupPage.tsx:205`) | Bölümsel B ✓; Y ✗; H yalnız toast (`src/pages/ClinicSetupPage.tsx:53-55`, `src/pages/ClinicSetupPage.tsx:129`, `src/pages/ClinicSetupPage.tsx:242`) |
| Personel modu giriş/kök | `/personel` | `StaffModeRoot` (`src/App.tsx:102-106`) | Jenerik | ✗ (`src/mobile/staff/StaffModeRoot.tsx:34`, `src/mobile/staff/StaffModeRoot.tsx:45`) | B uygulanamaz; Y yalnız auth kapısında; H ✗ (`src/App.tsx:48-59`, `src/mobile/staff/StaffModeRoot.tsx:20-48`) |
| Online seans alma | `/book/:slug` | `BookingPage` (`src/App.tsx:100`) | Org görünümü, metinleri jenerik | ✗ (`src/pages/public/BookingPage.tsx:184`, `src/pages/public/BookingPage.tsx:202-210`, `src/pages/public/BookingPage.tsx:405-431`) | B kısmi; Y ✓; H kısmi: ağ hatası ve 404 birleşiyor (`src/pages/public/BookingPage.tsx:58-71`, `src/pages/public/BookingPage.tsx:93-99`, `src/pages/public/BookingPage.tsx:195-204`) |
| Online seans yönetimi | `/booking/:token` | `BookingManagePage` (`src/App.tsx:101`) | Jenerik | ✗ (`src/pages/public/BookingManagePage.tsx:70`, `src/pages/public/BookingManagePage.tsx:90-112`) | B uygulanamaz; Y ✓; H kısmi: ağ hatası ve bulunamadı birleşiyor (`src/pages/public/BookingManagePage.tsx:29-51`, `src/pages/public/BookingManagePage.tsx:86-93`) |
| Diş ekranları | `/dental-chart`, `/dental-visit/:id`, `/patient-file/:id` | Diş bileşenleri (`src/App.tsx:121-123`) | Başka sektöre özel | N/A | Güzellikte redirect/ret ekranı (`src/pages/DentalChartPage.tsx:158-159`, `src/pages/DentalVisitPage.tsx:1056`, `src/pages/PatientFilePage.tsx:221`) |
| Masa/Menü/Sıra | `/masa`, `/menu`, `/queue` | Route'ta var (`src/App.tsx:128-130`) | Başka modül | N/A | Güzellikte modül kapısı `/`'a yönlendirir (`src/App.tsx:85-89`, `src/lib/sectorProfiles.ts:95`) |
| Login / bilinmeyen route | `/login`, `*` | `LoginPage` / redirect (`src/App.tsx:99`, `src/App.tsx:137`) | Sektör seçimi öncesi / N/A | N/A | Denetlenen sektör ekranı değil |

## 4. Terminoloji ihlalleri

Çoğul düzeltmenin ön koşulu profile `reservations: 'Seanslar'` eklenmesidir (`src/lib/sectorProfiles.ts:120`). Aşağıdaki sabitler profil etiketinden üretilmelidir:

- `src/pages/ReservationsPage.tsx:360` — “{count} randevu” → `t('reservation').toLocaleLowerCase('tr')`.
- `src/pages/ReservationsPage.tsx:383`, `src/pages/ReservationsPage.tsx:385`, `src/pages/ReservationsPage.tsx:387` — günlük/toplam randevu cümleleri → tekil/çoğul için `t('reservation')` / `t('reservations')`.
- `src/pages/ReservationsPage.tsx:465`, `src/pages/ReservationsPage.tsx:466`, `src/pages/ReservationsPage.tsx:493`, `src/pages/ReservationsPage.tsx:505` — boş/geçmiş metinleri → `t('reservation')` / `t('reservations')` ile oluşturulmalı.
- `src/pages/CalendarPage.tsx:721`, `src/pages/CalendarPage.tsx:1571` — “Randevu Oluştur” → `t('newReservation')`.
- `src/pages/CalendarPage.tsx:803`, `src/pages/CalendarPage.tsx:919`, `src/pages/CalendarPage.tsx:1080` — sayaç ve boş metin → `t('reservation')`.
- `src/pages/CalendarPage.tsx:1130`, `src/pages/CalendarPage.tsx:1160` — başarı başlığı/WhatsApp metni → `t('reservation')`; mesaj cümlesi için `settings.comms.servicePhrase` kullanılmalı.
- `src/pages/CalendarPage.tsx:1410` — “randevuları kabin bazında” → `t('reservations').toLocaleLowerCase('tr')`.
- `src/pages/CustomersPage.tsx:167` — güzellikte görünen “Hasta bilgileri güncellendi” → `t('customer')`.
- `src/pages/CustomersPage.tsx:193`, `src/pages/CustomersPage.tsx:358`, `src/pages/CustomersPage.tsx:424`, `src/pages/CustomersPage.tsx:426`, `src/pages/CustomersPage.tsx:446` — sayaç/KPI/geçmiş/CTA → `t('reservation')`, `t('reservations')`, `t('newReservation')`.
- `src/pages/CustomersPage.tsx:217`, `src/pages/CustomersPage.tsx:218`, `src/pages/CustomersPage.tsx:226`, `src/pages/CustomersPage.tsx:229`, `src/pages/CustomersPage.tsx:230` — WhatsApp aksiyon/metinleri → `t('reservation')` ve çekimli mesaj için `settings.comms`.
- `src/mobile/pages/MobileHome.tsx:61`, `src/mobile/pages/MobileHome.tsx:123`, `src/mobile/pages/MobileHome.tsx:153`, `src/mobile/pages/MobileHome.tsx:163`, `src/mobile/pages/MobileHome.tsx:170`, `src/mobile/pages/MobileHome.tsx:209` — hızlı aksiyon, KPI, sonraki/boş/iptal/sayaç metinleri → `t('reservation')` / `t('newReservation')`.
- `src/mobile/pages/MobileCalendar.tsx:92`, `src/mobile/pages/MobileCalendar.tsx:94`, `src/mobile/pages/MobileCalendar.tsx:109`, `src/mobile/pages/MobileCalendar.tsx:110` — sayaç, aria-label ve boş durum → `t('reservation')` / `t('newReservation')`.
- `src/mobile/pages/MobileNewReservation.tsx:243`, `src/mobile/pages/MobileNewReservation.tsx:290`, `src/mobile/pages/MobileNewReservation.tsx:509`, `src/mobile/pages/MobileNewReservation.tsx:577` — başarı/başlık/özet/CTA → `t('reservation')` / `t('newReservation')`.
- `src/mobile/pages/MobileCustomers.tsx:89`, `src/mobile/pages/MobileCustomers.tsx:163`, `src/mobile/pages/MobileCustomers.tsx:215` — müşteri satırı, istatistik, geçmiş başlığı → `t('reservation')`.
- `src/mobile/ReservationSheet.tsx:96`, `src/mobile/ReservationSheet.tsx:100`, `src/mobile/ReservationSheet.tsx:106` — güncellendi/silme/detay başlıkları → `t('reservation')`.
- `src/components/reservations/EditReservationModal.tsx:164`, `src/components/reservations/EditReservationModal.tsx:182` — düzenleme başlığı ve bağlı-kimlik açıklaması → `t('reservation')`.
- `src/mobile/BottomTabBar.tsx:97` — FAB `aria-label="Yeni randevu"` → `t('newReservation')`.
- `src/pages/BeautyPackages.tsx:567`, `src/pages/BeautyPackages.tsx:629`, `src/pages/BeautyPackages.tsx:651`, `src/pages/BeautyPackages.tsx:654` — “Randevuyu aç/tamamlanınca/yaklaşan” → `t('reservation')`.
- `src/pages/BeautyCashRegister.tsx:411`, `src/pages/BeautyCashRegister.tsx:1060`, `src/pages/BeautyCashRegister.tsx:1070`, `src/pages/BeautyCashRegister.tsx:1074`, `src/pages/BeautyCashRegister.tsx:1274`, `src/pages/BeautyCashRegister.tsx:1339`, `src/pages/BeautyCashRegister.tsx:1343` — kalem etiketi, açıklamalar, aria ve not placeholder'ı → bileşende zaten bulunan `t('reservation')` kullanılmalı (`src/pages/BeautyCashRegister.tsx:129-133`).
- `src/components/dashboard/GuzellikDashboard.tsx:446`, `src/components/dashboard/GuzellikDashboard.tsx:584`, `src/components/dashboard/GuzellikDashboard.tsx:658-659`, `src/components/dashboard/GuzellikDashboard.tsx:726` — “ilk/başka/sıradaki randevu” → `t('reservation')` / `t('newReservation')`.
- `src/components/dashboard/GuzellikDashboard.tsx:589`, `src/components/dashboard/GuzellikDashboard.tsx:662`, `src/components/dashboard/GuzellikDashboard.tsx:727`, `src/components/dashboard/GuzellikDashboard.tsx:899`, `src/components/dashboard/GuzellikDashboard.tsx:1072` — “Randevusuz müşteri” güzellikte “Seanssız müşteri” olmalı. Türkçe ek uyumu nedeniyle düz string birleştirme yerine `LabelKey`e `walkInCustomer` gibi çekimli bir anahtar eklenip `t(...)` kullanılmalı.
- `src/pages/StaffPage.tsx:194` — “Ort. Randevu” → `t('reservation')`.
- `src/pages/StaffDetailPage.tsx:122` — “Henüz randevu yok” → `t('reservation')`.
- `src/pages/AnalyticsPage.tsx:215`, `src/pages/AnalyticsPage.tsx:273` — “Toplam/Günlük Randevu” → `t('reservation')`.
- `src/pages/SettingsPage.tsx:295-296`, `src/pages/SettingsPage.tsx:531`, `src/pages/SettingsPage.tsx:563-565`, `src/pages/SettingsPage.tsx:655`, `src/pages/SettingsPage.tsx:870-877`, `src/pages/SettingsPage.tsx:904`, `src/pages/SettingsPage.tsx:920`, `src/pages/SettingsPage.tsx:1003-1004`, `src/pages/SettingsPage.tsx:1014` — widget, sadakat, otomasyon, kaynak, booking ve entegrasyon metinleri → `t('reservation')` / `t('reservations')`; “erken rezervasyon” ticari kavramı (`src/pages/SettingsPage.tsx:577`) bu değişime dahil edilmemeli.
- `src/components/settings/WhatsAppTab.tsx:162`, `src/components/settings/WhatsAppTab.tsx:283`, `src/components/settings/WhatsAppTab.tsx:405`, `src/components/settings/WhatsAppTab.tsx:612`, `src/components/settings/WhatsAppTab.tsx:627`, `src/components/settings/WhatsAppTab.tsx:636`, `src/components/settings/WhatsAppTab.tsx:638`, `src/components/settings/WhatsAppTab.tsx:644`, `src/components/settings/WhatsAppTab.tsx:655` — test/açıklama/otomasyon kartı metinleri → `t('reservation')` ve `settings.comms`.
- `src/pages/ClinicSetupPage.tsx:205` — “Randevu slotu” → `t('reservation')`.
- `src/mobile/staff/StaffModeRoot.tsx:34`, `src/mobile/staff/StaffModeRoot.tsx:45` — yönetici/personel kapsam açıklamaları → `t('reservations')`.
- `src/mobile/pages/MobileAdminHome.tsx:190` — “Randevu” KPI etiketi → `t('reservation')`.
- `src/pages/public/BookingPage.tsx:184`, `src/pages/public/BookingPage.tsx:202`, `src/pages/public/BookingPage.tsx:210`, `src/pages/public/BookingPage.tsx:405`, `src/pages/public/BookingPage.tsx:416`, `src/pages/public/BookingPage.tsx:431` — public akışın bütün randevu metinleri → public endpointten gelen sektör etiketiyle çalışan, `sectorProfiles` kaynaklı `t()` eşdeğeri.
- `src/pages/public/BookingManagePage.tsx:70`, `src/pages/public/BookingManagePage.tsx:90-91`, `src/pages/public/BookingManagePage.tsx:102`, `src/pages/public/BookingManagePage.tsx:110-112`, `src/pages/public/BookingManagePage.tsx:127` — yönetim metinleri → aynı public-safe `t('reservation')` resolver'ı.
- `src/hooks/useReservations.ts:17` — kullanıcıya hizmet olarak görünen “Genel Randevu” → güzellik hizmet seed'i; bu metin `t()` ile hizmet adı üretmemeli.
- `src/hooks/useReservations.ts:174`, `src/hooks/useReservations.ts:201`, `src/hooks/useReservations.ts:558`, `src/hooks/useReservations.ts:602`, `src/hooks/useReservations.ts:694`, `src/hooks/useReservations.ts:702`, `src/hooks/useReservations.ts:833`, `src/hooks/useReservations.ts:850` — kullanıcıya çıkan toast'lar → hook'a çözümlenmiş `t('reservation')` etiketi verilmesi veya UI katmanında sektörlü mesaj üretilmesi.
- `src/hooks/useCustomers.ts:202` — “Randevu geçmişi yüklenemedi” toast'ı → `t('reservation')`.

## 5. Tasarım dili ihlalleri

### Renk, gradyan ve glassmorphism

- `src/pages/beautyCash.css:20-22` — güzellik kasası arka planında hardcoded `#f5eee4`, `#eee5d8` ve ham `rgba`; `--dc-page`/`--dc-surface*` kullanılmalı.
- `src/pages/beautyCash.css:240-245`, `src/pages/beautyCash.css:674-677` — mor paket gradyanları; gradyan kaldırılıp düz `--dc-surface`/`--dc-card`, durum vurgusu için `--dc-purple(-bg)` yalnız düz renk olarak kullanılmalı.
- `src/pages/beautyCash.css:538-542` — hardcoded `#28211c` gradyanı ve listede olmayan `--dc-onbox-70`; düz `--dc-inkbox` + `--dc-inkbox-fg` kullanılmalı.
- `src/pages/beautyCash.css:615-619` — mobil sabit ödeme barında yarı saydam yüzey + `backdrop-filter: blur(16px)` glassmorphism; düz `--dc-card` kullanılmalı.
- `src/pages/BeautyCashRegister.tsx:52`, `src/pages/BeautyCashRegister.tsx:1390`, `src/pages/BeautyCashRegister.tsx:1399`, `src/pages/BeautyCashRegister.tsx:1444` — hardcoded hex fallback'lar ve var olmayan `--dc-purple-soft`/`--dc-amber-soft`/`--dc-amber-d`; mevcut karşılıklar `--dc-inkbox-fg`, `--dc-purple-bg`, `--dc-amber-bg`, `--dc-amber`, `--dc-red2`.
- `src/pages/beautyPackages.css:33` — çok sayıda hardcoded `#fff/#faf7f3cc/#ff5a1f..`, glass topbar ve ham shadow renkleri; ilgili `--dc-*` tokenları kullanılmalı. Aynı satırda 25–39 px kontroller de var.
- `src/pages/beautyPackages.css:36` — turuncudan hardcoded gül rengine (`#c25d86`) gradyan; düz `--dc-orange` kullanılmalı.
- `src/pages/BeautyPackages.tsx:595` — hardcoded `#f5efe7`; `--dc-inkbox-fg` kullanılmalı.
- `src/components/dashboard/beautyOps.css:48`, `src/components/dashboard/beautyOps.css:177`, `src/components/dashboard/beautyOps.css:241`, `src/components/dashboard/beautyOps.css:431`, `src/components/dashboard/beautyOps.css:458`, `src/components/dashboard/beautyOps.css:530` — hardcoded `#fff`; koyu kutu üstünde `--dc-inkbox-fg`, turuncu buton karşıt rengi için mevcut listede güvenli ayrı rol yoksa **YENİ TOKEN gerekir**.
- `src/components/dashboard/beautyOps.css:213`, `src/components/dashboard/beautyOps.css:217`, `src/components/dashboard/beautyOps.css:229`, `src/components/dashboard/beautyOps.css:423` — izinli listede olmayan `--dc-offhrs`, `--dc-hair2`, `--dc-box-surface` ve `#2A2118` fallback'ı; mevcut yüzey/border tokenına dönülmeli, gerçekten ayrı semantik gerekirse **YENİ TOKEN gerekir**.
- `src/components/beauty/BeautySessionModal.tsx:290-292`, `src/pages/CustomersPage.tsx:478` — modal scriminde `backdrop-blur`/`backdropFilter`; glassmorphism kaldırılıp düz overlay kullanılmalı. Uygun overlay rolü listede yoksa **YENİ TOKEN gerekir**.
- `src/pages/CalendarPage.tsx:37`, `src/pages/CalendarPage.tsx:583-619`, `src/pages/CalendarPage.tsx:660-718`, `src/pages/CalendarPage.tsx:766-875`, `src/pages/CalendarPage.tsx:905-1005`, `src/pages/CalendarPage.tsx:1205`, `src/pages/CalendarPage.tsx:1253`, `src/pages/CalendarPage.tsx:1344-1351`, `src/pages/CalendarPage.tsx:1449`, `src/pages/CalendarPage.tsx:1479` — onaylı rengin kendisi dahil çok sayıda hardcoded hex/rgba; `--dc-orange`, `--dc-red2(-bg)`, `--dc-amber(-bg)`, `--dc-inkbox` tokenlarına taşınmalı.
- `src/hooks/useReservations.ts:584` — varsayılan hizmet rengi `#CCFF00`; onaylı palet dışı neon. `--dc-orange` kullanılamaz çünkü DB'ye CSS var yazmak veri tüketicilerine bağlıdır; kalıcı renk semantiği için **YENİ TOKEN/veri politikası gerekir**.
- `src/mobile/pages/MobileNewReservation.tsx:260` — hardcoded WhatsApp yeşili ve koyu foreground; marka rengi korunacaksa **YENİ TOKEN gerekir**.
- `src/mobile/pages/MobileStaff.tsx:14`, `src/mobile/pages/MobileSettings.tsx:16` — hardcoded mor/mavi/pembe/indigo hizmet-personel paleti; mevcut `T.orange/green/blue/amber/purple/red` (`--lt-*`) rollerine dönülmeli.
- `src/mobile/pages/MobileCalendar.tsx:95`, `src/mobile/pages/MobileCalendar.tsx:174`, `src/mobile/pages/MobileNewReservation.tsx:267`, `src/mobile/pages/MobileNewReservation.tsx:374`, `src/mobile/pages/MobileNewReservation.tsx:391-398`, `src/mobile/pages/MobileNewReservation.tsx:471`, `src/mobile/pages/MobileHome.tsx:202`, `src/mobile/pages/MobileHome.tsx:244`, `src/mobile/pages/MobileHome.tsx:264`, `src/mobile/NewCustomerSheet.tsx:65`, `src/mobile/pages/MobileCustomers.tsx:43`, `src/mobile/pages/MobileCustomers.tsx:84`, `src/mobile/pages/MobileCustomers.tsx:147`, `src/mobile/pages/MobileKasa.tsx:53`, `src/mobile/pages/MobileKasa.tsx:170`, `src/mobile/pages/MobileKasa.tsx:192`, `src/mobile/ReservationSheet.tsx:110`, `src/mobile/ReservationSheet.tsx:153-182` — mobilde doğrudan hex/rgba; uygun `--lt-*` rolüne taşınmalı, turuncu üstü sabit foreground için **YENİ TOKEN gerekir**.
- `src/mobile/pages/MobileHome.tsx:101`, `src/mobile/pages/MobileCustomers.tsx:37`, `src/mobile/pages/MobileKasa.tsx:43`, `src/mobile/pages/MobileKasa.tsx:165`, `src/mobile/pages/MobileStaff.tsx:85`, `src/mobile/pages/MobileSettings.tsx:56`, `src/mobile/pages/MobileNewReservation.tsx:571` — sticky header/footer `backdropFilter` kullanıyor; glassmorphism yasağına aykırı, düz `--lt-surface`/`--lt-bg` kullanılmalı.
- `src/App.tsx:53-56`, `src/App.tsx:145-147` — auth yükleme ve global toast hardcoded renk kullanıyor; uygun `--lt-*`/`--dc-*` rolü kullanılmalı, tema dışı toast yüzeyi için gerekirse **YENİ TOKEN gerekir**.

### Scope, font ve focus

- `src/pages/beautyCash.css:47-685` — yorum kök scope iddia etse de `.bf-live` ile başlayarak seçiciler `.beauty-cash-final` ön eki olmadan globaldir (`src/pages/beautyCash.css:1-4`, `src/pages/beautyCash.css:47-68`). Bütün `.bf-*` seçiciler kök altında scope'lanmalı.
- `src/pages/beautyCash.css:43-44` — focus 2 px düz turuncu; beklenen `3px solid rgba(255,90,31,.28)` + 2 px offset.
- `src/components/CustomFieldsSection.tsx:18-22`, `src/pages/CustomersPage.tsx:256-257`, `src/components/beauty/BeautySessionModal.tsx:429-441` — inputlar `outline:none` kullanıyor ve ortak 3 px focus görünümü vermiyor; focus-visible kuralı eklenmeli.
- `src/pages/beautyCash.css:80`, `src/pages/beautyCash.css:171`, `src/pages/beautyCash.css:272`, `src/pages/beautyCash.css:501` — kasa Hanken yerine Inter kullanıyor; metinlerde Hanken, tutar/saat/sayılarda JetBrains Mono kullanılmalı.
- `src/pages/beautyPackages.css:15` — `--font-geist-mono` Inter'e bağlanmış; sayı/saat/tutarlar JetBrains Mono olmalı.
- `src/components/dashboard/beautyOps.css:26-29`, `src/components/dashboard/beautyOps.css:57-60`, `src/components/dashboard/beautyOps.css:409-410`, `src/components/dashboard/beautyOps.css:421-423`, `src/components/dashboard/beautyOps.css:454-457` — başlık/eyebrow/hizmet metinleri monospace; yalnız içlerindeki saat/sayı parçaları mono olmalı.
- `src/mobile/pages/MobileHome.tsx:153`, `src/mobile/pages/MobileCustomers.tsx:252`, `src/mobile/pages/MobileStaff.tsx:110`, `src/mobile/pages/MobileStaff.tsx:170`, `src/mobile/pages/MobileSettings.tsx:65`, `src/mobile/pages/MobileSettings.tsx:77`, `src/mobile/pages/MobileSettings.tsx:197`, `src/mobile/pages/MobileNewReservation.tsx:589` — cümle, bölüm başlığı veya açıklamanın tamamı `T.mono`; Hanken kullanılmalı.
- Legacy shadcn mor-indigo katmanı globalde hâlâ tanımlı ve `body`ye uygulanıyor (`src/index.css:125-191`, `src/index.css:195-206`), fakat denetlenen güzellik ana yüzlerinde `bg-primary`/`var(--gradient-primary)` kullanımını doğrulayan doğrudan bir tüketim bulunmadı. Katmanın varlığı tek başına yeni ekran ihlali sayılmadı.

### 44 px altı dokunma hedefleri ve taşma

- `src/components/dashboard/beautyOps.css:30-46`, `src/components/dashboard/beautyOps.css:72-87`, `src/components/dashboard/beautyOps.css:170-180`, `src/components/dashboard/beautyOps.css:435`, `src/components/dashboard/beautyOps.css:458`, `src/components/dashboard/beautyOps.css:520-524` — kaynak/walk-in/segment/switch/küçük buton/sonraki/akış aksiyonları 19–42 px; dokunmatik düzende en az 44×44 olmalı.
- `src/components/beauty/BeautySessionModal.tsx:295-300`, `src/pages/BeautyCustomerPage.tsx:134-138`, `src/pages/BeautyCustomerPage.tsx:184-196`, `src/pages/CustomersPage.tsx:263-267`, `src/pages/CustomersPage.tsx:344-347` — kapat, arama/WhatsApp, paket ve müşteri aksiyonları 34–42 px; en az 44 px olmalı.
- `src/pages/beautyCash.css:67-68`, `src/pages/beautyCash.css:225-247`, `src/pages/beautyCash.css:327`, `src/pages/beautyCash.css:528`, `src/pages/beautyCash.css:605-611` — 28–42 px kasa kontrolleri; mobil/container daralmasında en az 44 px olmalı.
- `src/pages/beautyPackages.css:23`, `src/pages/beautyPackages.css:33`, `src/pages/beautyPackages.css:40` — menü, ikon, filtre, satır aksiyonu ve ana butonlarda 21–42 px hedefler; mobil kırılımda da 44 px garanti edilmeli.
- `src/mobile/pages/MobileCalendar.tsx:94-96`, `src/mobile/pages/MobileNewReservation.tsx:365-374`, `src/mobile/pages/MobileHome.tsx:250-264`, `src/mobile/pages/MobileStaff.tsx:93-96`, `src/mobile/pages/MobileSettings.tsx:272-274` — 32–38 px gerçek mobil hedefler; 44×44 altına düşüyor.
- Global yatay taşma doğru biçimde kapalı (`src/index.css:7-10`). Güzellik dashboard'unda dar görünüm için iç yerleşim kırılımı var (`src/components/dashboard/beautyOps.css:445-448`); bu konuda doğrulanmış global taşma ihlali bulunmadı.

## 6. UX sürtünmeleri

- **Masaüstü Takvim** → hamilelik/cilt tipi iki saniyede görünmüyor ve kontrendikasyon uygulanmıyor (`src/pages/CalendarPage.tsx:270-276`, `src/pages/CalendarPage.tsx:1201-1217`) → müşteri seçildiği anda üç güzellik alanını üst uyarı şeridinde gösterip uygun olmayan hizmetleri ortak eligibility kuralıyla kapat.
- **Mobil Yeni Seans** → hizmet müşteriden önce seçildiği için kontrendikasyon ancak en son müşteri adımından sonra anlaşılabilir; bugün hiç anlaşılmıyor (`src/mobile/pages/MobileNewReservation.tsx:173-183`, `src/mobile/pages/MobileNewReservation.tsx:331-349`) → riskli hizmette müşteriyi önce seçtir veya müşteri seçildiği anda sepeti yeniden doğrula.
- **Müşteriler** → güzellik bilgisi ve gerçek paket özeti için jenerik detaydan ayrıca “Müşteri Kartı”na geçmek gerekiyor (`src/pages/CustomersPage.tsx:302-347`) → güzellik müşteri yüzünü doğrudan `calendarSectorProfiles` ile seç.
- **Mobil Müşteri Detayı** → cilt/alerji/hamilelik yok ve masaüstünde satılan `treatment_plans` yerine legacy paketleri gösteriyor (`src/mobile/pages/MobileCustomers.tsx:118-125`, `src/mobile/pages/MobileCustomers.tsx:190-200`) → mobil güzellik kartını aynı `treatment_plans` kaynağına bağla.
- **Paket Satışı** → drawer içindeki hızlı müşteri ekleme kritik alanları atlıyor (`src/pages/BeautyPackages.tsx:861-871`) → tam özel-alan formunu aynı adımda aç; satıştan sonra müşteri kartına dönüp düzenleme tıklamasını kaldır.
- **Güzellik Dashboard** → ana akış “Kasada” sütununda kasa aksiyonunu bilerek gizliyor, fakat alt seçili kart “Ödeme al” ile farklı ve riskli bir kısa yol sunuyor (`src/components/dashboard/GuzellikDashboard.tsx:807-813`, `src/components/dashboard/GuzellikDashboard.tsx:887-889`) → tek aksiyon “Kasayı aç” olmalı ve yöntem seçimi premium kasada kalmalı.
- **Kabin ataması** → “Kabin fark etmez” seçimi bütün kabinler doluyken sessizce kabinsiz kayıt yaratıyor (`src/components/beauty/BeautySessionModal.tsx:193-197`, `src/components/beauty/BeautySessionModal.tsx:241-265`) → kaydetmeden önce “uygun kabin yok” bloklayıcı durumu göster.
- **Paket Merkezi** → bir sayfada çok yoğun üç kolon, mobilde ise 34 px menü/aksiyonlar var (`src/pages/beautyPackages.css:23`, `src/pages/beautyPackages.css:40`) → günlük 5–15 seans ölçeğinde varsayılan görünümü “bugün kullanılacak / yenilenecek” iki kısa kuyruğa indir, ayrıntıyı mevcut panelde tut.
- **Recall** → ayar “~30 gün” derken gerçek tetikleyici hizmet satırındaki ayrı “Dönüş” alanına bağlı (`src/components/settings/WhatsAppTab.tsx:647-650`, `src/pages/SettingsPage.tsx:756-781`, `src/hooks/useReservations.ts:763-774`) → hizmet değeri boşsa sektörün 30 günlük varsayılanını kullan ve ekranda etkin tarihi göster.
- **Yüklenme/hata** → müşteri, takvim, kasa ve detay sayfalarının çoğu hook hata/yük durumunu tüketmiyor (`src/hooks/useReservations.ts:108-109`, `src/hooks/useReservations.ts:1080-1085`, `src/hooks/useCustomers.ts:545-558`) → boş durum ile ağ hatasını ayıran ortak skeleton/error yüzeyi ekle.
- **Terminoloji** → günlük güzellik yüzlerinde “Seans”, “Randevu”, “Rezervasyon” birlikte görünüyor (`src/lib/sectorProfiles.ts:120`, `src/pages/ReservationsPage.tsx:383-387`, `src/components/dashboard/GuzellikDashboard.tsx:658-659`) → bütün görünür metni `useLabels()` üzerinden geçir ve çoğul anahtarı tamamla.

## 7. Önerilen yeni ekranlar

### Güzellik Takvim Yüzü

- **Gerekçe:** Jenerik takvim hamilelik/cilt/alerji bağlamını ve kontrendikasyon kuralını taşımıyor; akış farklı giriş noktalarında farklı sonuç veriyor (`src/lib/calendarSectorProfiles.ts:49-58`, `src/pages/CalendarPage.tsx:270-276`, `src/components/beauty/BeautySessionModal.tsx:353-416`).
- **Tamamlayıcı olduğu yüzey:** `GuzellikDashboard` günlük “şimdi” operasyonunu korur; yeni yüz hafta/gün planlama ve düzenleme için `/calendar`ı tamamlar (`src/components/dashboard/GuzellikDashboard.tsx:784-839`, `src/App.tsx:117`).
- **Tahmini iş büyüklüğü:** 16–24 saat.
- **Dokunulacak tek-kaynak dosyası:** `src/lib/calendarSectorProfiles.ts`; `guzellik` satırı yeni FaceKey'e bağlanmalı (`src/lib/calendarSectorProfiles.ts:14-25`, `src/lib/calendarSectorProfiles.ts:49-58`).

### Mobil Güzellik Müşteri Kartı Yüzü

- **Gerekçe:** Mobil detay kritik özel alanları göstermiyor ve yanlış paket motorunu okuyor (`src/mobile/pages/MobileCustomers.tsx:118-125`, `src/mobile/pages/MobileCustomers.tsx:143-215`); masaüstü kartta gereken veri zaten mevcut (`src/pages/BeautyCustomerPage.tsx:84-86`, `src/pages/BeautyCustomerPage.tsx:116-196`).
- **Tamamlayıcı olduğu yüzey:** Mobil müşteri listesi kalır; yeni yüz yalnız seçili müşterinin bakım/risk/paket detayını açar (`src/mobile/pages/MobileCustomers.tsx:26-66`). Masaüstü `BeautyCustomerPage`in alternatifi değil, mobil karşılığıdır.
- **Tahmini iş büyüklüğü:** 10–16 saat.
- **Dokunulacak tek-kaynak dosyası:** `src/lib/calendarSectorProfiles.ts`; profile `mobileCustomers` yüz anahtarı eklenmesi gerekir. Bu alan bugün yoktur (`src/lib/calendarSectorProfiles.ts:17-32`).

### Ayrı “Kontrendikasyonlar” veya “Recall” sayfası önerilmiyor

- **Gerekçe:** Güvenlik kararı hizmet seçildiği anda, recall ise mevcut müşteri/paket iş kuyruklarında görünmelidir; ayrı sayfa daha fazla tıklama üretir (`src/components/beauty/BeautySessionModal.tsx:353-416`, `src/pages/CustomersPage.tsx:120-127`, `src/pages/BeautyPackages.tsx:235-240`).
- **Tamamlayıcı/alternatif ilişkisi:** Yeni route yerine Takvim, Mobil Müşteri Kartı, Müşteriler filtresi ve mevcut Paket Merkezi içindeki uyarı/iş kuyruğu tamamlanmalı.
- **Tahmini iş büyüklüğü:** Yeni ekran 0 saat; mevcut yüzey iyileştirmeleri kontrendikasyon için 8–12 saat, recall görünürlüğü için 4–6 saat.
- **Dokunulacak tek-kaynak dosyası:** Kontrendikasyon metadatası ve recall fallback'i için `src/lib/sectorProfiles.ts` genişletilmeli; ikinci bir sektör/comms kaynağı açılmamalı (`src/lib/sectorProfiles.ts:45-72`, `src/lib/sectorProfiles.ts:83-92`).

## 8. Doğrulanamayanlar

- Denetim statik kaynak kodu üzerinden yapıldı; giriş yapılmış bir güzellik organizasyonunda tarayıcı akışları çalıştırılmadı. Bu nedenle gerçek viewport'ta görsel taşma, focus sırası ve portal/bottom-sheet katmanları kesinleştirilemedi (`src/components/beauty/BeautySessionModal.tsx:286-292`, `src/pages/beautyCash.css:580-652`).
- Supabase'in çalışan ortamında `050`, `060`, `067`, `069` ve ilgili diğer migration'ların gerçekten uygulanmış olduğu doğrulanmadı; rapor repository'deki SQL'i değerlendirir (`supabase/050_custom_fields.sql:7-12`, `supabase/060_reservation_conflict_guard.sql:377-380`, `supabase/069_package_rights_and_templates.sql:42-80`).
- `remind` edge function'ının deploy sürümü, cron sıklığı, WhatsApp bağlantısı ve `settings.comms` canlı JSONB içeriği doğrulanmadı; yalnız repository davranışı izlendi (`supabase/functions/remind/index.ts:254-292`, `supabase/functions/remind/index.ts:393-443`).
- Canlı hizmet/paket adları görülmedi. Regex'in hangi gerçek adlarda false-positive/false-negative üreteceği ancak organizasyon verisiyle kesinleşir (`src/components/beauty/BeautySessionModal.tsx:34-35`, `src/pages/BeautyPackages.tsx:848-859`).
- Public booking edge yanıtının sektör/etiket bilgisi taşıyıp taşımadığı istemci tipinden doğrulanamadı; istemci yalnız işletme, hizmet ve personel alanlarını kullanıyor (`src/pages/public/BookingPage.tsx:58-62`, `src/pages/public/BookingPage.tsx:93-99`). Public terminoloji düzeltmesi için ilgili edge yanıt sözleşmesi ayrıca çalıştırılarak incelenmeli.
- Otomatik test/build çalıştırılmadı; görev kod davranışını okumaya dayalı denetim ve tek Markdown çıktı ile sınırlandırıldı. Kritik kapanış ve paket yarışı sonuçları kaynak akışından çıkarımdır (`src/hooks/useReservations.ts:685-774`, `src/hooks/useReservations.ts:725-744`).
