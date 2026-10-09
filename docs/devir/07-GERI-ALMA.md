# GERİ ALMA

Bir şey ters giderse. Hepsini **kullanıcı** çalıştırır.

---

## Önce yedek

`103` NOT NULL düşürüp CHECK ekliyor — tablo yapısını değiştiren tek migration.
Çalıştırmadan önce:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt pg_dump -U supabase_admin -d postgres -t public.push_subscriptions' > ~/Desktop/push_subscriptions_yedek.sql
```

`101`, `102` ve `104` yalnız tetikleyici/fonksiyon ekliyor — veri riski yok.

---

## 104 · Bildirim metni geri alma

`046`'yı yeniden çalıştırmak yeterli: aynı fonksiyonu `CREATE OR REPLACE` ile
eski hâline döndürüyor (tam ad geri gelir).

```bash
cd /Users/furkanulger/Projects/luera-timeflow && cat supabase/046_push_only_staff.sql | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -f -'
```

> `046` sonunda `DELETE FROM push_subscriptions WHERE role = 'manager'` var.
> Tur 2'den sonra geri alırsan müdür aboneliklerini siler — o aşamada bu
> dosyayı ham hâliyle çalıştırma.

---

## 103 · Expo kanalını geri alma

**Sıra önemli:** `expo` satırları silinmeden NOT NULL geri konamaz.

```sql
begin;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_shape;

-- Expo satırlarında p256dh/auth NULL; NOT NULL'u geri koymadan önce gitmeli.
delete from public.push_subscriptions where kind = 'expo';

alter table public.push_subscriptions alter column p256dh set not null;
alter table public.push_subscriptions alter column auth   set not null;

drop index if exists uq_push_subs_device;
drop index if exists idx_push_subs_org_kind;

alter table public.push_subscriptions drop constraint if exists push_subscriptions_kind_check;
alter table public.push_subscriptions
    drop column if exists device_id,
    drop column if exists platform,
    drop column if exists kind;

commit;
notify pgrst, 'reload schema';
```

**`send-push`'ı da eski hâline döndür**, yoksa olmayan `kind` kolonunu sorar:

```bash
cd /Users/furkanulger/Projects/luera-timeflow && git checkout HEAD -- supabase/functions/send-push/index.ts && ./scripts/deploy-functions.sh send-push
```

> `git` çalışmıyorsa (Xcode lisansı) önce `sudo xcodebuild -license`.

---

## 102 · Tahsilat denetim kaydını geri alma

```sql
drop trigger if exists trg_payment_void_log on public.payments;
-- Tablo dursun: içindeki kayıtlar silinen tahsilatların TEK izi.
```

---

## 101 · Zili daraltma

Yalnız `reservations` ve `payments` kalsın (100'ün hâli):

```sql
do $$
declare t text;
begin
    foreach t in array array[
        'customers','services','staff','staff_time_off','settings',
        'treatment_plans','package_templates','customer_packages','products'
    ] loop
        execute format('drop trigger if exists ring_on_%1$s on public.%1$I', t);
    end loop;
