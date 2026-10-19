# Devir 11 · Giriş ekranı + Apple/Google — kaldığımız yer

**Oturum:** 2026-10-18 gece → 2026-10-19 ~03:45 (TR). Önceki oturumun limiti
doldu; yeni oturum BURADAN devam eder. Önce bu dosyayı, sonra
`docs/giris-kararlar.md`'yi oku (14 karar + Apple/Google değerleri + kabul
edilen risk).

Kullanıcının sırası: **masaüstü giriş bitecek → mobil (v4) → sonra Core+Dodo
(devir 10).**

## Nerede kaldık (tek paragraf)

Masaüstü yeni giriş sayfası (Işık alanı) **canlıda**, Apple + Google
**herkese açık**. Sunucu tarafı canlıda (göç 121 + giriş servisi ayarları,
Coolify'a da kalıcı kaydedildi). Google ile giriş (mevcut hesaba bağlanma) ve
Apple ile giriş (köprü → yeni işletme) canlıda denendi. Apple denemesinde bir
hata çıktı (Kurulum "Kaydedilemedi") → düzeltildi, commit `195f9cf` GitHub
main'de, **ama İKİNCİ DEPLOY HENÜZ YAPILMADI** — ilk iş o.

## ✅ Yapılanlar

- **Masaüstü giriş sayfası** tasarıma birebir (`src/pages/LoginPage.tsx`,
  `src/pages/login/*` — giris.css, parcalar.tsx, girisKurallari.ts,
  sosyalGiris.ts; `src/components/LoginNotice.tsx`, `src/lib/loginNotice.ts`).
  6 genişlikte (2560→390) tasarım kareleriyle tarayıcıda ölçüldü. Giriş,
  kayıt, kayıt kodu, kodla şifre yenileme, köprü, "zaten hesabınız var" notu.
  Masaüstünde kayıt → Kurulum sihirbazı (M6/M7 yok, karar 1).
- **Apple/Google varsayılan AÇIK** (`SOCIAL_ENABLED = VITE_SOCIAL_LOGIN !== '0'`).
  Acil kapatma: Coolify masaüstü uygulamasına `VITE_SOCIAL_LOGIN=0` + deploy.
- **Apple Developer:** App ID `ai.luera.timeflow` (Sign in with Apple),
  Services ID `ai.luera.timeflow.web`, anahtar `NSKX9A75PZ` (.p8 kullanıcının
  Mac'inde `~/.luera-apple/`), e-posta göndericisi `lueratech.com` +
  `no-reply@` (SPF ✓). Team `5MYM3Z5C9R`.
- **Google Cloud:** proje `luera-timeflow`, onay ekranı yayında (logo yok →
  inceleme yok), web + iOS istemcileri (kimlikler `giris-kararlar.md`; web sırrı
  `~/.luera-google/web.json`).
- **Göç 121 CANLIDA** (`supabase/121_sosyal_giris.sql`, test
  `supabase/tests/sosyal_giris_regression.sql`): Apple/Google hesabına
  kendiliğinden işletme açılmaz; `create_own_business()`;
  `prune_orphan_social_users()` (24 sa). PGlite + canlı kuru koşu geçti.
- **Giriş servisi** (`ops/giris/giris-ayari-uygula.sh`): 8 ayar `.env`'e
  yazıldı, yalnız auth kabı yeniden (healthy, apple/google/email true). Yedek
  `.env.yedek-20261018-234353-giris`. **Coolify paneline de girildi** (kalıcı).
  Panelde "Changes pending / Restart current version" görünür — BASILMAZ.
- **Hesap gözden geçirme (karar 11):** 7 hesap, hepsi sağlam; `oz***`'yi
  kullanıcı tanıyor. Kabul edilen risk (otomatik onay açıkken hesap birleşme)
  `giris-kararlar.md`'de; 1.0.2'de otomatik onay kapanınca kapanır.
- **Panel düzeltmesi** (kullanıcı istedi): güzellik panelindeki çelişen 4
  adımlı kurulum kartı kaldırıldı (tek sayaç = şerit), şerit açık temada
  sakin kart, "%63'ı" → `percentSuffix` ("%63'ü"), kenarlar hizalı.
- **Tema:** giriş uygulamanın temasını izler, varsayılan AÇIK (kullanıcı kararı).
- **Commit'ler** (hepsi GitHub'da, main = tek-kisilik = `195f9cf`):
  `ccbd90d` giriş · `d30eb2d` panel · `dd92dfb` belgeler · `195f9cf` köprü düzeltmesi.
- **Canlı denemeler:** Google GİRİŞ (hsnulgr@gmail.com → mevcut hesaba bağlandı,
  hesap/işletme sayısı değişmedi) ✓ · İlk deploy canlı (paket
  `index-GDXGuOvc.js`) ✓ · Apple GİRİŞ → köprü → "Yeni işletme oluştur" →
  Kurulum ✓ (sonra kaydetme hatası → `195f9cf`).

## ⏳ Yapılacaklar — sırayla

1. ✅ **İKİNCİ DEPLOY** (2026-10-19 03:38 TR) — canlı paket
   `index-wDtKsBFj.js`; `refreshOrg` gövdesi pakette görüldü. Ders: ilk
   "deploy ettim" sonrasında canlı hâlâ 03:20 derlemesiydi — Coolify'da
   **Deploy** basılmalı (Restart yeniden derlemez). Doğrulama:
   `curl -s https://timeflow.lueratech.com/login | grep -o 'assets/index-[^"]*\.js'`
   + `curl -sI … | grep -i last-modified` (commit saatinden SONRA olmalı).
2. **Apple deneme hesabı** — ✅ ikinci deploy'dan sonra kullanıcı canlıda
   denedi: "çalışıyor" (2026-10-19 ~03:45 TR). **Kullanıcı kararı: hesap
   KALIYOR** — silme komutları aşağıda yalnız kayıt için. Kullanıcının Apple kimliğiyle açılan işletme
   (hsnulgr@gmail.com'dan AYRI bir hesap). Kullanıcıya sor: kalsın mı,
   silinsin mi? Silinecekse önce bul (salt okunur):
   `select id, email, created_at from auth.users where raw_app_meta_data->>'provider'='apple';`
   sonra `delete from auth.users where id = '<id>';` (işletme `owner_id`
   CASCADE ile gider). Komutları kullanıcı çalıştırır.
3. **Google ile KAYIT denemesi** — işletmesi olmayan İKİNCİ bir Google
   hesabıyla "Yeni işletme oluşturun" → "Google ile kaydol" → işletme açılır →
   Kurulum (artık kaydetmeli). Bir de hsnulgr@gmail.com ile "Google ile
   kaydol" → "Bu e-postayla zaten hesabınız var — giriş yaptınız." notu.
   Deneme hesabı sonra silinir (2'deki gibi, provider='google').
   ✅ **B geçti** (2026-10-19): hs*** `["email","google"]`, işletme 1 — ikinci
   işletme açılmadı; panelde "zaten hesabınız var" notu görüldü.
   ⏸ **A YAPILAMADI** — kullanıcının ikinci Google hesabı yok. DİKKAT: Apple
   yeniden denemesi de düzeltmeyi SINAMADI — hesabın işletmesi zaten vardı
   (`count > 0` → doğrudan giriş). `refreshOrg` yolu yalnız pakette görüldü +
   `tests/masaustu-giris.test.mjs`. Canlıda ilk gerçek Apple/Google kaydı onu
   sınayacak; bozuksa belirti Kurulum'da "Kaydedilemedi", yenileyince geçer.
   İkinci bir Google hesabı olunca A denenmeli.
4. **C · Günlük temizlik cron'u** (henüz KURULMADI — kullanıcı 2026-10-19
   "şimdilik kalsın" dedi; o kurulana kadar işletmesiz Apple/Google hesapları
   birikir, zararsız ama `kontrol-oku.sql` §5'te görünür). VPS crontab, demo tohumu
   kalıbı. Öneri satırı (03:17 UTC = 06:17 TR):
   `17 3 * * * docker exec -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -tAc "select public.prune_orphan_social_users();" >> /var/log/giris-temizlik.log 2>&1`
   Kurmadan önce cron ortamında dene: `env -i PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c '<komut>'`
   (bkz. hafıza `demo_salon` — "satırın doğru görünmesi çalışacağı anlamına
   gelmiyor"). Kurulumu `grep -v prune_orphan` ile idempotent yaz.
5. **Apple belge iptali (TN3194)** — ⏸ **KARAR VERİLDİ, BEKLİYOR**
   (2026-10-19). Kullanıcı: önce **Ayarlar sayfası Claude Design ile yeniden
   tasarlanacak, içine "Hesabı sil" düğmesi konacak; B yolu o tasarım
   gelince yazılacak.** Tasarım gelince kullanıcıya HATIRLAT.
   Seçilen yol **B · silme anında Apple'a yeniden sor** (A · girişte belgeyi
   saklama REDDEDİLDİ — tablo + iki giriş ekranı + eski hesaplarda belge yok):
   - "Hesabı sil" → Apple sayfası bir kez daha → tek kullanımlık
     `authorizationCode` → `account-delete` gövdesinde isteğe bağlı `appleCode`.
   - Sunucu `.p8` (`NSKX9A75PZ`, Team `5MYM3Z5C9R`) ile ES256 istemci sırrını
     kendisi üretir → `appleid.apple.com/auth/token` (kod → belge) → dönen
     `id_token.sub` bu hesabın Apple kimliği mi → `/auth/revoke`. `client_id`
     kodun geldiği yere göre: telefon `ai.luera.timeflow`, web
     `ai.luera.timeflow.web` (+ web kodunda `redirect_uri` şart).
   - Hata kuralı: kod geçersiz / başka Apple Kimliği → silme DURUR ("yeniden
     dene"); Apple'a ulaşılamıyor → silme YAPILIR + log (silme hakkı Apple
     kesintisine takılmaz). Kod gelmezse bugünkü gibi siler (1.0.1 kırılmaz).
   - Ek düzeltme: işletmesiz Apple/Google hesabı bugün kendini silemiyor
     (`resolveOrg` → `no_org` 403) → o durumda yalnız giriş kaydı silinsin.
   - `.p8` sunucuya: dosyadan okuyup `app_secrets`'a yazan komut (kullanıcı
     çalıştırır, sır sohbete girmez). Core'a bağımlılık EKLENMEZ.
   - **Silme HEM masaüstünde HEM telefonda olacak** (kullanıcı, 2026-10-19).
     Sunucu tek (`account-delete`), Apple adımı iki yerde:
     · **Masaüstü** — bugün silme ekranı YOK, yeni Ayarlar'la ilk kez geliyor.
       Apple açılır penceresi (`sosyalGiris.ts · signInWithApple` kalıbı,
       `authorization.code`). `redirectURI` Services ID'de kayıtlı TEK adres
       `https://timeflow.lueratech.com/login` olmalı (Ayarlar'dan çağrılsa da;
       açılır pencere ana sayfayı yönlendirmez); takasta aynı `redirect_uri`.
       Apple web yalnız canlı alan adında çalışır → bu yol yerelde denenemez.
     · **Telefon** — mevcut `app/(manager-flow)/profil/hesap-sil.tsx`;
       `expo-apple-authentication` (mobil v4, yeni derleme).
   İsteğe bağlı: Apple sunucudan sunucuya bildirim adresi (boş bırakıldı).
6. **G · Mobil v4** — ✅ **KODDA (2026-10-19, commit YOK, derleme YOK).**
   Tasarım `~/Downloads/18 ekim v2/Luera Mobil - Giris v4 Apple Google.html`
   birebir uygulandı; açık noktalar `giris-kararlar.md`'deki kararlarla
   cevaplandı. Ayrıntı ve kalanlar aşağıda **§ Mobil v4**.
7. **1.0.2 günü:** otomatik onay KAPANIR (kabul edilen riski kapatır); o
   güne kadar e-postayla açılıp sonra Google/Apple bağlanan hesapları
   `ops/giris/kontrol-oku.sql` (§4–5) ile gözden geçir.
8. Kurulum sihirbazının üstündeki logo hâlâ eski "luera." (noktalı) — artık
   ayrı küçük iş DEĞİL: kullanıcı Kurulum sihirbazını baştan yeniden
   tasarlatmaya karar verdi (2026-10-19) → `docs/yapilacaklar.md` §3B.

## Mobil v4 — ne yapıldı, ne kaldı

**Yapılan (mobile/, hepsi commit'siz diskte):**

- Paketler: `expo-apple-authentication`, `@react-native-google-signin/google-signin`
  (v16), `expo-crypto`, `@expo-google-fonts/google-sans` (yalnız 500, alt
  yoldan). `app.json`: `ios.usesAppleSignIn: true`, Apple eklentisi, Google
  eklentisi (`iosUrlScheme` = iOS istemcisinin tersi). Yapılandırma
  `npx expo config` ile doğrulandı (entitlement + URL şeması çıkıyor).
- `src/lib/socialAuth.ts` — Apple (nonce özeti Apple'a, hamı sunucuya; ad ilk
  girişte saklanır), Google (belge bir kez kullanılır, Google oturumu hemen
  kapatılır), silmede Apple'a yeniden sorma. Google modülü **Expo Go'yu
  düşürmesin diye** `try { require(...) }` + Expo Go'da hiç denenmez.
- Kimlik katmanı (`auth.ts` canlı + `authStub.ts`): `social.*` (start, bridge,
  createBusiness, leave), kayıt kodu (`signup.verify/resend`), kodla şifre
  yenileme (`manager.verifyRecovery/setPassword`), P1 (`account.setPassword`,
  `login` yöntemi). `session.ts` → `social` canlı.
- Ekranlar: karşılama satırı (A) · giriş B1–B4 (`manager/sign-in.tsx`) · köprü
  B5 (`manager/bridge.tsx`, YENİ) · kayıt K1+K2 (`signup/account.tsx`) · K3
  marka (`signup/ready.tsx`) · K4 notu (`src/components/LoginNotice.tsx`,
  kökte; `enterShell` bırakır) · şifre S1–S3 (`manager/recover.tsx`) · P1
  (`(staff-flow)/account.tsx` giriş yöntemi + "Şifre belirle", `profil/sifre.tsx`
  iki kip, `profil/hesap-sil.tsx` Apple satırı + Apple'a yeniden sorma).
  v4 parçaları `src/components/AuthSocial.tsx`, ölçüler `tokens.ts ·
  ssoMetrics / ssoInk / ssoMotion`, metinler `authCopy.ts`.
- **Bulunan canlı hata düzeltildi:** canlıda `manager.prefill` yoktu, stub'a
  düşüyordu → giriş formu demo hesabıyla (ayla@… + şifre) DOLU açılıyordu.
  Artık boş; "Şifremi unuttum"a yazılan e-posta taşınıyor.
- `EMAIL_RECOVERY_READY = true` (e-posta 2026-10-18'den beri gidiyor; akış KOD).
- Testler: `tests/mobil-giris-v4.test.mjs` (30, 5 kontrol koşusuyla) + 21 eski
  testin metni v4'e güncellendi. Tam paket 3271 / 0 hata. `tsc` temiz, yeni
  dosyalarda lint temiz. `npx expo export --platform ios` üretim paketi
  derlendi (6,5 MB hbc).

**Bilerek verilen kararlar (tasarımdan sapma):**

- Gizlilik satırı karar 6'nın metni: "Bilgileriniz Gizlilik Politikası'na
  göre işlenir." (tasarımdaki "kabul edersiniz" yer tutucuydu, KVKK'da yanlış).
- Yanlış kod bandı: "Kod doğru değil ya da süresi doldu. …" — sunucu ikisini
  ayırmıyor (masaüstüyle aynı). Amber "süresi doldu" yalnız kodun ömrü
  (`CODE_LIFETIME_MS` = 24 sa, GoTrue varsayılanı) GERÇEKTEN geçince.
- Çok deneme bandı süre yazmaz ("4:52" sunucudan gelmiyor); kutular 60 sn kapalı.
- K2'de karar 2'nin satırı: "Kod gelmediyse bu adresle zaten hesabınız
  olabilir: Giriş yapın · Şifremi unuttum".
- Giriş yöntemi satırı yalnız yazı ("Apple ile"), logo yok (karar 7).
- "Şimdi ödeme yapmıyorsunuz. Uygulama içinden satın alma yoktur." KORUNDU
  (App Store testi kilitliyor): boş formda yok, form dolunca Devam'ın altında.
- B3'ün eski alt bandı ("Şifrenizi bilgisayardan da…") kalktı — tasarımda alt
  satır bağlantı.
- K1 ve B1'de klavye kendiliğinden AÇILMIYOR (açılsa Apple/Google görünmezdi).

**Telefonda canlı denemeler (geliştirme derlemesi `e5e8f2fa`, 2026-10-19):**

- ✅ Apple · K1 "Apple ile Kaydol" → var olan Apple hesabı → içeri (kullanıcı:
  "giriş tamam çalışıyor", 14:3x TR).
- ✅ P1 · Profil › Hesap: "Giriş yöntemi · Apple ile" + "Şifre belirle" görüldü.
- ✅ Google · B1 "Google ile giriş yap" → asıl salon. Kullanıcı: "google ve
  apple giriş çalışıyor, tüm testlerim tamam" (2026-10-19 ~14:50 TR).
- Telefonda görülüp düzeltilen (kullanıcı): açık temada pasif birincil düğme
  ve ikincil düğme zeminde kayboluyordu → `quietInk` (pasif = turuncunun opak
  açık tonu + ince turuncu çerçeve + koyu turuncu yazı; ikincil = beyaz +
  belirgin kenar; koyu tema aynı). "Gir" → "Giriş yap" (Apple/Google ve
  masaüstüyle aynı fiil). "Oturumu kapat"ı turuncu yapma önerisi: yapılmadı
  (turuncu yalnız birincil eylem) — kullanıcı itiraz etmedi.
- DENENMEDİ (hesap/koşul yok): B5 köprüsü (işletmesiz Apple/Google hesabı
  gerekir), Apple/Google ile YENİ kayıt, K2 kod (otomatik onay açık), S1–S3
  (gerçek şifreyi değiştirir).
- Ders: ad hoc derleme App Store sürümünün ÜSTÜNE kurulmuyor ("Zaten Yüklü")
  — önce mağaza sürümü silinir. Telefon Metro'ya bağlanırken Expo Go'yu
  değil TimeFlow simgesini açmak gerek (`curl localhost:8081/json/list` →
  `host.exp.Exponent` görünüyorsa yanlış uygulama).
- Apple düğmesinin yazısı Google'ınkinden büyük: iOS sistem düğmesi yazıyı
  yüksekliğe göre kendisi boyluyor; değiştirilemez. Karar bekliyor (önerim:
  böyle kalsın).

**Kalan (sırayla):**

1. **Telefonda deneme = geliştirme derlemesi.** Expo Go'da Apple belgesi
   Expo Go'nun kimliğiyle imzalanır (sunucu reddeder → bant), Google modülü
   yok (→ bant). Ekranlar Expo Go'da GÖRÜLEBİLİR, giriş ancak derlemede.
   Komutu KULLANICI verir: `cd mobile && npx -y eas-cli@latest build --profile development --platform ios`
   (`eas` genel kurulu DEĞİL; 1.0.1 de `npx` ile derlendi). Aynı paket kimliği
   (`ai.luera.timeflow`) şart — Apple ve Google istemcileri ona bağlı — bu
   yüzden geliştirme derlemesi telefondaki mağaza sürümünün YERİNE kurulur;
   iş bitince App Store'dan yeniden yüklenir. JS Mac'teki Metro'dan gelir
   (`npx expo start`), ortam değişkenleri `mobile/.env`'den (canlı kip).
   Yayın öncesi `--no-dev` üretim denemesi ZORUNLU (hafıza: üretim paketi).
2. ✅ **Sunucu kod ömrü** (2026-10-19): auth kabında `OTP` içeren hiçbir
   ayar yok → giriş servisinin varsayılanı 86400 sn = `CODE_LIFETIME_MS`.
   Değişiklik gerekmedi. (Bir gün `GOTRUE_MAILER_OTP_EXP` kurulursa
   `authCopy.ts`'te eşitlenir.)
3. **Apple iptali sunucusu** (başka oturumun diskteki işi:
   `supabase/functions/account-delete/apple.ts` + `index.ts`): telefon artık
   `appleCode` + `appleClient: 'ios'` gönderiyor; deploy edilmeyen sunucu bunu
   yok sayar ve bugünkü gibi siler (kırılma yok). `.p8` → `app_secrets`
   (`APPLE_SIGNIN_KEY`) + deploy KULLANICIDA.
4. **Android Google:** Google Cloud'da Android istemcisi (paket + SHA-1) YOK →
   Android'de Google bant verir. Android yayımlanmıyor; yayımlanırsa eklenmeli.
5. Kayıt K2 (kod ekranı) otomatik onay açıkken görünmez; 1.0.2'de kapanınca
   canlıda dene (gerçek kod e-postası `dogrulama-kodu.html`).

## Bilinen gerçekler (doğrulandı)

- GoTrue v2.186: Apple/Google kimlik belgesi yolu yalnız `ENABLED` +
  `CLIENT_ID` (virgüllü liste) ister; Apple **secret istemez**. Google'ın web
  yönlendirmesi (`/authorize`) `SECRET` + `REDIRECT_URI` ister. Google için
  `SKIP_NONCE_CHECK=true` (iOS yerel giriş).
- Apple web girişi YALNIZ `timeflow.lueratech.com`'da çalışır (yerelde değil);
  Google yerelden de denenebilir (`localhost:5173` izinli).
- Yanlış kod / süresi dolmuş kod → ikisi de `otp_expired` (canlıda denendi).
- `API_EXTERNAL_URL` iç adres → Google dönüşü için `GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI`
  AÇIKÇA verildi.
- Aynı e-postalı Google hesabı mevcut hesaba OTOMATİK bağlanıyor (canlıda görüldü).
- İstemci sözleşmesi: `supabase.rpc('create_own_business')`; işletme açılınca
  `AuthContext.refreshOrg()` çağrılmalı (yoksa uygulama orgId'yi null tutar).
- AuthContext'teki 2 lint bulgusu (react-refresh, gereksiz eslint-disable)
  ESKİ — bu işten gelmiyor.

## Komutlar

Salt okunur kontrol: `ops/giris/kontrol-oku.sql` →
`ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -' < ~/Projects/luera-timeflow/ops/giris/kontrol-oku.sql`

Giriş servisi ayarı (yeniden gerekirse; sır yerel dosyadan, akışın ilk satırı):
`ops/giris/giris-ayari-uygula.sh` başındaki kullanım satırı. Compose'ta auth
servisi `env_file: .env` okuyor (gözle doğrulandı) — compose'a dokunulmaz.

## Kurallar

- ssh/deploy komutlarını KULLANICI çalıştırır; Claude hazırlar.
- Coolify Restart YOK; `systemctl restart docker` YOK.
- Commit/push yalnız kullanıcı isteyince. `supabase functions deploy` YOK.
- Sırlar sohbete girmez; dosyadan okunur (`.p8`, `web.json`).
- Demo hesabına dokunulmaz.
