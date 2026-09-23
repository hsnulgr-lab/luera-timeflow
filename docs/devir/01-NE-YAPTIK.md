# NE YAPTIK — 2026-09-23 oturumu

Yerel kontroller (son durum): **2603 test geçti · 0 kırmızı · 7 atlandı**,
`cd mobile && npx tsc --noEmit` temiz, lint tabanı **462** (değişmedi —
dokunulan hiçbir dosyada yeni hata yok).

**Hiçbir şey commit edilmedi. Hiçbir şey deploy edilmedi. SQL çalıştırılmadı.**

---

## Bölüm A — "100% canlı" işinin tamamlanması

### Sorun neydi

Canlı zil (uygulama AÇIKKEN anında tazeleme) migration `100` ile geldi ama
yalnız **iki tabloda** vardı: `reservations` ve `payments`. Geri kalan her şey
25 saniyelik yoklamayla öğreniliyordu. Masaüstünde müşteriye hamilelik bayrağı
eklenince telefondaki açık kart bunu 25 saniye göstermiyordu.

`101_live_doorbell_wide.sql` (önceki oturumda yazıldı) zili 9 tabloya daha
takıyor. Ama zil 11 tabloda çalınca yeni bir sorun doğdu: **süzgeçsiz ekranlar
ilgisiz değişikliklerde de kendini yeniliyordu** — bir paket satışı Akış'ı, bir
ürün fiyatı Kasa'yı tazeliyordu.

### Yapılanlar

**Zile bağlanan üç yeni kaynak** (yoklama emniyet ağı olarak KALDI):

| Dosya | Tablolar | Not |
|---|---|---|
| `mobile/src/lib/salonDay.ts` | `reservations`, `staff` | Personelin salon takvimi |
| `mobile/src/lib/fileSource.ts` | `customers`, `reservations`, `customer_packages`, `treatment_plans` | Müşteri dosyası; müşteri seçilmemişken abone OLMUYOR |
| `mobile/src/lib/catalogSource.ts` | `services`, `products` | `reservations` BİLEREK yok — oradan yalnız "son günlerde ne kullanıldı" sıralaması geliyor |

**Tablo süzgeci verilen 13 çağrı yeri:**

- `mobile/src/lib/liveSignal.ts` → yeni `BOOKING_TABLES` sözlüğü
  (`reservations, payments, staff, staff_time_off, settings, services,
  customers`). Dışarıda bırakılanlar bilinçli: `treatment_plans`,
  `package_templates`, `customer_packages`, `products`.
- `managerCalendarDay.ts`, `managerCash.ts`, `managerFlowDay.ts`,
  `managerAppointment.ts`, `managerCreate.ts` (×2) → `BOOKING_TABLES`
- `agendaSource.ts`, `visitSource.ts` → `['reservations']` (uç yalnız o tabloyu
  okuyor)
- `app/mudur/profile.tsx` → `['settings','services']`
- `app/(manager-flow)/musteriler.tsx` → `['customers','reservations']`
- `app/(manager-flow)/musteri-gecmis.tsx` → `['reservations','payments']`
- `app/(manager-flow)/paket-sat.tsx` → `['customers','package_templates','services','settings']`
- `app/(manager-flow)/profil/hizmetler.tsx` → `['services']`
- `app/(manager-flow)/profil/saatler.tsx` → `['settings']`
- `app/(manager-flow)/profil/personel.tsx` → `['staff','staff_time_off']`
- `app/(staff-flow)/customer.tsx` → `['customers','reservations','payments','treatment_plans','customer_packages']`

`useManagerRead` artık `options.tables` alıyor; verilmezse **her zil uyandırır**
(varsayılan bilerek "fazla tazele": kaçırılan değişiklik, gereksiz okumadan
pahalı).

**Testler**
- `tests/mobil-canli-sinyal.test.mjs` — 3 test KIRIKTI (eski `liveSignal`
  şeklini kilitliyordu), yeni gerçeğe göre güncellendi → 20/20
- `tests/mobil-canli-zil-genis.test.mjs` — **YENİ, 11 test**. En değerlisi
  *çapraz doğrulama*: bir ekranın süzgecinde yazan her tablo adının gerçekten
  zili olmalı. Yazım hatası olursa o ekran sessizce canlılıktan düşerdi ve
  hiçbir şey şikâyet etmezdi.
- `tests/mobile-mudur-olustur-canli.test.mjs` — `{ poll: false }` iddiası artık
  süzgeci de hesaba katıyor

---

## Bölüm B — Bildirim (Expo Push) TUR 1

### Sorun neydi

Sunucuda push altyapısı `037`'den beri duruyordu ama **yanlış kanalda**:
`send-push` `web-push@3.6.7` + VAPID kullanıyor — bu tarayıcı/PWA protokolü ve
**native iOS/Android'de çalışmaz**. Mobilde ise hiçbir şey yoktu:
`expo-notifications` kurulu değil, `eas.json` yok, `extra.eas.projectId` yok.

