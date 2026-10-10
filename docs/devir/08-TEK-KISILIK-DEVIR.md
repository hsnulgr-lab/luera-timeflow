# DEVİR · ÜÇÜNCÜ KABUK (tek kişilik işletme)

**Tarih:** 2026-10-11 · **Dal:** `tek-kisilik` = `main` (birleşti, push edildi) · **Kod commit'i:** `7386ba1`
**Testler:** 2784 geçti / 0 kırık / 7 atlandı · `tsc` temiz

> **2026-10-11 akşam turu (§15):** 111 yeniden yazıldı ve yerelde gerçek
> Postgres'te sınandı. Kasa arayüz taslağı `tek-kasa` dalına alındı.
> `tek-kisilik` `main`'e ileri sarıldı. **111 canlıda; `staff-api` ve
> `whatsapp-booking` deploy edildi ve doğrulandı** (§6). Deploy borcu yok.

Bu belge tek başına yeterli olmak için yazıldı. Yeni oturum bunu okuyunca
projeyi, kararları ve sıradaki işi bilmeli; önceki konuşmayı aramaya
ihtiyaç duymamalı.

---

## 0 · OTURUMA BAŞLARKEN İLK ÜÇ ŞEY

1. **Kullanıcının duran emrini oku** (§1). Her şeyin üstünde o var.
2. **Deploy borcu YOK** (§6, 2026-10-11 akşam). 111 canlıda; `staff-api`
   ve `whatsapp-booking` `main`'den deploy edildi. Tahsilatın telefonda
   denenmesi hâlâ bekliyor.
3. **v4 HTML'i aç:** `docs/design-reference/Luera Mobil - Tek Kisilik v4.html`
   Tek doğruluk kaynağı bu. 23 ekranın listesi §4'te.

---

## 1 · KULLANICININ DURAN EMRİ

Kelimesi kelimesine, çünkü her tur bundan sapma riski taşıyor:

> *"ben bu html dosyasındaki ekran tasarımlarını birebir aynısını istiyorum
> a-z ye eksiksiz bazıları uygulanmamış bunları uygula"*

Ve test turunda:

> *"1 ve 2nci fotoğraftaki görseller canlı olan 3 ve 4 deki de html de
> tasarlanan ben birebir aynısını istiyorum çünkü farklı duruyor telefondaki"*

**Ne demek:** v4'teki her ekran, telefonda birebir aynı görünecek. Kullanıcı
canlı ekranın fotoğrafını çekip tasarımın yanına koyuyor ve farkı soruyor.
"Yaklaşık aynı" kabul edilmiyor. Ölçüler v4 CSS'inden tarayıcıda JS ile
ölçülerek alındı — göz kararı değil.

### Tasarımın yönetici cümlesi

> **Bu yeni bir tasarım değil, var olanın yeniden derlenmesi.**

Üçüncü kabuk, var olan müdür + personel ekranlarından kuruluyor. Tek kişilik
bir işletme, bilgisayarı olmadan, tek telefondan yönetilecek. Yeni bileşen
yazmak son seçenek; ilk seçenek var olanı yeniden dizmek. `tek4-ekranlar.js`
her ekranın `from:` alanında hangi canlı ekrandan türediğini yazıyor — ona
uyun.

### Tasarım bel kemiği (proje geneli kuralı)

Doğru veri + bozuk görünüm = **iş bitmemiş.** Bu kullanıcının açık kararı
(bkz. hafıza: `tasarim_bel_kemigi`).

---

## 2 · PROJE GERÇEĞİ (kısa)

**Luera TimeFlow** — çok kiracılı (multi-tenant) salon/klinik SaaS. Masaüstü
web + Expo/RN mobil. Mobilde **üç kabuk** var:

| Kabuk | Dizin | Kim |
|---|---|---|
| Müdür | `mobile/app/mudur/` | işletme sahibi, ekibi olan |
| Personel | `mobile/app/personel/` | çalışan · "kumanda" |
| **Tek kişilik** | `mobile/app/tek/` | **bu devrin konusu** |

### Mod bir BAYRAK, rol değil

`AuthActor` hâlâ `'manager' | 'staff'`. Üçüncü bir rol YOK. Üçüncü kabuğu
açan şey `organizations.solo = true` (göç 108). Sebep: rol eklemek RLS,
çakışma kontrolü, raporlar ve bildirim kanallarının hepsinde ikinci bir dal
açardı ve hatalar o dalda saklanırdı.

`useInSoloShell()` kabuğu **rotadan** okuyor (`useSegments()[0] === 'tek'`).
⚠️ `app/(staff-flow)/kumanda.tsx` içinde ÇALIŞMAZ — o ekran farklı bir
segment. Orada `from` parametresi kullanılıyor (`params.from === 'tek'`).

### Teknik zemin

- Expo SDK **57** (`expo ~57.0.20`, `expo-router ~57.0.19`, RN 0.86.3,
  React 19.2.3). `mobile/AGENTS.md` bağlayıcı — okumadan kod yazma.
- `NativeTabs` → `expo-router/unstable-native-tabs`; `Icon`/`Label` artık
  `NativeTabs.Trigger` altında.
- **`react-native-gesture-handler` YOK ve kurulmayacak.** Jest =
  `PanResponder`.
