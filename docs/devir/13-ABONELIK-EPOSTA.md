# Devir 13 · Abonelik e-postaları + sihirli bağlantı (Faz 2.5 + 2.6)

**Tarih:** 2026-10-20 gece. **Durum (2026-10-21):** §3'ün 1–7'si KODDA ve
yerelde doğrulandı (§6). Commit YOK, canlıya HİÇBİR ŞEY çıkmadı — göç 125
uygulanmadı, fonksiyon yüklenmedi, cron kurulmadı. Sıradaki: §4 (komutları
kullanıcı çalıştırır). Önce oku: `docs/abonelik-kurallari.md` §2 ve §4,
devir 10 §10 sonu.

## 0 · Görev (değişmedi)

- **Faz 2.5 e-postaları** (yalnız uygulama DIŞINDA, e-postayla):
  hoş geldiniz (kartsız deneme başlayınca) · 3 gün kaldı · deneme bitti (bitiş
  günü) · son hatırlatma (bitişten 3 gün sonra; sonra e-posta YOK) · son ödeme
  alınamadı (ek süreye girince).
- **Kime:** kartsız deneme = `org_entitlement.state='trial' AND
  dodo_subscription_id IS NULL AND last_event IN ('trial_phone','trial_opening')`;
  ödeme hatası = `state='grace' AND grace_until > now()`. **Alıcı yalnız
  işletme sahibi** (`organizations.owner_id` → `auth.users.email`).
- **Sihirli bağlantı:** "Paketimi seç" → giriş yapmış olarak
  `https://timeflow.lueratech.com/abonelik`. Tek kullanımlık, kısa süreli.
  Telefon tarayıcısında da çalışmalı. "Ödeme alınamadı" e-postası da
  `/abonelik`e gider; oradaki "Kartı güncelle" Dodo kart sayfasını açar.
- **Faz 2.6:** `supabase/functions/dodo-webhook/index.ts` satır ~172
  `notifyOwner` gövdesi → **"Son ödeme alınamadı. Ayrıntılar e-postanızda."**
  (başlık "Ödeme alınamadı", `url` ve `tag` aynı kalır). Mobil koda DOKUNMA.
- Bitti sayılması: `npx tsc -b --noEmit`, `npm run lint`, `npm test` (son
  durum 3316 test / 0 hata) + PGlite testleri; değişiklikler kullanıcıya açık
  anlatılır; commit/push yalnız kullanıcı isteyince (`site/` ve başka oturumun
  dosyaları eklenmez).

## 1 · Doğrulanmış bulgular (yeniden araştırma)

1. **GoTrue `action_link` KULLANILAMAZ.** `API_EXTERNAL_URL=http://supabase-kong:8000`
   (iç ağ — `scripts/eposta-sablonlari.mjs` başlığı, hafıza `kayit_smtp_kirik`)
   → `generateLink`'in `action_link`'i kimsenin tarayıcısında açılmaz;
   `redirect_to` izin listesi ve yanlış `GOTRUE_SITE_URL` (Supabase'in kendi
   adresi) da ayrı tuzak. **Yol:** `admin.auth.admin.generateLink({ type:
   'magiclink', email })` → `data.properties.hashed_token` → e-postaya
   `${APP_URL}/baglanti#t=<hashed_token>`; sayfa `supabase.auth.verifyOtp({
   token_hash, type: 'email' })` çağırır ('email' türü hem magiclink hem
   onaysız-kullanıcı jetonunu kapsar). Jeton parçada (#) → sunucu günlüğüne
   düşmez; JS çalıştırmayan e-posta tarayıcıları jetonu yakmaz.
2. **Jeton ömrü 24 saat** (auth kabında OTP ayarı yok → GoTrue varsayılanı
   86400 sn; devir 11 "Sunucu kod ömrü"). Tek kullanımlık. Yeni bir
   generateLink öncekini (ve o anki şifre sıfırlama kodunu) geçersiz kılar —
   kabul edildi. E-postada "24 saat geçerli, tek kullanımlık; süresi geçtiyse
   timeflow.lueratech.com'da giriş yapın" notu olacak.
3. **🔴 PaywallPage hatası (DÜZELTİLECEK):** `src/pages/PaywallPage.tsx`
   `useEffect`: `if (!ent.loading && ent.ok && !ent.cardlessTrial && !returning)
   navigate('/')`. Ek sürede `computeAccess` **ok=true** döner → ek süredeki
   salon `/abonelik`'ten ana sayfaya atılıyor; "Ödemeniz alınamadı · Kartı
   güncelle" ekranı (Durum 3) bugün HİÇ görünmüyor (süre bitince `effective`
   'locked' olur, o da Durum 2'ye düşer). Düzeltme: koşula
   `&& ent.effective !== 'grace'` ekle + kaynak testi.
4. **Giriş sonrası hedef:** `ProtectedRoute` girişsizi `/login`e atar, hedefi
   taşımaz. `LoginPage` yalnız `?plan=…&cycle=…` tanıyor (`planDest`, satır
   ~130; testlerde `planDest` geçmiyor). Ekle: `params.get('sonra') ===
   'abonelik' ? '/abonelik' : null` (beyaz liste, açık yönlendirme yok).
   Google dönüşü `window.location.search`'ü korur (`sosyalGiris.ts`
   `startGoogle`), Apple açılır pencere → `sonra` iki yolda da yaşar.
