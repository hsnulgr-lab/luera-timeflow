# Luera TimeFlow · Altyapı denetimi ve düzeltme planı (2026-11-24)

Sen bu depoda (Luera TimeFlow) çalışan kıdemli bir mühendissin. Görevin **kodu
denetlemek, hataları kanıtıyla bulmak ve her biri için düzeltme planı
hazırlamak.** Bu turda **kod değiştirmiyorsun**: çıktın bir rapor ve bir plan.
Kurucu teknik değil. Raporu Türkçe, sade yaz; her bulguda ne olduğunu, neden
önemli olduğunu ve nasıl düzeltileceğini anlat.

## 0 · Değişmez kurallar

- **Üretime dokunma.** SSH yok, canlı veritabanına yazma yok, fonksiyon
  yükleme yok, Coolify Deploy yok, `git push` yok. Gerekirse komutu yaz,
  kullanıcı çalıştırır.
- **Hiçbir yere mesaj gönderme.** WhatsApp, e-posta ve push dahil. `remind`,
  `wa-scheduler`, `send-push` ve benzerlerini canlıda tetiklemek GERÇEK mesaj
  gönderir.
- **Commit yok.** Ana klasörde 15 dosyada kaydedilmemiş iş var (bkz. §2.4).
  Bunlara dokunma; yalnız oku ve değerlendir.
- Göç (migration) sınamak gerekirse yerel PGlite kullan (npm önbelleğinde
  0.3.15, internetsiz). Docker ve psql yok.
- `tests/wa-asistan-kilidi.test.mjs` WhatsApp asistanının konuşmasını
  kilitliyor (kullanıcı kararı, 2026-11-08). Konuşmayı değiştiren bir öneri
  varsa ayrıca işaretle, sessizce önerme.
- Telefon uygulaması (`mobile/`) yalnız Expo Go ile telefonda denenir;
  simülatör yok. Mağaza derlemesinden önce `--no-dev` üretim paketi denemesi
  zorunlu (dinamik import dersi).

## 1 · Denetim

Aradığın şey: **yanlış kişiye, yanlış işletmeye ya da yanlış zamanda giden
bir şey; ya da sessizce düşen bir şey.** Riske göre sırala; her şeyi
derinlemesine okumaya çalışma. Önce paylaşılan katmanı
(`supabase/functions/_shared/`) oku.

- **Dışarı giden mesajlar (WhatsApp):** Mesajın çıkabildiği bütün yolları
  listele: `wa-scheduler` (reminder_24h, reminder_2h, nudge, satisfaction,
  slot_offer, rebook), `remind` (eski yol), `whatsapp-proxy`
  (confirmation, review, winback, renewal, recall, manual…),
  `whatsapp-booking` ve `wa-agent` (gelen mesaja cevap), `notify-waitlist`,
  tarayıcıdan ya da telefondan tetiklenen gönderimler, n8n. Her yol için:
  neyle tetikleniyor, hangi kapılardan geçiyor (`sendWA` içindeki
  `not_connected`, kota, sessiz saat, opt-out), çift gönderim riski var mı,
  demo ve test işletmelerini ayırt ediyor mu? Demo ve test tohumlarındaki
  (`supabase/DEMO_*.sql`, `124_telefon_denemesi.sql`, `supabase/tests/`)
  telefon numaraları gerçek bir kişiye ait olabilir mi?
