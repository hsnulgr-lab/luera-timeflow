# Giriş · Apple/Google · kararlar

**Tarih:** 2026-10-18/19. Kullanıcıyla soru-cevap olarak netleşti. Kod bu
belgeye atıf yapıyor (`src/pages/LoginPage.tsx`, `src/pages/login/sosyalGiris.ts`).

## Durum (2026-10-19)

- **Masaüstü giriş sayfası tasarıma birebir uygulandı** (Giriş v2.1 · Işık
  alanı). Ölçüler tasarım kareleriyle tarayıcıda karşılaştırıldı: 2560, 1920,
  1440, 1280, 1024 ve 390 genişliklerinde aynı.
- E-posta ile giriş, kayıt, kayıt kodu, şifre yenileme (kodla) çalışıyor.
  Şifre yenileme bugün canlı sunucuyla çalışır; kayıt kodu ekranı otomatik
  onay kapanınca devreye girer (açıkken kayıt doğrudan içeri alır).
- **Apple/Google AÇIK — herkese** (2026-10-19, kullanıcı kararı: "tam olsun,
  herkese %100 işlevsel"). Sunucu tarafı aynı gece canlıya alındı (göç 121 +
  giriş servisi). Acil kapatma: masaüstü uygulamasına `VITE_SOCIAL_LOGIN=0` +
  yeniden deploy.
- **BİLEREK KABUL EDİLEN RİSK (karar 11'in devamı):** otomatik onay 1.0.2'ye
  kadar açık → biri başkasının e-postasıyla şifreli hesap açarsa, gerçek sahibi
  sonra Google/Apple ile girdiğinde hesaplar birleşir ve açan kişi içeride
  kalır. 2026-10-19'daki 7 hesap kontrol edildi, sorunlu yok. Açık, 1.0.2 günü
  otomatik onay kapanınca kapanır. O güne kadar: e-postayla açılıp SONRA
  Google/Apple bağlanan hesaplar gözden geçirilir (`ops/giris/kontrol-oku.sql`
  §4–5).
- Telefon (v4) ve sunucu işleri sırada.

## Kararlar

1. **Masaüstünde kayıt hesapla biter**, ardından mevcut Kurulum sihirbazı
   açılır (14 sektör, diş/klinik dahil). Tasarımdaki İşletmeniz (M6) ve "işi
   kim yapıyor" (M7) yalnız telefonda. Masaüstünde "Adım 1/3" çubuğu yok.
   Fiyatlardan plan seçilip gelindiyse önce abonelik sayfası.
2. **Kayıtta kayıtlı e-posta:** e-posta+şifre uyuyorsa içeri + "Bu e-postayla
   zaten hesabınız var — giriş yaptınız." notu; uymuyorsa kod ekranı (kod
   gitmez). Kod ekranında her zaman: "Kod gelmediyse bu adresle zaten
   hesabınız olabilir: Giriş yapın · Şifremi unuttum". Ekran hesabın varlığını
   hiçbir zaman söylemez.
3. **Köprüde uygulama kapatılırsa:** Apple/Google ile açılan hesaba işletme
   ancak "Yeni işletme oluştur" ile açılır; işletmesiz hesap 24 saat sonra
   sunucuda silinir.
4. **Kayıttan Apple/Google ile gelen, birden çok işletmesi olan kişi:** önce
   "Hangi işletme?" (telefon; masaüstünde işletme seçici yok).
5. **Şifre yenileyince** normal girişin yolu: tek işletme → Face ID ekranı,
   çok → "Hangi işletme?" (telefon). Masaüstünde doğrudan içeri.
6. **Gizlilik satırı** formun en altında: "Bilgileriniz Gizlilik
   Politikası'na göre işlenir." — KVKK'da gizlilik metni kabul ettirilmez.
7. **Profilde giriş yöntemi** yalnız yazıyla ("Apple ile"); logo yok.
8. **Android:** Apple düğmesi yok; yalnız Google + e-posta.
9. **Telefon geliştirme derlemesi:** sunucu ve ekranlar bitince tek derleme,
   komutu kullanıcı verir.
10. **Apple Developer + Google Cloud kurulumu** kodlamadan önce, adım adım.
    Her yerde yönlendirmesiz yol (kimlik belgesi → `signInWithIdToken`);
    masaüstünde Google için giriş servisinin kendi yönlendirmesi
    (`signInWithOAuth`) — sunucunun iç adresine dokunulmaz.
