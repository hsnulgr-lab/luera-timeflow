# Luera TimeFlow · Altyapı denetimi raporu (2026-11-24)

> Kapsam: `docs/denetim/2026-11-24-denetim-komutu.md`. Bu turda **kod değişmedi,
> commit yok, üretime dokunulmadı, mesaj gönderilmedi.** Kanıtlar depodaki
> koddan; canlıdaki durumu gerektiren yerler "olası" yazıldı ve §4'te
> doğrulama sorgusu var.
>
> Yerel kontroller (salt okunur): `npm test` → 3.822 geçti, 0 hata, 50 atlandı ·
> `tsc --noEmit` → hata yok (kaydedilmemiş 15 dosya dahil).

---

## 1 · Özet (kurucu için)

1. **🔴 Demo salondan mesaj çıkmasını engelleyen hiçbir kilit yok.** Bugünkü
   olayın kökü bu: koddaki hiçbir gönderim yolu "bu demo işletme mi?" diye
   sormuyor, tohumdaki müşteri ve personel numaraları da gerçek Turkcell /
   Türk Telekom numaraları. Hat koparıldığı için şu an mesaj gitmiyor; ama
   demo salona hangi hat bağlanırsa bağlansın, **birikmiş işler dahil** yine
   gider.
2. **🔴 `gateway` ucu kimliksiz.** API anahtarı olmadan, gövdeye bir işletme
   kimliği ve herhangi bir kayıtlı kullanıcının kimliği yazılarak **başka bir
   işletmeye randevu ve müşteri yazılabiliyor, o işletmenin müşterisinin adı
   değiştirilebiliyor ve dolu saatleri sorgulayarak müşteri adları
   okunabiliyor.** İşletme kimliği, logosu olan her salonun herkese açık
   randevu sayfasındaki logo adresinde açıkça yazıyor. Kayıt herkese açık
   olduğu için "herhangi bir kullanıcı" = internetteki herkes.
3. **🟠 Herkese açık randevu formu, salonun WhatsApp hattından yazılan her
   numaraya mesaj attırıyor** — "DUR" demiş kişiye de, kotasız, hız sınırsız.
   Yanlış kişiye mesaj ve hattın WhatsApp tarafından kapatılma riski.

**İlk yapılacak iş:** (a) §4'teki S1–S3 sorgularıyla demo salonda bekleyen
mesaj işi var mı bak, varsa S5 ile iptal et; (b) `gateway`i kapatan küçük
düzeltme (Plan P2) — tek fonksiyon yüklemesi, göç gerektirmiyor;
(c) demo kilidi (Plan P1) — bir göç + `_shared/wa.ts` + tohum dosyaları.

Ek olarak 4 önemli, 10 küçük bulgu var (tablo §2). Kaydedilmemiş 15 dosya
**kaydedilmeye hazır**; iki commit olarak ayrılması önerilir (§2.4).

---

## 2 · Bulgular

### 2.1 Tablo

