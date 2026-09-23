> **DURUM: UYGULANDI (2026-09-23).** Bu dosya artık plan değil, YAPILANIN
> kaydı. Kod ve testler yerinde; `02-SIRADAKI-ADIMLAR.md` Adım 12-20 doğrulama
> listesi. Planda `105`/`106` diye anılan migration numaraları gerçekte de
> `105_bildirim_tercihleri.sql` ve `106_mudur_push_geri.sql` oldu.

# TUR 2 — Müdür bildirimleri, tercihler, ayar ekranı

**Ön koşul:** Tur 1 doğrulaması geçmiş olmalı (`02-SIRADAKI-ADIMLAR.md` · Adım
5). Personelin telefonuna gerçek bildirim düşmeden müdür tarafını açmak,
çalışmayan bir şeyin üstüne ikinci bir katman koymak olur.

---

## Hedef

Müdürün telefonuna **üç olay** düşsün, müdür bunları **kendi profilinden
kapatabilsin**, ve kapattığı gerçekten gitmesin.

| Olay | Tetik | Ayar anahtarı |
|---|---|---|
| Yeni randevu talebi | `INSERT`, `status='pending'` | `booked` |
| Randevu iptal edildi | `UPDATE` → `cancelled` | `cancelled` |
| Adisyon kasada | `service_ended_at` ilk kez dolu + `is_paid=false` | `cash` |

> **`noshow` ve `daily` listeye GİRMİYOR.** Bugünkü `NOTIFICATIONS` dizisinde
> (`mobile/src/lib/managerProfile.ts`) var ama **sunucuda karşılıkları yok**:
> "müşteri gelmedi" telefonda saatten hesaplanıyor, gönderilecek bir an yok;
> gün sonu özeti dış zamanlayıcı istiyor. Karşılığı olmayan anahtar çizilmez —
> ikisi de `NOTIFICATIONS`'tan çıkarılacak.

---

## 2.1 · `supabase/105_bildirim_tercihleri.sql`

```sql
alter table public.settings
    add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
```

**Neden ayrı tablo değil:** `settings` satırı zaten var, org sahibinin satırını
çözme mantığı zaten yazılı (`settingsMap.ts` + `staff-api` · `orgSettings()`),
okuma/yazma yolu (`fetchOrgSettings` / ayar yazma) zaten kurulu. Yeni tablo =
yeni RLS + yeni indeks + yeni okuma yolu; dört boolean için fazla.

**Personelin tercihi tabloda TUTULMAYACAK.** Personelin "bildirimler kapalı"sı
= jeton kaydının silinmesi. Tek ana anahtar, tek gerçek. Personele giden dört
olayın hepsi kendi randevusuyla ilgili ve hepsi iş; seçmeli kapatmak personeli
kendi gününe karşı körleştirirdi.

---

## 2.2 · `supabase/106_mudur_push_geri.sql`

`046`'nın çıkardığı iki müdür olayı geri geliyor, `cancelled` olayına müdür
hedefi ekleniyor. Her `send-push` çağrısının gövdesine **`pref` alanı**
konuyor:

```sql
'payload', jsonb_build_object(... ),
'pref', 'booked'      -- 'booked' | 'cancelled' | 'cash'
```

Dosyanın başlığı **`046`'nın neden geri alındığını** anlatmalı: o karar müdür
tarayıcıdayken alındı, artık native uygulaması var (kullanıcı kararı
2026-09-23).

`104`'ün ilk-ad kuralı korunacak — yeni olaylar da `v_who` kullanmalı.

---

## 2.3 · `send-push` — tercih kapısı

```ts
if (pref) {
    const prefs = await readOrgPrefs(admin, organization_id);
    // OKUNAMAZSA ya da ANAHTAR YOKSA GÖNDERİLİR.
    // `managerWrite.writesPaused` ile aynı kural: bir ağ/şema boşluğu bütün
    // salonu sessize almamalı. Yokluk "kapalı" demek değil.
    if (prefs && prefs[pref] === false) return json({ sent: 0, note: 'pref_off' }, 200);
}
```