5. **Cron deseni:** `remind` x-cron-secret ile korunur (`_shared/auth.ts`
   `identify` → `kind:'cron'`; `remind/index.ts` ~144). VPS 1 crontab'ı
   30 dk'da bir çağırıyor; sır crontab satırında düz yazılı ve
   `scripts/rotate-cron-secret.sh` `x-cron-secret:` taşıyan HER satırı
   döndürüyor → yeni satır aynı başlıkla yazılırsa döndürmeye kendiliğinden
   katılır. Kurmadan önce cron ortamında dene (`env -i PATH=/usr/bin:/bin
   SHELL=/bin/sh /bin/sh -c '…'`, hafıza `demo_salon`). Crontab'da `%`
   yeni satır demektir — `date +%…` yazma, `date -u -Iseconds` kullan.
6. **Resend anahtarı:** Mac'te `~/.luera-resend.env` → değişken adı
   `RESEND_API_KEY` ("timeflow-giris", yalnız gönderme, yalnız lueratech.com).
   `app_secrets`'ta var mı **HENÜZ BAKILMADI** (salt okunur sorgu kullanıcının
   Terminal panelinde, onayıyla: `select key, length(value) from app_secrets
   where key ilike '%resend%';`). Büyük ihtimalle YOK. Sohbete yapıştırmadan
   yükleme: betik dosyayı yerelde okur, SQL'i `ssh … psql -f -` stdin'ine basar
   (değer ekrana/komut satırına çıkmaz) — bkz. §3 `eposta.sh anahtar`.
   (İstenirse ayrı anahtar "timeflow-abonelik" açılabilir; gerek yok.)
7. **Gönderici:** `Luera TimeFlow <no-reply@lueratech.com>`. **Apple gizli
   e-posta kaydı ZATEN HAZIR** (2026-10-20 23:45, Apple Developer › Email
   Sources: `lueratech.com` + `no-reply@lueratech.com`, SPF ✓; DKIM d=lueratech.com
   eşleşir) → kullanıcıya bu adımı YENİDEN YAPTIRMA. Başka From kullanılırsa
   Apple'a o da kaydedilmeli. Yanıt adresi **info@lueratech.com** (kodda 40
   kez geçen, gerçek posta kutusu; destek@ yalnız 5 yerde).
8. **APP_URL:** `getSecret(admin,'APP_URL') || 'https://timeflow.lueratech.com'`
   (dodo-checkout ile aynı).
9. **Mobil push yolu:** `/settings?tab=billing` mobil `pushHrefOf` haritasında
   yok → telefonda dokununca ana ekran; masaüstü web push'ta Ayarlar ›
   Abonelik. `url`/`tag` değişmesin.
