# Devir 11 · Giriş ekranı + Apple/Google — kaldığımız yer

**Başladı:** 2026-10-18 gece → 2026-10-19 sabaha karşı. Bu oturumun limiti
dolarsa yeni oturum BURADAN devam eder. Önce bu dosyayı, sonra
`docs/giris-kararlar.md`'yi oku (14 karar + Apple/Google değerleri).

Kullanıcının sırası: **masaüstü giriş bitecek → mobil (v4) → sonra Core+Dodo
(devir 10).**

## Durum — her adım bitince işaretle

- [x] Masaüstü giriş sayfası tasarıma birebir (`src/pages/LoginPage.tsx`,
      `src/pages/login/*`, `src/components/LoginNotice.tsx`). 6 genişlikte
      tasarımla ölçüldü. Testler `tests/masaustu-giris.test.mjs` (18).
      Odak halkası hatası (iç kutuda ikinci çerçeve) düzeltildi + testlendi.
      **COMMIT YOK, DEPLOY YOK.**
- [x] Apple Developer: App ID izni, Services ID, anahtar (.p8), e-posta
      göndericisi (SPF ✓). Değerler `giris-kararlar.md`.
- [x] Google Cloud: proje `luera-timeflow`, onay ekranı yayında, web + iOS
      istemcileri. Değerler `giris-kararlar.md`.
- [x] **A · Salt okunur sunucu kontrolü** (2026-10-19 02:4x) — canlı
      `handle_new_user` 006'dan biraz farklı (ELSE dalı yok, settings
      `ON CONFLICT DO NOTHING`); 121 CANLI tanımı kopyaladı. 7 hesap, hepsi
      e-posta, hepsinin işletmesi + verisi var; mükerrer e-posta yok.
      Otomatik onay döneminde açılan 2 hesap: kullanıcınınki + `oz***@gmail.com`
      (16 Eki, 1 müşteri/4 randevu) — kullanıcıya soruldu. Compose'ta
      Apple/Google için HİÇ satır yok; `GOTRUE_URI_ALLOW_LIST ←
      ${ADDITIONAL_REDIRECT_URLS}`; auth bölümü ~467–503. satırlar.
- [x] **B · Göç 121** (`supabase/121_sosyal_giris.sql` + test
      `supabase/tests/sosyal_giris_regression.sql`): Apple/Google hesabına
      kendiliğinden işletme açılmaz; `create_own_business()`;
      `prune_orphan_social_users()` (24 sa).
      ✅ PGlite'ta geçti; 4 koruma tek tek sökülünce test düştü; iki kez
      uygulanabiliyor; yetkiler doğru. Taslak + koşucu scratchpad'de
      (`pgtest/taslak.sql`, `pglite/kos.mjs`) — kaybolursa test dosyasının
      başındaki kullanımla yeniden kurulur.
      ✅ Canlı kuru koşu GEÇTİ (2026-10-19 ~02:50) → **CANLIDA UYGULANDI**
      (COMMIT). Karar 11 kapandı: `oz***` hesabını kullanıcı tanıyor.
- [ ] **C · Günlük temizlik** — VPS crontab (demo tohumu kalıbı; cron
      ortamında `env -i PATH=/usr/bin:/bin` ile dene).
- [x] **D · Giriş servisi ayarı** (2026-10-19 ~02:44 TR) — `ops/giris/giris-ayari-uygula.sh`
      ile: env_file .env doğrulandı (gözle de), yedek
      `.env.yedek-20261018-234353-giris`, 8 ayar `.env`'e yazıldı, yalnız auth
      kabı yeniden → healthy, `/settings` apple:true google:true email:true.
      ✅ **Coolify paneline de girildi** (2026-10-19 ~03:10): 7 `GOTRUE_EXTERNAL_*`
      listede görüldü (sır panoya dosyadan kopyalandı). `ADDITIONAL_REDIRECT_URLS`
      = `https://timeflow.lueratech.com/**,http://localhost:5173/**` görüldü. Panelde "Changes pending" + "Restart current
      version" görünüyor — BASILMAZ (gerek yok; .env zaten doğru).
- [ ] **E · Masaüstünde uçtan uca deneme** — Google yerelden denenebilir
      (`localhost:5173` izinli); Apple yalnız `timeflow.lueratech.com`'da
      çalışır (Apple alan adı denetliyor).
      ✅ **Google GİRİŞ çalıştı** (2026-10-19 02:45 TR, `localhost:5173/login?onizleme=sosyal`,
      hsnulgr@gmail.com): mevcut e-posta hesabına BAĞLANDI (otomatik bağlama),
      sunucuda 7 hesap / 7 işletme değişmedi, `auth.identities`'e `google`
      eklendi. ⏳ Apple: masaüstü deploy'undan sonra canlı alan adında.
      ⏳ Google ile KAYIT (yeni hesap → işletme → Kurulum) henüz denenmedi —
      ikinci bir Google hesabı gerekir; deneme hesabı sonra silinir.