**Neden trigger içinde değil:** "org sahibinin ayar satırı hangisi" mantığını
(`organizations.owner_id` → `settings.user_id`, sahipsizse en eskiye düş)
PL/pgSQL'de ikinci kez yazmak gerekirdi ve her yeni olay onu tekrar yazardı.
`send-push`'ta tek yerde, tek sorguda, test edilebilir.

**Personel kanalı sıfır etkilenir:** `pref` yalnız müdür hedefli çağrılara
konuyor; personel olayları `pref` taşımıyor → kapı hiç çalışmıyor.

---

## 2.4 · Müdürün jeton kaydı — `push-subscribe` genişletiliyor

Yeni uç AÇILMIYOR. `push-subscribe` zaten Supabase JWT doğruluyor ve org'u
`organization_members`'tan çözüyor; müdürün oturumu var.

```
{ action: 'subscribe', kind: 'expo', token, platform, deviceId, role: 'manager' }
{ action: 'unsubscribe', deviceId }     // endpoint yerine deviceId de kabul
{ action: 'status', deviceId }
```

`config` aksiyonu aynen kalıyor (web istemcisi VAPID public key'i kullanıyor).

**Mobil taraf:** ayrı dosya AÇILMADI — `mobile/src/lib/push.ts` içinde
`syncManagerPush()` / `unregisterManagerPush()` olarak duruyor, personel
yolunun yanında. İki kimlik sistemi iki fonksiyon; ama aynı dosyada, çünkü
jeton okuma ve izin kontrolü ikisinde de ortak.

`mobile/src/lib/push.ts` · `syncPush` müdür yolunu da bilmeli: bugün
`myStaffId()` müdürde `null` dönüyor ve kayıt atlanıyor. Müdür için ayrı bir
dal gerekiyor (org + `role:'manager'`, `staff_id` YOK).

---

## 2.5 · `_shared/notify.ts` canlanıyor — DİKKAT

`notifyOwner()`'ın **8 çağrı yeri** var (`booking-manage`, `whatsapp-booking`
×5, `dodo-webhook`) ve bugün hiçbiri bir yere ulaşmıyor (046 müdür
aboneliklerini sildi).

Açılmadan önce **metinleri ve url'leri tek tek denetle**. Bilinen sorun:
url'lerin hepsi **masaüstü rotası** — `/takvim?date=`, `/mesajlar`,
`/settings?tab=billing`. Son ikisinin mobilde karşılığı **YOK**.

`pushRoute.ts` haritası bunları zaten `null`'a düşürüyor (kabuk kökü açılır,
uydurma rota denenmez). Ama **metinler** müdüre uygun mu, ayrıca bakılmalı;
uygun olmayan çağrı susturulur.

---

## 2.6 · Mobil — müdür ayar ekranı

