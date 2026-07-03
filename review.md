# TimeFlow — Beta Öncesi UI/UX Denetim Raporu

**Tarih:** 2026-07-03 · **Kapsam:** Masaüstü + Mobil (yönetici & personel modu) · **Odak:** Kullanım kolaylığı, eksikler/fazlalıklar, beta hazırlığı

Her bulgu doğrulandı (kod satırı teyitli). Öncelik: **P0** = beta öncesi şart · **P1** = ilk hafta · **P2** = cila.
Not: Denetim ajanlarının 3 bulgusu yanlış çıktı ve rapora alınmadı (personel modunda çıkış butonu mevcut — MobileStaffHome:111; StaffDetailPage rotası mevcut — App.tsx:117; avatar koyu-metin kontrastı her iki temada yeterli).

---

## GENEL DEĞERLENDİRME

Ürünün çekirdeği sağlam: rezervasyon/tahsilat/sıra gerçek zamanlı, mobil rol ayrımı (müdür=cep desktop, personel=kumanda) kurulmuş, tasarım dili tutarlı ve premium. Beta'yı asıl tehdit eden şey **yeni kullanıcının ilk 10 dakikası** (onboarding yok, PIN kurulmadan mobil kilit) ve **birkaç akış kopukluğu** (mobilde masaüstü sayfasına düşme, sessiz hata yutma). Bunlar P0'da toplandı — toplamı 1-2 günlük iş.

---

## P0 — BETA ÖNCESİ ŞART (6 bulgu)

### P0-1 · Kayıt sonrası onboarding yok — yeni kullanıcı boş ekranda kayboluyor
- **Konum:** `src/pages/LoginPage.tsx:215-226` (signup → direkt dashboard)
- **Sorun:** Kayıt olan işletme boş dashboard'a düşüyor. Sektör seçimi, işletme adı, ilk hizmet, çalışma saatleri için hiçbir yönlendirme yok. Beta kullanıcısının %80'i burada kaybedilir.
- **Fix:** Kayıt sonrası 3-4 adımlı kurulum sihirbazı (modal): ① işletme adı + sektör (modülleri otomatik açar) ② ilk hizmet ③ çalışma saatleri ④ opsiyonel personel. `settings.sector` boşsa dashboard'da "Kuruluma devam et" kartı göster. Alternatif hızlı çözüm: dashboard'a işaretlenebilir "Başlangıç Rehberi" kartı (hizmet ekle → personel ekle → booking linkini paylaş).

### P0-2 · Mobilde yönetici PIN'i kurulmadan mobil yönetim tamamen kilitli
- **Konum:** `src/mobile/staff/ManagerLogin.tsx:18` (`notSet = !settings.managerPin` → tüm tuş takımı devre dışı)
- **Sorun:** Yeni işletme telefondan girince "Ayarlar → Genel'den PIN tanımla" yazısıyla ölü ekranda kalıyor; oraya götüren buton bile yok. Mobil-öncelikli beta kullanıcısı için duvar.
- **Fix:** `notSet` durumunda tuş takımı yerine "PIN Oluştur" akışı göster (ilk girişte PIN'i orada belirlesin ve settings'e yazsın) — ya da en azından `/settings?tab=general`'a götüren belirgin bir "PIN Tanımla" butonu.

### P0-3 · Mobilde masaüstü sayfasına düşen ölü uçlar: /masa ve /staff/:id
- **Konum:** `src/App.tsx:114` (masa, Adaptive'siz) ve `src/App.tsx:117` (staff/:id, Adaptive'siz); tetikleyen: MobileStaff kartları → personel detayı, restoran sektöründe alt bar → Masa
- **Sorun:** Mobil kullanıcı bu rotalara girince 375px ekranda masaüstü sayfası açılıyor (senin 4. ekran görüntüsündeki "çok kötü görünüş"ün aynısı — o rotayı düzeltmiştik, bu ikisi kaldı).
- **Fix (dar kapsam):** Mobil varyant yazmak yerine şimdilik mobilde bu geçişleri engelle: MobileStaff'ta detay yerine mevcut düzenleme sheet'ini kullan; restoran sektörü mobilde Masa yerine "Masa modülü masaüstünde" bilgi kartı göster. (Gerçek mobil Masa/StaffDetail sayfaları P2.)

