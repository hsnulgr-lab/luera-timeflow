# KOMUTLAR

Hepsini **kullanıcı** çalıştırır.

---

## Yerel kontroller (Claude da çalıştırabilir)

```bash
cd /Users/furkanulger/Projects/luera-timeflow && node --test tests/*.test.mjs
```

Yalnız özet:
```bash
cd /Users/furkanulger/Projects/luera-timeflow && node --test --test-reporter=tap tests/*.test.mjs 2>&1 | grep -E "^# (tests|pass|fail|skipped)|^not ok"
```

Tip kontrolü:
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx tsc --noEmit
```

Lint — **taban 462 hata**, bu sayı artmamalı:
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx eslint . 2>&1 | tail -3
```

Masaüstü tip kontrolü:
```bash
cd /Users/furkanulger/Projects/luera-timeflow && npx tsc --noEmit
```

---

## SQL çalıştırma

Genel kalıp (dosyayı stdin'den veriyor):

```bash
cd /Users/furkanulger/Projects/luera-timeflow && cat supabase/DOSYA.sql | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -f -'
```

Bekleyen üç migration birlikte:

```bash
cd /Users/furkanulger/Projects/luera-timeflow && cat supabase/101_live_doorbell_wide.sql supabase/103_push_expo_kanali.sql supabase/104_push_ilk_ad.sql | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -f -'
```

Tek sorgu çalıştırmak:

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 "docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -c \"select kind, count(*) from push_subscriptions group by kind;\""
```

> **`-U supabase_admin` şart.** `postgres` rolü burada SUPERUSER değil, tablolar
> `supabase_admin`'e ait.

---

## Edge function deploy

```bash
cd /Users/furkanulger/Projects/luera-timeflow && ./scripts/deploy-functions.sh send-push staff-api remind
```

Argümansız çalıştırmak **hepsini** gönderir:
```bash
cd /Users/furkanulger/Projects/luera-timeflow && ./scripts/deploy-functions.sh
```

Sunucu logu:
```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker logs --tail 60 $(docker ps --filter name=edge -q)'
```

---

## Mobil

Expo geliştirme sunucusu (Expo Go — **bildirim testi için YETMEZ**):
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx expo start -c
```

EAS projesi (bir kere):
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx eas-cli init
```

Geliştirme derlemesi:
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx eas-cli build --profile development --platform ios
```

Android (ücretsiz, Apple hesabı gerekmez):
```bash
cd /Users/furkanulger/Projects/luera-timeflow/mobile && npx eas-cli build --profile development --platform android
```

---

## Git

**Önce lisans** (bugün `git` bunun yüzünden hiç çalışmıyor):
```bash
sudo xcodebuild -license
```

Durum:
```bash
cd /Users/furkanulger/Projects/luera-timeflow && git status --short
```

Commit — **yalnız kullanıcı açıkça isterse**:
```bash
cd /Users/furkanulger/Projects/luera-timeflow && git add -A && git commit -m "bildirim: Expo push kanalı (Tur 1) + canlı zil tablo süzgeçleri"
```

> Push KİLİTLİ: GitHub SSH anahtarı yok, token geçersiz. ~94 commit yalnız
> yerelde. Kullanıcı bunu bilerek sona bıraktı.

---

## Sunucu sağlığı

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker ps --format "{{.Names}}\t{{.Status}}"'
```

```bash
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'free -h; df -h /'
```

> VPS bir kez bellek tükenmesinden dondu (2026-09-11); 8 GB takas eklendi.
> `evolution-api` konteyneri zombi süreç sızdırıyor.