| # | Önem | Başlık | Yer | Güven |
|---|---|---|---|---|
| B1 | 🔴 | Demo/test işletmesinden mesaj çıkışını durduran kilit yok; tohum numaraları gerçek | `_shared/wa.ts:243` · `DEMO_salon.sql:271,~320` · `DEMO_tek_kisilik.sql:230` · `DEMO_tek_test_gunu.sql:178` · `132_wa_davet.sql:34` | kesin |
| B2 | 🔴 | `gateway` kimliksiz: başka işletmeye yazma, müşteri adı okuma/değiştirme | `gateway/index.ts:52-140` | kesin (kod) · canlıda yüklü mü: olası → §4 S0 |
| B3 | 🔴 | Demo salonda kuyrukta bekleyen işler hat bağlanınca topluca çıkar | `wa-scheduler/index.ts:156` · `_shared/wa.ts:454` | olası → §4 S1 |
| B4 | 🟠 | `org-public` görsel deposu: herhangi bir kullanıcı başka salonun logosunu silebilir / değiştirebilir | `016_org_public_storage.sql:28-42` | kesin |
| B5 | 🟠 | Herkese açık randevu formu: girilen her numaraya opt-out'u ve kotayı atlayarak WhatsApp | `public-booking/index.ts:419,591` · `_shared/wa.ts:51` | kesin |
| B6 | 🟠 | `generate-recurring` kimliksiz; eşzamanlı çağrıda mükerrer randevu → çift hatırlatma | `generate-recurring/index.ts:24-120` | kimlik: kesin · mükerrer: olası |
| B7 | 🟠 | `deploy-functions.sh` hangi daldan/hangi değişiklikle yüklendiğini denetlemiyor | `scripts/deploy-functions.sh:81` | kesin |
| B8 | 🟡 | `remind` 2 saat hatırlatması sessiz saate bakmıyor (08:00 randevuya ~06:00'da mesaj) | `remind/index.ts:~285` | kesin |
| B9 | 🟡 | Kuyruk boşaltma (`drainOutbox`) sessiz saate bakmıyor | `_shared/wa.ts:419` · `remind/index.ts:~165` | kesin, nadir |
| B10 | 🟡 | 15 sn zaman aşımından sonra ikinci deneme → aynı mesaj iki kez gidebilir | `_shared/wa.ts:375-403` | olası |
| B11 | 🟡 | `organization_members … limit(1)` beş yerde: iki işletmeli kullanıcıda rastgele işletme | `_shared/auth.ts:47` · `src/contexts/AuthContext.tsx:45` · `remind/index.ts:83` · `gateway:65,96` · `src/services/integrationApi.ts:34` | bugün ulaşılamaz (142) |
| B12 | 🟡 | Zamanlayıcı tetikleyicisi hatayı yutuyor → hatırlatma sessizce planlanmayabilir | `132_wa_davet.sql:48` (ve aynı dosyadaki diğer `EXCEPTION WHEN OTHERS`) | kesin (tasarım) |
| B13 | 🟡 | Apple hakemi `demo@`'yu silerse demo salon tümden gider, tohum sessizce durur | `account-delete/index.ts` (kaydedilmemiş fark) · `DEMO_salon.sql` kapıları | olası |
| B14 | 🟡 | `has_timeflow_access` / `org_module_enabled` anonim açık: kimliği bilen aboneliği görür | `123_abonelik_yerel_kaynak.sql` · `053_module_rls.sql` | kesin, düşük etki |
| B15 | 🟡 | Masaüstü önbelleği yalnız "Çıkış"ta silinir; oturum düşünce ortak bilgisayarda kalır | `src/lib/swrCache.ts` · `AuthContext.tsx:154` | kesin, düşük etki |
| B16 | 🟡 | Web bildirim aboneliğinde `member` kendini `manager` yazabiliyor; `staffId` işletmeye karşı doğrulanmıyor | `push-subscribe/index.ts:138-152` | kesin, sızıntı yok |
| B17 | 🟡 | `checkAccess` bayrağı okuyamazsa kapı açılıyor (fail-open) | `_shared/entitlement.ts:197-200` | kesin (bilinçli) |
| B18 | 🟡 | Takvim gün görünümü 96 px sola kaymış; başlık ve ilk sütun kesik (eskiden de var) | `CalendarPage` · `.calendar-focus-page` | yerelde kesin · canlıda olası |

### 2.2 Bulguların ayrıntısı

#### B1 🔴 Demo işletmesi için mesaj kilidi yok; tohum numaraları gerçek

**Ne:** Bütün WhatsApp gönderimleri tek kapıdan (`sendWA`) geçiyor ve bu iyi.
Ama kapının sorduğu sorular yalnız: numara geçerli mi, hat bağlı mı, DUR
denmiş mi, kota dolu mu. "Bu işletme demo/test mi?" sorusu **hiçbir yerde
yok** (`grep is_demo|demo-luera|isDemo` → yalnız tohum dosyası).

```ts
// _shared/wa.ts:264 — tek kapının hat kontrolü; işletmenin türüne bakılmıyor
if (!org.instance || org.status !== 'connected') { … 'not_connected' }
```

Tohum numaraları:

```sql
-- DEMO_salon.sql:271 → 0532 1000000, 0532 1000037, … (14 kişi)
'0532 ' || lpad((1000000 + v_i * 37)::text, 7, '0'),
-- ~satır 320 → 0532 2000000 + i*53 (6 kişi, "bugün" seansları)
-- staff: '0555 000 0001..0003' (Türk Telekom)
-- DEMO_tek_kisilik.sql:230 ve DEMO_tek_test_gunu.sql:178 → '0532 900 0001..0008'
```

Hepsi `normalizePhone`'dan geçiyor (`90532…`, 3. hane `5`), yani gönderilebilir
numara sayılıyor. Göç 120'nin `luera.tohum='sessiz'` işareti yalnız push
tetikleyicisinde; zamanlayıcı tetikleyicisi (`wa_plan_jobs`, 132) ona bakmıyor
(`grep -c tohum 131 132` → 0).

**Senaryo (bugün yaşandı):** Demo salona hat bağlandı → tohum 11:00/13:00/15:00
koşusu randevu yazdı → `wa_plan_jobs` 24 saat / 2 saat / memnuniyet / "sıradaki
randevu" işleri planladı → `wa-scheduler` dakikada bir çalışıp gerçek
numaralara gönderdi. `scheduler_v2` kapalı olsaydı aynı şeyi `remind` (eski yol)
24h/2h/yorum/winback ile yapacaktı.

**Neden önemli:** KVKK ve itibar; ayrıca tanımadığı numaradan mesaj alan
kişilerin "spam" bildirmesi hattı WhatsApp'ta kapattırır.

`supabase/tests/*.sql` dosyalarındaki numaralar (`0500 000 0xxx`, `0555 …`)
`BEGIN…ROLLBACK` içinde koşuyor; canlıya mesaj üretmezler. `0555` gerçek bir ön
ek, tohumla birlikte değiştirilmesi iyi olur ama acil değil.

#### B2 🔴 `gateway` kimliksiz — başka işletmeye yazma ve okuma

**Kanıt:**

```ts
// gateway/index.ts — API anahtarı yoksa ya da yanlışsa:
const user_id = resolvedUserId || data_source.user_id;               // gövdeden
let organization_id = resolvedOrgId || data_source.organization_id;  // gövdeden
…
let customer_id = data_source.customer_id || null;                   // işletmeye karşı denetlenmiyor
…
.update({ name: customer_name, email: … }).eq('id', customer_id)     // var olan müşterinin adı değişir
…
return json({ error: 'Çakışma var', conflict }, 409)                 // conflict = {id, customer_name, start_time, end_time}
```

`user_id` yalnız `auth.users`'a yabancı anahtar; **saldırganın kendi hesabının
kimliği** yeterli (kayıt herkese açık, kimliğini kendi oturumundan görür).

**İşletme kimliği nereden bulunur:** `useOrgProfile.ts:182` logoyu
`org-public/<orgId>/logo-….jpg` yoluna yüklüyor; herkese açık randevu sayfası
(`public-booking` → `logoUrl`) bu adresi döndürüyor. Personel kimlikleri de
aynı cevapta (`staff[].id`).

**Senaryo — okuma:**
1. Saldırgan `timeflow.lueratech.com/book/<salon>` açar, logo adresinden
   `orgId`'yi, profil cevabından personel kimliklerini alır.
2. Kendi hesabıyla kayıt olur, kendi `user_id`'sini alır.
3. `POST /functions/v1/gateway` gövdesi `{organization_id, user_id, staff_id,
   date, start_time:"09:00", end_time:"21:00", customer_name:"x",
   customer_phone:"x", service:"x"}` → **409 cevabında o personelin o günkü
   ilk randevusunun müşteri adı ve saati** gelir. Aralığı daraltarak bütün gün,
   tarih değiştirerek bütün takvim okunur.

**Senaryo — yazma:** aynı istek boş bir saate atılırsa salonun takvimine
randevu düşer (`status` gövdeden, `confirmed` da olur); salon sahibine
"Yeni randevu" push'u gider, zamanlayıcı açıksa **gövdeye yazılan numaraya
salonun hattından** hatırlatma gider. `customer_phone` salonun mevcut bir
müşterisinin numarasıysa o müşterinin **adı ve e-postası** üzerine yazılır.

Koşul: işletmenin erişimi açık olmalı (`checkAccess`; ENFORCE açık, deneme
dahil). Demo salonun erişimi süresiz açık.

**Canlıda yüklü mü:** `deploy-functions.sh` argümansız çalıştırıldığında
bütün klasörleri yükler; yüklü olması büyük olasılık. §4 S0 ile zararsız
şekilde doğrulanır.

#### B3 🔴 Demo salonun kuyruğu

Hat koparılınca `wa-scheduler` işleri **iptal etmiyor**, 30 dakika sonraya
erteliyor (`settle` → `not_connected` → `pending`). `wa_message_log`'daki
`queued` satırlar da `drainOutbox`'ta hat düşükken ertelenip 3 denemeden sonra
düşüyor. Zaman penceresi (`sendDecision`) bayat hatırlatmaları büyük ölçüde
eler, ama **gelecek günlerin 24 saat hatırlatmaları, memnuniyet ve "sıradaki
randevu" işleri** pencereleri içinde bekliyor olabilir. Demo salona yarın bir
hat bağlansa ilk dakikada hepsi gider. S1 sayıyı gösterir, S5 temizler.

#### B4 🟠 `org-public` deposu kiracı süzgeçsiz

```sql
CREATE POLICY "org_public_auth_delete" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'org-public');   -- klasör = org denetimi yok
```

**Senaryo:** Herhangi bir kayıtlı kullanıcı, B2'deki gibi logo adresinden
`<orgId>/logo-….jpg` yolunu öğrenir; kendi oturumuyla
`storage.from('org-public').remove([...])` ya da `upload(..., {upsert:true})`
çağırır → **başka salonun herkese açık sayfasındaki logo/kapak/galeri silinir
veya uygunsuz bir görselle değiştirilir.** Okuma zaten herkese açık (kasıtlı).

#### B5 🟠 Herkese açık form → kotasız, opt-out'suz WhatsApp

```ts
// public-booking/index.ts:419 ve 591
sendWA(supabase, { org: orgWa, phone: customerPhone, kind: 'booking', ignoreOptOut: true, text })
// _shared/wa.ts:51 — 'booking' kota dışı
const UNMETERED = new Set(['booking', …]);
```

Formda hız sınırı, CAPTCHA ya da numara doğrulaması yok (`grep rate|captcha`
→ yok). **Senaryo:** biri formu başka birinin numarasıyla doldurur → o kişiye
salonun hattından "randevunuz oluşturuldu" + ertesi gün hatırlatma gider; kişi
daha önce "DUR" demiş olsa bile. Formu tekrar tekrar doldurmak, boş saat
kaldıkça tekrar mesaj demek. Kişi rahatsız edilir, salonun numarası spam
bildirimi alır.

`ignoreOptOut: true`'nun gerekçesi (müşteri az önce kendisi randevu aldı)
doğru, ama "müşteri kendisi" olduğu kanıtlanmıyor.

#### B6 🟠 `generate-recurring` kimliksiz ve yarışa açık

Fonksiyonda hiçbir kimlik kontrolü yok; URL'yi bilen herkes bütün
işletmelerin tekrarlı randevu üretimini tetikleyebilir. Tek başına zarar
sınırlı (aynı işi cron zaten yapıyor, var olan tarihleri atlıyor). Ama iki
çağrı aynı anda koşarsa ikisi de `existing` kümesini boş görür ve aynı tarihe
**iki çocuk randevu** yazar; personelsiz randevuda çakışma kapısı (060) da
durdurmaz → müşteriye iki hatırlatma. Cevapta kök randevu kimlikleri de dönüyor.

#### B7 🟠 `_shared` eşitleme koruması yok

`rsync -az --delete … supabase/functions/_shared/` çalıştığı klasörün
`_shared`'ını olduğu gibi sunucuya basar. Dal, temiz çalışma ağacı ya da
`origin/main` ile eşitlik denetlenmiyor. 2026-11-10 dersi (eski daldan yükleme
WhatsApp'ı bozar) yalnız bellekte duruyor, betikte değil.

#### B8–B17 🟡 (kısa)

- **B8** `remind` 2 saat hatırlatması `sendableHour` kapısının bilinçli olarak
  dışında. 08:00–09:30 randevuları için mesaj 05:30–07:30 arası gider.
  Yalnız `scheduler_v2` kapalı işletmeler (zamanlayıcıda pencere var).
- **B9** `drainOutbox` sessiz saatte de çalışıyor (yorumda bilinçli: "kuyruktaki
  mesaj gönderilebilir bir saatte üretilmiştir"). 20:55'te kuyruğa giren 24 saat
  hatırlatması son denemede ~23:00'te gidebilir.
- **B10** `deliver` 15 sn'de keser ve bir kez daha dener; Evolution ilk isteği
  geç de olsa göndermişse müşteri iki mesaj alır (kod yorumunda kabul ediliyor).
- **B11** Beş yerde sırasız `limit(1)`. 142 sahibin üye eklemesini kapattığı
  ve `create_own_business` ikinci işletme açmadığı için bugün iki işletmeli
  kullanıcı oluşamıyor; şube geldiğinde ilk kırılacak yer. `identify()`
  (sunucu) ile `AuthContext` (masaüstü) **farklı** işletme seçebilir: ekranda
  A salonu, `insight`/`draft-messages` cevabında B salonunun verisi.
- **B12** `wa_plan_jobs` her dalda `EXCEPTION WHEN OTHERS → RAISE WARNING`.
  Randevu kaydı bozulmasın diye doğru; ama planlama düşerse kimse bilmiyor.
- **B13** Kaydedilmemiş farkta `demo@` silme korumasının **dışında** bırakılmış
  (Apple 5.1.1(v) gerekçesiyle, bilinçli). Hakem silerse `organizations`
  cascade ile demo salon ve tüm verisi gider; tohum "e-posta tek kullanıcıya
  çözülmeli" kapısında durur, cron logu dışında ses çıkmaz.
- **B14** İki fonksiyon `anon`'a açık; işletme kimliğini bilen (logo adresi)
  aboneliğin açık olup olmadığını öğrenir.
- **B15** Önbellek anahtarları işletmeye bağlı (başka hesap okuyamaz), ama
  oturum süresi dolduğunda temizlenmiyor; ortak bilgisayarda tarayıcı
  deposunda müşteri listesi kalır.
- **B16** Web push dalında rol gövdeden. Sızıntı yok (satır yine kendi
  işletmesine yazılıyor), ama `member` müdür bildirimlerini alabiliyor.
- **B17** Bayrak sorgusu geçici hata verirse herkes geçer. Bilinçli (kilitlemek
  daha kötü); yalnız not.

#### B18 🟡 Takvim gün görünümü 96 px sola kaymış (önceden de var)

2026-11-24 yerel bakışında (panel-harness, 1440×900) `.calendar-focus-page`
kapsayıcısı `overflow-x: hidden` iken `scrollLeft = 96` (içerik 1460, kutu 1364):
"Seans Takvimi" başlığı ve ilk sütunun solu kenar çubuğunun altında kalıyor.
20 Kasım değişikliğinden ÖNCEKİ dosyalarla da aynı ölçüldü → yeni değil.
Canlıda da olup olmadığı **olası**: canlı takvimde Gün görünümünde başlığın tam
görünüp görünmediğine bakılmalı. Taşan 96 px'in kaynağı henüz bulunmadı.

### 2.3 Çok kiracılık (masaüstü · telefon · sunucu)

**Sonuç: veritabanı katmanı sağlam; sızıntılar sunucu fonksiyonlarında ve
depoda (B2, B4).**

**Veritabanı (göçler baştan sona tarandı, betikle):**
- 60 tablo, 65 `ENABLE ROW LEVEL SECURITY`; RLS'siz tablo **yok**.
- `organization_id`'siz tablolar: `organizations`, `organization_members`
  (kendi kimlikleri), `settings`/`customers`/`reservations`/`services` (sütun
  003'te eklendi), `app_secrets`, `app_flags`, `integration_connections`
  (`user_id` politikası), `staff_pair_attempts`. Eski `user_id` politikaları
  003'te düşürülmüş.
- `USING (true)`: yalnız `app_flags` (okuma; işletme verisi değil).
- Görünüm: yalnız `wa_outbox_pending`, `security_invoker = true` ✔.
- 53 `SECURITY DEFINER` fonksiyonun **hepsinde** `SET search_path` var ✔.
  İstemciye açık olanlar (`consume_plan_session`, `correct_payment`,
  `revert_payment`, `voided_payments`, `create_own_business`) gövdede
  `auth.uid()`/`auth_user_org_ids()` kullanıyor; servis işleri
  (`wa_claim_jobs`, `wa_backfill_jobs`, `purge_*`) `PUBLIC/anon/authenticated`'dan
  geri alınmış ✔. Anonim açık iki fonksiyon → B14.
- **Depo:** `org-public` politikaları klasöre bakmıyor → B4.
- Realtime: masaüstü `postgres_changes` RLS'e tabi; zil kanalı `org:<id>` yalnız
  `{t, op}` taşıyor, personel jetonunun `org`'u sunucuda basılıyor ✔.

**Sunucu fonksiyonları (`VERIFY_JWT=false`):**

| Fonksiyon | Kimlik | İşletme nereden | Durum |
|---|---|---|---|
| gateway | **yok** (anahtar isteğe bağlı) | **gövde** | 🔴 B2 |
| generate-recurring | **yok** | — (hepsi) | 🟠 B6 |
| public-booking | yok (kasıtlı) | slug | 🟠 B5 (yalnız mesaj) |
| booking-manage | `customer_token` (UUID v4) | randevudan | ✔ |
| dodo-satin-al | yok (ödeme önce, kasıtlı) | — | bakıldı, işletme verisine erişmiyor |
| dodo-webhook | Standard Webhooks HMAC + zaman damgası + defter | metadata (checkout'ta sunucu yazar) | ✔ |
| whatsapp-booking | instance + `?s=webhook_secret` | instance → org | ✔ |
| wa-saglik | anon anahtar (herkese açık) | — | yalnız sağlık özeti, ✔ |
| remind / wa-scheduler / staff-nudge / abonelik-eposta | cron sırrı / service | — | ✔ (`remind` elle hatırlatma dalı B11) |
| send-push / send-live-activity | `x-push-secret` | gövde (yalnız iç çağıran) | ✔ |
| notify-waitlist | `identify` + `caller.orgId === organization_id` | doğrulanmış | ✔ |
| draft-messages / insight | `requireUserOrg` | üyelik | ✔ (B11) |
| account-delete / billing-status / dodo-checkout / push-subscribe / whatsapp-proxy | JWT + `resolveOrg` | üyelik, çoklu üyelikte zorunlu `orgId` | ✔ |
| staff-api | ayrı `STAFF_TOKEN_SECRET`, `epoch`, `did` | jetonda, sunucu basar | ✔ |

**Masaüstü (`src/`):** İşletme `AuthContext`'te bir kez çözülüyor, işletme
değiştirme ekranı yok. Önbellek anahtarları `…:${orgId}`; çıkışta
`clearAllCache` ✔ (B15). `settings` okuyucuları `_shared/org.ts ownerSettings`
deseninde (hafızadaki kural) — bu turda yeniden derin okunmadı.

**Telefon (`mobile/`):** `signOut` sırası doğru: önce bildirim aboneliği
(personel jetonuyla / müdürde seçili işletmeyle), sonra "Müşteri bekliyor"
jetonları, sonra Supabase oturumu, sonra `resetTenant()` + `clearProfile()`.
`onTenantReset` Dinamik Ada etkinliklerini (`endAllWaitActivities`,
`endAllArrivalActivities`) kapatıyor ✔. Personel ayrılınca 142'nin
`drop_push_on_staff_deactivate` tetikleyicisi bildirim satırlarını siliyor ✔.
Expo Go + mağaza uygulaması: `device_id` kısmi tekillik + eski jetonu silme
(103/106) ✔; ölü jeton budaması `DeviceNotRegistered` ve 404/410'da ✔.

**Kanallar:** WhatsApp instance adı `tf_<orgId>` türetiliyor ✔; gelen mesaj
instance'tan org'a çözülüp sırla doğrulanıyor ✔; müşteri yönetim bağlantısı
tahmin edilemez UUID ✔.

### 2.4 Kaydedilmemiş 15 dosya

**Hata bulunmadı; kaydedilmeye hazır.** İki commit önerisi:

1. *Google Play hazırlığı* — `account-delete/index.ts`, `hesapSilApi.ts`,
   `HesapSil.tsx`, `mobile/src/api/accountDeletion.ts`, `managerProfile.ts`,
   `mobile/eas.json`, `mobile/.gitignore`, `public/gizlilik.html`,
   `public/destek.html`. Tutarlı: sunucu `protected_account` (403) döner, üç
   istemci de `protected` metnine çeviriyor; `play-service-account.json`
   gitignore'da.
   Notlar: (a) koruma e-postaya bağlı — hesabın e-postası değiştirilirse koruma
   düşer; kullanıcı kimliğiyle (`user.id`) korumak daha sağlam. (b) Gizlilik ve
   destek sayfasında "e-posta göndermeniz gerekmez" cümlesinin hemen altında
   e-postayla silme paragrafı var; "Uygulama sizde değilse…" diye başlayan ayrı
   bir kutu daha az çelişkili okunur. (c) Koruma ancak `account-delete`
   yüklenince ve `public/` Coolify Deploy'la yayımlanınca etkili.
2. *Takvim (20 Kasım)* — `DayAgendaGrid.tsx`, `CalendarPage.tsx`, üç CSS,
   `BeautyCustomersPage.tsx`. Yarım saat hücresi `placed` (sütunun kendi
   randevuları) ile süzülüyor ✔; `fmtH`/`onAddAt` kesirli saati doğru
   biçimliyor ✔; dış süzgeç `'all' → ''` eşlemesi doğru ✔; `both → backwards`
   değişikliği yorumuyla tutarlı ✔.
   Küçük not: `DayAgendaGrid.tsx:76` "Faz ilerletme" belge yorumu yeni
   `staffFilter` alanının üstüne kaymış (yalnız yorum).

---

## 3 · Düzeltme planı

Yayın sırası kuralı: **fonksiyon → göç → Coolify → mağaza.** Aşağıdaki
"kullanıcının adımları" her zaman: ne · neden · nasıl · ne görmeli · bana ne
söylesin.

### P1 · Demo/test kilidi (B1, B3) — ❌ İPTAL (kullanıcı kararı, 2026-11-24)

> "Demo hesaba hat bağlanmayacak, sadece demo olarak duracak; demo hesaba
> dokunmayalım." Demo org, tohum dosyaları ve demo kuyruğu (S5) olduğu gibi
> kalır. Koruma kuraldır: demo salona hiçbir WhatsApp hattı bağlanmaz.
> Aşağıdaki plan yalnız kayıt için duruyor.

**Değişecek:**
- Yeni göç `145_kum_havuzu.sql`: `organizations.is_sandbox BOOLEAN NOT NULL
  DEFAULT false`; demo salon (`slug='demo-luera'`) ve Test Salon 2 için `true`.
  `wa_plan_jobs` başına `IF (SELECT is_sandbox …) THEN RETURN NEW; END IF;` ve
  `luera.tohum = 'sessiz'` kontrolü. Göçün sonunda kum havuzundaki `pending`
  işler `cancelled` (not: `kum_havuzu`).
- `_shared/wa.ts` · `sendWA` ve `drainOutbox`: işletme `is_sandbox` ise
  gönderme; yalnız `org_whatsapp.agent_config.test_numbers` (zaten var)
  listesindeki numaralara izin ver. Sonuç `skipped / sandbox` loglanır.
  `getOrgWa`/`linkedOrgs` sorgusuna `organizations(is_sandbox)` eklenir.
- `whatsapp-proxy` `connect`: kum havuzu işletmesine hat bağlamaya izin ver
  ama ekranda "Bu deneme salonu: yalnız test numaralarına mesaj gider" uyarısı.
- Tohumlar (`DEMO_salon.sql`, `DEMO_tek_kisilik.sql`, `DEMO_tek_test_gunu.sql`):
  müşteri numaraları **gönderilemez biçime**: `0212 000 0xxx` (sabit hat —
  `normalizePhone` 3. hane `5` değil diye `null` döner). Personel `0216 000 000x`.
  Bedeli: demo müşteri kartında WhatsApp düğmesi görünmez; hakem ekran
  görüntüsü için sorun değil.
- Test: `tests/wa-kum-havuzu.test.mjs` (kum havuzunda `sendWA` → `sandbox`,
  test numarasında gider), `supabase/tests/kum_havuzu_regression.sql`
  (PGlite: tohum koşusu `wa_jobs`'a satır yazmaz).

**Asistan kilidi:** konuşma metni değişmiyor; `tests/wa-asistan-kilidi.test.mjs`
etkilenmez (yalnız gönderim kapısı).

**Yayın:** `_shared` değiştiği için **bütün fonksiyonlar** yüklenir (önce P4'ün
korumasıyla) → göç 145 → VPS'teki `/root/DEMO_salon.sql` yenisiyle değiştirilir
(özet karşılaştırması + kuru koşu, demo hafızasındaki sırayla).
**Geri alma:** göç geri alımı `UPDATE organizations SET is_sandbox=false` ve
tetikleyicinin 132 hâli; fonksiyonlar önceki commit'ten yeniden yüklenir.

**Kullanıcının adımları:** (1) S1–S3'ü çalıştır, sayıları bana ver.
(2) Gerekirse S5'i önce `ROLLBACK`'le, sayılar doğruysa `COMMIT`'le.
(3) Yüklemeyi ve göçü ben komutlarıyla yazacağım; sen çalıştırıp çıktıyı
yapıştır. Görmen gereken: S1'de demo için `pending` = 0.

### P2 · `gateway`i kapat (B2) — ✅ CANLIDA (2026-11-24)

> S6: tek kullanım LeadFlow, son 2026-06-02 ve anahtarlı; CallFlow hiç.
> Yüklendi (`deploy-functions.sh gateway`), anahtarsız istek canlıda
> `401 {"error":"API anahtarı gerekli"}` döndü. Test: `tests/gateway-kimlik.test.mjs`.

**Değişecek:** `gateway/index.ts` —
- Geçerli `integration_connections.api_key` **zorunlu**; yoksa 401. Gövdedeki
  `user_id`/`organization_id` yok sayılır.
- `customer_id` gelirse `organization_id`'ye karşı denetlenir, yoksa yok sayılır.
- Var olan müşterinin adı/e-postası **güncellenmez**.
- 409 cevabında `conflict` yalnız `{start_time, end_time}` (ad yok).
- `status` yalnız `pending`/`confirmed`.
- Anahtar karşılaştırması sabit süreli değil ama sorgu eşitliği; kabul edilebilir.

**Göç:** yok. **Test:** `tests/gateway-kimlik.test.mjs` (anahtarsız 401,
yabancı `customer_id` yok sayılır, 409'da ad yok).
**Yayın:** yalnız `gateway` fonksiyonu.
**Geri alma:** önceki commit'ten `gateway` yeniden yüklenir.
**Önce sor:** n8n / LeadFlow / CallFlow bu ucu **anahtarsız** çağırıyor mu?
S6 son kullanım tarihini gösterir. Anahtarsız meşru çağıran varsa onun
akışına anahtar eklenmeden bu yüklenmemeli.

### P3 · Görsel deposu (B4) — ✅ CANLIDA (2026-11-24; pg_policies doğrulandı, panelden logo yükleme çalıştı)

> Göç `145_org_public_klasor.sql` (numara 145: demo kilidi iptal edildi).
> Test `tests/org-public-klasor.test.mjs` (PGlite: önce açık gösteriliyor, sonra kapandığı; silme kuralı sökülünce düşüyor).

**Göç** `145_org_public_klasor.sql`: insert/update/delete politikalarına
`(storage.foldername(name))[1]::uuid IN (SELECT auth_user_org_ids())` ekle.
**Test:** PGlite'ta `storage` şeması yok; politika metni için
`tests/org-public-politika.test.mjs` (metin denetimi) + canlıda S7 ile
politika okuması. **Yayın:** yalnız göç. **Geri alma:** 016'daki eski
politikalar. **Kullanıcı:** göç sonrası Ayarlar → profil → logo yükle; yüklenmeli.

### P4 · `deploy-functions.sh` koruması (B7) — ✅ KODDA (2026-11-24)

> `scripts/deploy-guard.sh` + `deploy-functions.sh --kuru`; test
> `tests/deploy-koruma.test.mjs` (geçici depolar, bash 3.2). Plandan fark:
> GitHub'ın ÖNÜNDE olmak serbest (yalnız uyarı) — bu projede yükleme push'tan
> önce yapılabiliyor; GERİDE olmak durdurur. Sürüm izi `_shared/.surum`.

Betiğin başına: dal `main` değilse dur; `git status --porcelain
supabase/functions` boş değilse dur; `git fetch` sonrası `HEAD` ≠
`origin/main` ise dur; `ZORLA=1` ile aşılabilir. Yüklemeden önce
`_shared/SURUM` dosyasına commit kısa özeti yazılır, sunucudaki sürüm ekrana
basılır ("sunucuda a1b2c3d → yüklenecek e4f5g6h"). Test: betik `--kuru` kipi.
Göç yok, üretime etkisi yok.

### P5 · Herkese açık form (B5) — ⏸ ERTELENDİ (kullanıcı: "sonra konuşuruz", 2026-11-24)

- `public-booking`: aynı numaraya/IP'ye son 1 saatte 3'ten fazla randevu → 429.
  `ignoreOptOut: true` kaldırılır: DUR listesindeki numaraya onay **gitmez**,
  sayfa yine "randevunuz alındı" der. (Mesaj metni değişmiyor; asistan kilidi
  etkilenmez.)
- `booking` türü kota dışı kalır ama numara başına günlük tavan (ör. 3) eklenir.
**Göç:** yok (sayım `reservations`/`wa_message_log`'dan). **Test:**
`tests/public-booking-sinir.test.mjs`. **Yayın:** `public-booking` + `_shared`
(P4 korumasıyla).

### P6 · `generate-recurring` (B6)

`identify()` → yalnız `cron`/`service`. Mükerrer için göç
`147_tekrar_tekil.sql`: `CREATE UNIQUE INDEX … ON reservations
(recurrence_parent_id, date) WHERE recurrence_parent_id IS NOT NULL AND status
<> 'cancelled'`; fonksiyon `23505`'i "zaten var" sayar. **Önce S9** — var olan
mükerrerler varsa indeks kurulamaz, önce ayıklanmalı. Cron satırına
`x-cron-secret` başlığı eklenmeli (VPS crontab — kullanıcı).

### P7 · Küçükler (B8–B17)

- B8: `remind` 2 saat dalına `nowMin >= 8*60` alt sınırı (randevu 10:00'dan
  önceyse 24 saat hatırlatması yeter).
- B9: `drainOutbox` sessiz saatte yalnız `reminder_2h`/`booking` gönderir,
  gerisini sabaha erteler.
- B10: Evolution'a giden istekte idempotent anahtar yok; ikinci denemeyi yalnız
  bağlantı kurulamadıysa (zaman aşımında değil) yapmak.
- B11: beş `limit(1)`'i `resolveOrg`'a çevirmek — şube işi başladığında, tek PR.
- B12: `wa_plan_jobs` uyarıları için `wa_plan_errors` tablosu + dış izlemeye
  7. kontrol.
- B13: dış izlemeye "demo salon var mı" kontrolü; `account-delete` demo@
  silindiğinde kurucuya e-posta.
- B14: iki fonksiyonu `anon`'dan geri al (randevu sayfası zaten fonksiyon
  üzerinden geliyor; önce istemcide `anon` çağrısı var mı bakılmalı).
- B15: `onAuthStateChange('SIGNED_OUT')` içinde de `clearAllCache()`.
- B16: `member` için `role` zorla `staff`; `staffId` işletmeye karşı denetlensin.

---

## 4 · Kullanıcının çalıştıracağı SQL'ler

Supabase Studio → SQL Editor (TimeFlow yığını). Demo salon:
`6d93e1c4-8dd9-49ad-824f-f44ce6da0d97`.

**S0 — `gateway` canlıda mı?** *(SALT OKUNUR — veritabanına yazmaz)*
Terminalde; boş gövde, ilk kontrolde 400 döner, hiçbir şey yazılmaz:

```bash
curl -s -X POST https://supabase.timeflow.lueratech.com/functions/v1/gateway -H 'Content-Type: application/json' -d '{}'
```

`"Eksik alan"` görürsen yüklü (B2 canlıda geçerli). `404`/`not found` görürsen yüklü değil.

**S1 — Demo salonda bekleyen mesaj işleri** *(SALT OKUNUR)*

```sql
SELECT 'wa_jobs' AS kaynak, kind, status, count(*), min(due_at) AS ilk, max(due_at) AS son
FROM wa_jobs
WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97' AND status = 'pending'
GROUP BY kind, status
UNION ALL
SELECT 'outbox', kind, status, count(*), min(next_attempt_at), max(next_attempt_at)
FROM wa_message_log
WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97' AND status = 'queued'
GROUP BY kind, status;
```

**S2 — Hangi işletmede hat ve bayrak durumu ne?** *(SALT OKUNUR)*

```sql
SELECT o.name, o.slug, w.status, w.instance IS NOT NULL AS hat_var,
       w.features->>'scheduler_v2' AS zamanlayici, w.features->>'agent_v2' AS asistan,
       w.agent_config->'test_numbers' AS test_numaralari, w.last_error
FROM org_whatsapp w JOIN organizations o ON o.id = w.organization_id
ORDER BY o.name;
```

**S3 — Bugünkü olayda kaç numaraya ne gitti?** *(SALT OKUNUR — numaralar maskeli)*

```sql
SELECT date_trunc('day', created_at) AS gun, kind, status,
       count(*) AS adet, count(DISTINCT phone) AS farkli_numara
FROM wa_message_log
WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97'
  AND direction = 'out' AND created_at > now() - interval '7 days'
GROUP BY 1, 2, 3 ORDER BY 1, 2;
```

**S4 — Demo dışında da tohum numarası taşıyan müşteri var mı?** *(SALT OKUNUR)*

```sql
SELECT o.name, count(*) AS adet
FROM customers c JOIN organizations o ON o.id = c.organization_id
WHERE regexp_replace(c.phone, '\D', '', 'g') ~ '^0?(5321000|5322000|5329000|555000000)'
GROUP BY o.name ORDER BY adet DESC;
```

**S5 — Demo salonun kuyruğunu temizle** *(YAZAR — önce kuru koşu)*

```sql
BEGIN;
UPDATE wa_jobs SET status = 'cancelled', note = 'denetim 2026-11-24', updated_at = now()
WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97' AND status = 'pending';
UPDATE wa_message_log SET status = 'failed', error = 'denetim 2026-11-24', next_attempt_at = NULL
WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97' AND status = 'queued';
-- Kontrol: ikisi de 0 olmalı
SELECT (SELECT count(*) FROM wa_jobs WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97' AND status = 'pending') AS bekleyen,
       (SELECT count(*) FROM wa_message_log WHERE organization_id = '6d93e1c4-8dd9-49ad-824f-f44ce6da0d97' AND status = 'queued') AS kuyruk;
ROLLBACK;   -- sayılar doğruysa ROLLBACK yerine COMMIT yazıp yeniden çalıştır
```

Not: tohum her koşuda yeni randevu yazdığı için demo salona hat **bağlı
değilken** de yeni `pending` işler birikir (zamanlayıcı bayrağı açıksa). S5
P1 yayımlanana kadar kalıcı çözüm değil; demo salona hat bağlama yasağı sürer.

**S6 — `gateway`i kim kullanıyor?** *(SALT OKUNUR)*

```sql
SELECT module, active, organization_id IS NOT NULL AS org_bagli, last_used_at
FROM integration_connections ORDER BY last_used_at DESC NULLS LAST;
```

**S7 — Görsel deposu politikaları canlıda nasıl?** *(SALT OKUNUR)*

```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
```

**S8 — İki işletmeye üye kullanıcı var mı? (B11)** *(SALT OKUNUR)*

```sql
SELECT user_id, count(*) FROM organization_members GROUP BY user_id HAVING count(*) > 1;
```

**S9 — Mükerrer tekrarlı randevu var mı? (B6)** *(SALT OKUNUR)*

```sql
SELECT recurrence_parent_id, date, count(*)
FROM reservations
WHERE recurrence_parent_id IS NOT NULL AND status <> 'cancelled'
GROUP BY 1, 2 HAVING count(*) > 1;
```

---

## 5 · Denetlenmeyenler

- **`wa-agent` ve `whatsapp-booking`'in konuşma mantığı** — asistan kilitli
  (2026-11-08); yalnız kimlik ve işletme çözümü (instance + sır) okundu. LID'li
  mesaj düşmesi zaten açık madde.
- **`staff-api`'nin 3.094 satırı** — yalnız jeton imzası, sır ayrımı ve
  işletmenin jetondan geldiği doğrulandı; her eylemin yetki denetimi tek tek
  okunmadı (142/143 regresyon testleri bunu kapsıyor).
- **`settings` okuyucularının tutarlılığı** — hafızadaki kural (`ownerSettings`)
  sunucuda görüldü; masaüstü ve telefondaki üç okuyucu bu turda yeniden
  okunmadı.
- **Masaüstündeki her sorgunun `organization_id` süzgeci** — RLS zaten
  işletmeye göre süzdüğü için sızıntı yaratmaz; yalnız performans/doğruluk
  açısından önemli, atlandı.
- **n8n akışları** — depoda değil (`n8n.vps…/webhook/gateway`); `gateway`
  dışında ne çağırdığı bilinmiyor. S6 ipucu verir.
- **Yedek ve demo tohumu cron'ları** — VPS'te; SSH yasak olduğu için
  crontab okunmadı. `generate-recurring`'in cron satırında sır olup olmadığı
  da buna bağlı (P6).
- **Evolution API ve Coolify yapılandırması**, canlı `app_secrets` içeriği,
  canlı politikaların depoyla aynı olup olmadığı (S7 kısmen kapsar).
- **Telefon uygulamasının çalışan hâli** — Expo Go turu yapılmadı (kod
  değişmedi).
- **`dodo-checkout`, `abonelik-eposta`, `billing-status`'un iş mantığı** —
  yalnız kimlik/işletme çözümü okundu; "en yeni abonelik kazanır" kararı
  (`decide`) mevcut testlere bırakıldı.
