# DEVİR · ÜÇÜNCÜ KABUK (tek kişilik işletme)

**Tarih:** 2026-10-12 · **Dal:** `tek-kisilik` (114 ve 115 canlıda; §24 commit'leri henüz gönderilmedi)
**Testler:** 2894 geçti / 0 kırık / 7 atlandı · `tsc` temiz · yeni lint hatası yok

> **2026-10-12 · KARARLAR (§24):** randevu kartında "Müşteriyi ara"; Ekip
> ekle sahibin adını soruyor; ekipten tek kişiliğe DÖNÜŞ kapısı. Göç **115
> CANLIDA** (kuru koşu + göç + test, §6). `hourRange` kararı: dokunma.

> **2026-10-12 · TEST SIRASINDA (§23):** Gün başlığı gelmeyeni ve iptali
> "bitti" saymıyor (personel "Bugün"ünde de aynı hata kapandı); kumandanın
> ölü "Müşteriyi ara"sı sönük; seçicide "Tek kişilik". Test günü tohumu §22.

> **2026-10-12 · PERSONELİ SUNUCU YAZAR (§21):** göç **114 CANLIDA** (kuru
> koşu + göç + test, §6; doldurulacak eski satır çıkmadı: 0/0). Tek kişilikte
> personelsiz yeni randevuya sunucu sahibin personelini yazıyor; eski
> personelsiz randevular tek seferde dolduruluyor. Yanında: kayda bağlı
> olmayan randevunun müşteri dosyası artık "silinmiş olabilir" demiyor.

> **2026-10-12 · MESAJLA HATIRLAT (§20):** v4'ün son "duvarı" — randevu
> kartında, yalnız tek kişilikte, WhatsApp'ı hazır metinle açan satır.
> Paket satışı kullanıcı kararıyla OLDUĞU GİBİ kaldı. Yalnız istemci.

> **2026-10-12 · PERSONEL İZLERİ (§19):** karar 3'ün ("arayüzde kavram
> görünmez") kalan izleri temizlendi ve iki gizli kusur kapandı: kabuk artık
> ADRESTEN değil YERDEN okunuyor (üstüne sayfa itilince sekme kendini ekip
> ekranı sanıyordu), ve tek kişilikte müdür kabuğuna giden sabit yollar
> kalktı (Takvim'in boş saati ve kartın "Randevu ver"i Gün'e düşürüyordu).
> Yalnız istemci; göç ve deploy yok.
>
> **2026-10-12 · C2/C3 (§18):** Kasa'da Düzelt / Geri al bağlandı — yalnız
> tek kişilikte. v4'ün 23 ekranının HEPSİ kodda; telefonda denenmeyenler §0.
> Yalnız istemci (111 canlıdaydı); göç ve deploy yok.
>
> **2026-10-12 · G4 (§17):** Gün'ün dördüncü hâli — ADİSYON AÇIK kartı ve
> listede "tahsil edildi / adisyon açık". Yalnız istemci.

> **2026-10-11 gece turu (§16):** denetimin bulduğu on bir eksik kapandı
> (G2, G3, hafta şeridi, Gün'ün ikonu, B2, K3, C1, R2, P1, S1, S3) ve
> kullanıcı kararıyla **P2 (ekibe geçiş)** de yapıldı. İki yeni göç: **112**
> (bekleme damgası) ve **113** (`start_team`). **İkisi de CANLIDA, `staff-api`
> deploy edildi ve doğrulandı** (§6). `main` ileri sarıldı ve gönderildi
> (kullanıcı kararı): canlı sunucu kodu yine `main`'de.
>
> **2026-10-11 akşam turu (§15):** 111 canlıda; `staff-api` ve
> `whatsapp-booking` deploy edildi ve doğrulandı.

Bu belge tek başına yeterli olmak için yazıldı. Yeni oturum bunu okuyunca
projeyi, kararları ve sıradaki işi bilmeli; önceki konuşmayı aramaya
ihtiyaç duymamalı.

---

## 0 · OTURUMA BAŞLARKEN İLK ÜÇ ŞEY

1. **Kullanıcının duran emrini oku** (§1). Her şeyin üstünde o var.
2. **Deploy borcu yok** (§6): 112 + 113 + 114 + 115 canlıda. Telefonda
   deneme (Expo Go) test günü tohumuyla başladı (§22); kullanıcı bulguları
   topluyor.
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

`useInSoloShell()` kabuğu **yerden** okuyor (§19): sekme, kabuğun bağlamından
(`ShellScope`, `app/tek/_layout.tsx`); kök yığına itilmiş sayfa (müşteri
kartı, randevu detayı, kumandanın üstündeki müşteri dosyası) altındaki en
yakın kabuktan (`shellBeneath`). ⚠️ Eski hâli `useSegments()[0] === 'tek'`
idi ve YANLIŞTI: adres genel, üstüne sayfa itilince alttaki sekme kendini
ekip ekranı sanıyordu. Kumanda geri etiketi için hâlâ `from`/`back`
parametresini kullanıyor — etiket NEREDEN gelindiğini söylüyor, modu değil.

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
| G2 | Sürüyor | ✅ · §16: saniyede bir, sunucu saatiyle; saat ekleri |
| G3 | Beklemede · krem | ✅ · §16: bekleme SUNUCUDA (112), etiket yalnız "BEKLEMEDE" |
| G4 | Adisyon açık · "₺4.500 · Tahsil et" | ✅ · §17 (telefonda denenmedi) |
| K1 | Kumanda · bekleniyor | ✅ (var olan kumanda) |
| K2 | Kumanda · işlemde | ✅ (var olan kumanda) |
| K3 | Adisyon · tahsilat | ✅ `CollectBar` · sunucu canlı, telefon testi bekliyor · §16: Kasa şeridinden de açılıyor |
| K4 | Tahsilat · sunucu reddetti | ✅ `CollectBar` · sunucu canlı, telefon testi bekliyor |
| P1 | İşletme | ✅ · §16: "Ekip ekle · Tek kişilik çalışıyorsunuz" satırı |
| P2 | Ekip ekle kapısı | ✅ · §16: göç 113 + ekran — **deploy bekliyor** |
| C1 | Kasa · bir düzeltmeden sonra | ✅ (düzeltme satırı hariç) · §16: kişi adı yok, şerit tahsilatı açıyor |
| C2 | Hareket satırı → Düzelt / Geri al | ✅ · §18 (telefonda denenmedi) |
| C3 | Tahsilatı düzelt | ✅ · §18 (telefonda denenmedi) |
| R1 | Yeni randevu 1/2 | ✅ |
| R2 | Yeni randevu 2/2 | ✅ · §16: "kim" satırı yok, "boş yer yok" cümlesi |
| T1 | Takvim · tek sütun | ✅ |
| B1 | Gerçekten boş | ✅ |
| B2 | Kapalı gün | ✅ · §16: "Yarın 09:00’da açıksınız." |
| B3 | Yükleniyor (iskelet) | ✅ |
| B4 | Okunamadı | ✅ |
| S1 | Mod sorusu | ✅ · §16: v4 düzeni (marka, soru, iki eşit 66 pt düğme) |
| S2 | İlk gün | ✅ |
| S3 | İlk randevu · yeni hesap | ✅ · §16: eklenen hizmet dönüşte seçili |

**Kalan ekran yok** — 23'ün 23'ü kodda. Telefonda denenmemiş olanlar §16–§18'de.

---

## 5 · G4 (YAPILDI — §17; aşağısı planın kendisi, iz için)

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
   - (a) `fetchDayWithStamps` (`managerSource.ts:313`) `${RES_COLS}, updated_at,
     wait_ends_at, wait_minutes` seçiyor (bekleme §16'da girdi); oraya
     `is_paid` ekle → tek satır. `managerMap.toApptRaw` bekleme alanlarını
     nasıl "sorulduysa koy" diye taşıyorsa `is_paid` de öyle. ⚠️ `RES_COLS`
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
   Süren işin beklemesi varsa kart zaten BEKLEMEDE (`soloWaitPanel`, §16) —
   o da "süren iş" sayılır, adisyon kartı onun önüne geçmez.
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

### ✅ YAPILDI (2026-10-12) — 115 (sahibin adı + tek kişiliğe dönüş · §24)

Kullanıcı dört adımı sırayla çalıştırdı:
- Ön kontrol `start_team(text,text)` (dönüş yoktu).
- Kuru koşu: `DROP FUNCTION`, `CREATE FUNCTION` ×2 + `tek dönüş (115)
  regression: ok` + `ROLLBACK` — altı söz üretim şemasında, sahibin
  oturumuyla (fikstür org'ları gerçek `handle_new_user`la açılıp geri sarıldı).
- Göç `COMMIT`.
- Göç sonrası test `regression: ok` + `ROLLBACK` (yapı denetimi canlıda:
  yalnız üç parametreli `start_team`, ikisi de INVOKER, anon kapalı).

Komutlar kalıp olarak aşağıda duruyor.

**Telefonda yeni Ekip ekle / dönüş ekranlarını denemeden ÖNCE.** Yeni
istemci `start_team`e üçüncü parametreyi gönderiyor; göç yoksa çağrı
bulunamaz ve ekran "bağlantı" hatası verir. Mağazadaki sürüm etkilenmiyor:
iki parametreli eski çağrı yeni imzada aynen çalışıyor (varsayılan değer).
Yalnız göç; edge function deploy'u YOK.

**0 · Ön kontrol** — beklenen `start_team(text,text)` (dönüş yok):

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 "docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -tAc \"select string_agg(oid::regprocedure::text, ' ' order by 1) from pg_proc where proname in ('start_team','end_team')\""
```

**1 · Kuru koşu** — göç + davranış testi TEK işlemde, sonunda hepsi geri
sarılır. Beklenen: `tek dönüş (115) regression: ok` ve `ROLLBACK`:

```bash
cd ~/Projects/luera-timeflow && { echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/115_tek_sahip_adi_ve_donus.sql; sed -e '/^BEGIN;$/d' supabase/tests/tek_donus_regression.sql; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

**2 · Göç** (yalnız kuru koşu geçtiyse). Beklenen: `DROP FUNCTION`,
`CREATE FUNCTION` ×2, `COMMIT`:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/115_tek_sahip_adi_ve_donus.sql
```

**3 · Test** (göçten sonra, iz bırakmaz). Beklenen: `tek dönüş (115)
regression: ok` ve `ROLLBACK`:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/tests/tek_donus_regression.sql
```

### ✅ YAPILDI (2026-10-12) — 114 (personeli sunucu yazar · §21)

Kullanıcı dört adımı sırayla çalıştırdı:
- Ön kontrol `0 0 O`.
- Kuru koşu: `114: 0 randevuya personel yazıldı; 0 randevu … boş bırakıldı`
  + `tek personel (114) regression: ok` + `ROLLBACK` (altı söz üretim
  şemasında, sahibin oturumuyla yazma dahil; fikstür org'ları gerçek
  `handle_new_user`la açılıp geri sarıldı).
- Göç `COMMIT` — aynı NOTICE. Tek kişilik işletmelerde personelsiz eski
  randevu YOKMUŞ; doldurma boş geçti, iş bundan sonraki yeni randevularda.
- Göç sonrası test `regression: ok` + `ROLLBACK` (yapı denetimi canlıda:
  yalnız BEFORE INSERT, SECURITY DEFINER, EXECUTE kapalı, bildirim
  tetikleyicisi açık). `does not exist, skipping` ilk kurulumun sesi.

Yalnız göç; edge function ve istemci deploy'u YOK. Mağazadaki sürüm
etkilenmiyor (personeli zaten gönderiyor; tetikleyici yalnız boşsa yazar).
Komutlar kalıp olarak duruyor.

**0 · Ön kontrol** — beklenen `0 0 O` (fonksiyon yok, tetikleyici yok,
bildirim tetikleyicisi açık):

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 "docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -tAc \"select (select count(*) from pg_proc where proname='assign_solo_staff') || ' ' || (select count(*) from pg_trigger where tgname='trg_reservations_assign_solo_staff') || ' ' || (select tgenabled::text from pg_trigger where tgname='trg_push_on_reservation')\""
```

**1 · Kuru koşu** — göç (doldurma dahil) + davranış testi TEK işlemde,
sonunda hepsi geri sarılır. Beklenen: `NOTICE: 114: N randevuya personel
yazıldı; M randevu … boş bırakıldı` (gerçek veride kaç satırın dolacağını
söyler), `tek personel (114) regression: ok`, `ROLLBACK`:

```bash
cd ~/Projects/luera-timeflow && { echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/114_tek_personel_sunucu.sql; sed -e '/^BEGIN;$/d' supabase/tests/tek_personel_regression.sql; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

**2 · Göç** (yalnız kuru koşu geçtiyse). Beklenen: aynı NOTICE ve `COMMIT`:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/114_tek_personel_sunucu.sql
```

**3 · Test** (göçten sonra, iz bırakmaz). Beklenen: `tek personel (114)
regression: ok` ve `ROLLBACK`:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/tests/tek_personel_regression.sql
```

Doldurma işlem içinde bildirim tetikleyicisini kapatıp açıyor; o süre
boyunca `reservations`a eş zamanlı yazmalar BEKLER (kaybolmaz). Kısa sürer,
yine de yoğun saat dışında çalıştırmak daha rahat.

### ✅ YAPILDI (2026-10-11 gece) — 112 + 113 + `staff-api`

Kullanıcı beş adımı sırayla çalıştırdı: ön kontrol `0 0`; kuru koşu
`tek v4 (112 + 113) regression: ok` + `ROLLBACK` (üretim şemasında, iz yok;
fikstür org'ları `handle_new_user`'ın gerçek tetikleyicisiyle açılıp geri
sarıldı); 112 `COMMIT`; 113 `COMMIT`; `staff-api` deploy. Göçteki tek NOTICE
(`constraint "reservations_wait_shape" … does not exist, skipping`) ilk
kurulumda `DROP … IF EXISTS`in beklenen sesi.

**Doğrulama (Claude, yan etkisiz istekler):**
- 18/18 edge function `OPTIONS` → 200; olmayan bir ad → 500 (ölçüm ayırt ediyor).
- `staff-api` `visit.wait` jetonsuz → `invalid_token` (kapı yerinde).
- PostgREST, anon anahtarıyla: `start_team` → `42501 permission denied` —
  şema önbelleğinde VAR ve anon'a KAPALI; olmayan RPC → `PGRST202`.
- `reservations?select=wait_ends_at,wait_minutes` → 200 (RLS, anon'a satır
  vermiyor); olmayan sütun → `42703`. 112'nin sütunları yerinde.
- Deploy logundaki `remind` "wall clock duration warning / early
  termination" satırları yeniden başlatmadan ÖNCEKİ kaba ait ve iş bitmiş
  (`errors=0` satırı uyarıdan önce): bu deploy'la ilgisiz.

**Deploy `tek-kisilik`ten yapıldı** (çalışma ağacı `aeb158d`), `main` o an
`a4540ae`'deydi. Kullanıcı kararıyla `main` hemen ileri sarıldı ve iki dal da
gönderildi: §15'teki kural ("canlı sunucu kodu = `main`") yeniden sağlandı.
Ders: deploy betiği ÇALIŞMA AĞACINI kopyalıyor — dal adına bakmıyor.

Aşağıdaki komutlar kalıp olarak duruyor.

**Sıra zorunluydu:** göçler önce. Yeni `staff-api`nin `RES_COLS`u
`wait_ends_at`i soruyor; 112'siz `agenda` düşer ve kumanda açılmaz.
Mağazadaki sürüm ikisinden de etkilenmiyor (yeni sütunları sormuyor, yeni
fonksiyonu çağırmıyor).

**0 · Ön kontrol** — ikisi de `0`:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 "docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -tAc \"select (select count(*) from information_schema.columns where table_schema='public' and table_name='reservations' and column_name in ('wait_ends_at','wait_minutes')) || ' ' || (select count(*) from pg_proc where proname='start_team')\""
```

**1 · Kuru koşu** — iki göç + davranış testi TEK işlemde, sonunda hepsi
geri sarılır. Son satırlar `tek v4 (112 + 113) regression: ok` ve
`ROLLBACK`:

```bash
cd ~/Projects/luera-timeflow && { echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/112_bekleme_damgasi.sql; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' supabase/113_ekibe_gecis.sql; sed -e '/^BEGIN;$/d' supabase/tests/tek_v4_regression.sql; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

**2 · Göçler** (yalnız kuru koşu geçtiyse), sırayla:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/112_bekleme_damgasi.sql
```

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/113_ekibe_gecis.sql
```

**3 · Deploy** (`_shared` değişmedi, adla deploy güvenli):

```bash
cd ~/Projects/luera-timeflow && ./scripts/deploy-functions.sh staff-api
```

**4 · Doğrulama** (Claude çalıştırabilir): `staff-api` `OPTIONS` → 200;
PostgREST'te anon anahtarıyla `start_team` → `42501` (var ve anon'a kapalı),
olmayan bir RPC → `PGRST202`.

### ✅ YAPILDI (2026-10-11 akşam) — 111 + iki fonksiyon

(Aşağıdaki komutlar 111 içindi; kalıp olarak duruyor.)

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
| Takvim sahipsiz randevuyu çizmiyor, Gün çiziyor | `columnize` `staff_id` boş satırı süzüyor; düzeltmesi müdür takvimini de etkiler. Fark alt başlıkta **söyleniyor**, sessiz değil. **§21 (114) tek kişilikte kaynağı kapatıyor:** yeni randevu personelsiz yazılamıyor, eskiler dolduruluyor; yalnız çakışan/kilitli eski satırlar boş kalır |
| `VoidBlock` yatay dolgu 18, v4'te 26 | Paylaşılan bileşen; 8 pt için çatallanmaz |
| `DayHeader` 42 pt, v4'te 44 | aynı sebep |
| G3 etiketi yalnız "BEKLEMEDE", v4 "BEKLEMEDE · KREM" | **Kullanıcı kararı (§16):** kumanda neyin beklendiğini bilmiyor, yalnız süre soruyor; ad uydurulmaz. Kumanda değişmedi |
| R2'nin düğme metni canlıdaki gibi | v4 notu "canlıyla karşılaştırılmalı" diyor; değiştirilmedi |
| ~~Ekipte sahibin personel satırı işletmenin adını taşıyor~~ | **§24 · 115 ile kapandı** (kullanıcı kararı: Ekip ekle'de "Siz · Adınız" sorulur) |
| ~~Ekipten tek kişiliğe dönüş yolu yok~~ | **§24 · 115 ile kapandı** (kullanıcı kararı: dönüş kapısı; yalnız ekipte sahipten başka aktif kimse kalmayınca) |
| Personel sayfasında "Personel eklemek bilgisayardan" cümlesi | v4 P2 notu "müdür modunda da kalkmalı" diyor; ekipte telefondan personel ekleme formu yok, cümle o gelince kalkar |
| Masaüstü `cashBuild.adisyonLines` adetle çarpmıyor, telefon çarpıyor | **Kullanıcı kararı:** ekranda görünen (fiyat × adet) tahsil edilir. Masaüstünün kendi borcu |

### ✅ Kullanıcı kararı: `hourRange` — DOKUNMA (2026-10-12)

`hourRange` **kapalı günü** (`null`) **bilinmeyen günle** (`undefined`) aynı
sayıyor. Sonuç: kapalı pazarda Takvim normal 09:00–17:00 ızgarasını çiziyor,
Gün ekranı ise "Bugün kapalısınız." diyor. Kullanıcıya üç seçenekle soruldu,
cevap **"Dokunma"**. Bu bir ayrışma olarak kalıyor; yeniden önerme.

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
10. `supabase/112_bekleme_damgasi.sql`, `supabase/113_ekibe_gecis.sql`,
    `supabase/tests/tek_v4_regression.sql` ve `tests/tek-v4-ikinci-tur.test.mjs`
    — §16'nın kuralları

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

---

## 16 · 2026-10-11 GECE TURU — DENETİMİN ON BİR EKSİĞİ + P2

Kullanıcı: "G2, G3, Hafta şeridi, Gün sekmesinin ikonu, B2, K3, C1, R2, P1,
S1, S3 bunları yap." Kararlar (soru aracıyla):
- **P2 de yapılsın** — P1'in satırı ve S1'in "Sonradan İşletme’den
  değiştirebilirsiniz" cümlesi ancak onunla doğru oluyor.
- **G3 etiketi yalnız "BEKLEMEDE"** — v4'teki "· KREM" uydurulmaz, kumanda
  değişmez.

### Ne yapıldı

| Kod | Değişiklik | Nerede |
|---|---|---|
| G2 | Sayaç süren iş varken saniyede bir, **sunucu saatiyle** (`clockOffset`); "16:00’da biter" / "14:00’e kadar" — sabit ekler yarı yarıya yanlıştı (`clockDative` yeni). Müdür ekranı da aynı dosyayı kullanıyor, o da düzeldi | `tek/index.tsx`, `staffDay.ts`, `text.ts`, `managerCalendarDay.ts` |
| G3 | Bekleme artık SUNUCUDA (göç 112, `visit.wait`). Kumandanın halkası yine yerel ve internetsiz döner; yazma arkadan gider (kuyruksuz), sunucunun bitişi benimsenir. Aynı telefondaki niyet `waitIntent` ile Gün'e taşınır. Gün kartı BEKLEMEDE (kehribar, nabızsız, kalan dakika). Kumanda yeniden açılınca halka geri kurulur; bitişte sunucu temizler | `waitIntent.ts`, `soloDay.ts · soloWaitPanel`, `kumanda.tsx`, `visitWrite.ts`, `staff.ts`, `staff-api` |
| Şerit | Gün personelin şeridini kullanıyor; kapalı günler soluk ve noktasız (tek kişilik Takvim'de de). Gün okunamadıysa hiçbiri soluk değil | `StaffWeekStrip`, `CalendarParts.WeekStrip · offDays`, `managerCalendarDay.offDays` |
| İkon | Gün sekmesi güneş (`sun.max`) — personel Bugün'ün sembolü | `tek/_layout.tsx` |
| B2 | Kapalı günün ipucu açılışı söylüyor: "Yarın 09:00’da açıksınız." ("Yarın" yalnız bugün seçiliyken; yolda bilinmeyen gün varsa cümle yok) | `createLive.nextOpenAfter`, `soloDay.openingSentence` |
| K3 · C1 | Kasa'nın turuncu şeridi tek kişilikte tahsilatı açıyor: tek adisyon doğrudan kumandada, çoksa liste (`PendingTicketsSheet`). Dünden kalan adisyon kendi gününde açılıyor (`useVisit(id, date)`). Hareketlerde kişi adı yok (yalnız ekranda; `cash.ts` değişmedi → `tek-kasa` ile çakışma yok). Geri oku "Kasa" diyor | `cash.tsx`, `managerFlow.pendingTickets/pendingTicketLine`, `flowBuild.ts`, `kumanda.tsx` |
| R2 | "… yapacak · Değiştir" satırı ve ray okumasındaki kişi adı yok; seçili blok "Müşteri · Hizmet"; gün sığmıyorsa düğme "Bu gün 60 dk’lık boş yer yok" | `ApptParts.tsx`, `CreateFlow.tsx`, `createFlow.actionLabel/slotSpeech` |
| S3 | "Yeni hizmet ekle" dönüşünde TEK yeni hizmet seçili geliyor (on dakika içinde; risk kuralı kapatıyorsa seçilmiyor); ilk hizmet ipucu satırın altında | `CreateFlow.tsx` |
| P1 | İşletme'de Personel'in yerinde "Ekip ekle · Tek kişilik çalışıyorsunuz" | `mudur/profile.tsx` |
| P2 | Göç 113 `start_team(ad, meslek)`: personel satırı + `solo=false` TEK işlemde, INVOKER (RLS + abonelik kapısı aynen), rol 058'in kuralıyla, renk paletin kullanılmayan ilki. Ekran v4 metinleriyle; başarıda müdür kabuğuna geçiş. "Zaten ekip" cevabı kaybolmuş bir başarı olabilir — aynı adla çalışan varsa başarı sayılıyor | `113_ekibe_gecis.sql`, `profil/ekip-ekle.tsx`, `auth.ts · startTeam`, `authStub.ts`, `session.ts`, `authCopy.ts` |
| S1 | Kayıttaki soru v4 düzeninde: marka (44), "Bu işletmede işi kim yapıyor?", iki EŞİT 66 pt ikincil düğme (`AuthActionButton kind="tall"`) | `signup/ready.tsx`, `ui.tsx`, `tokens.ts` |

### Bulunan ve düzeltilen eski hata (108'den)

**Karşılamadaki "Solo" kapısının niyeti hazır ekranına HİÇ ulaşmıyordu.**
Hesap adımı taslağı sıfırdan yazıyor (niyet siliniyor), kurulumun sonu da
taslağı siliyordu — hazır ekranı okuduğunda niyet yoktu ve Solo'dan gelene
soru yeniden soruluyordu. "Mod bir daha sorulmuyor" dalı ölüydü; testi yalnız
kaynak metnine bakıyordu. Şimdi: niyet hesap ve işletme adımlarında korunuyor,
taslak modun YAZILDIĞI anda siliniyor, "Yeni işletme oluştur" niyeti
sıfırlıyor (yarım bir Solo kaydının niyeti oradan girene geçmesin). Solo
dalının listesinden "Personelinizi ekleyin" çıktı.

### Küçük düzeltmeler

- Tek kişilik kabuk da geri kaydırmıyor (`app/_layout.tsx` · `gestureEnabled:
  false`) — ekibe geçişte kabuk değişiyor.
- `pendingOf`'un yorum bloğu yerinden kaymıştı; geri kondu.

### Kanıt

- **Yerel gerçek Postgres (PGlite):** iki göç iki kez uygulanıyor
  (idempotent), regresyon testi geçiyor, kuru koşu iz bırakmıyor, abonelik
  kapalıyken `start_team` `42501` dönüp bayrağı düşürmüyor (istemci bunu
  "abonelik" diye okuyor). **On koruma tek tek söküldü, test her birinde
  doğru hatayla düştü** (zaten-ekip kapısı, bayrak, rol sırası, palet,
  kırpma, uzunluk, REVOKE, DEFINER, 112'nin şekli ve üst sınırı).
- **Node:** yeni `tests/tek-v4-ikinci-tur.test.mjs` (33 test); yedi saf
  korumada mutasyon denetimi — yedisinde de düştü. Eski davranışı kodlayan
  14 test YENİ davranışa taşındı, gevşetilmedi.
- Canlıda: 112 + 113 + `staff-api` (§6, doğrulandı). Telefonda HENÜZ
  görülmedi (Expo Go).
- ⚠️ P2'yi gerçek hesapta DENEME: ekipten tek kişiliğe dönüş yolu yok; bir
  deneme hesabı (Solo kapısından yeni kayıt) kullanılmalı — aynı kayıt
  Solo niyeti düzeltmesini de sınar.

### Açık konular (kullanıcıya soruldu)

1. **Ekipte sahibin satırının adı** — salonun adıyla görünecek (108 kayıtta
   kişinin adını sormuyor, v4 P2 de sormuyor). Seçenek: P2'ye "Sizin adınız"
   alanı ya da Personel sayfasında düzenleme.
2. **S1 cümlesi yarı doğru** — "Ekibim var" diyenin tek kişiliğe dönüş yolu
   yok. Ya cümle daraltılır ya İşletme'ye bir dönüş kapısı açılır.
3. **Personel sayfasının "bilgisayardan" cümlesi** — ekipte telefondan
   personel ekleme formu gelince kalkar (v4 P2 notu).

### Dersler

- **Kaynak metnine bakan test, ölü bir dalı yakalamaz.** Solo niyetinin testi
  "ekran taslağı okuyor mu" diye bakıyordu; taslağın oraya ulaşıp ulaşmadığına
  bakan yoktu. Yeni test veri yolunun üç halkasını da kilitliyor.
- **`pg_temp` yardımcıları `SET ROLE authenticated` altında çağrılamıyor.**
  Kullanıcı adına yapılan ret denetimleri `DO` bloğunda `EXCEPTION WHEN
  OTHERS` ile yazılıyor (SQLSTATE + metin birlikte denetleniyor).
- **İmza değişince testin argüman sırası da değişir:** `soloEmptyCopy`'ye
  fazladan bir argüman, açılış cümlesini "NaN:NaN" yaptı — test yakaladı.

---

## 17 · 2026-10-12 · G4 — ADİSYON AÇIK

Kullanıcı: "g4 ile başla". Yalnız istemci: `is_paid` sütunu zaten vardı,
göç ve deploy YOK. Telefonda (Expo Go) henüz denenmedi.

### Ne yapıldı

| Parça | Değişiklik | Nerede |
|---|---|---|
| Veri | Gün okuması `is_paid`i soruyor; eşleme "sorulduysa koy" (bekleme gibi). Paylaşılan `RES_COLS` DEĞİŞMEDİ | `managerSource.fetchDayWithStamps`, `managerMap.toApptRaw`, `calendar.Appt` |
| Liste | Biten işin damgası "tahsil edildi" (yeşil) ya da "adisyon açık" (kehribar, kehribar kenar şeridi). Ödeme hâli SORULMADIYSA "tamamlandı" — bilinmeyeni borç diye yazmamak için. Açık adisyonun adı da soluyor (`done` bayrağı; ton değil) | `soloDay.soloApptStamp`, `SoloDayParts` |
| Kart | ADİSYON AÇIK · ₺tutar · "Tuğçe Erden · Kalıcı Makyaj · 16:02’de bitti"; kehribar, nabızsız, **sol kenarda kehribar şerit** (`.pnl.bar`, yeni `bar` bayrağı) | `soloDay.soloTicketPanel`, `StaffDayParts.StaffHeroPanelCard`, `tokens` (`panelBarWidth 4`, `panelBarPadLeft 17`) |
| Hap | Sıra tasarımın: süren iş > açık adisyon ("Tahsil et", go) > sıradaki. Hap kumandayı tahsilat adımında açıyor (K3); parayı kendisi almıyor | `soloDay.soloPanelAction` |
| Seçim | Kartın adisyonu ve TUTARI Kasa'nın kaynağından (`useManagerDay` · `pendingTickets` · `balance`) — Kasa'nın şeridiyle aynı rakam. Bugünün en son biteni; dünden kalan kart olmuyor; tutarsız/sıfır kart olmuyor (`zero_amount`); Gün okuması satırı ödendi diyorsa kart iner (iki okumadan hangisi önce öğrenirse) | `soloDay.soloOpenTicket`, `tek/index.tsx` |

### Kanıt

- 10 yeni test (`tests/mobile-tek-gun.test.mjs` · G4), eski davranışı
  kodlayan 3 test YENİ davranışa taşındı. 2828 geçti / 0 kırık.
- Yedi koruma tek tek söküldü, yedisinde de test düştü (dünden kalan,
  ödenmiş satır, sıfır tutar, en son biten, hap sırası, sorulmamış ödeme,
  süren işin kartı). Biri ilk denemede DÜŞMEDİ — kural iki ayrı süzgeçle
  daha korunuyordu; kuralı tek başına sınayan durum eklendi.

### Telefonda bakılacaklar

- Bir işi bitirip "Sonra tahsil et" deyin → Gün'de kart ADİSYON AÇIK,
  tutar Kasa'nın turuncu şeridindekiyle aynı, sol kenarda kehribar şerit;
  listede o satır kehribar "adisyon açık".
- "Tahsil et" → kumanda tahsilat adımında açılmalı; tahsilattan sonra kart
  ŞU AN BOŞ / sıradakine dönmeli, satır yeşil "tahsil edildi".

---

## 18 · 2026-10-12 · C2/C3 — KASA'DA DÜZELT / GERİ AL

Kullanıcı: "push et, main'i ileri al ve devam et" (G4 gönderildi, `67bee52`).
Arayüz `tek-kasa` dalındaki taslaktan (`95eaf73`) alındı — commit'lenmeden
uygulanıp bağlandı, tek commit olarak girdi. Yalnız istemci: 111'in üç
fonksiyonu canlıdaydı.

### Ne yapıldı

| Parça | Değişiklik | Nerede |
|---|---|---|
| Okuma | Canlı satırlarda `created_at` + `corrected_from`; seçili dönemin damgalı satırları `voided_payments`tan (RLS onları gizliyor — bilerek) | `managerSource.fetchCashPayments / fetchVoidedPayments` |
| Satırlar | Düzeltilmiş: TEK satır, yeni tutar, "X verdi"nin yuvasında "düzeltildi 15:40 · önce ₺1.200" (v4 C1; eski kehribar ton ve "DÜZELTİLDİ" çipi kalktı). Geri alınmış: paranın alındığı saatte yerinde, üstü çizili, "geri alındı 15:42", toplama girmiyor. Düzeltmenin eski satırı ayrıca çizilmiyor | `cashBuild.toMovements`, `CashParts.MovementCard`, `cash.correctionTrace / traceLine` |
| Fiş | Tek kişilikte, canlı satırda iki satır: "Düzelt · Tutar ya da yöntem", kırmızı "Geri al · Adisyon yeniden açılır" (serbest satışta "Tutar gün toplamından düşer"). Ekipte "masaüstündeki Kasa'dan" (karar 4). Geri alınmış satırda "15:42’de geri alındı; tutar gün toplamına girmiyor." | `CashSheets.MovementSheet` (`note` prop'u), `cash.voidSub / voidedNote` |
| Düzelt | Tutar + yöntem; yalnız yöntem değişse de geçerli; ret gelirse sayfa açık, sebep düğmenin üstünde | `managerWrite.correctPayment` → `correct_payment` |
| Geri al | Sistem uyarısı: "₺1.200 kart tahsilatı geri alınsın mı? Adisyon yeniden açılır." Sonra Kasa ve günün verisi tazeleniyor → adisyon Gün'de G4'e, Kasa'da turuncu şeride dönüyor | `managerWrite.revertPayment` → `revert_payment`, `mudur/cash.tsx` |
| Vana | Kasa yazmaları da `MANAGER_WRITES_ENABLED`a uyuyor ("Değişiklik şimdilik alınmıyor") | `managerWrite` |
| Söz | Sayaç "6 işlem · 1 geri alındı" (satırın iziyle aynı sözcük); sesli okuma "Düzeltildi 15:40, önce 1.200 lira." | `cash.counterLine / movementSpeech` |

### Tuzak (testle kilitli)

`MovementSheet`in `close(after)`u `after` verilince `onClose`u ÇAĞIRMIYOR.
"Geri al" fişi `close(onVoid)` ile kapatıyor; ekran açık hâli kendisi
düşürmezse görünmez bir katman Kasa'yı kilitlerdi. `askRevert` önce
`setOpenId(null)` yapıyor.

### Kanıt

- Eski davranışı kodlayan testler (yerel iptal katmanı, "İptal et", özel
  diyalog, salt okunur ekran) YENİ davranışa taşındı; `mobile-mudur-kasa`
  yeniden yükleniyor (68 test). 2835 geçti / 0 kırık.
- On koruma tek tek söküldü, onunda da test düştü.

### Telefonda bakılacaklar (tek kişilik hesap)

- Kasa'da bir harekete dokun → "Düzelt" → tutarı değiştir → kaydet: satır
  yeni tutarla, altında "düzeltildi SS:DD · önce ₺…"; toplam düşmeli/artmalı.
- "Geri al" → sistem uyarısı → onay: satır üstü çizili "geri alındı", toplam
  düşmeli; Gün'de G4 kartı, Kasa'da turuncu şerit geri gelmeli.
- Ekip hesabında aynı fiş: eylem YOK, "masaüstündeki Kasa'dan" cümlesi.

### `tek-kasa` dalı

İçeriği bu commit'te. Dal GitHub'da duruyor; silinip silinmeyeceği
kullanıcının kararı.

---

## 19 · 2026-10-12 · PERSONEL İZLERİ (karar 3) + KABUK YERDEN

Kullanıcı: "push et, main'i ileri al, devam et" (C2/C3 gönderildi, `9d3e4ed`).
Sıradaki iş denetimin "küçükler"inden ilkiydi: personel izleri. Kazınca iz
iki yerde değil on yerde çıktı ve altında iki gizli kusur vardı.

### Gizli kusur 1 — kabuk ADRESTEN okunuyordu

`useInSoloShell()` = `useSegments()[0] === 'tek'`. `useSegments` GENEL adres
(expo-router `useRouteInfo` → `useSyncExternalStore`, odaktaki rota). Kumanda,
randevu detayı ya da İşletme'nin bir sayfası itilince adres `(staff-flow)/…`
oluyor ve alttaki sekmeler — sökülmeyen, yığın değişince yeniden çizilen
sekmeler — o çizimde `solo = false` görüyordu. Görünür sonuç: geri
kaydırırken, modal kartın arkasında ve geçiş boyunca Takvim personel
başlığıyla, İşletme "Personel" satırıyla, Kasa "X verdi"yle çiziliyordu.
Üstüne itilen sayfalar da kabuğu hiç bilemiyordu — o yüzden karttaki izler
temizlenemiyordu.

Düzeltme (`src/lib/shellRoot.ts`, `src/lib/shellBeneath.ts`):
- Sekme kabuğun bağlamını okur: `app/tek/_layout.tsx` sekmeleri
  `<ShellScope value="tek">` ile sarıyor.
- İtilen sayfa kök yığında ALTINDAKİ en yakın kabuğa bakar
  (`useNavigationState` + `useRoute().key` → `shellBeneath`).
- Kapanan sayfa bir kare bile ekip düzenine dönmüyor: yerel yığın çıkan
  rotayı React'ten hemen söküyor (`state.routes` dışında kalıyor), animasyonu
  yerel taraf yürütüyor.

### Gizli kusur 2 — müdür kabuğuna sabit yollar

Tek kişilikte `/mudur/...` müdür kabuğunu kuruyor, kök yığını ona indiriyor
(`useShellIsRoot`), kapısı da `solo` görüp `/tek`e geri yolluyordu: kullanıcı
Gün'e düşüyor, kabuk baştan kuruluyordu.
- Takvim'de boş saate dokunmak (v4 T1 "randevu kurma o saatle açılır") →
  saat ön dolu randevu yerine **Gün** açılıyordu.
- Müşteri kartının "Randevu ver"i → müşteri ön dolu randevu yerine **Gün**.
- Randevu sekmesinin kapanışı, kart ve detayın "geri gidilemezse" yolu.
Hepsi `solo ? '/tek/…' : '/mudur/…'`. Test: bu dosyalarda koşulsuz `/mudur`
yolu kalmadı.

### İzler (v4 karar 3: "ile", "verdi", "kim yapacak" render edilmez)

Sahibin personel satırı işletmenin adını taşıyor; her iz "Derya Güzellik
ile" diye okunuyordu.

| Yer | Tek kişilikte | Nasıl |
|---|---|---|
| Müşteri kartı | yaklaşan / son geliş / ilk ziyaret / son işlemlerde "X ile" yok | ad VERİDE düşüyor: `customerCard.withoutStaff` |
| Tüm geçmiş | "X ile" yok | `customerCardLive.historyWithoutStaff` |
| Müşteriler listesi | satırda son işi yapan ve baş harf diski yok (v4 s-harman "Müşteriler") | `managerBook.bookWithoutStaff`, disk çizilmiyor |
| Kumandanın müşteri dosyası | "son bakan" pili yok | `musteri.tsx` |
| Randevu detayı | kimlikte personel pili yok ("Atanmamış" da değil), "Personeli değiştir" jetonu yok (tek jeton satırı kaplıyor), hizmet çakışması "11:00–12:30 ile çakışır", iptal/silme onayı adsız | `identityOf(…, solo)` → `crew`, `changeTiles(…, solo)`, `serviceChoices(…, solo)` |
| Takvim · menü | "Personeli değiştir" satırı yok, alt başlıkta "X ile" yok | `menuRows(…, solo)` |
| Takvim · sürükleme | "Parmağınızı kaldırmadan istediğiniz saate taşıyın." (kişiye yok), hedef etiketi yalnız saat, dolu sebebi adsız | `moveBanner / targetLabel / resolveTarget(solo)`, `MOVE_HINT_SOLO` |
| Takvim · saat seçici | boş satır "Müsait", ad ve baş harf yok | `MoveSheet solo` |
| "Taşındı" sayfası | saatlerin altında ad yok | `moveResultCopy(…, solo)` |
| R2 rayı | dolu kutu "**Dolu**" + "Deniz Şahin · Manikür & Pedikür" (v4 R2 birebir); kapalı kutu "Bu saatte çalışmıyorsunuz" / "Bu gün izinlisiniz"; sesli okuma "dolu, Dolu" demiyor | `slotRows({ solo })`, `slotSpeech` |
| Randevu onayı | kanıt kartında personel sütunu yok, sesli okuma "X yapacak" demiyor | `ConfirmScreen solo`, `confirmSpeech / stillBookedLine(null)` |
| Reddin cümlesi | "O saatte Derya Güzellik zaten…" yerine "O saat dolu — …" | yazmalara tek kişilikte ad gitmiyor; webhook adı yine taşıyor |
| Hesap silme | "Personelinizin telefon bağlantıları…" maddesi ve "1 personelin erişimi" satırı yok | `accountDeletionItems(…, solo)` (hesabın BÜTÜN işletmeleri tek kişilikse), `hesap-sil` |

Ekip davranışı değişmedi; her saf fonksiyonun bayrağı varsayılan `false`.

### Kanıt

- Yeni: `tests/tek-personel-izi.test.mjs` (21). "Özet şeridi yok" nöbeti
  (`mobile-mudur-denetim`) tek kişilik Gün'ü de kapsıyor (v4 `s-rn`).
- Üç eski test satırın yeni biçimine taşındı (gevşetilmedi): takvimin taşıma
  ve geri al yazması, hizmet sayfasının katalog çağrısı.
- 2856 geçti / 0 kırık / 7 atlandı · `tsc` temiz · yeni lint bulgusu yok
  (değişen her dosya HEAD sürümüyle karşılaştırıldı).
- 28 koruma tek tek söküldü; 28'inde de test düştü.

### Telefonda bakılacaklar (tek kişilik hesap)

- Takvim'de boş saate dokun → Randevu sekmesi o saatle açılmalı (Gün değil).
- Bir bloğa dokun → randevu kartı: kimlikte yalnız hizmet pili, tek
  "Saati değiştir" jetonu; arkadaki Takvim'de personel başlığı GÖRÜNMEMELİ.
- Bloğu basılı tut, sürükle: alt bantta "kişiye" yok, hedefte yalnız saat.
- Müşteri kartı: "X ile" yok; "Randevu ver" müşteri seçili Randevu'yu açmalı.
- İşletme → Müşteriler: satırlarda baş harf diski ve ad yok.
- Kumanda'dan geri kaydırırken alttaki Gün/Kasa ekip düzenine dönmemeli.

### Kalan küçükler (bu turda yapılmadı)

- İşletme seçici kartında "1 personel" (yalnız birden çok işletmesi olan
  hesap görür; kimlik akışı, tek kabuğun dışında).
- Masaüstüne yollayan cümleler (paket sat, WhatsApp "Mesajla hatırlat").
- `staff_id`'yi sunucu yazsın (göç ister).
- Bekleme bitince bildirim (ürün kararı).

---

## 20 · 2026-10-12 · MESAJLA HATIRLAT (v4 s-duvar `actionPill.ts:39`)

Kullanıcı: "Devam et". Sıradaki iş masaüstüne yollayan cümlelerdi. v4'ün iki
kalemi de çizilmemişti ve karar istiyordu; kullanıcıya soruldu:

| Soru | Karar |
|---|---|
| Paket satışında ödeme (v4: "Paket tek ödemeyle satılır") | **Şimdilik dokunma.** Satışta ödeme almak yeni bir göç (plan + ödeme tek işlemde, tutar sunucuda) isterdi; yalnız cümleyi kaldırmak borcu tahsil yolu olmayan bir çıkmaza bırakırdı. `paket-sat.tsx` olduğu gibi. |
| "Mesajla hatırlat" nerede | **Randevu kartında**, müşteri panelinin hemen altında. Akış'ta satırın ⋮'i de bu kartı açıyor; Gün kartı ve Takvim bloğu da. |
| Gönderim | Tur bitince ikisi birlikte. |

### Ne yapıldı

- `appointmentDetail.reminderAction` — kural: müşteri henüz gelmemiş
  (`waiting`), randevu geçmemiş, numara yazılabilir (`phone.waLink`). Metin
  Akış'ın cümlesi (`actionPill.waNudgeText`) — gün eklendi: "bugün 14:00",
  "yarın 14:00", "Cuma 16 Ekim 14:00"; başlamış ama müşterisi gelmemiş
  randevuda "14:00 randevunuz için sizi bekliyoruz, yolda mısınız?". Gün
  verilmezse eskisi gibi "bugün" (Akış değişmedi).
- `ApptParts25.ReminderRow` — `ChangeRows`un satırı; uçta ok değil DIŞARI ok
  (dokununca uygulamadan çıkılıyor). `accessibilityRole="link"`, sesli okuma
  gidecek metni söylüyor.
- `randevu/[id].tsx` — yalnız `solo`'da; `Linking.openURL(wa.me…)`, açılamazsa
  "WhatsApp açılamadı" uyarısı (sessiz kalmıyor).
- Selam için işletme adı (`settings.business_name`) saat satırının AYNI
  okumasından (`fetchHoursRow`) — ayrı istek yok.

Salonun hattı bağlı olmasa da çalışır: gönderen kişinin kendi WhatsApp'ı.
Otomatik hatırlatma kapsam dışı (v4).

### Kanıt

- Yeni: `tests/tek-mesajla-hatirlat.test.mjs` (7). Bir eski test okumanın
  yeni sütununa taşındı (`mobile-mudur-ayarlar-canli`; niyeti — kilit alanları
  okunuyor, yazma yalnız `working_hours` — aynen duruyor).
- 2863 geçti / 0 kırık / 7 atlandı · `tsc` temiz · yeni lint bulgusu yok.
- 13 koruma söküldü; 13'ünde de test düştü.

### Telefonda bakılacaklar (tek kişilik hesap)

- Yarınki bir randevuya dokun → kartta müşteri panelinin altında "Mesajla
  hatırlat · WhatsApp’ta hazır metin" → WhatsApp "…yarın 14:00 randevunuzu
  hatırlatmak istedik…" metniyle açılmalı.
- Numarası olmayan, gelmiş ya da bitmiş randevuda satır OLMAMALI.
- Ekip hesabında satır hiç yok.

### Kalan küçükler

- `staff_id`'yi sunucu yazsın (v4 karar 3) — göç ister, deploy kullanıcıda.
- Bekleme bitince bildirim — ürün kararı.
- Paket satışında ödeme — kullanıcı "şimdilik dokunma" dedi.
- Müşteri kartının "kayda bağlı değil" boş hâli "masaüstünde kayda
  bağlanınca" diyor; tek kişide masaüstü yok (v4 listelememiş).
- İşletme seçici kartında "1 personel" (§19).

---

## 21 · 2026-10-12 · PERSONELİ SUNUCU YAZAR (114) + KAYITSIZ MÜŞTERİ DOSYASI

**114 CANLIDA** (2026-10-12, §6) — kuru koşu ve göç sonrası test üretimde
geçti; doldurma 0/0.

Kullanıcı: "1 ve 2'ye başla" (kalanlar listesinin ilk iki maddesi).

### 1 · Göç 114 — v4 karar 3

"Sahip için bir personel satırı var; sunucu her randevuya o staff_id'yi
kendisi yazar, istemci göndermez."

**Kazının bulguları** (hafızadaki `randevu-null-personel` ile birlikte):
masaüstü, halka açık randevu ve telefon zaten gerçek bir personel yazıyor.
Personelsiz satırlar eski kayıtlardan, silinen personelden (`ON DELETE SET
NULL`) ve gelecekteki yollardan (içe aktarma, API) geliyor. Bugün tek
kişilikte böyle bir randevu Takvim'de hiçbir sütuna düşmüyor ve 060 onu
sahibin randevularıyla değil "atanmamış" havuzla karşılaştırıyor.

| Parça | Karar | Neden |
|---|---|---|
| Tetikleyici | `trg_reservations_assign_solo_staff`, **yalnız BEFORE INSERT**, `WHEN (NEW.staff_id IS NULL)` | UPDATE'te çalışsaydı eski personelsiz bir randevuyu "tamamlandı" yapmak, doldurulan personel yüzünden 060'ın çakışma hatasına düşerdi |
| Kural | tek kişilik org + **tek** aktif personel; iki aktifte ve hiç aktif yokken dokunmaz | `staff-api solo.session` ile aynı: sunucu tahmin etmez |
| Sıra | ad, `trg_reservations_conflict_guard`dan önce sıralanıyor | Postgres aynı olayın BEFORE tetikleyicilerini ada göre çalıştırır; çakışma kontrolü doldurulmuş personeli görmeli |
| Yetki | SECURITY DEFINER, `search_path` sabit, EXECUTE herkesten geri alındı | kimin yazdığından bağımsız (halka açık randevu, staff-api, masaüstü); RLS WITH CHECK yine son satırda bakıyor |
| Doldurma | tek seferlik, satır satır; 23P01 (060 çakışma) ve 23514 (062 kilit) ATLANIR ve sayılır; başka hata göçü düşürür | doldurma bir düzeltme, kimsenin gününü bozmamalı |
| Bildirim | doldurma sırasında `trg_push_on_reservation` kapalı, sonra BULUNDUĞU hâle (`O`/`A`) geri; kapalıysa kapalı kalır | personel boştan doluya geçince "Yeni randevun var" gidiyor (107); her eski randevu için bildirim yağardı |

İstemci personeli GÖNDERMEYE DEVAM ediyor (bilerek): göç canlıya alınmadan
istemci göndermeyi bıraksaydı randevular personelsiz yazılırdı. Sonuç aynı
(tek personel); v4'ün "istemci göndermez"i göç canlıdayken istenirse
ayrıca kaldırılır.

**Kanıt:**
- PGlite (gerçek Postgres 17), 060'ın GERÇEK çakışma fonksiyonuyla; bildirim
  tetikleyicisi ve 062 kilidi yerel vekillerle: 7 senaryo (idempotent, kuru
  koşu iz bırakmıyor, doldurma kuralı, doldurmadan sonra test, tetikleyici
  kapalıysa/`A` ise/yoksa) geçti; 13 sökme kontrolünün 13'ü testi düşürdü.
  Ayrıca: yapı denetimi sökülünce de davranış testi (6. söz) UPDATE'te
  çalışan tetikleyiciyi `reservation_staff_conflict` ile yakalıyor.
  Düzenek oturumun scratchpad'inde (`pgtest/run114.mjs`, `stub114.sql`).
- `supabase/tests/tek_personel_regression.sql` — üretimde kuru koşu için
  (§6): altı söz, sahibin kendi oturumuyla yazma dahil.
- Node: `tests/tek-personel-sunucu.test.mjs` (10) göçün kritik satırlarını
  kilitliyor; 13 koruma söküldü, 13'ü yakalandı.

### 2 · Kayda bağlı olmayan randevunun müşteri dosyası

Listedeki madde müdür kartının cümlesiydi ("masaüstünde kayda bağlanınca
açılır") — ama o boş hâl tek kişilikte AÇILAMIYOR: randevu kartı müşteri
kartını yalnız kaydı ve geçmişi olan müşteride açıyor. Asıl yer KUMANDA:
"Müşteri kartı" düğmesi her randevuda duruyor ve kimliksiz açılan müşteri
dosyası "Müşteri bulunamadı · Kayıt silinmiş ya da başka bir deftere
taşınmış olabilir" diyordu — hiç olmamış bir kayıt için (tek kişilikte de
personelde de).

- `musteri.tsx`: kimlik yoksa ayrı boş hâl — ad + "Bu randevu bir müşteri
  kaydına bağlı değil. …"; kimlik var ama kayıt yoksa eski cümle (doğru).
- `customerCard.unlinkedHint(solo)` — tek kişilikte "Kayıt, randevuyu
  müşterinin numarasıyla kurduğunuzda açılır." (telefonda kayıt numarayla
  açılıyor: `createAppointment → resolveCustomer`); ekipte eski cümle.
  Müdür kartı da aynı kaynaktan.
- Bir eski test cümlenin yeni kaynağına taşındı (`mobile-mudur-musteri-canli`).

### Kanıt

2873 geçti / 0 kırık / 7 atlandı · `tsc` temiz · yeni lint bulgusu yok.

### Bulunan, dokunulmayan

Kumandanın "Müşteriyi ara" düğmesi numarası olmayan randevuda sessizce
hiçbir şey yapmıyor (`onCall` erken dönüyor) — ölü kontrol. Kumanda personel
tasarımının birebiri; ayrı bir iş.

---

## 22 · 2026-10-12 · TEST GÜNÜ — tohum + deneme planı

Kullanıcı: "test etmem için bir test günü planla, bir tohum ekleyelim —
yalnız hsnulgr@gmail.com hesabı". Eski `DEMO_tek_kisilik.sql`in saatleri
sabit olduğu için akşam her şey "gelmedi" görünüyordu (telefonda görüldü).

`supabase/DEMO_tek_test_gunu.sql` — günü ÇALIŞTIRILDIĞI ANA (T) göre
kuruyor; hedef sahibi `hsnulgr@gmail.com` olan tek solo org (değilse durur).
Yalnız tohum işaretli satırları (`demo_tek`, `demo_tek_test`) siliyor.
Randevuları personelsiz yazıyor: personeli 114 yazıyor (NOTICE "114
ÇALIŞIYOR"). Bildirim tetikleyicisi tohum boyunca kapalı. PGlite'ta iki ayrı
saatte, iki kez üst üste denendi.

Çalıştırma (kullanıcı):

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/DEMO_tek_test_gunu.sql
```

Deneme sırası (durumlar birbirine akıyor; sırayla gidilmeli):

1. Gün — ADİSYON AÇIK ₺1.550 (Cilt Bakımı 1.200 + Peeling 350) · listede
   "tahsil edildi" (yeşil), "adisyon açık" (amber), "gelmedi" (kırmızı).
2. Tahsil et → yöntem seçilmeden düğme kapalı → "Kartla tahsil et" → kart
   düşer, Cilt "tahsil edildi" olur, hâl kartı Manikür'e (G1 · Başlat) geçer.
3. Başlat → kaydırıp başlat → SÜRÜYOR (saniye sayacı) → bekleme (BEKLEMEDE)
   → Bitir → tahsilat. Uçak modunda dene: "bağlantı yok", kasaya yazılmaz.
4. Sıradaki Selin Uçar (KAYITSIZ): Başlat → kumanda → "Müşteri kartı" →
   "kayda bağlı değil · numarasıyla kurduğunuzda açılır". Randevu kartında
   "Mesajla hatırlat" ve müşteri oku YOK.
5. Kasa — Kaş ₺350 nakit → Düzelt (₺400, Kart) → "düzeltildi … · önce
   ₺350". Lazer ₺1.500 → Geri al → üstü çizili, "· 1 geri alındı"; Gün'de
   Lazer "adisyon açık" (süren iş yoksa ADİSYON AÇIK kartı da döner).
6. Takvim — tek sütun, personel başlığı yok. Boş saate dokun → Randevu o
   saatle (Gün'e düşmemeli). Bloğa dokun → kart: yalnız hizmet pili, tek
   "Saati değiştir". Basılı tut + sürükle → "…istediğiniz saate taşıyın.",
   hedefte yalnız saat → "taşındı" sayfasında ad yok → Geri al.
7. Yarın (13) — Elif Demir 10:00 → kart → "Mesajla hatırlat" → WhatsApp
   "…yarın 10:00 randevunuzu hatırlatmak istedik…" (göndermeden kapat).
8. Şeritte 3 gün sonrası → B1 boş gün; Pazar → B2 kapalı gün.
9. Randevu (+) → müşteri, hizmet → R2 rayında "kim" yok, dolu kutu "Dolu ·
   müşteri · hizmet" → kur → onay ekranında personel sütunu yok.
10. İşletme → Müşteriler: baş harf diski ve ad yok → kart: "X ile" yok.
11. Geri kaydırma: İşletme → Hizmetler'den yavaşça geri kaydırırken alttaki
    ekranda "Personel" / "Profil" görünmemeli.

⚠️ "Ekip ekle"yi BU hesapta deneme — 115 dönüş kapısını açtı ama kapı yalnız
ekipte sahipten başka aktif kimse kalmayınca görünüyor ve çalışanı pasife
almak bilgisayar işi. Gidiş-dönüşü denemek için önce 115 canlıya alınmalı.

Telefonda görülen ilk bulgu (tohumdan önce): Gün başlığı "3 iş bitti, 0
kaldı" derken hâl kartı "0 tamamlandı · 3 gelmedi" diyordu — gelmeyen
randevu "bitti" sayılıyor. **§23'te düzeltildi.**

---

## 23 · 2026-10-12 · TEST SIRASINDA — SAYIMLAR + İKİ KÜÇÜK

Kullanıcı test günüyle telefonda deniyor ve bulguları topluyor; bu tur
kararsız kalan küçükleri kapattı. Yalnız istemci; göç ve deploy yok.

| İş | Ne oldu | Dosyalar |
|---|---|---|
| Gün başlığı (bugün) | Sayılar personel durumunun "geçmiş" kovasından geliyordu → saati geçen her şey "bitti". Artık `soloDayCounts`, kartın damgasıyla (`soloApptStamp`) AYNI kural: bitti / gelmedi / kaldı; iptal hiçbirine girmiyor. Cümle personel "Bugün"ünün: "2 iş bitti, 1 gelmedi, 3 kaldı" (gelmedi yalnız >0). Yalnız iptal kalan gün "N iptal" | `soloDay.ts`, `tek/index.tsx` |
| Gün başlığı (başka gün) + liste başlığı | İptali sayıyordu; şeridin noktası (`countsOf`) saymıyor → "5 randevu" / şeritte 4. `soloDayTotal` | `soloDay.ts` |
| Personel "Bugün" (ekip) | AYNI hata sınıfı: iptal kartı `dim: 2` ve "bitti" filtresine takılıyordu. `staffDayCounts`; geçmiş/ileri gün de iptali saymıyor | `staffCard.ts`, `personel/index.tsx` |
| Kumanda "Müşteriyi ara" | Numara yokken sessizce `return` ediyordu (§21'de bulunmuştu). Artık SÖNÜK: 0.38, `disabled`, etiket "— numara yok" (personel ekranlarında "kayıt" kelimesi yasak, `mobile-durum-dili` yakaladı) | `kumanda.tsx` |
| İşletme seçici | Tek kişilik işletme "1 personel" değil "Tek kişilik"; ekran okuyucu da aynı kelime | `accountMap.ts`, `ui.tsx` |

### Kanıt

2879 geçti / 0 kırık / 7 atlandı · `tsc` temiz · lint sayısı değişmedi
(kumandanın 24 `react-hooks/refs` hatası öncesinde de 24). Taşınan testler
gevşetilmedi: `mobile-tek-gun` (ekran ifadesi), `mobile-personel-kart` 05c
(kaynak metni yerine davranış).

### Kararlar (aynı gün soruldu, §24'te uygulandı)

| Madde | Karar |
|---|---|
| Ekipte sahibin satırının adı | Ekip ekle'de sorulur → §24 |
| Ekipten tek kişiliğe dönüş | Dönüş kapısı → §24 (göç 115) |
| `hourRange` kapalı gün | **Dokunma** (§9) |
| Randevu kartında "Ara" | Ekle → §24 |

Hâlâ açık: Personel sayfasının "bilgisayardan" cümlesi (form gelince),
bekleme bitince bildirim, `tek-kasa` dalını silmek. Paket satışı ödemesi
"şimdilik dokunma".

---

## 24 · 2026-10-12 · KULLANICI KARARLARI — ARA, SAHİBİN ADI, DÖNÜŞ (göç 115)

| İş | Ne oldu | Dosyalar |
|---|---|---|
| Randevu kartında "Müşteriyi ara" | Yalnız tek kişilikte, "Mesajla hatırlat"ın ÜSTÜNDE, aynı listede (`ReminderRow` → `ContactRows`; `ChangeRows` çizgileri, dışarı ok). Numara TAM ("0532 111 22 33"), `tel:+90…`, her hâlde (gelmeyeni aramak da iş); aranamayan numarada satır yok. Açılamazsa Alert | `appointmentDetail.callAction`, `ApptParts25.ContactRows`, `AppointmentDetail.tsx`, `randevu/[id].tsx` |
| Ekip ekle · sahibin adı | Yeni "SİZ · Adınız" grubu çalışan formunun önünde; iki ad da dolmadan düğme kapalı. Sunucu adı yeni çalışan eklenmeden ÖNCE ve yalnız tek aktif satıra yazıyor | `ekip-ekle.tsx`, `authCopy.teamStart`, `auth.startTeam`, 115 |
| Tek kişiliğe dön | İşletme'de satır YALNIZ ekipte (`team.status`) ≤1 aktif personel varken: "Ekipte yalnız X var". Ekran Ekip ekle'nin dili; form yok. `end_team`: bayrak + ayrılanların İLERİ açık randevuları kalan kişiye; sahibinkiyle çakışan personelsiz (Gün'de görünür), başlamış işleme bağlı olan (062) olduğu gibi. Hepsi geçtiyse doğrudan Gün; değilse önce özet, düğme "Gün’e geç". "Zaten tek kişilik" başarı sayılıyor (cevabı kaybolan ilk istek) | `tek-kisilige-don.tsx`, `profile.tsx`, `authCopy.teamEnd*`, `auth.endTeam`, `_layout.tsx`, 115 |
| Personel sayfası | Dipnot kapının yerini söylüyor: "Ekipte yalnız siz kalınca İşletme’de Tek kişiliğe dön görünür." | `personel.tsx` |

### Göç 115 — `supabase/115_tek_sahip_adi_ve_donus.sql` (✅ canlıda, §6)

- `start_team(p_name, p_specialty, p_owner_name DEFAULT NULL)` — eski
  `(text,text)` DÜŞÜRÜLÜYOR (iki aday PostgREST'i şaşırtır). Mağazadaki eski
  istemcinin iki parametreli çağrısı aynen çalışır.
- `end_team(p_name DEFAULT NULL) RETURNS JSONB` — INVOKER, yalnız sahibin
  org'u (FOR UPDATE), `already_solo` / `team_not_empty`; hiç aktif yoksa
  108'in kuralıyla satır ("Ben" ya da salonun adı). Dönüş `{staff_id, moved,
  unassigned, kept}`.
- Bildirim: taşınan her satır 107'nin "Yeni randevun var"ını kalan kişinin
  PERSONEL cihazına tetikliyor; sahip müdür olarak abone, yani pratikte
  gidecek cihaz yok. Tetikleyiciyi kapatmak burada yapılamaz (ALTER TABLE
  sahip ister ve bütün salonların tablosunu kilitler).
- `tests/tek_v4_regression.sql` iki imzada da koşacak hâle getirildi.

### Kanıt

- PGlite (`run115.mjs`): göç iki kez + regresyon ok ve iz yok; kuru koşu iz
  bırakmıyor (eski imza geri, `end_team` yok); kilitli satır olduğu gibi +
  taşınan başına bir bildirim; **11 söküm**, on birinde de test düştü.
  113'ün regresyonu 115'ten önce ve sonra geçiyor.
- 2894 geçti / 0 kırık / 7 atlandı · `tsc` temiz · yeni lint bulgusu yok.
  İki eski test yeni çağrı şekline taşındı (`tek-v4-ikinci-tur`), gevşetilmedi.

### Telefonda bakılacaklar (115 canlıda)

1. Randevu kartı (tek kişilik): "Müşteriyi ara" + numara; dokununca arama
   sorusu. Selin Uçar gibi numarasız randevuda satır yok.
2. İşletme → Ekip ekle: "SİZ · Adınız" alanı; boşken düğme kapalı. (Bu
   hesapta GÖNDERME — §22 uyarısı.)
3. Gidiş-dönüş yalnız deneme hesabında: Ekip ekle → çalışanı bilgisayardan
   pasife al → İşletme'de "Tek kişiliğe dön" → Gün.

---

## 25 · 2026-10-12 · BULGU — SAATİ GEÇEN RANDEVU BAŞLATILAMIYORDU

Kullanıcının telefonundan (22:30 → 22:31, iki ekran görüntüsü): 22:30'da hâl
kartı "ŞU AN BOŞ · 0 dk · 22:30’a kadar · sıradaki Gizem Ünal · Başlat";
22:31'de randevu "geçmiş" kovasına düştü, hap kayboldu, kart "0 dk · Gün
sonuna kadar" dedi. Listenin kartı randevu kartını açıyor, başlatmıyor —
geciken müşteriyi başlatmanın HİÇBİR yolu kalmamıştı.

| Kök | Düzeltme | Yer |
|---|---|---|
| Sıradaki = `upcomingAppointments[0]` (saati gelmemiş ilk randevu) | `soloNextToStart`: başlamamış, bitmemiş, iptal/tamamlanmamış ve GELMEDİ SAYILMAMIŞ ilk randevu (saati gelmemiş, payı dolmamış gecikme ya da kapıdaki müşteri), saat sırasıyla. Hap ve kart bunu kullanıyor | `soloDay.ts`, `tek/index.tsx` |
| Kart geç kalmayı bilmiyordu | `soloNextPanel`: KAPIDA (kehribar, "N dk" bekliyor) · GECİKTİ (kırmızı, "N dk", "X dk sonra gelmedi sayılır" — Akış'ın A1 dili). Panel tonu `rd` eklendi (`panelInk.red`) | `soloDay.ts`, `staffDay.ts`, `StaffDayParts.tsx` |
| Gün sonu 19:00 sabiti (`buildStaffDayState` free dalı) | `soloIdlePanel`: sıradaki yoksa kapanışa kalan süre ("23:55’e kadar · sıradaki randevu yok"); kapanış geçtiyse ya da saat bilinmiyorsa BUGÜN · N randevu · "3 tamamlandı · 1 gelmedi" | `soloDay.ts` |
| Kapıdaki müşterinin liste kartı damgasızdı (ne bitmiş ne gelmemiş) | Liste damgası "kapıda" (kehribar) | `soloApptStamp` |

Gelmedi sayılan müşteri sonradan gelirse: randevu kartı → "Geldi" → kapıya
alınır → kart KAPIDA, hap Başlat. Sunucu (`visit.start`) saat kısıtı
koymuyor. `graceLeft`in varsayılanı ESKİ 120 dk — tek kişilik payı (30)
açıkça veriyor; Akış da öyle.

Kanıt: 2899 geçti / 0 kırık · `tsc` temiz · lint sayısı değişmedi. Telefonun
iki anı testte birebir (22:30 → G1, 22:31 → GECİKTİ 1 dk · 29 dk sonra
gelmedi sayılır, 23:01 → yok). İki eski test taşındı (panel ifadesi, G3
tonu), gevşetilmedi.

### İkinci bulgu (23:00) + kullanıcı isteği

- KAPIDA → **BEKLİYOR** (kullanıcı "beklemede" istedi; "BEKLEMEDE" aynı
  yuvada G3'ün kelimesi — süren işin beklemesi, yine kehribar. Kumandanın
  kadranı bu hâlde zaten "BEKLİYOR"). Satır artık ne zaman geldiğini söylüyor
  ("… · 22:05’te geldi"); liste damgası "bekliyor".
- Bekleyen müşteri varken liste "BUGÜN · KAPANDI" diyordu (personel durumu
  günü son randevunun BİTİŞİNE göre kapatıyor) → başlatılabilir varken
  "Bugün · N randevu".
- Süren iş varken liste yalnız saati gelmemişleri gösteriyordu; bekleyen ve
  geciken müşteri kayboluyordu → `soloStartable`.
- Kullanıcının asıl isteği — kartı picker gibi kaydırıp sıradakiler arasında
  gezmek ve istediğini başlatmak — Claude Design turuna verildi:
  `docs/tek-gun-secici-claude-design-prompt.md` (G5).

---

## 26 · 2026-10-13 · G5 — GÜN KARTININ SEÇİCİSİ (Claude Design, birebir)

Kullanıcı isteği: hâl kartı aynı kalsın, iOS picker'ı gibi aşağı-yukarı
kaydırılıp sıradaki randevular arasında geçilsin, Başlat seçileni açsın
(sırasını veren, erken gelen, aynı anda bekleyen müşteri). Brif
`docs/tek-gun-secici-claude-design-prompt.md`; tasarım
`docs/design-reference/Luera Mobil - Tek Kisilik G5 Secici.html` — kullanıcı
"tam istediğim gibi", "eksiksiz birebir uygula" dedi. Yalnız istemci.

| Parça | Ne | Dosya |
|---|---|---|
| Geometri | Tasarımın `lay`/`rb`/`settle`'ı birebir: 72 pt = 1 randevu; komşu ±11 · ,94 · ,50 (yazı 0), ikinci ±20 · ,88 · ,25; ara noktada 28·sin πd çıkıntı; lastik bant (en çok ½ randevu, yığının tamamı ×43 pt); oturma = yuvarla(konum + hız × ,12), yay 330/20/,5; ipucu 0 → ,25 → 0 (260 ms) bir kez | `soloPicker.ts` |
| Yığın | süren işler (G2/G3, BİRDEN ÇOK olabilir) → açık adisyon (G4) → başlatılabilirler. BEKLİYOR · GECİKTİ · **BAŞLAMAYA** (yeni: ilk olmayan, saati gelmemiş — "44 dk · Yasemin Kurt · Ağda · 16:30’da", nötr, noktasız); "ŞU AN BOŞ … sıradaki" yalnız yığının ilk kartıyken. SÜRÜYOR'da sıradakiler hapsız ve kapalı; süren işlerin HEPSİ beklemedeyken Başlat açık (paralel iş) | `soloDay.soloPickItems` |
| Bileşen | `PanResponder` (karttan başlayan dikey jest seçicinin, bırakılmaz; sürüklerken sayfa kaymaz); tek `Animated.Value` → kart başına `interpolate`, native sürücü, yalnız translateY · scale · opacity; öne geçme `zIndex` durumla; her ,5 geçişte `selection` tıkı (ekranın kendi değişikliğinde sessiz); kenarı görünen karta dokunmak seçer, seçiliye dokunmak açar; erişilebilirlik "ayarlanabilir" (yukarı/aşağı, çift dokunuş açar); reduceMotion: 72 pt eşikte anlık, tık var | `SoloPicker.tsx` |
| Kart | `contentOpacity` (komşuda yazı solar), `heroValue2/heroUnit2` ("1 sa 14 dk"te dakika da büyük) | `StaffDayParts.tsx`, `staffDay.ts` |
| Seçim | RANDEVUYA bağlı (Karar 2): yeni randevu gelse de aynı kalır; yığından düşünce, Gün'den çıkınca, arka plandan dönünce ilk kart | `tek/index.tsx`, `soloPickIndex` |
| Liste | Kart eskisi gibi randevu kartını açar (Karar 4 · c); seçilinin saati turuncu | `SoloDayParts.tsx` |

Tek başlatılabilirde (G5·5) bugünkü kartın birebiri — yığın, pay, sürükleme
yok. Etiket "BEKLEMEDE · KREM" DEĞİL, yalnız "BEKLEMEDE" (§16 kararı).
`soloPanelAction` ve `soloNextToStart` kaldırıldı (kuralları `soloPickItems`te).

### Kanıt
2916 geçti / 0 kırık · `tsc` temiz · yeni dosyalarda lint temiz (`SoloPicker`
tek satır gerekçeli `react-hooks/refs` kapatması — PanResponder geri
çağrıları render'da çalışmıyor). Sabitler tasarım dosyasının sabitlerine
testle bağlı (`tek-g5-secici.test.mjs`); tasarımın üç sahnesi (15:46, 15:16,
14:20) birebir.

### Açık
- **Kumandanın "komşu iş" şeridi** — v4 K1 notu: "yalnız paralel bir iş varken
  çıkar". G5 paralel işi mümkün kıldı ama şeridi ÇİZMEDİ ("burada çizilmedi").
  Tasarımı `personel-06` (dört kademe: sakin · 15 dk altı amber · 5 dk altı
  kırmızı saniyeli · sıfır). Bugün beklemedeki işe Gün'ün yığınından
  dönülüyor. Kullanıcıya sorulacak.
- Telefonda denenmedi.

---

## 27 · 2026-10-13 · G5 · A — KARTIN EYLEM HAPI ("Yönet") + "Geldi" yalnız kendi gününde

Kullanıcı isteği: kartta bir düğmeyle Ara, mesaj, gelmedi, iptal gibi
eylemler. Üç yer seçeneği çizildi (A Başlat'ın solunda yuvarlak düğme ·
B alt satırın sonunda yazı · C sola kaydırınca); kullanıcı **A** dedi ve
doğrudan uygulandı (tasarım turu yok). Akış'ın onaylı hapı (Müdür 34 · v2)
yeniden kullanıldı — iki mod aynı dili konuşuyor.

| Kart | Gözler |
|---|---|
| ŞU AN BOŞ / BAŞLAMAYA | Ara · Yaz · Randevu kartı |
| GECİKTİ | Ara · Yaz · **Gelmedi** · Randevu kartı |
| BEKLİYOR | **Geldi'yi geri al** · Randevu kartı (kullanıcı: "tasarım A'daki gibi" — yanlış "Geldi"yi geri almanın tek kişilikte yolu yoktu) |
| SÜRÜYOR · ADİSYON AÇIK · süren iş varken sıradakiler | düğme yok |

- Ara/Yaz HEP çizilir; numara yoksa SÖNÜK, dokununca randevu kartı (Akış
  kuralı). İptal hapta YOK — hapta basılı tutmanın yetmesinin sebebi
  gözlerin geri alınabilir olması; iptal randevu kartında onaylı.
- **Yaz** kişinin KENDİ WhatsApp'ını hazır metinle açar (`waNudgeText`,
  gecikmişse "yolda mısınız?") — "Mesajla hatırlat" ile aynı yol.
- **Gelmedi** Akış'la aynı damga (098 `no_show_at`, canlıda 2026-09-17'den
  beri); kilit Gün'ün okumasından. Gün okuması artık `no_show_at`ı soruyor,
  `isNoShow` kararı payı beklemeden sayıyor; "Geldi" onu yener (geri alma
  yolu: randevu kartı → Geldi).
- **Randevu kartı** gözü yeni (`kart`): DOKUNUNCA açar, basılı tutma yok
  (`cellTaps`); müdür tarafı kullanmıyor.
- Düğme kartta GERÇEK bir düğme (seçicide kartın geri kalanı görüntü,
  `interactive={false}`); dokunuşun kabdaki yeri sayfa koordinatıyla
  ölçülüyor. Hap düğmenin hizasında altta (`ActionPill.triggerRight`), kimliğe
  bağlı — seçili kart değişince kapanır. VoiceOver: seçicinin "Yönet" eylemi.

**"Geldi" yalnız kendi gününde** (telefonda görüldü: Elif Demir "BEKLİYOR ·
177 dk · 21:29’da geldi" — yarının randevusuna akşamdan "Geldi" basılmış;
`dayStamp`'in 12 saatlik payı akşamki damgayı içeride tutuyordu).
`showsAttendance(appointment, today)` — randevu kartı başka günün randevusuna
"geldi mi?" sormuyor. Canlıdaki üç yanlış damga (Elif, Tuğçe, Yasemin · 13
Ekim) kodla temizlenmez; randevu kartından düzeltilecek ya da tohum yeniden
çalıştırılınca gider.

Kanıt: 2922 geçti / 0 kırık · `tsc` temiz · yeni lint bulgusu yok. Altı eski
test yeni kaynak biçimine taşındı (gevşetilmedi). Telefonda denenmedi.


**Telefon turu (69458be).** Gün kartının alt satırında müşterinin ADI 13,5 pt
kalın ve koyu (`subName` · `subParts`); satır yüksekliği aynı, kart boyu
değişmedi. "Geldi'yi geri al" gözü kişi + geri ok (Gelmedi'deki siluet).

## 28 · 2026-10-13 · T1 — TAKVİM TASARIMA DÖNDÜ ("çok kaba durmuyor mu")

Telefonda tek kişilik Takvim kaba görünüyordu. Sebep tasarım değil uygulama:
ekran T1'i değil müdürün 95 pt'lik sütun ölçülerini çiziyordu — ~320 pt'lik
blokta köşede 15,5 / 11,5 pt yazı, koyu `bd2` kenarlık, 74 pt saat.
`ColumnCalendar · soloColumn` artık T1'in CSS'ini (`soloColumnMetrics`) çiziyor:

| | ekip (Müdür 06, değişmedi) | tek sütun (v4 · T1) |
|---|---|---|
| saat | 74 pt | 69 pt · ilk çizgi 22 pt aşağıda |
| saat etiketi | 13,5 · 600 · sütun 62 | 14 · 500 · çizginin 6 pt altı · sütun 58 |
| blok | yerinde · `bd2` · 10 pt pay | 2 pt içeriden · `bd` · 8/13 pay |
| yazı | 12 / 15,5 / 11,5 · boya göre ÇIKARILIR | 13,5 / 17 / 14 · boya göre DİZİLİR |
| sürüyor | `or 70` · 3 pt şerit | `or 80` (%50) · 4 pt köşesiz şerit |
| bitti | ,56 | ,5 |
| şimdi çizgisi | 1 pt | 1,5 pt |

Diziliş (`soloBlockShape`): 78 pt ve üstü alt alta, 64–78 sıkışık (satır
1,15, pay 5), altı tek satır (saat · ad · hizmet; yalnız hizmet kırpılır).
Eşikler Hanken Grotesk'in satır yüksekliğinden (1,303) — test TTF'ten
hesaplıyor. Blok, şimdi çizgisi ve sürükleme hedefi aynı saat boyunu
kullanıyor (69); en kısa blok yarım saat (ekipte 37, tek sütunda 34,5).

Kanıt: 2936 geçti / 0 kırık · `tsc` temiz · yeni lint bulgusu yok
(`tests/tek-takvim-t1.test.mjs`). Dört eski test yeni yapıya taşındı.
Telefonda denenmedi.

## 29 · 2026-10-13 · KASA FİŞİ = RANDEVU KARTININ KABUĞU

Telefonda Kasa'daki hareket fişinin tutamacı çalışmıyordu. İki deneme
tutmadı: önce cam şeritteki jest, sonra fişin kabına yakalama aşamasında
bağlanan jest (`426ed23`). Kullanıcı randevu kartının davranışını ve
görünüşünü istedi ("tasarımını da aynısını uygulasak").

Fiş artık **sistemin sayfası**: RN `Modal` · `presentationStyle="pageSheet"`
· `allowSwipeDismissal`. Randevu kartı (`presentation: 'modal'`) da aynı iOS
sayfası. Aşağı çekmeyi iOS yapıyor, arkadaki ekran geri çekiliyor.

- **Kabuk ortak:** `Sheet.tsx · SheetHeader`. İçinde etiket ("RANDEVU" /
  "KASA HAREKETİ") ve kapat düğmesi var; düğme randevu kartından taşındı.
  Tutamak `SheetGrab`, zemin `c.bg`.
- **Kapanış sırası:** `close(after)` sayfayı indiriyor, iş `onDismiss`te
  yapılıyor. "Geri al"ın sistem uyarısı inen sayfanın üstüne açılmıyor.
  Android'de `onDismiss` yok; orada iş hemen yapılıyor.
- **Klavye:** düzeltme alanı, sayfanın ekrandaki yerinden ölçülen payla
  klavyenin üstünde kalıyor. `KeyboardAvoidingView` sayfanın ekranın
  tepesinden başlamadığını bilmiyor.
- **Silinenler:**
  - Kasa'nın camı (tasarımdaki tek cam yeri)
  - elle yazılmış giriş ve çıkış animasyonları
  - jest eşikleri ve tutamak ölçüleri (`cashMetrics`)

Aynı ölü tutamak `BottomSheet`te de duruyor (Gün sonu özeti, tahsil
edilmedi, randevu kartının alt sayfaları); kullanıcıya soruldu.

Kanıt: 2937 geçti / 0 kırık · `tsc` temiz. Telefonda denenmedi.