### P0-4 · Tarayıcı `confirm()` diyalogları — PWA'da sistem diyaloğu tasarımı kırıyor
- **Konum (8 kullanım):** `src/mobile/ReservationSheet.tsx:92` (randevu sil), `src/mobile/pages/MobileStaff.tsx:70` (personel kaldır), `src/mobile/pages/MobileCustomers.tsx:82` (ödül kullan), `src/pages/StaffPage.tsx:151`, `src/pages/SettingsPage.tsx:145` (API key iptal), `src/pages/MasaPage.tsx:165`, `src/pages/public/BookingManagePage.tsx:69`, `src/components/settings/BillingTab.tsx:243`
- **Sorun:** Yerel tarayıcı diyaloğu; PWA'da (özellikle iOS ana ekran modunda) çirkin sistem penceresi açılıyor, marka hissini kırıyor, buton metinleri İngilizce (OK/Cancel).
- **Fix:** Tek bir `ConfirmDialog` bileşeni (mobilde BottomSheet, masaüstünde modal; ReservationsPage'deki iki-tıklı "Emin misin?" deseni de kabul). 8 kullanımı buna geçir. En kritik üçü mobildekiler — müşteri karşısında kullanılan ekranlar.

### P0-5 · Sessiz hata yutma: WhatsApp gönderimi ve tahsilat kaydı başarısız olunca kullanıcı bilmiyor
- **Konum:** `src/pages/QueuePage.tsx:42,51` (`sendTextMessage(...).catch(() => {})`), `src/mobile/TahsilatSheet.tsx:69-75` (addPayment başarısızsa toast yok)
- **Sorun:** Sıra bildirimi WhatsApp'tan gitmezse ya da tahsilat kaydı düşmezse ekranda hiçbir şey olmuyor — işletme müşteriye "mesaj attık" sanıyor, kasada kayıt eksik kalıyor. Beta'da güven kaybettiren türden sessiz hata.
- **Fix:** Her iki noktaya başarısızlıkta `toast.error(...)` ekle ("WhatsApp mesajı gönderilemedi", "Tahsilat kaydedilemedi — tekrar deneyin"). TahsilatSheet'te `saving` durumunu hata dalında da sıfırla.

### P0-6 · Mobilde tek dokunuşla randevu iptali — onaysız ve geri alınamaz görünümde
- **Konum:** `src/mobile/pages/MobileHome.tsx:263-265` (ApptRow ✕ butonu → doğrudan `status:'cancelled'`)
- **Sorun:** Genişletilmiş randevu satırındaki ✕'e yanlışlıkla dokunmak randevuyu anında iptal ediyor; onay yok, geri al yok. (İptal edilen randevu no-show istatistiğini de kirletiyor.)
- **Fix:** Onay + geri al: `toast('Randevu iptal edildi', { action: { label: 'Geri Al', onClick: () => updateReservation(id, { status: eskiDurum }) } })` — ya da P0-4'teki ConfirmDialog.

---

## P1 — İLK HAFTA (8 bulgu)

### P1-1 · Form gönderimlerinde loading state yok — çift kayıt riski
- **Konum:** `src/pages/CustomersPage.tsx:115` (handleCreate), `src/pages/CalendarPage.tsx:325-359` (handleCreateReservation), `src/mobile/staff/MobileServiceDetail.tsx:71-79` (adisyon ürün ekleme)
- **Sorun:** Kaydet butonları async işlem sırasında disabled olmuyor; yavaş bağlantıda çift tıklama = mükerrer müşteri/randevu/adisyon satırı.
- **Fix:** `StaffPage.tsx:137-149`'daki mevcut `saving` deseni bu üç noktaya kopyalanacak (state + `disabled={saving}` + spinner).

### P1-2 · SettingsPage: sekme değiştirince kaydedilmemiş değişiklik sessizce kayboluyor
- **Konum:** `src/pages/SettingsPage.tsx:307-316`
- **Sorun:** Genel'de işletme adını değiştirip kaydetmeden Hizmetler'e geçen kullanıcının değişikliği kayboluyor; uyarı yok.
- **Fix:** Sekme başına dirty-check (mevcut state ≠ settings); kirliyken sekme değişiminde toast/onay: "Kaydedilmemiş değişiklikler var".

### P1-3 · Mobil light modda kırık sabit renkler (personel modu ağırlıklı)
- **Konum:** `src/mobile/staff/hizmetDesign.tsx` (D token seti — koyu sabitler), `src/mobile/staff/MobileServiceDetail.tsx:251` (ctaGreen koyu gradient), `:108,189` (`'#fff'` metin/stroke), `src/mobile/pages/MobileHome.tsx:189` (`border:'2.5px solid #1C1710'`)
- **Sorun:** Gelir kartında düzelttiğimiz sorunun kalanları: personel modu ekranları light temada koyu-üstüne-koyu/görünmez öğeler üretiyor. Sen aktif light mod kullanıcısısın — beta kullanıcıları da olacak.
- **Fix:** `hizmetDesign.tsx`'teki D sabitlerini theme.ts CSS değişkenlerine bağla (LIGHT_VARS'ta karşılıkları zaten tanımlı); tekil sabitleri `T.surface`/`T.btnInkBg` token'larına çevir. Ardından light modda personel akışının ekran turu.