Yani iş "sıfırdan bildirim yazmak" değildi: **mevcut boruya ikinci kanal
eklemek**. Tetikleyiciler, hedefleme sözleşmesi
(`target: {staffId} | {role:'manager'}`), `remind`'ın "15 dk kala" bloğu ve
`_shared/notify.ts` aynen yerinde kaldı.

### Yeni migration'lar (ÇALIŞTIRILMADI)

**`supabase/103_push_expo_kanali.sql`**
- `push_subscriptions`'a `kind` (`'web'|'expo'`, varsayılan `'web'`),
  `platform`, `device_id`
- `p256dh`/`auth` NOT NULL düşürüldü; garanti `push_subscriptions_shape`
  CHECK'iyle `kind`'a bağlı olarak geri verildi
- `idx_push_subs_org_kind`, ve `(organization_id, device_id)` üzerinde
  **kısmi tekil indeks** (`where kind='expo'`)
- **Mevcut web abonelikleri sıfır veri taşımasıyla çalışmaya devam ediyor**

> `device_id` neden var: `endpoint` (jeton) elde OLMADIĞI iki an var ve ikisi de
> tam olarak satırı silmemiz gereken an — (1) izin OS ayarından geri alındı,
> jeton üretilemiyor; (2) çıkışta ağ yoktu, iş bekliyor. Ortak telefonda bunun
> bedeli somut: ayrılan personelin bildirimleri yeni personelin elinde çalar.

**`supabase/104_push_ilk_ad.sql`**
- Bildirim gövdesi artık **tam ad değil ilk ad**:
  `split_part(COALESCE(NEW.customer_name,''),' ',1)`
- Gerekçe: salonda telefon tezgâhta duruyor, kilit ekranı herkese açık. KVKK'da
  veri sorumlusu salonun kendisi.
- `046`'nın olay listesine DOKUNMADI (yöneticiye push hâlâ yok — Tur 2'de
  açılacak)

### `supabase/functions/send-push/index.ts` — yeniden yazıldı

**Düzeltilen canlı hata (bu en önemlisi):**
```ts
// ESKİ: const { data: subs } = await q;   ← error HİÇ OKUNMUYORDU
// Sorgu patlayınca 200 + "no_subscribers" dönüyordu: bütün salon sessizce
// bildirimsiz kalır ve HİÇBİR YERDE İZ OLMAZDI.
const { data: subs, error: subsErr } = await q;
if (subsErr) { console.error(...); return json({ error: 'lookup_failed' }, 500); }
```

Diğer değişiklikler:
- **VAPID kapısı web dalının İÇİNE** taşındı (başta olduğu için VAPID'siz
  kurulumda Expo bildirimleri de ölüyordu)
- Expo dalı: `https://exp.host/--/api/v2/push/send`, 100'lük gruplar, biletler
  `to` dizisiyle aynı sırada eşleniyor
- **Yalnız `DeviceNotRegistered` satır siliyor.** `MismatchSenderId` ve
  `InvalidCredentials` sunucu yapılandırma arızası — silseydik tek yanlış
  anahtar salonun BÜTÜN aboneliklerini yok ederdi
- Tek satırlık log: `push org=… target=staff web=0/0 expo=1/1 pruned=0`
- **Çağıranların sözleşmesi değişmedi** — gövde, `x-push-secret`,
  `{sent, pruned, total}` aynen

### `supabase/functions/staff-api/index.ts` — iki yeni action

Personelin Supabase oturumu YOK, bu yüzden `push-subscribe` (JWT ister)
telefondan çağrılamıyor.

| Action | Yer | Not |
|---|---|---|
| `push.register` | Personel kapısından **sonra** | Cihaz jetonu 403 alır. `staff_id`/`organization_id` **token'dan**, gövdeden asla. Jeton biçimi regex ile doğrulanıyor → açık 400. Önce `device_id` ile eski satır siliniyor, sonra `onConflict: 'endpoint'` upsert (iki tekillik kısıtı var, tek ifadeye sıkıştırılamaz). |
| `push.unregister` | Personel kapısından **önce** | **Cihaz jetonunu da kabul ediyor** — çıkışta personel jetonu silindiği için bekleyen silme işi ancak böyle tamamlanabiliyor. `staff_id`'ye bakmıyor: çıkışın anlamı "bu telefon artık kimsenin değil". |

### `supabase/functions/remind/index.ts`
- "15 dk kala" bildiriminde de ilk ad (`firstName()` yardımcısı eklendi)

### Mobil — yeni dosyalar