- **Çok kiracılık (multi-tenant) — masaüstü, telefon ve sunucu, üçü de
  (kullanıcının ayrıca istediği madde):** Her işletme yalnız kendi verisini
  görmeli ve değiştirebilmeli; bir işletmenin hiçbir verisi, ayarı, mesajı ya
  da bildirimi başka bir işletmeye geçmemeli. Kontrol et:
  - **Veritabanı:** Her tabloda RLS açık mı ve politika
    `organization_id IN (SELECT auth_user_org_ids())` deseninde mi? RLS'siz
    ya da `organization_id`'siz tablo, `USING (true)` politika, görünümler
    (view) ve `SECURITY DEFINER` fonksiyonların kiracı süzgecini atlayıp
    atlamadığı. Göçleri baştan sona tara; eski (legacy) tabloları da.
  - **Sunucu fonksiyonları:** service_role kullanan her edge fonksiyonu
    işletmeyi istekten gelen bir sayıya değil, doğrulanmış kimliğe göre mi
    seçiyor? (`VERIFY_JWT=false`: her fonksiyon kendi kimliğini doğrulamak
    ZORUNDA.) Personel uçları (`staff-api`) personelin işletmesini sunucuda
    mı belirliyor?
  - **Masaüstü (`src/`):** Sorgularda `organization_id` süzgeci, birden fazla
    işletmesi olan kullanıcıda işletme değiştirince önbelleğin, canlı
    aboneliklerin (realtime) ve yerel depolamanın (localStorage) eski
    işletmenin verisini taşıyıp taşımadığı. Ayarlar: `settings` tablosu
    işletme başına değil kullanıcı başına (`user_id`); doğru satırın işletme
    sahibininki olduğu ve okuyan yerlerin bunu tutarlı yaptığı.
  - **Telefon (`mobile/`):** Müdür ve personel oturumlarında işletme
    değişince ya da çıkış yapınca önbellek, AsyncStorage/SecureStore
    kayıtları, push kaydı ve Dinamik Ada etkinliğinin eski işletmeden
    kalıp kalmadığı; aynı telefonda iki farklı işletmeye giriş.
  - **Kanallar:** Realtime kanal adları ve süzgeçleri, push bildirimleri,
    WhatsApp hattı (`org_whatsapp`, instance adı org'dan türetiliyor),
    e-postalar, herkese açık randevu sayfası (`/book/<slug>`) ve müşteri
    yönetim bağlantıları: biri başka işletmenin verisine ulaşabilir mi?
  Her bulguda hangi işletmenin hangi veriyi görebildiğini adım adım senaryo
  olarak yaz. Bu bölüm raporda ayrı bir başlık olsun.
- **Push bildirimleri:** `push_subscriptions`, `send-push`, `staff-nudge`;
  ayrılan personelin telefonuna bildirim gitmesi, aynı telefonda Expo Go +
  mağaza uygulaması iki kayıt bırakması, ölü jeton budaması.
- **Zamanlayıcılar ve cron'lar:** `wa-scheduler`, `remind`,
  `generate-recurring`, demo tohumu, yedek; çift gönderim, sessiz saat, saat
  dilimi (İstanbul UTC+3), bayat iş.
- **Abonelik ve ödeme (Dodo):** webhook imzası, ENFORCE kapısı, en yeni
  abonelik kazanır kuralı (`docs/abonelik-kurallari.md`), hesap silmede
  abonelik iptali.
- **Hesap silme:** `account-delete`; Apple belge iptali; korunan test hesabı
  (kaydedilmemiş iş, §2.4).
- **Göçler:** `supabase/NNN_*.sql` sırası, `SECURITY DEFINER` fonksiyonlarda
  `search_path` ve EXECUTE izinleri (096 dersi), tetikleyicilerin hata yutup
  yutmadığı.
- **`_shared` eşitleme riski:** `scripts/deploy-functions.sh` çalıştığı
  klasörün `_shared`'ını `--delete` ile eşitler; yanlış daldan yükleme
  WhatsApp'ı bozar. Bir koruma önerilebilir mi?
- **Sırlar:** depoda, istemci paketinde ya da loglarda anahtar sızıntısı.

## 2 · Bağlam

1. **Yapı:** masaüstü web paneli React + Vite (`src/`), telefon Expo
   (`mobile/`), sunucu kendi kurulu Supabase + Deno edge fonksiyonları
   (`supabase/functions/`), göçler `supabase/NNN_*.sql`. Testler
   `npm test` (node --test, `tests/`), tür denetimi `tsc`.
2. **WhatsApp:** Evolution API (VPS 2). İşletme başına bir hat
   (`org_whatsapp`, göç 070). Zamanlayıcı göç 131, asistan göç 130.
   Bayraklar `org_whatsapp.features.scheduler_v2` ve `agent_v2`.
3. **Canlı müşteri:** henüz ödeyen salon yok. Canlıda Demo salon
   (App Store hakemi bunu kullanıyor; bozulmamalı) ve Test Salon 2 var.
4. **Kaydedilmemiş iş (main, 15 dosya):**
   - 13 Kasım · Google Play hazırlığı: `playtest@lueratech.com` silinemez
     (`account-delete`, `hesapSilApi.ts`, `HesapSil.tsx`,
     `mobile/src/api/accountDeletion.ts`, `managerProfile.ts`),
     `mobile/eas.json` Android ayarı, `public/gizlilik.html` ve
     `public/destek.html` e-postayla silme paragrafı.
   - 20 Kasım · takvim: `DayAgendaGrid.tsx` yarım saatlik boş hücre ve dış
     personel süzgeci, `CalendarPage.tsx`, sayfa animasyonu CSS'leri,
     müşteri kartı WhatsApp şablon adı.
   Bunları da denetle: hata var mı, kaydedilmeye hazır mı?

## 3 · Çıktı

Tek dosya: `docs/denetim/2026-11-24-denetim-raporu.md`. Sırası:

1. **Özet** — kurucunun okuyacağı 5–10 satır: en ciddi 3 bulgu ve ilk
   yapılacak iş.
2. **Bulgular tablosu** — her satır: önem (🔴 kritik · 🟠 önemli · 🟡 küçük),
   başlık, dosya:satır, kanıt (kod alıntısı ya da adım adım senaryo),
   etkisi, güven derecesi (kesin / olası). Kanıtsız tahmin yazma; emin
   değilsen "olası" de ve nasıl doğrulanacağını yaz.
3. **Düzeltme planı** — bulgu başına: ne değişecek (dosyalar), göç gerekiyor
   mu, test, yayın sırası (fonksiyon → göç → Coolify → mağaza), geri alma
   yolu, kullanıcının elle yapacağı adımlar (ne · neden · nasıl · ne
   görmeli · bana ne söylesin).
4. **Kullanıcının çalıştıracağı SQL'ler** — her biri salt okunur mu yazar mı
   açıkça etiketli; yazanlar `BEGIN … ROLLBACK` kuru koşusuyla.
5. **Denetlenmeyenler** — bakmadığın alanlar ve neden.

Bitirince kullanıcıya özeti ve dosyanın yolunu ver; uygulamaya geçmek için
onay bekle.
