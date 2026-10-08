# Mobil + masaüstü denetimi · 2026-09-27

**Kapsam:** `mobile/` (71.2k satır), `src/` masaüstü (57.7k satır), 19 edge
fonksiyonu, 112 migration. Ağırlık mobilde; özel odak **iki yüzeyin aynı
veriyi farklı okuması**.

**Taban ölçümü (bugün):** 2702 test · 0 hata · 7 atlanıyor · mobil `tsc`
temiz · masaüstü `tsc` temiz · eslint 668 bulgu (462 mobil / 206 diğer, ezici
çoğunluk React Compiler'ın `react-hooks/refs` gürültüsü).

Her madde: **kanıt** (dosya:satır) · **etki** · **düzeltme yöntemi** ·
**tahmin**. Kanıtsız madde yok.

---

## A · İki yüzeyin ayrıştığı yerler

### A1 🔴 Aynı randevu masaüstünde "Onay Bekliyor", telefonda "Gelmedi"

**Kanıt**
- `src/pages/CalendarPage.tsx:575` → elle açılan randevuya `status: 'pending'`
- `src/components/kuafor/KuaforCalendarPage.tsx:565` → `'confirmed'`
- `mobile/src/lib/createLive.ts:364` → `'confirmed'`
- `src/hooks/useReservations.ts` insert varsayılanı → `'confirmed'`
- `src/lib/calendarSectorProfiles.ts:54` → **`guzellik` jenerik takvimi
  kullanıyor**, yani `CalendarPage`'i
- `src/lib/appointmentFlow.ts:29` → `pending` ERKEN dönüyor; `missed`
  hesabına hiç girmiyor
- `mobile/src/lib/approval.ts` → `APPROVAL_FLOW_ENABLED = false`, telefon
  `pending`i onaylı sayıyor

**Etki.** Güzellik salonu — yani satışa çıkan birincil sektör ve demo org —
masaüstü takviminden randevu açtığında satır `pending` yazılıyor.
- Masaüstünde o randevu **sonsuza kadar "Onay Bekliyor"**: `apptPhase`
  `pending`i görür görmez dönüyor, 30 dakikalık "Gelmedi" kuralına hiç
  ulaşmıyor.
- Aynı satır telefonda onaylı çiziliyor ve 30 dakika sonra **"Gelmedi"ye**
  düşüyor.
- Müdür kendi açtığı randevuyu onaylamak zorunda kalıyor; güzellik panosu bunu
  bir "fırsat" satırına çevirmiş (`GuzellikDashboard.tsx:420` · "Yarın onay
  bekliyor · Onayla").
- Kuaförde bu yok — `KuaforCalendarPage` `confirmed` yazıyor. Yani **aynı
  eylem sektöre göre iki farklı durum üretiyor.**

**Düzeltme.** `CalendarPage.tsx:575`'teki `status: 'pending'` → `'confirmed'`.
`booking_auto_confirm` zaten yalnız dış kanallar (public-booking,
whatsapp-booking) için tasarlanmış; elle açılan randevu tanımı gereği onaylı.
Kilit: masaüstü tarafında "elle açılan randevu confirmed yazılır" testi +
mevcut `tests/mobile-mudur-*` akış testleri.
Geçmiş veri isteğe bağlı: `update reservations set status='confirmed' where
status='pending' and source is null` — bu SQL'i sen çalıştırırsın, kararı senin.

**Tahmin:** 30 dk (kod + test). Geçmiş veri ayrı karar.

---

### A2 🟠 Masaüstü randevu listesi 500 satırda kesiliyor, telefon kesmiyor

**Kanıt**
- `src/hooks/useReservations.ts:205` → `.order('date', {ascending:false}).limit(500)`
- `mobile/src/lib/managerSource.ts:1080` → `readAll()`, 1000'lik sayfalarla
  tam okuma; başındaki yorum PostgREST'in sessiz kesmesini anlatıyor

**Etki.** Sıralama `date` AZALAN ve sınır 500 → dönen satırlar **tarihi en
ileri olan 500 satır**. Tekrarlayan randevular (`generate-recurring`) geleceğe
yığıldıkça bu pencere ileri kayıyor; yeterince ileri randevusu olan bir
salonda **bugün listeden düşebilir**. Daha hafif hâli zaten biliniyordu: eski
açık adisyonlar Kasa kuyruğundan düşüyor.

Telefon aynı veriyi eksiksiz okuyor. Yani **telefon doğru, masaüstü eksik** —
ve masaüstü hiçbir uyarı vermiyor.

Aynı desen `usePayments.ts:92`'de de var (`PAYMENTS_LIMIT = 3000`); oradaki
yorum "tüm-zaman toplamlar doğru kalır" diyor ama sınır aşılınca kalmıyor.

**Düzeltme.** Mobildeki `readAll` desenini masaüstüne taşı: sayfa sayfa oku,
sayfa dolu gelmeyene kadar devam et. Alternatif (daha ucuz ama yarım): tarih
penceresini sınır yerine kullanmak — `gte(date, bugün-90) `zaten var, `limit`
kaldırılıp sayfalama eklenir.
Kilit: 501 satırlık kurgu veriyle "bugün listede" testi.

**Tahmin:** 2 saat (iki hook + test).

---

### A3 🟠 `settings` satırı: masaüstü kullanıcıya, telefon org sahibine bakıyor

**Kanıt**
- `src/hooks/useReservations.ts:275` → `.eq('user_id', user.id)`
- `mobile/src/lib/managerSource.ts:228` (`fetchOrgSettings`) → önce
  `organizations.owner_id`, sonra o kullanıcının satırı
- `supabase/functions/staff-api` → aynı sahip satırını okuyor
- `src/hooks/useReservations.ts:354` → satır yoksa **o kullanıcı adına yeni bir
  settings satırı açıyor**, varsayılan çalışma saatleriyle
- `src/hooks/useSectorComms.ts:31` → `.eq('organization_id').maybeSingle()`
- `src/hooks/useSectorComms.ts:52,65` → `.update(...).eq('organization_id')`

**Etki.** Tek kullanıcılı salonda görünmez. İkinci bir kişi masaüstüne girer
girmez:
- Ona **kendi settings satırı** açılıyor (varsayılan saatlerle). Masaüstünde
  onun gördüğü çalışma saatleri, telefonun ve `staff-api`'nin gördüğünden
  farklı.
- `useSectorComms` okuması `maybeSingle()` ile **çok satırda hata veriyor**;
  hata dalı yalnız 42703/PGRST204'ü tanıyor, gerisi sessizce `stored = null`
  bırakıyor → salonun kendi mesaj dili kaydedilmiş olduğu hâlde ekran sektör
  varsayılanını gösteriyor.
- Aynı dosyanın yazması `organization_id` süzgeciyle **bütün satırları**
  eziyor: okuma tek satır, yazma hepsi.

**Düzeltme.** Tek bir `orgSettingsRow()` yardımcısı: sahip satırı → yoksa en
eski. Masaüstündeki üç okuyucu (`useReservations`, `useSectorComms`,
`integrationApi`) onu çağırsın. `maybeSingle()` yerine
`.order('created_at').limit(1).maybeSingle()`.
Asıl çözüm (daha sağlam, migration ister): `settings`e
`unique(organization_id)` koyup org başına tek satıra inmek — ama önce
mevcut mükerrer satırların birleştirilmesi gerekir.

**Tahmin:** 2 saat (istemci hizalaması) · 1 gün (org başına tek satır göçü).

---

### A4 🟡 Paket borcu: telefon masaüstünden FAZLA gösterebiliyor

**Kanıt**
- `mobile/src/lib/managerSource.ts:764` →
  `owed = max(0, total_amount − planId'ye bağlı ödemeler)`
- `mobile/src/lib/managerSource.ts:725` → plan süzgeci `.neq('status','cancelled')`
- `src/lib/patientBalance.ts:54` → `isBillablePlan = active | completed`
  (**`proposed` borç değildir**)
- `src/lib/patientBalance.ts:75` → plana bağlanmamış `service` ödemeleri de
  borçtan düşülüyor
- `mobile/src/components/CustomerCard.tsx:468` → telefon `₺X ödenmedi` yazıyor

**Etki.** İki fark da telefonun rakamını **yukarı** çekiyor:
1. `proposed` (teklif) planlar telefonda borç sayılıyor.
2. Plana bağlanmamış serbest tahsilat telefonda hiç düşülmüyor.

Pratikte dar: `src/lib/allocatePayment.ts` Kasa'dan alınan her tahsilatı
planlara FIFO mahsup ediyor, ve `proposed` yalnız diş/fizyo'da üretiliyor —
mobil kayıtta o sektörler kapalı. Yine de formül iki yerde ayrı ve biri
"tek doğruluk kaynağı" diye yazılmış.

**Düzeltme.** Mobil süzgeci `.in('status', ['active','completed'])` yap —
`isBillablePlan` ile birebir. Bir satır. İkinci fark için telefonun da
serbest `service` ödemelerini okuması gerekir; bugün gerekmiyor, karar
ertelenebilir ama YAZILI olsun.

**Tahmin:** 15 dk (süzgeç) · yarım gün (tam eşleme).

---

## B · Mobil içi

### B1 🟠 Var olmayan bir kolon her akış okumasında sunucuya soruluyor

**Kanıt**
- `mobile/src/lib/managerSource.ts:263` `fetchArrivalTolerance()` →
  `fetchOrgSettings('arrival_tolerance_min')`
- `settings.arrival_tolerance_min` **112 migration'ın hiçbirinde yok**
  (`grep` boş döndü)
- Masaüstünde onu AYARLAYAN bir ekran da yok; yalnız okuyanlar var

**Etki.** Her çağrı iki istek harcıyor (`organizations` + `settings`) ve
ikincisi **her seferinde 42703 ile hata dönüyor**; hata bilerek yutuluyor.
Yani ürünün normal çalışması sunucuya sürekli başarısız istek atıyor —
bir gün gerçek bir hata bu gürültünün içinde kaybolur.

**Düzeltme.** İki yol, biri seçilmeli:
- **Sil:** okumayı kaldır, `NO_SHOW_AFTER_MIN` sabitini kullan. Telefon ve
  masaüstü zaten 30 kullanıyor. 20 dk.
- **Gerçek yap:** migration + masaüstünde ayar alanı. Salonlar eşiği
  değiştirmek isterse doğru yol bu. Yarım gün.

Bugünkü hâl ikisinden de kötü: ne çalışıyor ne de yok.

---

### B2 🟠 Üretim paketi hâlâ "sahte kip"e düşebilir

**Kanıt** `mobile/src/api/session.ts:24` →
`LIVE_AUTH = process.env.EXPO_PUBLIC_AUTH_MODE === 'live'`
`STUB_PARTS = []` (satır 38) — stub'ın kapattığı hiçbir boşluk kalmamış.
`eas.json` `environment: "production"` ile EAS'in kendi değişkenlerini
kullanıyor; değişken silinirse ya da adı değişirse **varsayılan stub**.

**Etki.** Değişken kaybolursa mağazaya giden paket açılır, giriş yapar, veri
gösterir — **hepsi sahte**. Duman testi bunu YAKALAYAMAZ, çünkü uygulama
sorunsuz çalışıyor görünür. Bu, üretim paketinin sessizce kırılmasının ikinci
sınıfı (birincisi dinamik import'tu, bkz. [[uretim_paketi_kirikti]]).

**Düzeltme.** İki adım:
1. `__DEV__` değilken `EXPO_PUBLIC_AUTH_MODE !== 'live'` ise **açılışta sert
   hata** — "yapılandırma eksik" ekranı. Sahte veri göstermektense açılmamak
   yeğ.
2. Orta vadede stub'ı tamamen kaldır (`authStub.ts` 979 satır + 6 `demo*`
   kaynağı mağaza paketinde taşınıyor). Kalan tek stub tüketicisi abonelik.

**Tahmin:** 1 saat (guard + test) · yarım gün (stub'ın sökülmesi).

---

### B3 🟡 Saat eki tablosu yalnız 5'in katlarını biliyor

**Kanıt** `mobile/src/lib/managerFlow.ts` · `MINUTE_LOCATIVE` — 5,10,…,55.
Tabloda olmayan dakikada ek `'de'`ye düşüyor.

**Etki.** "11:06'de bekleniyordu" (doğrusu *11:06'da*), "10:03'de",
"09:04'de". Masaüstünden 5'in katı olmayan saatlerde randevu açılabiliyor ve
demo tohumu da dakikayı `date_trunc('minute')` ile yazıyor — yani ekran
görüntüsü alınan veride bile çıkabilir.

**Düzeltme.** Eki tablodan değil **son rakamın okunuşundan** türet (0,3,4,5→
'te/ta' ailesi; kalınlık uyumu için son sesliye bak). 20 satırlık saf
fonksiyon, tamamen test edilebilir.

**Tahmin:** 45 dk.

---

### B4 ⚪ Ölü dışa aktarımlar ve yinelenen sayaçlar

- `managerFlow.autoCancelled` ve `graceLeft` yalnız **testlerden** çağrılıyor;
  üretimde kullanan yok. Üstelik ikisi de 120'yi varsayılan alıyor, ürünün
  gerçek eşiği 30 — bir gün biri onları çağırırsa yanlış cevap alır.
- `mobile/app/mudur/profile.tsx` aynı ekranda hem 1 sn'lik hem 60 sn'lik
  sayaç çalıştırıyor.
- `.claude/worktrees/friendly-wilson-5be57e` — `git worktree list` onu
  **prunable** gösteriyor ve `~/Desktop/luera-timeflow` altında duruyor
  (proje iCloud yüzünden Masaüstü'nden taşınmıştı). Lint onu tarıyor ve
  bulgulara karıştırıyor.

**Düzeltme.** İkisini sil; `git worktree prune`. 20 dk.

---

## C · Masaüstü (mobili dolaylı etkileyen)

### C1 🟡 Realtime güncellemesinde personel adı bir an kayboluyor

**Kanıt** `src/hooks/useReservations.ts:415-427` — `postgres_changes` yükünde
`staff(name,color)` join'i gelmiyor; yedek olarak *başka* bir randevudan aynı
`staff_id` aranıyor. Listede o personelin başka randevusu yoksa ad boş kalıyor
ve ancak tek satırlık düzeltme sorgusu dönünce geliyor.

**Etki.** Telefondan bir randevu oluşturulduğunda masaüstünde satır bir an
personelsiz görünüyor. Kozmetik, kendi kendini düzeltiyor.

**Düzeltme.** Yedeği listeden değil `staff` listesinden (zaten yüklü) al.
20 dk.

---

## D · Upgrade fikirleri

Kusur değil; ürünü ileri taşıyan işler. Etki/maliyet sırasıyla.

### D1 · Yoklamayı canlı kanala göre esnet — **en yüksek kâr/zarar**
Bugün ekran açıkken her **25 sn**'de bir sorgu gidiyor
(`mobile/src/lib/freshness.ts · POLL_MS`), üstüne canlı kanal da açık
(`liveSignal.ts`). Kanal sağlıklıyken yoklama emniyet ağı — 25 sn gereksiz.
**Öneri:** kanal `joined` iken `POLL_MS` 120 sn'ye çıksın, kanal düşünce 25
sn'ye insin. Açık duran her telefonda sunucu yükü ~5 kat azalır, pil kazancı
cabası. Bayatlık eşiği (`STALE_AFTER_MS`) kanal düştüğü an zaten devreye
giriyor, yani dürüstlük sözleşmesi bozulmuyor.
**Tahmin:** 2 saat.

### D2 · `owner_id` + settings için oturum önbelleği
`fetchOrgSettings` her çağrıda **iki** istek atıyor ve ekran başına birkaç kez
çağrılıyor (risk kuralları, bildirim tercihleri, tolerans, çalışma saatleri).
Oturum boyu tek okuma + yazmada geçersiz kılma, müdür ekranlarının ilk
açılışını gözle görülür hızlandırır.
**Tahmin:** 3 saat.

### D3 · Saati sunucudan oku, cihazdan değil
`calendar.ts:429 todayISO()` cihazın yerel gününü kullanıyor. Sahibi yurt
dışındayken telefon salonun "bugün"ünü kaydırır; cihaz saati yanlışsa
"Gelmedi" eşiği de kayar. `server_now` RPC'si (095) zaten var.
**Öneri:** açılışta bir kez sunucu saatiyle sapma ölçülsün, bütün "şimdi"
hesapları o sapmayla düzeltilsin. Salon saat dilimi ileride org ayarı olur.
**Tahmin:** yarım gün.

### D4 · Sunucu zamanı tek kaynak olunca "gelmedi" sunucuya yazılabilir
Bugün "düştü" kararı iki istemcide ayrı ayrı hesaplanıyor
(`NO_SHOW_AFTER_MIN` iki dosyada sabit). D3'ten sonra bu karar sunucuya
alınabilir → masaüstü, telefon ve ileride personel kumandası aynı cevabı
verir ve A1 sınıfı ayrışmalar yapısal olarak imkânsızlaşır.
**Tahmin:** 1 gün.

### D5 · Paylaşılan kural katmanı (`@shared`)
`appointmentFlow.ts` (masaüstü) ile `managerFlow.ts`/`flowBuild.ts` (mobil)
aynı kuralın iki kopyası. Abonelik tarafında bu zaten çözülmüş:
`supabase/functions/_shared/entitlement.ts` hem sunucu hem istemci tarafından
`@shared` alias'ıyla kullanılıyor. Aynı deseni randevu yaşam döngüsüne taşı.
A1 ve A4 bu sayede bir daha doğmaz.
**Tahmin:** 2 gün (kademeli yapılabilir: önce faz, sonra bakiye).

### D6 · Masaüstü okumalarını sayfalamaya geçir
A2'nin kalıcı hâli: `useReservations`, `usePayments`, `useStock`, `useExpenses`
hepsi tek atışlık sınırlı sorgu. Mobildeki `readAll` yardımcısı ortak bir
`src/lib/` dosyasına alınıp dördüne de bağlanabilir.
**Tahmin:** yarım gün.

### D7 · Mağaza paketinden demo veriyi çıkar
`authStub.ts` (979 satır) + `staffDemo` · `catalogDemo` · `demoSource` ·
`demoBook` · `demoAgenda` üretim paketinde taşınıyor. B2'nin guard'ı
konduktan sonra bunlar `__DEV__` arkasına alınabilir; paket küçülür ve
"sahte veri mağazaya gitti" riski kökten kalkar.
**Tahmin:** yarım gün.

### D8 · Lint tabanını düşür
668 bulgunun 376'sı `react-hooks/refs`, 115'i `no-explicit-any`. `refs`
grubunun neredeyse tamamı React Compiler'ın yeni kuralı ve çoğu gerçek bir
hata değil — ama gürültü, **gerçek** 5 `purity` + 14 `immutability` bulgusunu
görünmez yapıyor. Öneri: `refs` kuralını bilinçli olarak `warn`'a indir, 19
gerçek bulguyu sıfıra çek, tabanı kilitle.
**Tahmin:** 3 saat.

---

## E · Önerilen sıra

| Sıra | Madde | Neden önce |
|---|---|---|
| 1 | **A1** | Satıştaki sektörde iki ekran aynı randevu için zıt şey söylüyor; düzeltmesi bir satır |
| 2 | **B2** | Bir daha "üretim paketi sessizce sahte" olmasın; guard ucuz |
| 3 | **B1** | Her okumada sunucuya başarısız istek; sil ya da gerçek yap, ikisi de kısa |
| 4 | **A2 + D6** | Masaüstü sessizce eksik veri gösteriyor; aynı işte ikisi birden |
| 5 | **A3** | İkinci kullanıcı girer girmez patlar — ikinci kullanıcı gelmeden yap |
| 6 | **D1** | Ölçülebilir sunucu ve pil kazancı, davranış değişmiyor |
| 7 | **A4, B3, B4, C1** | Kısa ve bağımsız; bir turda toplanır |
| 8 | **D3 → D4 → D5** | Yapısal; A1/A4 sınıfını kökten kapatır |