11. **Otomatik onayla açılmış hesaplar** 1.0.2'den önce listelenip birlikte
    gözden geçirilir (salt okunur sorgu).
12. **Core:** TimeFlow erişimi kendi kaydına bakar; Core yalnız kopya.
13. **Dodo canlı + abonelik kapısı:** fiyat ve webhook düzelir → gerçek bir
    ödeme kanıtlanır → kapı en son (mevcut salonlara ve demoya süre
    tanımlanınca).
14. **Telefonda aboneliği bitmiş kullanıcı:** bugünkü "kapalı kapı" ekranı.

## Doğrulanan

- Yanlış kod ile süresi dolmuş kod ayırt edilemiyor: sunucu ikisine de
  `otp_expired` · "Token has expired or is invalid" dönüyor (2026-10-19,
  canlı). Tek mesaj: "Kod doğru değil ya da süresi doldu."
- Sunucu kilit süresi vermiyor: kilit bandı süre yazmaz, düğme 60 sn kapalı.

## Apple Developer — kuruldu (2026-10-19)

Gizli olmayan değerler (sunucu ayarında kullanılacak):

- Team ID: `5MYM3Z5C9R`
- App ID (iOS paketi): `ai.luera.timeflow` — Sign In with Apple açık, primary
- Services ID (web): `ai.luera.timeflow.web` — alan `timeflow.lueratech.com`,
  dönüş `https://timeflow.lueratech.com/login`
- Anahtar: `Luera Sign in with Apple`, Key ID `NSKX9A75PZ`. Dosya kullanıcının
  Mac'inde `~/.luera-apple/AuthKey_NSKX9A75PZ.p8` (600) — GİZLİ, depoya ve
  sohbete girmez.
- E-posta göndericisi: `lueratech.com` + `no-reply@lueratech.com`, ikisi de
  SPF ✓.
- Sunucudan sunucuya bildirim adresi boş bırakıldı (sonra, sunucu işiyle).

## Google Cloud — kuruldu (2026-10-19)

- Proje: `Luera TimeFlow` (ID `luera-timeflow`), hesap hsnulgr@gmail.com.
  Onay ekranı: External, **In production**, logo yok (inceleme gerekmez);
  alan `lueratech.com`, gizlilik `https://timeflow.lueratech.com/gizlilik.html`.
- Web istemcisi `TimeFlow Web`:
  `477665756267-956h1cq5dn5kbghh52p1lmmgpeqd19vc.apps.googleusercontent.com`
  · kaynaklar `https://timeflow.lueratech.com`, `http://localhost:5173`
  · dönüş `https://supabase.timeflow.lueratech.com/auth/v1/callback`
  · gizli anahtar kullanıcının Mac'inde `~/.luera-google/web.json` (600) —
  depoya ve sohbete girmez.
- iOS istemcisi `TimeFlow iOS` (paket `ai.luera.timeflow`, Team `5MYM3Z5C9R`):
  `477665756267-s0ffn786degg21i01uidr3pnoth7j5e7.apps.googleusercontent.com`
  (s**0**ffn — sıfır). URL şeması (ters kimlik):
  `com.googleusercontent.apps.477665756267-s0ffn786degg21i01uidr3pnoth7j5e7`.
  Gizli parçası yok.
- Giriş servisinde Google'ın kabul edeceği kimlikler: web + iOS (ikisi de).

## Önkoşullar — Apple/Google açılmadan önce (sunucu)

- Giriş servisinde Apple ve Google açık; istemci kimlikleri (iOS paket,
  web Services ID, Google web + iOS).
- Kayıt tetikleyicisi (`handle_new_user`) Apple/Google hesabına kendiliğinden
  işletme AÇMAZ.
- `public.create_own_business()` — kişinin kendi işletmesini açar
  (köprü ve Apple/Google ile kayıt bunu çağırıyor; adı istemcide sabit).
- İşletmesiz Apple/Google hesaplarını 24 saat sonra silen günlük iş.
- Apple "E-postamı gizle" için `lueratech.com` gönderici kaydı.
- Otomatik onay kapanışı ve Apple/Google açılışı AYNI GÜN (1.0.2).
