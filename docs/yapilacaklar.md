# YAPILACAKLAR

**Yazıldı:** 2026-10-16 akşam, 1.0.1 (6) Apple'a gönderildikten sonra (18:01).
**Son güncelleme:** 2026-10-17 — dış izleme bitti (§6), sıra yenilendi; dosya/satır referansları doğrulandı.
Kaynak: Devir 2 (`docs/devir/09-DEVIR-2-YAYIN-1.0.1.md` §11–12), hafıza notları,
o günün konuşmaları. Bitenin kutusu işaretlenir; yeni iş en uygun bölüme eklenir.

**Önerilen sıra (2026-10-18 güncel, kullanıcı kararı):** 1.0.1 Release Salı 20 / Çarşamba 21
Ekim 09–11 · **önce giriş ekranı** (Apple + Google + kodla sıfırlama/doğrulama; tasarım
Claude Design'da) · **sonra Core + Dodo** (yeni oturum, `docs/devir/10-CORE-DODO-BASLANGIC.md`)
— Core/Dodo bitene kadar SATIŞ YOK, abonelik kapısı kapalı · 1.0.2'nin kalanı + Sentry +
taramalar + gönderim · ~16 Kasım Pushover ödemesi. Sosyal giriş ile e-posta doğrulaması
AYNI GÜN (1.0.2) açılır.

---

## 1 · 1.0.1 yayın süreci (önümüzdeki 1–2 hafta)

- [x] **Apple incelemesi** — ✅ ONAYLANDI 17 Ekim 2026 22:00 (gönderimden ~31 saat; Submission `f1c08496…`). Sürüm `Pending Developer Release`; "cancel this release"a dokunma.
- [ ] **Release This Version** — 20 Ekim Salı ya da 21 Ekim Çarşamba, 09:00–11:00 (siz). 28–29 Ekim bayram: kaçın.
- [ ] **Kademeli yayını izle** — 7 gün; sorun çıkarsa "Pause" (siz + Claude).
- [ ] Ret gelirse: mesajı Claude'a ver → düzeltme → `1.0.1 (7)` (birlikte).

İnceleme sürerken: 1.0.1 sayfasında hiçbir şeyi değiştirme · demo hesap şifresine
dokunma · demo personeli telefona bağlama · Coolify'da Restart yok · Hostinger yine
yeniden başlatırsa ilk iş `/auth/v1/health` (hafıza: `vps_reboot_auth_dersi`).

## 2 · Küçük ama önemli (yayın sonrası açık maddeler)

- [ ] **`info@lueratech.com` denenmedi** — şifresini unutan müşteriye uygulamanın gösterdiği tek yol. Başka bir adresten deneme e-postası at, geldi mi bak.
- [ ] **Çökme takibi (Sentry) yok** — mağazadaki bir çökmeyi görmenin yolu yok.

## 3 · 1.0.2 (uygulama), ~2 hafta

- [ ] **Giriş ekranı** — Apple ile giriş, Google ile giriş, şifre sıfırlama (kodla). **Büyük, 3–5 gün.** ✅ 2026-10-18: e-posta sağlayıcısı **Resend** (EU/Ireland), `lueratech.com` doğrulandı (DKIM + SPF, Gmail Birincil'e düştü), Türkçe yalnız-kod şablonları `public/eposta/` (üretici `scripts/eposta-sablonlari.mjs`). **E-posta altyapısı CANLI (2026-10-18 01:27):** giriş servisi Resend'le Türkçe kod e-postası gönderiyor, uçtan uca doğrulandı (Coolify'da kayıtlı + `.env` + yalnız auth kabı yeniden; Coolify Restart kullanılmadı). Otomatik onay 1.0.2'ye kadar açık. ✅ 2026-10-19: **masaüstü giriş sayfası tasarıma birebir uygulandı** (Giriş v2.1 · Işık alanı; kodla şifre yenileme dahil, commit yok, deploy yok); Apple/Google düğmeleri sunucu hazır olana kadar gizli. Kararlar: `docs/giris-kararlar.md`. Sırada: telefon v4 → sunucu (Apple/Google, `create_own_business`, temizlik işi) → Apple/Google konsolları. Doğrulama açılınca Apple inceleme notu ("her e-postayla kaydol, hemen girersin") değişir. Plan: `docs/giris-yeniden-plan.md`, brief: `docs/giris-claude-design-prompt.md`.
- [ ] **Dinamik Ada / kilit ekranında bekleme geri sayımı** (Live Activity) — 2–3 gün, Expo Go'da denenemez → test derlemesi/TestFlight.
- [ ] **Personel müşteri dosyasında paket halkası** — `app/(staff-flow)/musteri.tsx · PackageRow`: çentik/çubuk + "1 / 6" → Ø36 `SessionRing` + `remainingHead`. ~15 dk.
- [ ] **"Bekleme kur"da bildirim izni sorusu** — tek kişilikte izin yalnız İşletme › Bildirimler'den isteniyor; ilk "Bekleme kur"da ön soru (`PushPrompt` kalıbı). ~1 sa.
- [ ] **Çevrimdışı BAŞLAT + kalem → `items_stale`** — kuyruktaki `visit.start` damgayı ilerletiyor, kalem yazması atılıyor. Yarım gün, `staff-api` deploy.
- [ ] **Personelin oturumu düşünce "oturum kapandı"** — bugün "bağlantı" diyor. Küçük.
- [x] **Panelde iki kurulum sayacı çelişiyor** (2026-10-19, kullanıcı gördü) ✅ AYNI GECE DÜZELDİ: güzellik panelindeki 4 adımlı kart kaldırıldı (tek sayaç = şerit), şerit açık temada panel kartı diline döndü, "%63'ı" → `percentSuffix` ("%63'ü"), testler `tests/setup-progress.test.mjs`. Commit yok. — üstteki koyu şerit (`SetupBanner`, sihirbaz adımları: "%63 · 3 adım kaldı · sırada Kimlik") ile güzellik panelindeki kart (`GuzellikDashboard`, kendi 4 adımı: "3/4 · sırada Kabinler") aynı anda farklı şey söylüyor; kart "Kabinlerini ekle" (sen dili). Yeni kayıt Kurulum → panel yolundan geçtiği için **Apple/Google + kayıt herkese açılmadan ÖNCE** düzelmeli. Öneri: tek kaynak = sihirbaz hesabı (`setupProgress`); kart ya kalkar ya aynı hesabı okuyan sakin tek karta döner. Tasarım turu (Claude Design brief'i).
- [ ] **Gizlilik metninin yeni hâli** — yazıldı (`631bf04`), yayımlanmadı; yurt dışı aktarım kararını bekliyor. Giriş ekranı gelince e-posta sağlayıcısı, Apple ve Google da alıcı olarak eklenir. Yarım gün.
- [ ] **Mağaza ekran görüntüleri** — 7. görüntü eski adisyonu gösteriyor; telefondan çekilmiş yenileri. ~1 sa.

## 4 · Ayrı oturumlar (kullanıcı kararı: bu işlerin kendi oturumu var)

- [ ] 🔴 **Core + Dodo abonelik — İLK ÖDEYEN MÜŞTERİDEN ÖNCE** — sıradaki iş (kullanıcı 2026-10-18), YENİ oturumda; başlangıç notu `docs/devir/10-CORE-DODO-BASLANGIC.md`:
  - yenileme günü webhook'un susması (önce ayna, sonra Core + yeniden deneme kuyruğu); ödeyen her salon o gün kilitlenir
  - hesap silmenin Core'a bağımlılığı (Core düşerse silme durur → Apple 5.1.1(v) riski)
  - fiyat farkı ₺599 ↔ ₺611,62 (Dodo ürünleri USD → TRY'ye)
  - Dodo canlı moda geçiş, abonelik kapısının (ENFORCE) açılması
  - mobilde kilitli kullanıcıya ne denecek (Apple 3.1.1: uygulama içinden ödeme yok, yönlendirme yok)
  - Hafıza: `timeflow_core_debt`, `billing_design_pending`
- [ ] **WhatsApp** — Evolution ile otomatik hatırlatma ("salon sahibi elle bir şey yapmadan"); hat QR eşleştirmesi.
- [ ] **Altyapı** — `supabase.lueratech.com` (LeadFlow/CallFlow) haftalardır 503 · VPS 1'deki kullanılmayan Supabase yığını (`eopb02…`; yedek → Stop → bekle → sil) · salt okunur teşhis yolu (Supabase MCP fikri; bulut bağlayıcısı bizde çalışmaz, self-hosted).
- [ ] **Luera sitesi + ekosistem + Instagram planı.**

## 5 · Büyüdükçe gerekecek borçlar

- [ ] **`settings` işletme başına değil kullanıcı başına** — ikinci müdür/ortak eklendiği gün onun ayarları sessizce kaybolur → `unique(organization_id)`.
- [ ] **Personel verisinin sunucuda ayrılması** (personel başına RLS) — bugün istemci süzüyor.
- [ ] **Şube desteği** (1 şube = 1 org; `branch_id` ödeyen müşteri çıkınca) ve **Core API anahtarları** (`integration_connections` → `gateway_api_keys`) — 10. müşteri yaklaşınca.
- [ ] **KVKK aydınlatma metni işletme başına** — en sona bırakıldı.

## 6 · Claude'un önerileri (listede yoktu — karar sizin)

2026-10-17'de koddan ve sunucudan doğrulanarak eklendi. Dış izleme kullanıcı onayıyla yapıldı; kalanlar onay bekliyor.

**Gerçek salonlar gelmeden (küçük, etkisi büyük)**

- [x] **Dış izleme + alarm** — ✅ 2026-10-17 03:16 uçtan uca provayla doğrulandı. Cloudflare Worker `luera-izleme` 2 dk'da bir 5 kontrol; **Pushover** asıl kanal (sunucu/giriş/veri/personel = acil, Critical Alerts; masaüstü bir kez sesli; lueratech.com ve sabah 09:00 sessiz), ntfy yedek. Metinler: Etkisi → Ne yap → teknik. Kod `ops/izleme/`, test `tests/izleme.test.mjs`, rehber `ops/izleme/README.md`. Sonraki aşama: gece yedeği + demo tohumu için cron nabzı.
- [ ] **Pushover denemesi biter (~16 Kasım 2026)** — beğenildiyse uygulama içinden tek seferlik $4.99; alınmazsa alarm susar (sabah 09:00 mesajının gelmemesinden anlaşılır).
- [ ] **Yedeğin dış kopyası + bir geri yükleme provası** — gece yedeği VPS'in kendi diskinde duruyor (`scripts/vps-backup.sh` dışarı kopyalamıyor); sunucu giderse yedek de gider. Başka bir yere kopya (VPS 2, Backblaze B2, Hetzner Storage Box) + bir kez boş bir veritabanına geri yükleyip doğrulama. Yarım gün.
- [ ] **Masaüstünde elle açılan randevu `pending` yazılıyor** — **kod düzeltildi `862678c` (2026-10-17), yalnız güzellik** (diş/sağlık "Teyit bekliyor", dövme "talep" bilerek `pending` kalır; durum `calendarSectorProfiles · manualStatus`). Kalan: Coolify'dan masaüstü deploy + takvimden deneme randevusu · isteğe bağlı: eski `pending` + `source` boş güzellik kayıtlarının sayımı → kararla onaylıya çevirme.

**1.0.2'ye**

- [ ] **Mağaza paketi sessizce sahte veriye düşebilir** — `mobile/src/api/session.ts:24`: `EXPO_PUBLIC_AUTH_MODE` derlemeye ulaşmazsa uygulama demo verisiyle sorunsuz açılır, hiçbir test yakalamaz (`eas.json` bu değeri sabitlemiyor, yalnız `.env`'den geliyor). Üretim paketinde canlı değilse sert hata. ~15 dk.

**Taranmalı (durumu bilinmiyor)**

- [ ] **Paketler'deki "ödenmedi" masaüstü bakiyesiyle aynı mı** — telefon yalnız pakete bağlanmış ödemeleri düşüyor; masaüstü bağlanmamış tahsilatı da sırayla (FIFO) paketlere dağıtıyor. Kasa'dan pakete bağlamadan alınan ödeme → masaüstünde ödendi, telefonda "₺X ödenmedi" çıkabilir. Demo salonda bir senaryoyla karşılaştır (denetim A4; Paketler ekranı bu farkı artık görünür kılıyor).
- [ ] **Masaüstünün 500 satır sınırı** — `src/hooks/useReservations.ts:205` en ileri tarihli 500 randevuyu alıyor; tekrarlayan randevular birikince bugünün randevuları masaüstünden düşebilir. Yoğun bir salonun kaç ayda 500'e ulaşacağı hesaplanmalı (denetim A2).
- [ ] **Mobil↔masaüstü denetiminin 2. turu** — ilki 27 Eylül'de (`docs/mobil-masaustu-denetim-2026-09-27.md`); o günden beri tek kişilik, paket satışı ve Paketler eklendi. Aynı rakamı iki yüzeyde karşılaştırma turu.

**İnşa (orta vade)**

- [ ] **Sunucu kurtarma tek sayfası** — VPS düşünce sırayla ne kontrol edilir, auth kurtarma komutu, Coolify'da basılmayacaklar, yedekten dönüş. Bugün hafıza notlarına dağılmış; kriz anında tek dosya. ~1 sa.

**Var olan maddelere not**

- **Core + Dodo (§4):** abonelik kapısı açılırken demo salonun aboneliği `active` + `expires_at = NULL` kalmalı; yoksa hakem kapalı kapıya çarpar ve güncelleme reddedilir.
- **Giriş ekranı (§3):** auth'taki `GOTRUE_SITE_URL` Supabase'in kendi adresini gösteriyor; SMTP kurulduğu gün sıfırlama bağlantıları yanlış yere gider → `https://timeflow.lueratech.com` olmalı.

---

*Kullanıcı kararıyla bekletilen: VPS'te kök kullanıcıyla şifreli SSH girişinin kapatılması.*