10. **Dodo hâlâ TEST kipinde, ENFORCE kapalı.** Canlıdaki gerçek telefon
    kullanıcıları (124'ten beri `trial_phone` satırı alıyorlar) e-posta alır ve
    Dodo TEST ödeme sayfasına giderse ödeyemez → gönderim bir **anahtara**
    bağlı olmalı (aşağıda `ABONELIK_EPOSTA`), Dodo Live ile birlikte açılır.

## 2 · Verilen tasarım kararları (uygulanacak)

- **Ayrı fonksiyon** `supabase/functions/abonelik-eposta/` (remind'e
  karıştırılmaz). Saf kısım `abonelik-eposta/eposta.ts` (ağ/Deno yok; node
  testleri doğrudan import eder), G/Ç `abonelik-eposta/index.ts`. `_shared`
  DEĞİŞMEZ → deploy `scripts/deploy-functions.sh abonelik-eposta dodo-webhook`
  (argümanlı). `_shared`'e dokunulursa ARGÜMANSIZ.
- **Kimlik:** `identify` → yalnız `cron` ya da `service`; diğerleri 401.
- **Sıklık:** cron **15 dakikada bir** (`*/15 * * * *`). Görev "günlük
  tarama" diyor; sapmanın gerekçesi: telefon bildirimi anında "Ayrıntılar
  e-postanızda" diyor ve ek süre yalnız 2 gün — e-posta saatlerce
  gecikmemeli; hoş geldiniz de "deneme başlayınca". Her e-posta yine BİR kez
  (defter). Kullanıcıya açıkça söylenecek. Webhook'a e-posta gönderimi
  EKLENMEDİ (para yolunu yavaşlatmamak için) — yalnız metin değişiyor.
- **Sessiz saat:** `uc_gun`, `bitti`, `son` yalnız TR 09:00–21:00 arasında;
  `hosgeldin` ve `odeme` her saat.
- **Anahtar:** `app_secrets.ABONELIK_EPOSTA = 'true'` → gerçek gönderim.
  Başka her değer/yok → **kuru**: hesaplar, deftere YAZMAZ (yazsaydı açılınca
  o e-postalar "gitti" sayılırdı), yalnız sayı döner ve loglar.
- **ENFORCE'a duyarlı metin:** `ENTITLEMENT_ENFORCE='true'` ise "salt okunur
  olur/oldu, WhatsApp ve online randevu durdu" cümleleri; kapalıysa bu
  cümleler yok ("kesintisiz devam etmek için paket seçin").
- **Aşama (saf `dueMail(row, now)` → `{tur, donem} | null`)**, gün farkları
  TR takvim günüyle (UTC+3 sabit, remind'deki gibi):
  - `state='grace'` ve `grace_until > now` → `odeme`, dönem = `grace_until` ISO.
  - kartsız deneme değilse → null.
  - deneme sürüyor: `d = trGün(bitiş) − trGün(şimdi)`; `d ≤ 3` → `uc_gun`
    (dönem = bitiş ISO; metin d'ye göre: 3/2 "…N gün kaldı", 1 "yarın
    bitiyor", 0 "bugün bitiyor"); `d ≥ 4` → `hosgeldin` (dönem =
    `last_event`, yani işletme başına deneme türü başına BİR kez; kısa
    denemede hoş geldiniz atlanır, uc_gun gelir).
  - deneme bitti (`now ≥ bitiş`): `s = trGün(şimdi) − trGün(bitiş)`;
    `s ≤ 2` → `bitti`; `3 ≤ s ≤ 6` → `son`; `s > 6` → null (anahtar geç
    açılırsa aylar önce bitmiş birine e-posta gitmesin).
  - Bitiş = `expires_at` (kartsız denemede = `trial_ends_at`).
- **Defter (göç 125, YAZILDI):** `abonelik_eposta` (org, tur, donem tekil;
  durum gonderiliyor/gonderildi/hata; deneme ≤ 3; resend_id; adres TUTULMAZ,
  yalnız user_id) + `abonelik_eposta_ayir(p_org, p_tur, p_donem, p_user)`:
  `INSERT … ON CONFLICT DO UPDATE … WHERE deneme < 3 AND (durum='hata' OR
  (durum='gonderiliyor' AND updated_at < now() − 30 dk)) RETURNING *` — boş
  dönüş = gönderme. Tablo + fonksiyon istemci rollerine kapalı,
  `service_role`'e EXECUTE açık. Önce ayır, SONRA gönder.
- **Gönderim (index.ts `sendOne`):** ayır → sahibin e-postası
  (`admin.auth.admin.getUserById(owner_id)`) yoksa `hata` → işletme adı
  (`settings.business_name` WHERE org AND user_id = sahip, yoksa
  `organizations.name`) → bağlantı (`hosgeldin`: düz
  `${APP_URL}/login?sonra=abonelik`; diğerleri sihirli, generateLink
  başarısızsa düz bağlantıya düş) → Resend `POST https://api.resend.com/emails`
  `{from, to:[e-posta], reply_to:'info@lueratech.com', subject, html, text,
  tags:[{name:'tur',value:tur}]}`, başlık `Idempotency-Key:
  abonelik-<satır id>-<deneme>`, `AbortSignal.timeout(10000)` → başarı:
  `durum='gonderildi', resend_id`; hata: `durum='hata', hata=<durum kodu +
  ilk 300 karakter>`.
- **Gövde seçenekleri:** gövdesiz = tarama (yanıt yalnız sayılar — cron
  günlüğüne kişisel veri düşmesin). `{ "ayrinti": true }` = kuru/gerçek
  listesi, alıcı MASKELİ (`k***@gmail.com`). `{ "dene": { "org": "<uuid>",
  "tur": "<tur>" } }` = deneme gönderimi: anahtardan ve sessiz saatten
  bağımsız, dönem `deneme-<zaman>` (gerçek defter satırını bloke etmez),
  tarihleri işletmenin gerçek satırından alır (yoksa şimdi + 3 gün).
- **Metinler** (Türkçe, kırmızı/suçlama yok, sebep tahmini yok; işletme adı
  HTML-escape — kullanıcı girdisi):
  - hosgeldin / trial_phone — konu "Luera TimeFlow'a hoş geldiniz"; "{İşletme}
    için 7 günlük ücretsiz denemeniz başladı. Bu süre boyunca her şey açık,
    kart bilgisi istemiyoruz." · bilgi kutusu "Deneme bitişi: 27 Ekim Salı" ·
    "Deneme bitince devam etmek için web'den bir paket seçmeniz yeterli; erken
    seçerseniz ilk ödeme yine denemeniz bittiğinde alınır." · düğme "Paketleri
    gör". trial_opening — konu "TimeFlow ücretsiz denemeniz başladı", başlık
    "Ücretsiz denemeniz başladı."
  - uc_gun — konu/başlık d'ye göre; "{İşletme} denemeniz {tarih} günü
    bitiyor. Kesintisiz devam etmek için şimdi bir paket seçin: ilk ödeme
    denemeniz bittiğinde alınır, o güne kadar ücret yok." (+ENFORCE cümlesi) ·
    düğme "Paketimi seç".
  - bitti — "Denemeniz bitti." · verileriniz duruyor (müşteri, randevu, ayar
    silinmedi) · ENFORCE açıksa salt okunur cümlesi, kapalıysa "paket seçip
    kesintisiz devam edin" · "Paketimi seç".
  - son — konu "Son hatırlatma: verileriniz sizi bekliyor" · "Bu son
    hatırlatmamız; bundan sonra bu konuda e-posta göndermeyeceğiz." · dışa
    aktarım için info@ (abonelik gerekmez) · "Paketimi seç".
  - odeme — konu "Son ödemeniz alınamadı" · "bankanız geçirmedi; genelde limit
    ya da bankanın doğrulamasıyla ilgilidir" · bilgi kutusu "Kartınızı
    güncellemek için son gün: {grace_until, gün + saat, TR}" · "güncellediğiniz
    an ödeme yeni karttan tekrar denenir, abonelik sürer" (+ENFORCE) · düğme
    "Kartımı güncelle".
  - Sihirli düğmeli e-postalarda not: şifresiz giriş, 24 saat, tek kullanım,
    süresi geçtiyse giriş yapın, kimseyle paylaşmayın.
  - Görünüm `scripts/eposta-sablonlari.mjs` ile aynı aile (RENK, YAZI, logo
    `https://timeflow.lueratech.com/eposta/logo.png`, 480 px kart, 20 px
    köşe); düğme mürekkep zemin + krem yazı (turuncu zeminde beyaz yazı
    kontrastı 3:1, yetmez). Düz metin sürümü de. Altbilgi: "Bu e-posta
    {adres} adresli Luera TimeFlow hesabınızın aboneliğiyle ilgili olduğu için
    gönderildi. Sorularınız için bu e-postayı yanıtlayın ya da
    info@lueratech.com." Tarih biçimi `Intl.DateTimeFormat('tr-TR', { timeZone:
    'Europe/Istanbul', day:'numeric', month:'long', weekday:'long' })`.

## 3 · Kalan iş listesi (sırayla)

1. **`supabase/functions/abonelik-eposta/eposta.ts`** (saf): `MailKind`,
   `CARDLESS_EVENTS`, `dueMail`, `sendableAt` (sessiz saat), `trDaysLeft`,
   `mailContent(tur, ctx)` → `{subject, preheader, html, text}`,
   `magicUrl(appUrl, hash)`, `paywallLoginUrl(appUrl)`, `maskEmail`,
   `escapeHtml`, `MAGIC_LINK_HOURS = 24` (GoTrue OTP_EXP'e bağlı yorumuyla).
2. **`supabase/functions/abonelik-eposta/index.ts`** (G/Ç) — §2'deki akış.
   `deno.json`/`config.toml` gerekiyorsa öteki fonksiyonlara bak
   (`verify_jwt=false` deseni).
3. **dodo-webhook metni** (Faz 2.6) — tek satır.
4. **Masaüstü:**
   - `src/pages/EpostaBaglantiPage.tsx` + `App.tsx`'te **ProtectedRoute
     DIŞINDA** `<Route path="/baglanti" …/>`. Açılışta `#t=` oku, hemen
     `history.replaceState` ile parçayı sil, `verifyOtp({ token_hash, type:
     'email' })`. Başarı → `await refreshOrg()` → `useAuth().user?.id ===
     oturumun kullanıcı kimliği` olunca `navigate('/abonelik', {replace:true})`
     (aynı tarayıcıda başka biri açıksa eski kullanıcıyla yönlenmesin).
     Hata → oturum varsa yine `/abonelik`; yoksa "Bu bağlantının süresi dolmuş
     ya da daha önce kullanılmış. … Giriş yapın, sizi paket ekranına
     götürelim." + "Giriş yap" → `/login?sonra=abonelik`. Görünüm
     PaywallPage kabuğu (`bl dash-theme`, `.wall`, `.badge n`, `BillingSprite`,
     `Ico` 'clock'/'loading'/'ar'; `btn pri big`).
     supabase-js `detectSessionInUrl` yalnız `access_token`/`error_description`
     arar → `#t=` ile çakışmaz.
   - `PaywallPage` grace düzeltmesi (§1 madde 3).
   - `LoginPage` `sonra=abonelik` (§1 madde 4).
   - Telefon tarayıcısı: `/abonelik` ve `/baglanti` 375 px'te kontrol
     (billing.css). Canlı veriye giriş yapılamıyor; görsel kontrol için
     sahte veriyle küçük bir harness (scratchpad) ya da `.claude/harness`
     deseni (o klasör başka oturumun — DEĞİŞTİRME, kopyala).