- reanimated 4.5.1 kurulu ama **eski ekranlar taşınmıyor**; yazılmış
  animasyonlar RN `Animated`'de kalıyor.
- Supabase **kendi VPS'imizde** (Coolify). Edge function deploy'u
  `./scripts/deploy-functions.sh <ad>` — `supabase functions deploy`
  **KULLANILMAZ** (o Cloud için).

### Ev kuralları (kaynak metni eşleyen testler koruyor)

1. **"Ekran yalan söylemez."** Sunucu kabul etmeden ekran değişmez.
2. **"Dokunulan her kontrol bir iş yapar."** Süs düğme yok.
3. **"Yazma önce sunucuya gider."** İyimser yazma yok.

---

## 3 · BU DALDA NE YAPILDI

### Dosyalar — yeni

| Dosya | Satır | Ne |
|---|---|---|
| `mobile/app/tek/_layout.tsx` | 117 | 5 sekme + solo oturum takması |
| `mobile/app/tek/index.tsx` | 345 | **Gün** ekranı (v4 G1–G3, B1–B4) |
| `mobile/app/tek/calendar.tsx` | 7 | Takvim (T1) — müdür takvimini tek sütunla sarıyor |
| `mobile/app/tek/create.tsx` | 7 | Yeni randevu (R1/R2) — müdür akışını sarıyor |
| `mobile/app/tek/cash.tsx` | 7 | Kasa (C1) — müdür Kasa'sını sarıyor |
| `mobile/app/tek/isletme.tsx` | 13 | İşletme (P1) — müdür Profil'ini sarıyor |
| `mobile/src/lib/soloDay.ts` | 352 | Gün ekranının tüm karar katmanı (saf) |
| `mobile/src/lib/soloSession.ts` | 130 | Sahibin personel jetonunu basma köprüsü |
| `mobile/src/lib/collect.ts` | 98 | Tahsilat karar katmanı (saf) |
| `mobile/src/components/SoloDayParts.tsx` | 304 | v4 `.gc`/`.gk` kartı, şimdi hapı, iskelet |
| `mobile/src/components/CollectBar.tsx` | 207 | v4 K3/K4 tahsilat güvertesi |

**7 satırlık dosyalar süs değil:** sarmalayıcı olmaları kasıtlı. Aynı ekranı
iki kez yazmak, iki kez bozmak demekti.

### Göçler

| Göç | Ne | Durum |
|---|---|---|
| `108_tek_kisilik.sql` | `organizations.solo` + `set_business_mode()` | ✅ **üretimde** |
| `109_staff_auth_log_eksik_olaylar.sql` | (gerekçesi YANLIŞTI — bkz. §8) | ⚠️ **üretimde, zararsız** |
| `110_staff_auth_log_tahsilat.sql` | `visit.collect` olayı + `pair_locked` geri | ✅ **üretimde** (2026-10-11) |
| `111_kasa_duzeltme_izi.sql` | Düzelt / Geri al izi + damgalı satırı gizleyen politikalar (§15) | ✅ **üretimde** (2026-10-11 akşam, kuru koşu geçti) |

### Sunucu — `supabase/functions/staff-api/index.ts`

**`solo.session`** (satır ~466) — sahip KENDİ kumandasını açıyor.
Dört kapı sırayla: sahip oturumu (`ownerOf`) → org `solo` mu → tam olarak
**bir** aktif personel var mı → abonelik (`checkAccess`). Hepsi geçerse
`loginResponse(crew[0])` ile personel jetonu basıyor ve
`audit(org, staff.id, 'login', 'solo')` yazıyor.
⚠️ `x-staff-token` kapısından **ÖNCE** duruyor — çünkü jetonu o basıyor.
**Durum: deploy EDİLDİ** (canlıda doğrulandı: bilinmeyen eylem
`invalid_token`, bu uç `unauthorized` dönüyor).

**`visit.collect`** (satır ~1859) — adisyonu tahsil et.
Yöntem doğrulaması → `loadOwnReservation` → `status !== 'completed'` ise
409 `not_finished` → var olan ödeme sorgusu → **tutarı SUNUCU hesaplıyor** →
`payments` satırı → sonra `is_paid` bayrağı → `audit(…, 'visit.collect', method)`.
`WRITE_ACTIONS` listesinde (idempotens).
**Durum: deploy EDİLDİ** (2026-10-11); telefonda denenmedi. → §6

### İstemci — `mobile/src/api/staff.ts`

Takılabilir jeton tazeleyici eklendi. **Bilinçli olarak `supabase`'i import
etmiyor** (dairesel bağımlılık ve personel kabuğunun müdür oturumuna
bulaşması):

```ts
type TokenRefresher = () => Promise<boolean>;
export function setStaffTokenRefresher(fn: TokenRefresher | null): void
const needsFreshToken = (code) => code === 'no_session' || code === 'invalid_token';
// call() BİR kez yeniden deniyor: if (!fresh || fresh === t) throw cause;
```

