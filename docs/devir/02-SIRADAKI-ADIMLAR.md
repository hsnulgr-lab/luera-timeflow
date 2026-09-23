# SIRADAKİ ADIMLAR

Hepsini **kullanıcı** çalıştırır. Claude komutu hazırlar, çalıştırmaz.

---

## ⚠️ SIRA ÖNEMLİ

Migration'dan ÖNCE fonksiyon deploy edilirse, yeni fonksiyon olmayan kolonu
sorar, sorgu düşer ve — `send-push` düzeltilene kadar — **bütün bildirimler
sessizce kaybolur**. O hata bu turda düzeltildi ama sıraya yine de uyulmalı.

```
1. eas init  →  2. SQL (101-106)  →  3. fonksiyon deploy  →  4. derleme
```

---

## Adım 0 · Git'i aç (bir kere)

`git` şu an çalışmıyor, Xcode lisansı onaylanmamış. Commit aşamasına gelmeden
gerekli:

```bash
sudo xcodebuild -license
```

---

## Adım 1 · EAS projesi

Expo hesabına giriş isteyecek. `mobile/app.json` içine
`extra.eas.projectId` yazacak — **bu olmadan Expo push jetonu alınamaz.**

```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx eas-cli init
```

> `projectId` bir kez üretilir. Sonradan değişirse bütün jetonlar ölür — bu
> yüzden ilk adım.

---

## Adım 2 · Altı migration

**Dördü de bekliyor:**
- `101` — canlı zilin 9 tabloya yayılması (önceki oturumda yazıldı)
- `102` — silinen tahsilatın denetim kaydı (2026-09-22'den beri bekliyor,
  bu işle ilgisi yok ama sırada; saf DB tetikleyicisi, deploy istemiyor)
- `103` — Expo kanalı
- `104` — bildirimde yalnız ilk ad
- `105` — müdürün bildirim tercihleri (`settings.notification_prefs`)
- `106` — müdüre bildirim geri açılıyor (`046` tersine dönüyor)

```bash
cd /Users/furkanulger/Projects/luera-timeflow && cat supabase/101_live_doorbell_wide.sql supabase/102_payment_void_log.sql supabase/103_push_expo_kanali.sql supabase/104_push_ilk_ad.sql supabase/105_bildirim_tercihleri.sql supabase/106_mudur_push_geri.sql | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -f -'
```

> **YEDEK AL.** `103` NOT NULL düşürüp CHECK ekliyor. Geri alma yolu
> `07-GERI-ALMA.md`'de yazılı ama önce yedek:
> ```bash
> ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt pg_dump -U supabase_admin -d postgres -t public.push_subscriptions' > ~/Desktop/push_subscriptions_yedek.sql
> ```

### Doğrulama sorguları

Zili olan tablolar (11 bekleniyor):
```sql
select c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where t.tgname like 'ring_on_%' and not t.tgisinternal order by 1;
```

Yeni kolonlar:
```sql
select column_name, is_nullable from information_schema.columns
 where table_name = 'push_subscriptions'
   and column_name in ('kind','platform','device_id','p256dh','auth');
```

Tetikleyicinin sırları — **ikisi de yoksa hiçbir bildirim gönderilmez ve hata
da vermez**:
```sql
select key from public.app_secrets
 where key in ('FUNCTIONS_BASE_URL','PUSH_TRIGGER_SECRET');
```

Fonksiyonda tam ad kalmadı mı:
```sql
select count(*) from pg_proc
 where proname = 'notify_push_on_reservation' and prosrc like '%split_part%';
-- beklenen: 1
```

---

## Adım 3 · Dört edge function

`101` ve `102` edge deploy'u GEREKTİRMİYOR; kalanı için bunlar şart.
`push-subscribe` müdürün jetonunu alıyor (106).

```bash
cd /Users/furkanulger/Projects/luera-timeflow && ./scripts/deploy-functions.sh send-push staff-api remind push-subscribe
```

---

## Adım 4 · Geliştirme derlemesi

**Expo Go ile bu iş doğrulanamaz** — SDK 53'ten beri uzak bildirim Expo Go'da
çalışmıyor, iOS Simülatörü de jeton üretemiyor.

```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx eas-cli build --profile development --platform ios
```

Derleme bitince telefona kurulur. *Daha ucuz ilk deneme isterse:*
`--platform android` (Play Services'li emülatör FCM push alabiliyor, Apple
kimlik bilgisi akışına girmeden).

---

## Adım 5 · Uçtan uca doğrulama

Sırayla, telefonda:

1. Geliştirme derlemesi açık, **personel** PIN'iyle girilmiş
2. Bugün ekranında **"Bildirimler kapalı"** amber kartı çıkmalı → **Aç** →
   sistem izin diyaloğu → izin ver
3. Satır yazıldı mı:
   ```sql
   select kind, platform, staff_id, last_seen_at
     from push_subscriptions where kind = 'expo';
   ```
4. **Masaüstünden** o personele randevu ata → telefona bildirim düşmeli.
   Gövde **yalnız ilk adı** yazmalı ("Ayşe · Saç kesimi · 14:30")
5. Sunucu logunda: `push org=… expo=1/1 pruned=0`
   ```bash
   ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker logs --tail 40 supabase-edge-functions-t6yi63jbebvj6c7oo7yjofnt'
   ```
6. **Bildirime dokun** → `/personel/calendar` açılmalı
7. **Uygulamayı kapat**, masaüstünden randevuyu iptal et → bildirim düşmeli →
   dokun → uygulama açılıp `/personel`'e gitmeli *(soğuk açılış yolu)*
8. Uygulama AÇIKKEN aynı olay → banner + ses
9. Profil → **Bildirimler** satırı "Bildirimler açık" demeli
10. **Çıkış yap** → satır silinmeli:
    ```sql
    select count(*) from push_subscriptions where kind = 'expo';
    -- beklenen: 0
    ```
11. Uygulamayı sil, yeniden kur, gir → **iOS'ta** yine tek satır
    (Keychain uninstall'ı atlatıyor). **Android'de iki satır normal**: orada
    kimlik uygulamayla gidiyor, eski satır ilk gönderimde
    `DeviceNotRegistered` ile budanıyor. Android'de test ediyorsan bu adımı
    "bir olay sonra tek satır" diye oku.

### Müdür tarafı (Tur 2)

Personel doğrulaması geçtikten sonra, **müdür oturumuyla**:

12. Profil → **Bildirimler** satırı artık görünmeli (eskiden gizliydi)
13. Ekranda üç anahtar: Yeni randevu · Randevu iptali · Adisyon kasada.
    **`Müşteri gelmedi` ve `Gün sonu özeti` OLMAMALI** — sunucuda karşılıkları yok
14. İlk anahtarı aç → izin sorulmalı → izin ver → altta "TELEFON İZNİ" grubu
    "Bildirimler açık" demeli
15. Satır yazıldı mı:
    ```sql
    select role, kind, staff_id from push_subscriptions where role = 'manager';
    ```
16. Web'den ya da WhatsApp'tan yeni randevu talebi → müdüre bildirim
17. Bir randevuyu iptal et → müdüre bildirim (personele de ayrıca gider)
18. Bir işlemi bitir, ödeme alma → "Adisyon kasada" bildirimi
19. **"Randevu iptali"ni kapat** → aynı olay artık bildirim getirmemeli,
    diğer ikisi gelmeli. Logda `pref=cancelled atlandı`
20. Tercih gerçekten yazıldı mı:
    ```sql
    select notification_prefs from settings where organization_id = '<org>';
    ```

### Bir şey çalışmazsa bakılacak sıra

| Belirti | Bak |
|---|---|
| Kart hiç çıkmıyor | İzin zaten sorulmuş olabilir (`tf.push.prompt`). Profil satırından bak. |
| İzin verildi ama satır yok | `extra.eas.projectId` var mı? Profil satırı "Bildirim kurulumu eksik" diyorsa yok. |
| Satır var, bildirim gelmiyor | `app_secrets` sırları (Adım 2) + `docker logs` |
| `no_subscribers` dönüyor | Hedef `staff_id` doğru mu; randevunun personeli atanmış mı |
| `lookup_failed` 500 | Migration çalışmamış — Adım 2'ye dön |
| Müdür anahtarı kapattı ama bildirim geliyor | `send-push` deploy edilmiş mi; `settings.notification_prefs` gerçekten yazılmış mı |
| Müdür anahtarı açık ama bildirim gelmiyor | Önce izin (ekrandaki "TELEFON İZNİ" satırı), sonra `role='manager'` satırı var mı |

---

## Adım 6 · Sonra ne olacak

Yukarıdaki 20 adım geçtiğinde **bildirim işinin tamamı** bitmiş olur —
Tur 1 (personel) ve Tur 2 (müdür) kodu birlikte yazıldı, birlikte doğrulanıyor.

Sonrası `06-BORC-DEFTERI.md`: küçük doğruluk hataları, masaüstü `pending`
kararı, mağaza hazırlığı.

Kullanıcı isterse önce commit atılır (bkz. `05-KOMUTLAR.md`).