end $$;
```

Telefon tarafında bir şey yapmaya gerek yok: tablo süzgeci olan ekranlar zili
duymaz olur, yoklama (25 sn) devralır — hiçbir ekran bozulmaz, yalnız yavaşlar.

---

## Mobil tarafı geri alma

Bildirim kodunun tamamı **yeni dosyalarda** ve mevcut akışlara yalnız birkaç
satırla bağlı. Tümden geri almak gerekirse:

```bash
cd /Users/furkanulger/Projects/luera-timeflow && git status --short && git checkout HEAD -- mobile/
```

Kısmi kapatma (kod dursun, davranış gitsin) istenirse en ucuz yol:
`mobile/src/lib/push.ts` · `syncPush` başına `return 'unsupported';` koymak —
jeton hiç istenmez, hiç kaydedilmez, ekranlar "Bu cihaz bildirim alamıyor" der.
Yalan söylemez, sadece kapalıdır.

---

## Hiçbir şey çalışmıyorsa

Bildirim bir **hızlandırıcıdır, garanti değil**. `app_secrets`'tan
`PUSH_TRIGGER_SECRET`'ı silmek bütün push yolunu kapatır ve uygulama hiçbir
şey kaybetmeden çalışmaya devam eder (tetikleyiciler sırları bulamayınca
sessizce `RETURN NEW` yapıyor).

```sql
-- En büyük kapı. Geri açmak için değeri yeniden yazmak yeterli.
delete from public.app_secrets where key = 'PUSH_TRIGGER_SECRET';
```

---

# 108 · Tek kişilik kabuk — geri alma

**Göç yazılmadan önce taslaklandı, yazıldıktan sonra DARALTILDI** (2026-10-09).
İlk taslak `handle_new_user`'ı değiştirmeyi ve geri doldurma yapmayı
öngörüyordu; ikisinden de vazgeçildi (gerekçe göç dosyasının başında). Kalan
yüzey çok küçük:

| Ne yapıyor | Risk | Geri alma |
|---|---|---|
| `organizations.solo` kolonu | Yok — yeni kolon, varsayılan `false` | Kolonu düşür |
| `set_business_mode()` fonksiyonu | Düşük — yeni fonksiyon, kimse çağırmazsa etkisiz | Fonksiyonu düşür |
| Kayıt akışı (`handle_new_user`) | **Dokunulmuyor** | — |
| Mevcut hesaplar | **Dokunulmuyor** — hiçbiri `solo` olmuyor | — |

Göç çalıştıktan sonra bile, uygulama `set_business_mode`'u çağırmadığı
sürece hiçbir şey değişmiyor. Yani **göç tek başına geri alınmayı bile
gerektirmez**; geri alınacak şey, fonksiyonun açtığı satırlardır.

## SIRA: ÖNCE GÖÇ, SONRA UYGULAMA

Göç tek başına hiçbir davranışı değiştirmiyor ama **uygulama göçsüz
çalışamıyor.** `managerBusinesses()` org satırını `solo` kolonuyla okuyor ve
o işlev müdür girişinin ANA yolunda: kolon yoksa PostgREST 400 döner, giriş
"bağlantı yok" der ve kullanıcı ONLINE olduğu hâlde içeri giremez.

Yani `tek-kisilik` dalını canlı veritabanına karşı açmadan önce göç
çalışmalı. (Sebep artık konsola da düşüyor — `[giriş] salon listesi
okunamadı: column organizations.solo does not exist`.)

## Göçten ÖNCE — yedek

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt pg_dump -U supabase_admin -d postgres --no-owner | gzip' > ~/Desktop/timeflow_tek-oncesi.sql.gz
```

Doğrula — **dosya var demek yedek var demek değil**:

```bash
gzip -t ~/Desktop/timeflow_tek-oncesi.sql.gz && gunzip -c ~/Desktop/timeflow_tek-oncesi.sql.gz | grep -c '^CREATE TABLE'
```

Tablo sayısı **90'ın altındaysa durun**. 2026-10-09'da 91'di.

Cron yedeklerinin yaşadığını da gör:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'ls -lht /root/yedek/timeflow/ | head -5'
```

## 1 · Bir hesabı tek moddan çıkar (en hafif müdahale)

Kabuk yanlış açılıyorsa önce bunu dene. Veri silmiyor:

```sql
update public.organizations set solo = false where id = '<org_id>';
```

Uygulama bir sonraki açılışta müdür kabuğuna döner. Açılmış personel satırı
yerinde kalır ve müdür kabuğunda normal bir personel olarak görünür —
zararsız, hatta doğru: sahip de çalışıyor.

## 2 · Açılan personel satırını geri al

**Toplu silme yok.** Satıra bir randevu ya da tahsilat bağlanmış olabilir;
silmek veri koparır. Yalnız hiç kullanılmamış olanlar:

```sql
begin;

delete from public.staff s
where not exists (select 1 from public.reservations r where r.staff_id = s.id)
  and not exists (select 1 from public.payments    p where p.staff_id = s.id)
  and s.created_at >= '2026-10-09';

-- Kullanılanlar DURUYOR, bilerek. Kaç tane kaldığını gör:
select count(*) as kullanimda_kalan from public.staff where created_at >= '2026-10-09';

commit;
```

Tarihi göçü çalıştırdığın güne göre düzelt.

## 3 · Fonksiyonu ve kolonu düşür

En son, ve yalnız **kod da geri alındıysa** — uygulama `solo` okuyorken
kolonu düşürmek "okunamadı" ekranı üretir.

```sql
drop function if exists public.set_business_mode(boolean, text);
alter table public.organizations drop column if exists solo;
notify pgrst, 'reload schema';
```

## Kod tarafı

```bash
git checkout main          # uygulama öncesi hâl
```

Dönüş noktası: **`tek-oncesi`** etiketi (`b4bc585`, testler 2696 geçti).
Tek dosya geri almak için: `git checkout tek-oncesi -- <dosya>`.

## Sıra önemli

**Kod önce, veritabanı sonra.** Uygulama `solo` okuyorken kolonu düşürmek
okuma hatası üretir; önce kodu eski hâline al, sonra şemayı.