**Saf karar katmanı** (React'siz, testten gerçekten çağrılıyor):

| Dosya | İş |
|---|---|
| `mobile/src/lib/pushRoute.ts` | Sunucunun masaüstü adresini telefon rotasına çeviriyor. **BEYAZ LİSTE** — dizge birleştirme YOK. Tanınmayan hedef `null`. |
| `mobile/src/lib/pushIntent.ts` | Dokunulan bildirimin hedefini TUTUYOR; kabuk hazır olunca bir kez tüketiliyor. TTL 120 sn, rol uyuşmazlığında düşüyor. |
| `mobile/src/lib/pushPermission.ts` | Altı hâl: `unsupported/undetermined/granted/denied/missing/error`. `error` asla `denied` gibi çizilmiyor. |
| `mobile/src/lib/pushRegistration.ts` | `shouldRegister` / `shouldUnregister`. Jeton veya personel değiştiyse yaz; 7 günde bir tazele. |

**Bağlayıcı katman:**

| Dosya | İş |
|---|---|
| `mobile/src/lib/pushDevice.ts` | `deviceIdOnce()` — SecureStore'da kurulum başına UUID |
| `mobile/src/lib/push.ts` | `readPushState`, `askPushPermission`, `syncPush`, `unregisterPush`, `flushPendingUnregister` |
| `mobile/src/lib/pushSetup.ts` | İşleyici (banner + SES, rozet yok), Android `randevu` kanalı, `usePushIntent` |
| `mobile/src/components/PushPrompt.tsx` | Bugün ekranındaki izin ön-sorusu (amber, kapatılabilir) |

**Değiştirilen dosyalar:**
- `mobile/app.json` — `android.package: "ai.luera.timeflow"` (YOKTU),
  `expo-notifications` eklentisi (ikon: mevcut `android-icon-monochrome.png`,
  renk `#FF5A1F`, kanal `randevu`)
- `mobile/eas.json` — **YENİ** (development / preview / production profilleri)
- `mobile/src/api/staff.ts` — `api.pushRegister` / `api.pushUnregister`.
  **`call()` kullanıldı, `write()` DEĞİL**: kuyruğa giren bir kayıt saatler
  sonra boşalırsa çıkış yapmış personelin jetonunu diriltir
- `mobile/src/api/auth.ts` — `signOut` ve `unlinkDevice` aboneliği koparıyor
  (sıra şart: jeton silinmeden ÖNCE)
- `mobile/src/lib/backgroundSync.ts` — turun sonunda `syncPush`
- `mobile/src/lib/me.ts` — `myStaffId()` eklendi; **müdür oturumunda `null`
  döner** (müdürün `profile.id`si Supabase kullanıcı kimliği, `staff.id` değil)
- `mobile/src/lib/staffShift.ts` — `NOTIFICATION_FOOT` yeni gerçeğe göre
- `mobile/app/_layout.tsx` — `import '../src/lib/pushSetup'`
- `mobile/app/personel/_layout.tsx`, `mobile/app/mudur/_layout.tsx` —
  `usePushIntent(actor, gate.state === 'allowed')`
- `mobile/app/personel/index.tsx` — `<PushPrompt />`
- `mobile/app/personel/profile.tsx` — "Bildirimler" **durum satırı**
  (anahtar DEĞİL)

**Yeni testler:**
- `tests/push-expo-kanali.test.mjs` — 17 test (sunucu)
- `tests/mobil-push-karar.test.mjs` — 20 test (saf kararlar, çalıştırılarak)
- `tests/mobil-push-baglanti.test.mjs` — 14 test (bağlantılar, kaynak metni)
- `tests/staff-pin-setup.test.mjs` — `unlinkDevice` iddiası güncellendi

---

## Bölüm C — Karar ve kapsam değişiklikleri

### Kullanıcının verdiği altı karar

1. **Müdüre de push gidecek.** `046_push_only_staff.sql` "yöneticiye
   GÖNDERİLMEZ" diyor — o karar müdür tarayıcıdayken alınmıştı, **Tur 2'de geri
   alınıyor**. `046`'ya bakıp "müdüre push yok" diye karar verme.
2. **Bildirimde yalnız ilk ad.**
3. **Uygulama açıkken banner + SES.** (Önerim sessizdi; kullanıcı sesi seçti.
   Teknik olarak da doğru çıktı: Android'de `shouldPlaySound: false` verilince
   açılır uyarı hiç görünmüyor.)
4. **Rozet yok.**
5. **İzin ön-soruyla**, Bugün ekranındaki kapatılabilir kartla.
6. **Gün sonu özeti + sessiz saatler kapsam DIŞI** (dış zamanlayıcı gerekiyor,
   `pg_cron` yok — n8n kullanılıyor).

### İptal edilen iş

**Bildirim tasarım turu iptal edildi.** Kullanıcı haklı olarak sordu:
"bildirimler zaten standart değil mi?" — Doğru. Bildirimin görünümünü OS
çiziyor, ayar ekranı zaten mevcut bileşenlerle (`SwitchRow`/`Group`/`Foot`)
çizili ve ekran dosyası yazılı. Geriye kalan tasarım değil **karar**dı; üç soru
sorulup cevaplandı. `docs/bildirimler-claude-design-prompt.md` dosyası duruyor
ama **kullanılmıyor** — istenirse silinebilir.

Kullanıcı ayrıca "hareket sözleşmesi genelde her şeyi bozuyor" dedi; bildirimde
hareket olmadığı için o ek zaten çıkarıldı.

### Kapsam ayarı

**Müdürün jeton kaydı Tur 1'den Tur 2'ye alındı.** Müdür olayları olmadan
jetonu kaydetmek gözle görülür hiçbir şey üretmiyordu. Müdür tarafının derin
bağlantı yolu (`pushRoute` haritası + `usePushIntent`) şimdiden kurulu.