- [x] **Ara iş · Panel kurulum sayaçları** (2026-10-19 ~03:00, kullanıcı istedi):
      `GuzellikDashboard`'daki 4 adımlı kart kaldırıldı, `SetupBanner` açık
      temada sakin kart, `percentSuffix` ("%63'ü"). Testler geçti, build ok.
      Kullanıcı kendi Chrome'unda (localhost, Google ile girişli) bakacak.
- [ ] **F · Commit + masaüstü deploy** — KARAR DEĞİŞTİ (2026-10-19 ~03:15,
      kullanıcı: "tam olsun, herkese %100 işlevsel"): Apple/Google kodda
      VARSAYILAN AÇIK (`VITE_SOCIAL_LOGIN !== '0'`; acil kapatma `=0`).
      Önizleme anahtarı kaldırıldı. Kabul edilen risk `giris-kararlar.md`'de.
      Sıra: commit + push (tek-kisilik + main) → kullanıcı Coolify'da masaüstü
      Deploy → canlıda Apple girişi, Google ile KAYIT (ikinci Google hesabı),
      köprü → deneme hesapları silinir.
- [ ] **G · Mobil v4** — `~/Downloads/18 ekim v2/Luera Mobil - Giris v4
      Apple Google.html` (tasarım geldi, henüz incelenmedi).

## Bilinen gerçekler (doğrulandı)

- GoTrue v2.186: Apple/Google kimlik belgesi yolu yalnız `ENABLED` +
  `CLIENT_ID` (virgüllü liste) ister; Apple **secret istemez**. Google'ın web
  yönlendirmesi (`/authorize`) `SECRET` + `REDIRECT_URI` ister. Nonce
  denetimi `SKIP_NONCE_CHECK=false` iken yapılır (Google iOS için true).
- Yanlış kod / süresi dolmuş kod → ikisi de `otp_expired` (canlıda denendi).
- `API_EXTERNAL_URL` iç adres (`http://supabase-kong:8000`) — Google dönüşü
  için `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI` AÇIKÇA verilmeli.
- İstemci sözleşmesi: `supabase.rpc('create_own_business')` (adı sabit).

## §A · Salt okunur kontrol (kullanıcı çalıştırır)

`ops/giris/kontrol-oku.sql` — `ssh … psql -f -` kalıbıyla. Çıktıda e-postalar
maskeli.

## §B · Göç 121 — canlı kuru koşu ve uygulama (kullanıcı çalıştırır)

Kuru koşu (her şey geri sarılır):

```
{ echo 'BEGIN;'; sed -e '/^BEGIN;$/d' -e '/^COMMIT;$/d' ~/Projects/luera-timeflow/supabase/121_sosyal_giris.sql; cat ~/Projects/luera-timeflow/supabase/tests/sosyal_giris_regression.sql; echo 'ROLLBACK;'; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

Beklenen: `KURU KOŞU GEÇTİ (121)` + `ROLLBACK`. Sonra uygulama:

```
ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/supabase/121_sosyal_giris.sql
```

## §D · Giriş servisi ayarları (değerler)

```
GOTRUE_EXTERNAL_APPLE_ENABLED=true
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=ai.luera.timeflow.web,ai.luera.timeflow
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=<web>,<ios>        (giris-kararlar.md)
GOTRUE_EXTERNAL_GOOGLE_SECRET=<~/.luera-google/web.json içinden, dosyadan>
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://supabase.timeflow.lueratech.com/auth/v1/callback
GOTRUE_EXTERNAL_GOOGLE_SKIP_NONCE_CHECK=true
GOTRUE_URI_ALLOW_LIST=https://timeflow.lueratech.com/**,http://localhost:5173/**
```

Compose: auth servisi `supabase-auth` (`supabase/gotrue:v2.186.0`), ayarlar
`environment:` + (doğrulanacak) `env_file: .env`. `ADDITIONAL_REDIRECT_URLS`
(.env) BOŞ → `GOTRUE_URI_ALLOW_LIST` boş. `GOTRUE_SITE_URL` =
`https://supabase.timeflow.lueratech.com`. Apple/Google satırı compose'ta YOK:
`env_file` varsa yalnız `.env`'e yazmak yeter (compose'a dokunma — Coolify
yeniden üretir); KALICI olsun diye aynı değerler Coolify panelinde de
girilmeli (Coolify `.env`'i Restart'ta yeniden yazar).
Sır sohbete yapıştırılmaz: dosyadan okunur (`jq -r .web.client_secret`).

## Kurallar

- ssh/deploy komutlarını KULLANICI çalıştırır; Claude hazırlar.
- Coolify Restart YOK; `systemctl restart docker` YOK.
- Commit/push yalnız kullanıcı isteyince. `supabase functions deploy` YOK.
- Sırlar sohbete girmez; dosyadan okunur.
- Demo hesabına dokunulmaz.