5. **Ops:** `ops/abonelik/eposta.sh` (hediye.sh deseni; Mac'ten çalışır,
   sır VPS'ten çıkmaz):
   - `anahtar` — `~/.luera-resend.env`'i yerelde oku, `insert into app_secrets
     (key,value) values ('RESEND_API_KEY', '…') on conflict (key) do update`
     SQL'ini `ssh … psql -f -` stdin'ine bas; sonra yalnız `length(value)`
     göster.
   - `cron` — VPS'te: sırrı `app_secrets.CRON_TRIGGER_SECRET`'tan oku (psql
     `-qtA`), satır: `*/15 * * * * { date -u -Iseconds | tr '\n' ' '; curl -sS
     -m 60 -X POST -H 'x-cron-secret: <S>'
     https://supabase.timeflow.lueratech.com/functions/v1/abonelik-eposta;
     echo; } >> /var/log/abonelik-eposta.log 2>&1`; önce `env -i
     PATH=/usr/bin:/bin SHELL=/bin/sh /bin/sh -c` ile BİR kez dene (anahtar
     kapalı → kuru, zararsız), sonra `crontab -l | grep -v
     'functions/v1/abonelik-eposta'` + yeni satır | `crontab -` (idempotent),
     doğrulamada sırrı `***` ile maskele. `crontab -l` çıktısını ASLA düz
     basma (2026-09-24 sızıntı dersi).
   - `kuru` — fonksiyonu `{"ayrinti":true}` ile çağır (maskeli liste).
   - `dene <e-posta> <tur>` — VPS'te psql ile e-posta → işletme kimliği
     (sahibi olduğu), sonra `{"dene":{…}}`.
   - `ac` / `kapa` — `ABONELIK_EPOSTA` true/false. `durum` — anahtar + son
     30 günün tür/durum sayıları.
   - `ops/abonelik/125-dogrula.sql` — tablo/kısıt/fonksiyon var, istemci izni
     0 (`has_table_privilege('authenticated', …)`, `has_function_privilege`),
     `service_role` EXECUTE t.
6. **Testler** (`tests/abonelik-eposta.test.mjs` yeni dosya ya da
   `abonelik-yerel`'e bölüm):
   - saf `dueMail`: her aşama + sınırlar (d=4/3/0, s=0/2/3/6/7), kartlı
     deneme/aktif/kilitli/demo → null, `trial_opening`, grace süresi geçmiş →
     null, TR gün dönümü (UTC 21:30 = TR ertesi gün), sessiz saat.
   - `mailContent`: her tür konu/düğme; ENFORCE açık/kapalı cümlesi; işletme
     adı escape (`<script>`); sihirli notu yalnız sihirli türlerde; düz metin
     bağlantıyı içerir; From `no-reply@lueratech.com`.
   - PGlite (`PGLITE_DIR` deseni, `tests/abonelik-yerel.test.mjs` 124 testi
     fikstürü + `CREATE ROLE service_role`): 125 iki kez uygulanır; ayır →
     satır; ikinci ayır → boş; `hata` → yeniden alınır (deneme 2); 3'te durur;
     `gonderildi` asla; 31 dk eski `gonderiliyor` alınır, 5 dk eski alınmaz;
     işletme silinince satır gider; `authenticated` tabloyu okuyamaz,
     fonksiyonu çağıramaz. Her korumayı tek tek sök → test düşmeli.
   - Kaynak testleri: webhook metni ("Son ödeme alınamadı. Ayrıntılar
     e-postanızda.", "kartınızı güncelleyin" YOK); PaywallPage grace koşulu;
     LoginPage `sonra`; `/baglanti` ProtectedRoute dışında; mobil klasörde
     değişiklik yok.
   - PGlite kurulumu: `mkdir -p <scratchpad>/pglite && cd … && npm init -y &&
     npm install --offline @electric-sql/pglite@0.3.15`, sonra
     `PGLITE_DIR=<dizin> node --test tests/…`.
   - Sonra `npx tsc -b --noEmit` · `npm run lint` · `npm test`.
7. **Belgeler:** `docs/abonelik-kurallari.md` §4 madde 5–6 "✅ kodda" + kısa
   not (15 dk, anahtar, sessiz saat); devir 10 sonuna bir satır; bu belge
   güncellenir.

## 4 · Canlıya çıkış sırası (komutları KULLANICI çalıştırır, Terminal panelinde)

1. Göç 125 **kuru koşu** (BEGIN … göç BEGIN/COMMIT'siz … 125-dogrula …
   ROLLBACK) — devir 10 §10 "Canlıya çıkış SIRASI" madde 1 kalıbı, `cat dosya
   | ssh …` biçimi (terminal aracı `<` yönlendirmesini reddediyor).
2. Göç 125 uygula → `125-dogrula.sql`.
3. `ops/abonelik/eposta.sh anahtar` (Resend anahtarı; önce §1 madde 6
   kontrolü).
4. Fonksiyonlar: `scripts/deploy-functions.sh abonelik-eposta dodo-webhook`
   (`_shared` değiştiyse ARGÜMANSIZ). Göçten SONRA.
5. Masaüstü: Coolify **Deploy** (Restart DEĞİL) — `/baglanti`, PaywallPage,
   LoginPage. Açık gizli pencereleri kapat (eski paket tutar).
6. `ops/abonelik/eposta.sh cron` (kuru deneme + kurulum).
7. `eposta.sh kuru` → kimlere ne gideceğini gör. `eposta.sh dene
   <kendi e-postası> uc_gun` ve `odeme` → gelen kutusu: görünüm, Gmail
   Birincil mi, düğme telefonda `/baglanti` → `/abonelik` açıyor mu, ikinci
   tıklamada "süresi dolmuş" ekranı. Apple gizli adresli bir hesapla da bir
   deneme (relay iletiyor mu).
8. `eposta.sh ac` — **Dodo Live ile birlikte** (test kipinde gerçek
   kullanıcılar ödeyemez). ENFORCE bundan sonra (abonelik-kurallari §4.5).

Elle yapılan her adım kullanıcıya AÇARAK anlatılır: ne · neden · nasıl · ne
görmeli · bana ne söylesin (hafıza `anlatim_bicimi`).

## 5 · Açık sorular / riskler

- Görevdeki "günlük tarama" yerine 15 dk — gerekçe §2; kullanıcı itiraz
  ederse cron satırı `7 7 * * *` olur, kod değişmez.
- Hoş geldiniz e-postası düz bağlantılı (belge §2 tablosu "Abonelik sayfası"
  diyor, sihirli değil).
- E-posta tarayıcısı JS çalıştırırsa jeton yanabilir → kişi "süresi dolmuş"
  ekranından girişe düşer; kayıp yok.
- Yarıda kalan gönderimin yeniden denenmesi nadiren çift e-posta üretebilir
  (deneme başına ayrı Idempotency-Key) — kayıp e-postaya tercih edildi.
- Resend'in geri dönen (bounce) e-postaları izlenmiyor; `resend_id` ile
  panelden bakılır.

## 6 · Yapılanlar (2026-10-21) — KODDA, commit yok, canlı değil

| Dosya | Ne |
|---|---|
| `supabase/functions/abonelik-eposta/eposta.ts` (yeni) | Saf: `dueMail`, `sendableAt`, `trDaysLeft`, `mailContent`, `magicUrl`, `paywallLoginUrl`, `maskEmail`, `escapeHtml`, `displayName`, `MAGIC_LINK_HOURS = 24` |
| `supabase/functions/abonelik-eposta/index.ts` (yeni) | Tarama · kuru tarama (defteri OKUR, yazmaz) · `sendOne` (ayır → sahip → ad → sihirli bağlantı → Resend → defteri kapat) · `dene` |
| `supabase/functions/dodo-webhook/index.ts` | Bildirim gövdesi "Son ödeme alınamadı. Ayrıntılar e-postanızda." (başlık/url/etiket aynı) |
| `supabase/config.toml` | `[functions.abonelik-eposta] verify_jwt = false` |
| `supabase/125_abonelik_eposta.sql` | + `service_role`'e AÇIK yetki (tablo SELECT/INSERT/UPDATE, dizi USAGE) — varsayılan yetkiye bırakılmadı |
| `src/pages/EpostaBaglantiPage.tsx` (yeni) + `src/App.tsx` | `/baglanti`, ProtectedRoute DIŞINDA. Üç hâl: giriş yapılıyor · bağlantı kurulamadı (ağ hatası, "Yeniden dene", jeton bellekte) · artık geçerli değil (→ `/login?sonra=abonelik`) |
| `src/pages/PaywallPage.tsx` | Ek süredeki salon ana sayfaya ATILMAZ (`ent.effective !== 'grace'`) — şeridin "/abonelik" yönlendirmesi de bu yüzden boşa gidiyordu |
| `src/pages/LoginPage.tsx` | `afterDest`: `?sonra=abonelik` → girişten sonra `/abonelik` (beyaz liste; yeni kayıtta geçmez, kayıt yine `/kurulum`) |
| `ops/abonelik/eposta.sh` (yeni) | `durum · anahtar · cron · kuru · dene · ac [zorla] · kapa` — `ac` Dodo TEST'teyken durur |
| `ops/abonelik/125-dogrula.sql` (yeni) | Tekillik, RLS, imza, yetkiler (istemci f f f f · servis t t), geri alınan ayırma denemesi, anahtarlar (değer basmaz) |
| `tests/abonelik-eposta.test.mjs` (yeni, 29) | Saf kararlar · metinler · PGlite'ta 125 (iki kez uygulanır, 3 deneme, 30 dk, istemci kapalı, 3 koruma tek tek sökülünce düşer) · kaynak testleri |
| `tests/abonelik-yerel.test.mjs`, `tests/masaustu-giris.test.mjs` | İki iddia yeni koşula göre (silinmedi, yön değiştirdi) |
| Logo (kullanıcı, 2026-10-21) | E-postaların üstünde tam marka: `public/eposta/logo-timeflow.png` (luera + "timeflow" hapı, 437×89, e-postada 146×30) — üretimi `node scripts/eposta-logo.mjs` (LueraTimeflowMark geometrisi, headless Chrome; aynı baytı yeniden üretir). Resim engellenince biçimli alt metin "Luera TimeFlow" (eski 44 px ikonda taşıyordu). 4 giriş/kod şablonu da (`scripts/eposta-sablonlari.mjs` → `public/eposta/*.html`). `/baglanti` üstünde de tam marka (`LueraTimeflowMark`). Logo dosyası ve şablonlar AYNI masaüstü Deploy'unda yayına çıkar; giriş servisi şablonu sitenin adresinden okuduğu için ikisi birlikte değişir. |

**Doğrulama (yerel):** `npm test` 3345 / 0 hata (PGLITE_DIR ile 3338 geçti, 7 atlandı) ·
`npx tsc -b --noEmit` temiz · lint toplamı 612 (yeni dosyalarda 0) · fonksiyon geçici
Deno taklidiyle `tsc`'den geçti (çıkan 3 hata dokunulmayan eski kodda: `_shared/wa.ts`,
webhook 156) · `125-dogrula.sql` PGlite'ta kuru koşu biçiminde (BEGIN … ROLLBACK) iz
bırakmadan geçti · `eposta.sh` sahte ssh/docker/crontab/curl ile bütün alt komutlarda
koştu (remind satırı korunuyor, ikinci `cron` çift satır açmıyor) · `/baglanti` ve
e-posta 375 px'te tarayıcıda görüldü.

**Tasarım kararına eklenenler:**
- E-postayla kayıtta `business_name` = e-posta adresi (devir 12 kusur 1) → adres
  işletme adı sayılmaz, metin "İşletmeniz için …" der. Metinler adı hep "… için"
  kalıbında kullanır.
- Bir turda en çok 40 gönderim, aralarında 0,6 sn; kalanı 15 dk sonraki tura.
- Kuru tarama defteri okur: "gidecek / zaten gitti / vazgeçildi" ayrı sayılır.
- `dene` gerçek defter satırını bloke etmez (dönem `deneme-<an>`); tarih o tür
  için anlamsızsa (bitmemiş denemeye "bitti") örnek tarih kullanır.

**Dersler:**
- macOS'un bash'i 3.2: `$( … )` içindeki here-doc'ta kesme işareti ayrıştırmayı
  bozuyor → ortak uzak betik fonksiyonla basıldı. `bash -s` ile giden uzak
  betikte stdin okuyan komut (docker exec -i) betiğin kalanını yutar → `-i`
  yalnız kendi here-doc'uyla.
- Yerel sahte denemede `cron` adımı `env -i` ile çıplak PATH kullandığı için
  GERÇEK curl'e düştü: canlı uca sahte sırla tek istek gitti, fonksiyon henüz
  yüklü olmadığından "worker boot error" döndü (zararsız). Betiğin koruması
  çalıştı: cevap `"mod"` içermediği için crontab'a dokunmadı.

## 7 · Canlıya çıkış — komutlar (KULLANICI çalıştırır, sırayla)

> **İlerleme (2026-10-21):** ✅ 1 kuru koşu temiz · ✅ 2 göç 125 UYGULANDI (COMMIT)
> ve `125-dogrula.sql` canlıda temiz (f f f f t t, ayırma 1/0/2 geri alındı, kalan 0) ·
> ✅ 3 `eposta.sh anahtar` → RESEND_API_KEY 36 karakter; `eposta.sh durum`: Dodo TEST,
> crontab satırı yok, defter boş. ✅ 4 `deploy-functions.sh abonelik-eposta dodo-webhook`:
> kimliksiz çağrı ikisinde de 401 (kod açılıyor) · `eposta.sh kuru` canlıda → vade 0,
> defter okundu (tek deneme satırı Dodo'nun KARTLI denemesi → doğru) · günlükte hata yok,
> tek satır `abonelik-eposta mod=kuru vade=0 …`. Telefon bildirim metni artık canlıda.
> 5 · commit `3411a2b` main + tek-kisilik'e gönderildi (kullanıcı kararıyla kenar
> çubuğu `c6fbcde` de birlikte; panel kartı CSS'i ve `site/` commit DIŞI). Deploy öncesi
> canlı paket `index-GnGouzzw.js`, `/eposta/logo-timeflow.png` henüz yok (SPA 200 text/html).
> ✅ Coolify Deploy (2026-10-21 01:25 TR): paket `index-GnGouzzw.js` → `index-qJPvNUUs.js`;
> `/eposta/logo-timeflow.png` 200 image/png, yereldekiyle aynı bayt; 4 kod şablonu yeni
> logoyu gösteriyor; pakette `/baglanti` metinleri, `sonra=abonelik`, `effective!=="grace"`,
> kenar çubuğu. Canlı `/baglanti` tarayıcıda açıldı (tam marka, konsol temiz).
> ✅ 6 `eposta.sh cron` (2026-10-21 01:39 TR): cron ortamında deneme `"mod":"kuru"` →
> crontab'a `*/15` satırı, öteki 5 satıra dokunulmadı, sır maskeli. Ölçüm (VPS içinden,
> 3 kuru tur): 0,17 sn (soğuk) · 0,05 · 0,06 sn; edge kabı CPU %0,15 → %0,12, bellek
> 154 → 160 MB; makine yükü artmadı (3,27 → 3,01). Günde 96 tur ≈ 5–15 sn.
> İlk OTOMATİK tur 22:45:01 UTC (01:45 TR) `/var/log/abonelik-eposta.log`'a düştü — kuru, vade 0.
> 7 · `dene` (2026-10-21 01:46 TR): `uc_gun` ve `odeme` → Test Salon 3'ün sahibine (iCloud),
> ikisi de Resend'e teslim, defterde `gonderildi` · deneme 1 · resend kimliği var. Gelen kutusu
> kontrolü KULLANICIDA. Not: ikinci sihirli bağlantı ilkini geçersiz kılar (tasarım gereği) →
> yalnız `odeme` düğmesi çalışır; `uc_gun` düğmesi "artık geçerli değil" ekranını sınar.
> Bu salon kartlı Dodo denemesinde (ek sürede değil) → düğme girişten sonra ana sayfaya
> döner (doğru). `dene uc_gun` salonun gerçek bitişini (30 Ekim, Dodo toleransı dahil) kullandı
> → konu "9 gün kaldı" — yalnız deneme kipinde; gerçek taramada `uc_gun` ≤ 3 günde gider.
> **Telefonda (01:47):** iki düğme de "artık geçerli değil" gösterdi. Denetim kaydı: 01:47:55
> `login` (bağlantı ÇALIŞTI) → 01:48:09 `logout` (14 sn sonra; bütün oturumları kapattı) → sonraki
> dokunuşlar oturumsuz + jeton harcanmış → doğru ekran. Kodda kendiliğinden çıkış yolu YOK (web:
> Paywall "Çıkış", Hesabım, kenar çubuğu, köprü, hesap silme; mobil: yalnız düğmeyle) — çıkış bir
> düğmeden geldi, kaynağı kayıtta yok (denetim IP/cihaz tutmuyor). Ders: giriş servisi istek
> günlüğü tutmuyor; teşhis `auth.audit_log_entries` + `auth.sessions` ile.
> ✅ **Temiz yeniden deneme (08:22 TR):** tek `dene odeme` → tek dokunuş → şifresiz giriş, ana
> sayfa (LOU) açıldı; kayıt 08:22:44 bağlantı · 08:22:57 `login` · iPhone Safari oturumu AÇIK,
> çıkış yok. Sihirli bağlantı uçtan uca DOĞRULANDI.
> **E-posta kipi (c3d4c3e, kullanıcı kararı 2026-10-21):** düğme telefonda uygulamanın ana
> sayfasını açıyordu → istenmedi. Artık `/baglanti` ve `sonra=abonelik` → `/abonelik?kaynak=eposta`;
> bu kipte paket ekranı kimseyi uygulamaya göndermez (aboneliği sürene "Aboneliğiniz/Denemeniz
> sürüyor" + Dodo'daysa "Kartı güncelle" + kapatma notu), Dodo ödeme/kart dönüşü de buraya
> (`dodo-checkout` `donus: 'abonelik'`, beyaz liste). `dodo-checkout` yüklendi; ilk Coolify
> Deploy push'tan önce başladığı için eski commit'i (c305765) derledi → ikinci Deploy
> `index-5T35VNSC.js`. ✅ Telefonda (08:4x): tek dokunuş → "Denemeniz sürüyor", ana sayfa YOK.
> DENENMEDİ: e-posta kipinde Dodo kart sayfasından dönüş (`?kart=1`) ve ödeme dönüşü.
> Sonra 8 (`ac`, Dodo Live ile).
> Komutlar kullanıcının Terminal panelinde, onayıyla çalıştı.

1. **Kuru koşu** (yazmaz, sonunda ROLLBACK). Beklenen: tekillik 1 satır · RLS `t` ·
   tek imza · `f f f f t t` · NOTICE "1 · 0 · 2 — GERİ ALINDI" · kalan 0.
   ```bash
   { echo 'BEGIN;'; grep -vx -e 'BEGIN;' -e 'COMMIT;' ~/Projects/luera-timeflow/supabase/125_abonelik_eposta.sql; cat ~/Projects/luera-timeflow/ops/abonelik/125-dogrula.sql; echo 'ROLLBACK;'; } | ssh -i ~/.ssh/luera_vps root@76.13.4.164 'docker exec -i -u postgres supabase-db-t6yi63jbebvj6c7oo7yjofnt psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
   ```
2. **Göç 125:** `cat ~/Projects/luera-timeflow/supabase/125_abonelik_eposta.sql | ssh … -f -'` (aynı ssh kuyruğu) → sonra `cat …/ops/abonelik/125-dogrula.sql | ssh …`.
3. **Resend anahtarı:** `ops/abonelik/eposta.sh durum` (RESEND_API_KEY satırı var mı) → yoksa `ops/abonelik/eposta.sh anahtar` → "RESEND_API_KEY yazıldı: N karakter".
4. **Fonksiyonlar** (göçten SONRA; `_shared` değişmedi → argümanlı): `scripts/deploy-functions.sh abonelik-eposta dodo-webhook`.
5. **Masaüstü:** commit + push → Coolify **Deploy** (Restart DEĞİL). Açık gizli pencereleri kapat. `/baglanti` açılıyor mu bak.
6. **Cron:** `ops/abonelik/eposta.sh cron` — önce çıplak cron ortamında bir kez koşar (anahtar kapalı → kuru), sonra kurar; çıktıda sır `***`.
7. **İzle:** `ops/abonelik/eposta.sh kuru` (kime ne giderdi, adresler maskeli) · `ops/abonelik/eposta.sh dene <işletme sahibi e-postan> uc_gun` ve `odeme` → gelen kutusu, Gmail'de hangi sekme, düğme telefonda `/baglanti` → `/abonelik`, ikinci tıklamada "artık geçerli değil". Apple gizli adresli bir hesapla da bir `dene`.
   (Not: ek sürede OLMAYAN bir işletmeyle `odeme` denenirse `/abonelik` ana sayfaya döner — doğru davranış.)
8. **Aç:** `ops/abonelik/eposta.sh ac` — Dodo Live ile birlikte (TEST kipindeyken durur; `ac zorla` bilinçli istisna).