**Bayrağı aç:** `mobile/src/lib/managerProfile.ts:262` →
`MANAGER_NOTIFICATIONS_READY = true`, yorumu yeniden yaz (neyin ne zaman
açıldığı, `105`/`106`'ya atıfla).
`mobile/app/(manager-flow)/profil/bildirimler.tsx`'teki `Redirect` kalkar.

**Anahtar listesini gerçeğe uydur:** `NOTIFICATIONS` →
`booked | cancelled | cash`. `noshow` ve `daily` çıkar.
`notificationsSummary()` ve `NOTIFICATION_FOOT` metinleri güncellenir.

**Sahte kaynağı sil:** `mobile/src/lib/salonSettings.ts` içindeki
`readNotifications` / `setNotification` **bellekte** tutuyor
(`let NOTIFY = {...}`). Silinecek — yerinde bırakılırsa aynı gerçeğin iki
kaynağı olur.

**Yeni saf dosya** `mobile/src/lib/notificationPrefs.ts` (React'siz):
- `prefsOf(raw, keys)` — **her zaman dolu bir kayıt döner.** Planda `null`
  (okunamadı) dönmesi yazılmıştı; uygulamada öyle yapılmadı çünkü "okunamadı"
  hâlini `useManagerRead` zaten `state`/`refusal` ile taşıyor. İki yerde iki
  ayrı "bilinmiyor" tutmak, ikisinin bir gün çelişmesi demekti.
- `prefsPatchOf(key, value, current)` — yazılacak JSONB; **bilinmeyen anahtarlar
  korunur** (`settingsMap`'in dersi)
- `PREF_DEFAULT` (planda `DEFAULT_PREFS`) — **sunucudaki fail-open kuralıyla
  AYNI**, yoksa ekran "kapalı" der sunucu gönderir

**Okuma/yazma:**
- `managerSource.ts` → `fetchNotificationPrefs()`
- `managerWrite.ts` → `saveNotificationPref(key, value)`, **ilk satırı
  `if (await writesPaused()) return { ok:false, kind:'paused' }`**
- `bildirimler.tsx` gerçek durum makinesine bağlanır:
  `loading | ok | error` + `refusal`. "Okunamadı" asla "kapalı" çizilmez.

**İzin durumu ekranda ayrı görünmeli** — anahtar tek başına "açık" diyemez.
Personel profilindeki desenle aynı: `permissionText(push)` +
`Linking.openSettings()`.

---

## 2.7 · Testler

**Yeni:** `tests/mobil-push-tercihler.test.mjs`
- Süzgeç `send-push` içinde, trigger'da değil
- Kapalı anahtar → `note: 'pref_off'`
- **Okunamayan tercih GÖNDERİYOR** (fail-open) — bu en önemli iddia
- `DEFAULT_PREFS` ile sunucunun varsayılanı aynı
- Karşılığı olmayan anahtar ekranda YOK (`noshow`, `daily`)
- `salonSettings.ts`'te sahte fonksiyonlar kalmamış

**Güncellenecek bariyer:** `tests/mobile-mudur-ayarlar-canli.test.mjs:188-193`
bugün şunları iddia ediyor ve **hepsi ters dönecek**:
```js
assert.equal(MANAGER_NOTIFICATIONS_READY, false);
assert.match(profile, /\{MANAGER_NOTIFICATIONS_READY \? \(/);
assert.match(notifyScreen, /if \(!MANAGER_NOTIFICATIONS_READY\) return <Redirect/);
assert.match(read('supabase/046_push_only_staff.sql'), /GÖNDERİLMEZ/i);
```
**Bariyer kaldırılmıyor, yön değiştiriyor:** yeni hâli `true` olduğunu, ekranın
gerçek kaynağa bağlandığını ve `106`'nın `046`'yı neden geri aldığını
doğrulamalı.

---

## 2.8 · Kullanıcının çalıştıracakları (Tur 2)

```bash
# 1) Migration
cd /Users/furkanulger/Projects/luera-timeflow && cat supabase/105_bildirim_tercihleri.sql supabase/106_mudur_push_geri.sql | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -f -'
```

```bash
# 2) Fonksiyonlar
cd /Users/furkanulger/Projects/luera-timeflow && ./scripts/deploy-functions.sh send-push push-subscribe
```

Mobil değişiklikler için **yeni derleme gerekmez** — JS tarafı Expo üzerinden
gider (native eklenti eklenmediği sürece).

---

## 2.9 · Tur 2 doğrulaması

1. Müdür telefonunda izin verilmiş, `push_subscriptions`'ta
   `role='manager', kind='expo'` satırı var
2. Web'den ya da WhatsApp'tan yeni randevu talebi → müdüre bildirim
3. Randevu iptal → bildirim
4. Bir işlem bitir, ödeme alma → "Adisyon kasada" bildirimi
5. Profil → Bildirimler → **"Randevu iptali"ni kapat** → aynı olay artık
   bildirim getirmemeli, diğer ikisi gelmeli
6. Sunucu logunda `note=pref_off`
7. ```sql
   select notification_prefs from settings where user_id = '<sahip>';
   ```

---

## Tur 2'den SONRA sırada ne var

`06-BORC-DEFTERI.md`'deki maddeler. Öncelik sırası kullanıcının kararı, ama
mantıklı sıra:

1. Küçük doğruluk hataları (Kasa'daki ölü "Gün sonu", ₺0 adisyon, müşteri
   defterinde sayılmayan no-show'lar)
2. Masaüstü kararı: elle randevu `confirmed` yazılsın mı
3. Mağaza hazırlığı: demo salon → App Store görselleri → Sentry → yayın
4. Gün sonu özeti + sessiz saatler (n8n workflow'u gerekiyor)