`visitCollect` → `call` kullanıyor, **`write` DEĞİL**: para çevrimdışı kuyruğa
girmez (§7'de sebebi).

---

## 4 · v4 EKRAN ENVANTERİ — 23 EKRAN

`docs/design-reference/tek4-ekranlar.js` içindeki `spec({id:…})` sırası.

| Kod | Başlık | Durum |
|---|---|---|
| G1 | Boşta · sıradaki 19 dk sonra | ✅ |
| G2 | Sürüyor | ✅ |
| G3 | Beklemede · krem | ✅ |
| **G4** | **Adisyon açık · "₺4.500 · Tahsil et"** | ❌ **SIRADAKİ** |
| K1 | Kumanda · bekleniyor | ✅ (var olan kumanda) |
| K2 | Kumanda · işlemde | ✅ (var olan kumanda) |
| K3 | Adisyon · tahsilat | ✅ `CollectBar` · sunucu canlı, telefon testi bekliyor |
| K4 | Tahsilat · sunucu reddetti | ✅ `CollectBar` · sunucu canlı, telefon testi bekliyor |
| P1 | İşletme | ✅ |
| **P2** | **Ekip ekle kapısı** | ❌ |
| C1 | Kasa · bir düzeltmeden sonra | ✅ (düzeltme satırı hariç) |
| **C2** | **Hareket satırı → Düzelt / Geri al** | ⏳ sunucu CANLIDA (111), arayüz `tek-kasa` dalında, bağlanmadı |
| **C3** | **Tahsilatı düzelt** | ⏳ aynı |
| R1 | Yeni randevu 1/2 | ✅ |
| R2 | Yeni randevu 2/2 | ✅ |
| T1 | Takvim · tek sütun | ✅ |
| B1 | Gerçekten boş | ✅ |
| B2 | Kapalı gün | ✅ |
| B3 | Yükleniyor (iskelet) | ✅ |
| B4 | Okunamadı | ✅ |
| S1 | Mod sorusu | ✅ |
| S2 | İlk gün | ✅ |
| S3 | İlk randevu · yeni hesap | ✅ |

**Kalan dört ekran: G4, P2, C2, C3.** Hepsi Faz 3 ("para ve ekip").

---

## 5 · SIRADAKİ İŞ · G4 (adım adım)

v4'te Gün ekranının **dördüncü** hâl kartı:

```
ADİSYON AÇIK        (bar:1, dot:1, am:1 — kehribar)
₺4.500
[Tahsil et]  (go)
Tuğçe Erden · Kalıcı Makyaj · 16:02'de bitti
alt başlık: "9 Ekim · 3 iş bitti, 2 kaldı"
listedeki kart: st:OPEN
```

### Neden henüz yok — tesisat eksiği

`mobile/src/lib/soloDay.ts:229` kendi yorumunda yazıyor:
*"`buildStaffDayState` ödeme diye bir şey bilmiyor."* Durum şu:

| Katman | `is_paid` var mı |
|---|---|
| Veritabanı `reservations.is_paid` | ✅ |
| `staff-api` → `RES_COLS` (satır 1135) | ✅ |
| `managerSource.FLOW_COLS` (Akış okuması) | ✅ (satır 392) |
| `RES_COLS` → `managerMap.ts:28` (gün okuması) | ❌ |
| `Appt` arayüzü (`mobile/src/lib/calendar.ts:26`) | ❌ |
| `buildStaffDayState` | ❌ dal yok |
| `soloPanelAction` | ❌ üçüncü dal yok |

Gün ekranı **`useManagerCalendarDay`** ile okuyor (Akış'la değil), o yüzden
`is_paid` oraya ulaşmıyor.

### Yapılacaklar sırası

1. `Appt`'a `is_paid?: boolean | null` ekle — **isteğe bağlı**, aynı
   `staff_id` gibi; personel tarafındaki çağrıları bozmamak için.
2. Gün okumasına sütunu geçir. İki yol var, **birincisi tercih**:
   - (a) `fetchDayWithStamps` (`managerSource.ts:313`) `${RES_COLS}, updated_at`
     seçiyor; oraya `is_paid` ekle → tek satır. ⚠️ `RES_COLS`
     (`managerMap.ts:28`) **paylaşılan** bir sabit; onu değiştirmek bütün
     okumaları etkiler. Sütunu sabite değil, **o çağrının kendi listesine**
     ekle.
   - (b) Gün ekranını `fetchFlowRows`'a geçir → daha büyük değişiklik, müdür
     Akış'ının varsayımlarını taşır. Önerilmez.
3. `buildStaffDayState`'e "adisyon açık" dalı: `status === 'completed' &&
   !is_paid`. ⚠️ **Bu fonksiyonu müdür de kullanıyor** — yeni dal mevcut
   davranışı değiştirmemeli; en güvenlisi yeni bir alan döndürmek
   (`openTicket: Appt | null`) ve var olan alanlara dokunmamak.
4. `soloPanelAction`'a üçüncü dal: açık adisyon varsa
   `{ label: 'Tahsil et', tone: 'go', appointmentId }`. **Sıra önemli:**
   süren iş > açık adisyon > sıradaki. Sebep: süren işin dakikası akıyor.
5. Kart tutarı: `cashBuild`'in `serviceLines` + adisyon kalemleri formülü
   zaten var; `visit.collect`'in sunucudaki hesabıyla **aynı** olmalı
   (kalem = `price × qty`, kullanıcı kararı).
6. Listedeki kartın `st:OPEN` damgası → `soloApptStamp`'e yeni ton.
   Bugün "tamamlandı" yazıyor; v4 "tahsil edildi" / "adisyon açık" ayrımı
   yapıyor. `is_paid` gelince bu ayrım da yapılabilir hâle geliyor (§8'de
   "bilinçli ayrışma" olarak duruyordu — G4 onu kapatır).
7. `soloDay.ts:229`'daki "üçüncü hâl neden yok" yorumunu **sil ve yerine
   olanı yaz**. O yorum artık yanlış olacak.
8. Test: `tests/mobile-tek-gun.test.mjs`'e G4 dalı; hapın sırası ve tutarın
   sunucuyla aynı formülden geldiği kilitlenmeli.

---

## 6 · DEPLOY DURUMU

**Kuralı unutma: ssh ve deploy komutlarını KULLANICI çalıştırır.** Sen
çalıştırmayı denemeyeceksin; komutu verip bekleyeceksin.

### ✅ YAPILDI (2026-10-11 akşam) — 111 + iki fonksiyon

Kullanıcı dört adımı sırayla çalıştırdı: ön kontrol `0`; kuru koşu
`kasa düzeltme regression: ok` + `ROLLBACK` (üretim şemasında, iz yok); göç
`COMMIT`; deploy (`main` = `75f1ac1`).

**Doğrulama (Claude, yan etkisiz istekler):**
- 18/18 edge function `OPTIONS` → 200; olmayan bir ad → 500 "boot error".
- PostgREST, anon anahtarıyla: `correct_payment`, `revert_payment`,
  `voided_payments` → `42501 permission denied` — üçü de şema önbelleğinde
  VAR ve anon'a KAPALI. Olmayan bir RPC → `PGRST202` (ölçüm ayırt ediyor).
- `staff-api`: `visit.collect` → `invalid_token` (jeton kapısı),
  `solo.session` → `unauthorized` (uç yerinde).

**Yan sonuç:** `whatsapp-booking` artık `main`'in en son koduyla çalışıyor.
Hafızadaki "remind + whatsapp-booking deploy'u bekliyor" (2026-08-02) borcu
böylece kapandı: `remind` öğlen, `whatsapp-booking` akşam gitti. Hiçbir
WhatsApp hattı bağlı olmadığı için bugün kimseye etkisi yok; hat eşleşince
asistan bayrağı (varsayılan kapalı) devrede.

Aşağıdaki komutlar sonraki göçler için kalıp olarak duruyor. Sıra zorunluydu:
ters sırada `visit.collect` olmayan `voided_at` sütununu sorar ve **her
tahsilat `lookup_failed` ile düşerdi.** Sakin bir saatte (göç `payments`i bir
an kilitliyor).

**0 · Ön kontrol** — 111 daha önce uygulanmamış olmalı, sonuç `0`:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 "docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -tAc \"select count(*) from information_schema.columns where table_schema='public' and table_name='payments' and column_name='voided_at'\""
```

**1 · Kuru koşu** — göç + davranış testi TEK işlemde, sonunda hepsi geri
sarılır. Son satırlar `kasa düzeltme regression: ok` ve `ROLLBACK` olmalı:

```bash
cd ~/Projects/luera-timeflow && { echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/111_kasa_duzeltme_izi.sql; sed -e '/^BEGIN;$/d' supabase/tests/kasa_duzeltme_regression.sql; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

**2 · Göç** (yalnız kuru koşu geçtiyse):

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/111_kasa_duzeltme_izi.sql
```

**3 · Deploy** (`_shared` değişmedi, adla deploy güvenli):

```bash
cd ~/Projects/luera-timeflow && ./scripts/deploy-functions.sh staff-api whatsapp-booking
```

**4 · Doğrulama** — ikisi de `200` dönmeli (Claude çalıştırabilir; olmayan
bir fonksiyon adı aynı istekte 500 "boot error" döndüğü için ölçüm geçerli):

```bash
for f in staff-api whatsapp-booking; do curl -s -o /dev/null -w "$f %{http_code}\n" -X OPTIONS https://supabase.timeflow.lueratech.com/functions/v1/$f; done
```

### ✅ Önceki tur (2026-10-11 öğlen) — hepsi yapıldı

| İş | Durum |
|---|---|
| Göç `110_staff_auth_log_tahsilat.sql` | ✅ uygulandı (BEGIN/ALTER/ALTER/NOTIFY/COMMIT) |
| `staff-api` deploy (`visit.collect`) | ✅ edildi |
| `remind` deploy | ✅ edildi — aşağıdaki kazayı kapattı |

**Sıra neden önemliydi:** göç önce, deploy sonra. Tersi olsaydı
`visit.collect` çalışır ama denetim satırı kısıta takılırdı — ve `insert()`
fırlatmadığı için **sessizce** düşerdi (§8'deki ders).

Geriye kalan tek doğrulama **telefonda**: `visit.collect` jeton kapısının
arkasında olduğu için dışarıdan probe ile bilinmeyen bir eylemden ayırt
edilemiyor (ikisi de `invalid_token` döner).

### 🔴 Bu deploy turunda ortaya çıkan üretim kazası

`staff-api` deploy'unun logu `remind`'in **boot edemediğini** gösterdi:

    worker boot error: The requested module '../_shared/wa.ts'
    does not provide an export named 'connectedOrgs'

25 Eylül'deki `9726fc3` (WhatsApp "connecting" süzgeci) `_shared/wa.ts` ile
`remind/index.ts`'i BİRLİKTE değiştirmişti: `connectedOrgs` → `linkedOrgs`.
Ama `deploy-functions.sh` **her koşuda `_shared`'ı kopyalıyor**, fonksiyonları
yalnız adı verilirse. Başka bir iş için yapılan her deploy sunucuya yeni
`wa.ts` gönderdi; `remind` eski kaldı ve var olmayan bir adı istedi.

`./scripts/deploy-functions.sh remind` ile kapatıldı. **Doğrulama şekli
önemli:** `docker restart` log geçmişini silmiyor, bu yüzden deploy sonrası
log tail'i hâlâ eski hata satırlarını gösteriyor (izolat kimlikleri bile
aynı). Düzeldiğini anlamanın yolu **ucu çağırmak**:

```bash
curl -s -X POST https://supabase.timeflow.lueratech.com/functions/v1/remind -H 'Content-Type: application/json' -d '{}'
```

Kendi 401 metnini dönüyorsa ("Bu uç yalnız zamanlayıcı tarafından
çağrılabilir") boot ediyor demektir.

**İki ders:**
1. **Paylaşılan modül değişince tek fonksiyon deploy etme.** Betiğin kendi
   başlığı söylüyor: `_shared` değişince argümansız koş.
2. **Deploy sonrası log tail'i kanıt değildir.** Ucu çağır.

~~⚠️ Hafızadaki `dental_sales_prep` `whatsapp-booking` için de bekleyen bir
deploy olduğunu söylüyor.~~ **KAPANDI (2026-10-11 akşam):** `whatsapp-booking`
`main`'den deploy edildi. 18 fonksiyonun 18'i açılıyor (boot). Kalan tek
bilinmeyen MANTIK kayması: öteki fonksiyonların sunucudaki kodu `main` ile
aynı mı — dosya özetleri karşılaştırılmadı.

---

## 7 · PARA YAZAN AKIŞIN KURALLARI (dokunmadan önce oku)

Bunlar `tests/tek-tahsilat.test.mjs` ile kilitli. Gevşetmek isteyeceksen önce
testin yorumunu oku; her birinin bir sebebi var.

1. **Tutarı sunucu hesaplar.** İstemci rakam göndermez. Gövdeden almak, ele
   geçmiş bir jetonla kasaya istenen rakamı yazdırmaktı.
2. **Yöntem seçilmeden düğme kapalı.** Varsayılan yöntem koymak, nakit alınan
   işi karta yazmanın en kolay yoluydu.
3. **Düğme yöntemle birlikte adlanır** — "Kartla tahsil et", "Tahsil et"
   değil. Hangi yoldan para alındığı kaydın kendisi kadar önemli ve dokunmadan
   ÖNCE görünmeli.
4. **İki başarısızlık AYNI DEĞİL:**
   - `send_failed` → "Kasaya bir şey yazılmadı."
   - `collect_failed` → "Adisyon kasada açık kaldı; tekrar deneyebilirsiniz."
   İkisine aynı cümleyi yazmak, ikincisinde yalan söylemekti — kullanıcı
   parayı ikinci kez almaya kalkardı.
5. **Para çevrimdışı kuyruğa GİRMEZ.** `write` değil `call`. Kuyruk saatler
   sonra boşalır: kullanıcı "olmadı" görüp nakit alır, akşam kasada ikinci bir
   kart tahsilatı belirir.
6. **Para kaydı önce, `is_paid` sonra.** Bayrak kaydın türevi. Ters sırada
   bayrak basılıp kayıt düşerse Kasa, tahsil edilmiş görünen ama parası
   olmayan bir randevu gösterir. Bayrak hatası isteği düşürmez (loglanır).
7. **İki kapı, tek tahsilat:** idempotens anahtarı + randevunun var olan
   ödeme sorgusu. Anahtar aynı dokunuşu yakalar; sorgu, ekranı kapatıp
   yeniden açan kullanıcıyı yakalar.
8. **Sıfır tutarda "tekrar dene" denmez** — aynı sonuç çıkar. Söylenmesi
   gereken, eksiğin ne olduğu.
9. **Tahsilat gönderimden SONRA.** `visit.collect` sunucuda
   `status = 'completed'` istiyor; randevuyu kapatan şey gönderimin içindeki
   `visit.finish`.
10. **Kuyruğa giren gönderim "olmuş" sayılmaz.** İş telefonun kuyruğunda,
    sunucuda değil.

---

## 8 · HATALAR VE DERSLER (tekrar etmemek için)

### 🔴 Göç 109'un gerekçesi YANLIŞTI — ve kullanıcı onu zaten uygulamıştı

Kullanıcıya "altı denetim olayı sessizce düşüyor" dedim. **Düşmüyorlardı:**
091 ve 099 kısıtı zaten genişletmişti. `grep` çıktısı `head` ile kesilmiş,
yalnız 082 ve 090 görülmüştü. 109 etkisiz bir göç oldu ve üstüne
`pair_locked`'ı düşürdü (zararsız: o değer koda hiç yazılmıyor, yalnız
istemciye dönen bir hata kodu). 110 geri koyuyor.

**Ders:** bir kısıtı/listeyi "eksik" ilan etmeden önce onu değiştiren
**bütün** göçleri bul. Çıktının kesilmediğini doğrula.

Dosyanın SQL gövdesi **olduğu gibi duruyor** — üretimde koşan o. Yalnız
başlığı düzeltildi; tarihi değiştirmek veritabanıyla depo arasındaki tek
doğru kaydı bozardı.

### `supabase-js` `insert()` FIRLATMAZ

`{ error }` döndürür. Kontrol edilmeyen insert sessizce düşer. Denetim kaydı
böyle kaybolur ve kaybolan şey bir para kaydının izi olur.

### `DO $$ … $$;` tek bir ifadedir

İçindeki herhangi bir hata **her şeyi** geri sarar. Tohum betiklerinde
bölerek yazın.

### Dev-only çökme · `transform: undefined`

`AuthPasswordRule`, bir şifre kuralı true→false olunca kayıt ekranını
çöküyordu. RN Fabric kaldırılan stil anahtarını `null` yapıyor ve
`_validateTransforms` (yalnız `__DEV__`) fırlatıyor. Çözüm: **her zaman bir
dizi geçir** (`[{ translateY: 0 }]`). `VoidBlock`'ta aynı desen düzeltildi.

Bu, üretim paketi dersinin **tersi**: Expo Go'da çöküyor, mağaza
derlemesinde çökmüyor. İkisi de var; ikisi de test edilmeli.

### `myStaffId()` değiştirilmemeli (var olan test yakaladı)

Async `myStaffId()`'yi solo personel kimliğini de döndürecek şekilde
değiştirmiştim. `mobil-push-baglanti` testi yakaladı: o fonksiyon `syncPush`'u
besliyor; kimlik dönerse solo sahibin cihazı **hem müdür hem personel**
bildirim kanalına kayıt olur → mükerrer bildirim. Geri alındı; yalnız
`useMyStaffId()` kancası değişti. Ayrışma iki fonksiyonun da yorumunda yazılı.

### `maskPhone` yanlış hane gösteriyordu

Yalnız `^90` soyuyordu; masaüstü `0532…` biçimini yazıyor (bunu
`phoneVariants`'ın kendi yorumu söylüyor). `0532 111 03 01` →
`0053 ••• 10 30`. `phoneDigits` kullanılarak düzeltildi. Eski test yalnız
`+90…` biçimini kapsıyordu.

### Demo tohumu · iki tuzak

1. `reservations_source_check` (göç 015) `source`'u
   `manual|booking|leadflow` ile sınırlıyor. Ben yalnız `init_database.sql`'e
   bakıp "kısıt yok" demiştim. İşaret `custom_fields @> '{"demo_tek": true}'`
   olarak taşındı.
2. Müşteri işareti `notes`'tan çıkarıldı — `CustomerCard` onu gösteriyor.

### Sıralama/"şimdi" hataları (kullanıcının fotoğraflarından çıktı)

- İptal edilmiş 11:15, 09:30'un üstünde çiziliyordu: `buildStaffDayState`
  iptalleri saate bakmadan "geçmiş" kovasına atıyor (Müdür 24 için doğru,
  solo tek liste için yanlış).
- Hâl kartı geçmiş günde "ŞU AN BOŞ · 9 sa 16 dk" diyordu.
- Alt başlık geçmiş günde "1 iş bitti, 7 kaldı" diyordu.

Hepsi `soloDayList` + `isToday` kapısıyla düzeltildi. **`buildStaffDayState`
elle tutulmadı** — müdür onu kullanıyor.

### Gün ekranının sıcaklığı eksikti

Uygulamanın **tek** gradyanı bir jeton: `glow` (298 pt, v4'ün `--glow`'uyla
birebir). Yedi ekran kullanıyor (müdür Bugün + Takvim, personel Bugün +
Takvim, kumanda, kayıt sonu); `app/tek/index.tsx`'e koymayı atlamışım. Yan
sekme sıcak, Gün düz siyahtı.

Jetonu paylaşmak işin özü: üç ekran artık **tanım gereği** ayrışamıyor.
Gradyan güvenli alanın **üstünden** başlıyor, yoksa başlığın altında bir
şerit gibi görünür.

### Testler taşındı, GEVŞETİLMEDİ

`StaffAppointmentRow` → yeni sözleşme · `WRITE_ACTIONS` düz metin yerine
ayrıştırılmış küme + okuma uçlarının dışlanması · `done()` sayımı 7 → 9 ·
`router.push` yasağının kapsamı daraltıldı (tek istisna adresine kilitli) ·
099'a sabitlenmiş kısıt testi → **tüm zinciri tarayan** test, 109 adlı
istisna ve bir uç-durum kapsama kuralıyla.

---

## 9 · BİLİNÇLİ AYRIŞMALAR (kullanıcıya söylendi, kapatılmadı)

Bunlar hata değil, **karar**. Yeniden "bulup" düzeltmeye kalkma; kullanıcı
biliyor.

| Ayrışma | Sebep |
|---|---|
| Kart "tamamlandı" diyor, v4 "tahsil edildi" | `Appt`'ta ödeme alanı yok → **G4 bunu kapatacak** |
| Takvim sahipsiz randevuyu çizmiyor, Gün çiziyor | `columnize` `staff_id` boş satırı süzüyor; düzeltmesi müdür takvimini de etkiler. Fark alt başlıkta **söyleniyor**, sessiz değil |
| `VoidBlock` yatay dolgu 18, v4'te 26 | Paylaşılan bileşen; 8 pt için çatallanmaz |
| `DayHeader` 42 pt, v4'te 44 | aynı sebep |
| "Yeni hizmet ekle" dönüşte hizmeti seçmiyor | Hizmetler ekranının geri bildirmesi gerekiyor |
| Masaüstü `cashBuild.adisyonLines` adetle çarpmıyor, telefon çarpıyor | **Kullanıcı kararı:** ekranda görünen (fiyat × adet) tahsil edilir. Masaüstünün kendi borcu |

### 🟡 Kullanıcının kararını bekleyen tek madde

`hourRange` **kapalı günü** (`null`) **bilinmeyen günle** (`undefined`) aynı
sayıyor. Sonuç: kapalı pazarda Takvim normal 09:00–17:00 ızgarasını çiziyor,
Gün ekranı ise "Bugün kapalısınız." diyor. **Müdür takvimini de etkiliyor.**
Kullanıcıya sunuldu, cevap gelmedi. Sorulmadan dokunma.

---

## 10 · DEĞİŞMEZ KISITLAR (kullanıcının kararları)

- 🔴 **VPS root SSH şifre sertleştirmesi: kullanıcı YAPMAMA kararı verdi
  (2026-10-08). Yeniden gündeme getirme, görev listesine ekleme.**
- **ssh/deploy komutlarını kullanıcı çalıştırır.** Sen komutu verirsin.
- **Mobil doğrulama = fiziksel telefonda Expo Go. Simülatör YASAK.** Xcode
  yalnız açık yayın emriyle.
- **Yayın öncesi `--no-dev` üretim paketi testi ZORUNLU** (bir kez mağaza
  derlemesi açılmaz hâle geldi).
- **Claude Design'a `Luera Mobil - Durumlar.html` ve
  `Luera Mobil - Hareket Sözleşmesi.html` VERİLMEZ** (2026-10-08).
- **Şifre sıfırlama ÖLÜ** (SMTP yok) ve uygulama "gönderildi" diyor. Yeni test
  hesabının şifresi mutlaka kaydedilir.
- Proje `~/Projects`'te durmalı — Masaüstü iCloud'da ve Expo açılmıyor.

---

## 11 · GERİ ALMA

Doğrulanmış dönüş noktası: **`tek-oncesi` etiketi (`b4bc585`)**, `origin`'de.

```bash
cd /Users/furkanulger/Projects/luera-timeflow && git checkout tek-oncesi
```

`108`'i geri almak: `organizations.solo` sütununu düşürmek yeterli ama
**gerekmez** — `DEFAULT false` ve kimse `true` yazmadıysa kabuk hiç açılmaz.
Mod bayrağını kapatmak tek satır:

```sql
update public.organizations set solo = false where id = '<org-id>';
```

Demo satırları: `supabase/DEMO_tek_kisilik_geri_al.sql`. Tohumun hedefi
`8418f10d-8182-4224-b334-c9acc775acee` ("Fu Ni" org'u) ve satırlar **hâlâ
canlıda**.

---

## 12 · AÇIK UÇLAR (bu daldan bağımsız, uzun süreli)

- `info@lueratech.com` doğrulaması (site formları buna bağlı)
- Sentry kurulumu
- SMTP (şifre sıfırlamayı diriltir)
- Demo satırları "Fu Ni" org'unda duruyor
- Core entegrasyon borcu (3 eksik) — 10. müşteriden önce
- WhatsApp hattı **QR ile eşleştirilmeli** — hiçbir hat bağlı değil, yani
  hatırlatma WhatsApp'ları gitmiyor. (Süzgeç düzeltmesi 2026-10-11'de
  deploy edildi; kalan iş eşleştirme.)

---

## 13 · ÇALIŞTIRMA

```bash
cd /Users/furkanulger/Projects/luera-timeflow && npm test
```

```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx tsc --noEmit
```

Metro (Expo Go, fiziksel telefon):

```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx expo start --go
```

Yalnız bu dalın testleri:

```bash
cd /Users/furkanulger/Projects/luera-timeflow && node --test tests/tek-*.test.mjs tests/mobile-tek-gun.test.mjs
```

---

## 14 · OKUMA SIRASI (yeni oturum için)

1. Bu belge
2. `docs/design-reference/Luera Mobil - Tek Kisilik v4.html` ← **tasarım
   doğruluğunun tek kaynağı**
3. `docs/brief-tek-kisilik-isletme.md` — modun niçin var olduğu
4. `docs/tek-kisilik-uygulama-plani.md` — fazlar ve neyin bilerek dışarıda
   bırakıldığı
5. `docs/tek-kisilik-revizyon-v3.md` — tasarım turlarının evrimi
6. `mobile/AGENTS.md` — **kod yazmadan önce zorunlu**
7. `mobile/src/lib/soloDay.ts` — kararların gerekçeleri yorumlarda
8. `tests/tek-tahsilat.test.mjs` — para akışının kuralları, sebepleriyle
9. `supabase/111_kasa_duzeltme_izi.sql` başlığı + `tests/tek-kasa-izi.test.mjs`
   — düzeltme / geri alma izinin kuralları

---

## 15 · 2026-10-11 AKŞAM TURU — RİSK VE KIRIK KAPANDI

Bir denetim üç kırmızı madde buldu; kullanıcı "ilk olarak bunu düzeltelim"
dedi. Üçü de kapandı.

### Dallar

| Dal | Ne | Durum |
|---|---|---|
| `main` | `tek-kisilik` ile AYNI (ileri sarıldı) | GitHub'da |
| `tek-kisilik` | çalışma dalı | GitHub'da |
| `tek-kasa` | C2/C3 arayüz taslağı — tek `wip(tek)` commit'i, `tek-kisilik`in üstünde, **bağlanmadı** | GitHub'da |

**Neden `main`'e birleşti** (kullanıcı kararı): canlıdaki `staff-api` ve
108–110 yalnız bu daldaydı; biri `main`'den `staff-api` deploy etse tahsilat
ve tek kişilik oturum canlıdan silinirdi. Masaüstü etkilenmedi (dal `src/`a
dokunmuyor, Coolify elle tetikleniyor). ⚠️ Bundan sonra `main`'den alınan bir
mağaza derlemesi tek kişilik modu ve kayıttaki "Yalnız ben / Ekibim var"
sorusunu İÇERİR.

**`tek-kasa`da bilerek açık bırakılan:** `tests/mobile-mudur-kasa.test.mjs`
ve `mobile-mudur-kasa-canli.test.mjs` (1 test) eski davranışı bekliyor —
yerel iptal katmanı ve salt okunur fiş. C2/C3 bağlanırken YENİ davranışa
taşınacaklar, gevşetilmeyecekler. Veri katmanı (`voided_payments` okuması,
`correct_payment` / `revert_payment` çağrıları) ve `mudur/cash.tsx`
bağlantısı da o turun işi. Tip denetimi orada temiz.

### 111 — dört sorun, dördü kapandı

1. **Düzeltme taksit bağını düşürüyordu** (elle sütun listesi
   `installment_id`yi unutmuştu) → yeni satır artık eskisinin TAM KOPYASI
   (`to_jsonb` → `jsonb_populate_record`), üzerine yazılan alanlar sabit küme.
2. **061 damgalı satırı sayıyordu** (tetikleyiciler SECURITY DEFINER, RLS'i
   görmüyor) → üç fonksiyon 111'de yeniden kuruldu: 061'in birebir kopyası +
   `-- 111` işaretli 7 süzgeç + damgalı satırın tavana girmemesi için erken
   dönüş. Test işaretleri söküp 061 ile karşılaştırıyor.
3. **Geri alınan adisyon tekrar tahsil edilemiyordu** → `visit.collect` ve
   `whatsapp-booking · my_balance` damgalı satırı süzüyor.
4. **Okuyucular damgayı bilmiyordu** → kullanıcı kararı "veritabanında
   gizle": `authenticated` için dört KISITLAYICI politika. Masaüstü, telefon
   ve eski uygulama sürümleri koda dokunmadan doğru topluyor. İz yalnız
   `voided_payments(org, from, to)`tan okunuyor.

**Bilinen sınır:** açık bir masaüstü sekmesi damga olayını canlı almıyor
(gizlenen satırın değişikliği realtime abonelerine gitmiyor); yenileyince
doğru. Düzeltme yalnız tek kişilik modda yapılıyor, o modun masaüstü yok.

### Dersler

- **Kopyalayan fonksiyonda sütunları elle yazma.** Tablo büyüdükçe liste
  geride kalır ve sessizce sütun düşürür. `to_jsonb(eski) || {değişenler}`.
- **SECURITY DEFINER olan her şey RLS'i atlar** — tetikleyiciler dahil. Bir
  satırı RLS ile gizlemek, DEFINER fonksiyonların ve service_role okuyucuların
  onu görmeye devam ettiği anlamına gelir. `tests/tek-kasa-izi.test.mjs` edge
  function okumalarını tarıyor; yeni bir okuma süzgeçsiz eklenirse düşer.
- **Kısıtlayıcı SELECT politikası + aynı satırı gizleyen UPDATE = ret.**
  Postgres güncellenen satırın YENİ hâlini de SELECT politikasına sokuyor
  ("new row violates row-level security policy"). Damgayı yalnız DEFINER
  fonksiyon basabilir; bu bir hata değil, tasarımın kendisi.
- **Davranış testi önce DÜŞMELİ.** Her süzgeç tek tek söküldüğünde
  regresyon testi doğru hatayla düştü; düşmeseydi test bir şey kanıtlamıyor
  olurdu.

### Yerel Postgres (gelecek göçler için)

Makinede Docker ve psql yok, ama npm önbelleğinde **PGlite 0.3.15** var
(gerçek Postgres 17, WASM). İnternetsiz kurulur:

```bash
mkdir -p /tmp/pglite-pkg && cd /tmp/pglite-pkg && npm init -y >/dev/null && npm install --offline @electric-sql/pglite@0.3.15
```

Roller (`SET ROLE authenticated`), RLS ve DEFINER fonksiyonlar çalışıyor.
111 böyle sınandı: Supabase'in ilgili kısmının taslağı (auth.users +
`handle_new_user`, `auth.uid()`, `auth_user_org_ids`, tablolar, politikalar,
fonksiyonlara açık varsayılan EXECUTE) + 061'in GERÇEK fonksiyonları + 111 +
regresyon testi. Taslak üretim değil: son söz her zaman §6'daki kuru koşu.