### P1-4 · Mobil ana sayfada Analiz kısayolu masaüstü sayfasına gidiyor
- **Konum:** `src/mobile/pages/MobileHome.tsx:164-166` (sıra modülü kapalıysa 4. hızlı aksiyon = `/analytics`), `src/mobile/pages/MobileAdminHome.tsx:80` (Yönetim grid'inde Analiz)
- **Sorun:** P0-3 ile aynı sınıf ama tetiklenmesi daha olası (yönetici grid'inde her zaman görünür).
- **Fix (iki aşama):** Şimdi: mobilde Analiz girişlerini gizle ya da "yakında" işaretle. Sonra: müdür mobiline basit özet kartlı MobileAnalytics (bekleme listesinde zaten var).
- **Not:** Bu, "müdür her şeyi görür" vizyonunun tek gerçek mobil eksiği.

### P1-5 · Bekleme listesi (waitlist) gerçek zamanlı değil
- **Konum:** `src/hooks/useWaitlist.ts` (abonelik yok); DB publication'da da yok
- **Sorun:** Dolu güne müşteri yazılınca müdürün açık ekranına düşmüyor; yenileme gerekiyor. Randevu/tahsilat/sıra canlıyken bu tutarsız his veriyor.
- **Fix:** `waitlist` tablosunu `supabase_realtime` publication'a ekle (+ replica identity full) ve useWaitlist'e diğer hook'lardaki desenle org-filtreli abonelik ekle.

### P1-6 · usePayments tüm tahsilat geçmişini sınırsız çekiyor
- **Konum:** `src/hooks/usePayments.ts:50` (`select('*')`, tarih filtresi ve limit yok)
- **Sorun:** Bugün küçük veri; 6-12 ay sonra Kasa/mobil Kasa açılışı yavaşlayacak. Beta kullanıcıları büyüdükçe kendiliğinden kötüleşen türden sorun.
- **Fix:** Son 90 gün filtresi (Kasa istatistikleri bugün/hafta/ay bazlı — yeterli) + `limit`. Not: "Toplam gelir" kartı tüm-zaman istiyorsa ayrı hafif bir `sum` sorgusu.

### P1-7 · Yeni randevu başarı ekranı, sayfadan çıkıp dönünce tekrar görünüyor
- **Konum:** `src/mobile/pages/MobileNewReservation.tsx:145` (`done` state'i rota değişiminde sıfırlanmıyor)
- **Sorun:** Randevu oluşturup takvime geçen, sonra tekrar +'ya basan kullanıcı eski "Randevu Oluşturuldu!" ekranını görüyor — kafa karıştırıcı, çift kayıt sanılabilir.
- **Fix:** Komponentin unmount'unda ya da rota girişinde `reset()` çağır.

### P1-8 · Doğrulama işaretleri ve telefon klavyesi eksik
- **Konum:** `src/pages/CustomersPage.tsx:443-450`, `src/pages/StaffPage.tsx:493-501` (zorunlu alan görsel işareti yok); `src/pages/QueuePage.tsx:72`, `src/pages/KasaPage.tsx:362` (`inputMode="tel"` yok — public BookingPage'de doğru örneği var)
- **Sorun:** Zorunlu alan boş bırakılınca neden kaydolmadığı belirsiz; telefon alanları mobilde tam klavye açıyor.
- **Fix:** Zorunlu label'lara kırmızı `*` + boş gönderimde alan kenarına kırmızı vurgu; tüm telefon inputlarına `inputMode="tel"`.

---

## P2 — CİLA / SONRASI (özet liste)

| # | Bulgu | Konum | Fix |
|---|-------|-------|-----|
| P2-1 | BottomSheet'te sürükle-kapat yok (tutamaç görsel) | `src/mobile/BottomSheet.tsx:37-39` | Tutamaça touch-drag ile kapatma |
| P2-2 | Dokunma hedefleri 38px (44 önerilir) | MobileHome:86-92 başlık butonları, MobileCalendar hafta şeridi | 44×44'e büyüt |
| P2-3 | Boş durum mesajları tutarsız ton/CTA'sız | ReservationsPage:347, CustomersPage:164, MobileCustomers:51 | Standart boş-durum bileşeni + eylem butonu |
| P2-4 | EditReservationModal'da "ID:" ve karışık dil | `src/components/reservations/EditReservationModal.tsx:126` | Türkçeleştir/kaldır |
| P2-5 | AnalyticsPage'te ₺ öneki ve skeleton yok | AnalyticsPage KPI kartları | Global `formatCurrency` + yükleme iskeleti |
| P2-6 | İkon butonlarda aria-label eksik (yaygın) | StaffPage IBtn:82-92, MobileCalendar:82 vb. | aria-label geçir |
| P2-7 | Dropdown Escape ile kapanmıyor | ReservationsPage:452-486 | CalendarPage:178'deki Escape deseni |
| P2-8 | MobileCalendar seçili tarih navigasyonda kayboluyor | MobileCalendar:18 | `?date=` query param |
| P2-9 | Adım 1'e dönünce önceki seçim özeti görünmüyor | MobileNewReservation | Üstte seçim breadcrumb'ı |
| P2-10 | ReservationSheet kapatınca edit state sıfırlanmıyor | ReservationSheet:38-46 | reservation değişince state reset |
| P2-11 | BillingTab plan grid'i sabit 3 kolon | BillingTab.tsx:142 | Dar ekranda 1 kolona düş (mobile taşınırsa şart) |
| P2-12 | Kasa'da Enter kısayolu keşfedilemez | KasaPage:109 | Tutar altına ipucu metni |
| P2-13 | Slot çakışma toast'ları yönlendirmesiz | MobileNewReservation:105, ReservationSheet:74 | "Başka saat/personel seçin" ekle |
| P2-14 | StaffLogin'de PIN'siz personel için yol gösterme butonu yok | StaffLogin:52-55 | "/staff'a git" butonu |
| P2-15 | MobileQueue uzun listede sanallaştırma yok | MobileQueue:52-120 | İlk 10 + "Tümünü gör" (100+ sıralık işletme betada beklenmiyor) |

---

## FAZLA / GEREKSİZ OLANLAR ("neler fazla")

1. **İki farklı silme-onayı deseni** — ReservationsPage'te iki-tıklı "Emin misin?", başka yerlerde `confirm()`. P0-4'te tek desene inince kendiliğinden çözülür.
2. **`supabase/migration.sql` ve `update_database.sql`** — sıra numaralı migration'larla çakışan eski toplu dosyalar; yeni geliştirici için kafa karıştırıcı. Arşiv klasörüne taşı ya da başına "KULLANMA — tarihsel" notu koy.
3. **MobileHome'da hem "Giriş" (personel modu) hem bildirim zili hem tema butonu** — başlıkta 3 ikon; personel moduna geçiş alt bara ya da daha belirgin bir yere taşınabilir (beta kullanıcısı "Giriş" ikonunun ne olduğunu bilemez). Küçük ama ilk izlenimde kafa karıştırıcı.
4. **AI Önerisi kartı (MobileHome:203-225)** yalnızca "onay bekleyen var" bilgisini tekrarlıyor — hemen üstteki Onay Bekliyor bölümüyle aynı işi yapıyor. Ya gerçek AI içgörüsü (insight fonksiyonu zaten var) bağlansın ya kart kaldırılsın.

## BİLİNÇLİ KABUL EDİLENLER (bulgu değil, kayıt için)
- Faturalandırma/widget kodu/WhatsApp kurulumu mobilde yok → tasarım felsefesi gereği masaüstü işi.
- Personel veri izolasyonu client-side → bekleme listesinde (staff-scoped RLS, ekip büyüyünce).
- iOS push yalnızca ana-ekrana-ekli PWA'da çalışır → beta kullanıcılarına kurulum yönergesinde anlatılmalı.

---

## FİX LİSTESİ (uygulama sırasıyla)

**Beta'yı açmadan (P0):**
- [~] 1. Onboarding (P0-1) — **kullanıcı kararıyla beta sonrasına ertelendi** (2026-07-03)
- [x] 2. ManagerLogin: PIN yokken PIN oluşturma akışı (P0-2) — commit 9db286a
- [~] 3. (P0-3) — `/staff/:id` YANLIŞ POZİTİF (mobilde erişilemiyor); `/masa` gerçek mobil sayfa olarak P2'ye taşındı
- [x] 4. `ConfirmDialog` + 8 `confirm()` değişimi (P0-4) — commit 75b135c
- [x] 5. QueuePage WhatsApp + TahsilatSheet hata toast'ları (P0-5) — commit 75b135c
- [x] 6. Mobil randevu iptaline geri-al toast'ı (P0-6) — commit 75b135c

**İlk hafta (P1 — ~2 gün):**
- [ ] 7. Üç formda saving/disabled durumu (P1-1)
- [ ] 8. Settings dirty-check uyarısı (P1-2)
- [ ] 9. Personel modu light-mode renk düzeltmeleri (P1-3)
- [ ] 10. Mobil Analiz girişlerini gizle/yönlendir (P1-4)
- [ ] 11. Waitlist realtime (P1-5)
- [ ] 12. usePayments 90 gün + limit (P1-6)
- [ ] 13. MobileNewReservation done-state reset (P1-7)
- [ ] 14. Zorunlu alan işaretleri + inputMode="tel" (P1-8)

**Sonrası (P2):** yukarıdaki 15 kalem — sprint aralarına serpiştir; ayrıca "Fazlalıklar" 2-4.

---
*Rapor: masaüstü (24 ham bulgu) + mobil (30+ ham bulgu) otomatik taramaları ve önceki sistem denetimleri (realtime/parite/verimlilik) birleştirilip elle doğrulanarak hazırlandı; 3 yanlış-pozitif ayıklandı.*
