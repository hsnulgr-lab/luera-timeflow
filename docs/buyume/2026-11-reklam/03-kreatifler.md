# 03 · Kreatifler — ilk set (6 video + 4 görsel + 1 karusel)

**Tarih:** 2026-11-20 · Aşama 4 · Dayanak: `02-konumlandirma.md`
**Dosyalar:** `kreatif/` · **Üretici:** `uretici/reklam.swift` (13 Kasım Reels üreticisinden türedi)

```bash
cd docs/buyume/2026-11-reklam/uretici && swiftc -O reklam.swift -o /tmp/reklam
/tmp/reklam video    # A1 · B1 · D1  (9:16, sesli; ses: docs/buyume/reels-2026-11-13/ses/*.mp3)
/tmp/reklam gorsel   # G1–G4 + K1 (4:5)
```
Videolar (`*.mp4`) git'e girmez (büyük); üreticiyle aynı hâlleriyle yeniden çıkar.

## Durum

| Kod | Açı | Biçim | Durum | Kredi |
|---|---|---|---|---|
| **A1** | Gelmeyen müşteri | Video 9:16 · 21 sn | ✅ hazır | 0 |
| **A1 v2** | Gelmeyen müşteri · **profesyonel sürüm** | Video 9:16 · 22,8 sn | ✅ hazır | 0 |
| **A3** | "Bu mesajı siz yazmadınız" · **sessiz**, A1'in alternatifi | Video 9:16 · 20,5 sn | ✅ onaylı (2026-11-20) | 0 |
| **B1** | Defter karmaşası | Video 9:16 · 17 sn | ✅ hazır | 0 |
| **D1** | Teklif | Video 9:16 · 18 sn | ✅ hazır | 0 |
| **D1 v2** | Teklif · **profesyonel sürüm** (telefon + bilgisayar) | Video 9:16 · 19,4 sn | ✅ hazır | 0 |
| **G1** | Gelmeyen müşteri | Görsel 4:5 | ✅ hazır | 0 |
| **G2** | Defteri bırakın | Görsel 4:5 | ✅ hazır | 0 |
| **G3** | İlk 2 ay yarı fiyat | Görsel 4:5 | ✅ hazır | 0 |
| **G4** | Ekip kendi telefonunda | Görsel 4:5 | ✅ hazır | 0 |
| **K1** | Bir randevunun yolculuğu | Karusel 4:5 × 6 | ✅ hazır | 0 |
| **A2** | Gelmeyen müşteri · **kurucu sesi** | Video 9:16 · ~20 sn | ⏳ Furkan'ın sesli notu + 2 ara sahne | ~70 |
| **B2** | "İşlem yaparken telefon çalıyor" | Video 9:16 · ~18 sn | ⏳ 2 ara sahne + ses + online randevu ekranı | ~85 |
| **C1** | Ekip kendi telefonunda | Video 9:16 · ~18 sn | ⏳ 1–2 ara sahne + ses + Dinamik Ada ekranı | ~70 |

**8/11 hazır, 0 kredi.** Kalan 3 video Higgsfield Plus ile ~230 kredi + ses (teklifle bakılacak).
Ana malzeme her yerde **gerçek uygulama ekranı** ve sistemin **gerçek WhatsApp kalıpları**.

## Kurallar (hepsine uygulandı)
- İlk 2 sn kanca · büyük Türkçe yazı (sessiz izleyen için) · Türkçe karakterler doğru.
- WhatsApp örneğinde salon adı **"Sizin Salonunuz"**: hem gerçek bir salon gibi durmaz hem de
  "hatırlatma sizin numaranızdan gider" fikrini görsel olarak söyler.
- Müşteri adları uydurma (Ayşe, Yasemin, Ufuk…), gerçek kişi değil. Sahte yorum/referans yok, rakip adı yok.
- Teklifin koşulu her kreatifte: "aylık paketlerde · 31 Aralık 2026'ya kadar".
- **Reels güvenli alanı:** düğme ve teklif alttaki %35'in üstünde biter (Instagram yazısı/düğmesi örtmesin).
- Yapay zekâ: seslendirme ElevenLabs (yapay ses). Görüntüde yapay insan yok → Meta'nın görsel
  etiketi bu 8 kreatifte beklenmez. A2/B2/C1'deki Higgsfield ara sahneleri etiket alabilir; sorun değil.

## Her kreatifin reklam bilgileri

WhatsApp **hazır ilk mesajı** her reklamda farklı koddur; gelen ilk mesajdan hangi kreatif
olduğu okunur (`takip.csv` · `kreatif_kodu`). Hepsi:
`Merhaba, TimeFlow hakkında bilgi almak istiyorum. (KOD)`

| Kod | Birincil metin (02 §7) | Başlık | Hazır sorular (en çok 3) |
|---|---|---|---|
| A1 | Metin 1 (gelmeyen müşteri) | Gelmeyen müşteri azalır | Fiyatlar ne kadar? · Nasıl kuruluyor? · Android'de çalışır mı? |
| B1 | Metin 2 (defter) | Defteri bırakın | aynı |
| D1 | Metin 2 | 7 gün ücretsiz, 2 ay yarı fiyat | aynı |
| G1 | Metin 1 | Gelmeyen müşteri azalır | aynı |
| G2 | Metin 2 | Bütün gün tek ekranda | aynı |
| G3 | Metin 2 | İlk 2 ay yarı fiyat | aynı |
| G4 | Metin 2 (+ "ekibiniz kendi telefonundan") | Ekip kendi telefonunda | aynı |
| K1 | Metin 2 | Bir randevu nasıl ilerler? | aynı |
| A2 | Metin 3 (kurucu) | Kurulumu birlikte yapıyoruz | aynı |

## Kalan 3 video: senaryo ve ihtiyaç

### A2 · Kurucu sesi (en güçlü güven kaynağı)
- **Ses (senin sesin, iPhone Sesli Notlar, sessiz oda, ~20 sn):**
  > Ben Furkan. TimeFlow'u Ankara'da, salonlar için yapıyorum. Randevu verdiğiniz müşteri gelmeyince
  > o saat boş geçiyor, biliyorum. TimeFlow, randevudan bir gün ve iki saat önce sizin WhatsApp
  > numaranızdan hatırlatır. Bana WhatsApp'tan yazın, on dakikada birlikte kuralım. İlk iki ay yarı fiyat.
- **Görüntü:** 0–3 sn boş koltuk + duvar saati (**Higgsfield**, 5 sn) → A1'deki WhatsApp sahneleri →
  telefon elde, Akış ekranı (**Higgsfield**: eller + telefon, ekranı biz bindiririz) → teklif kartı.
- Ekranda alt yazı: "Furkan · TimeFlow'un kurucusu" (yüz yok).

### B2 · İşlem yaparken telefon çalıyor
- **Kanca:** manikür yapan eller, yanda titreşen telefon (**Higgsfield**, 5 sn) + yazı "İşlem yaparken telefon çalıyor mu?"
- Online randevu sayfası (müşteri boş saati kendi seçer) → takvime kendiliğinden düşer → teklif.
- **Senden:** telefondan Test Salon 2'nin **online randevu sayfasının** 2 ekran görüntüsü (saat seçimi + onay).

### C1 · Ekip kendi telefonunda
- **Kanca:** "Personeliniz 'bugün kim var?' diye size mi soruyor?"
- Kumanda ekranı (sayaç) → **Dinamik Ada / kilit ekranı sayacı** → kasaya gönderme → teklif. "iPhone + web; Android yolda."
- **Senden:** personel telefonunda süren bir işlemin **kilit ekranı / Dinamik Ada** ekran görüntüsü.
- **Higgsfield:** kuaför salonunda telefona bakan eller (5 sn).

## Higgsfield ara sahne istemleri (onaydan sonra üretilecek)
Model: Seedance 2.5 · 9:16 · 720p · 5 sn · sessiz → **35 kredi/sahne** (fiyat teklifi 2026-11-19).
1. `Empty salon chair in a warm, softly lit beauty salon, wall clock ticking, slow push-in, no people, cinematic, shallow depth of field` (A2)
2. `Close-up of a nail technician's hands doing a manicure, a smartphone on the table vibrating with an incoming call, warm salon light, no faces` (B2)
3. `Hands holding a smartphone in a modern hair salon, thumb scrolling, warm light, no faces, no readable screen` (A2, C1 — ekran sonradan bindirilir)
4. `Hairdresser's hands with scissors, a phone on the station lights up, warm salon light, no faces` (C1)
Her üretimden önce kesin kredi tutarını sorup onayını alacağım.

## Yayın sırası önerisi (Ankara testi, hafta 1)
Aynı reklam setinde **A1 v2, A3, D1 v2, G1, G3, K1** (6 kreatif; A1 v2 ile A3 aynı açının iki kancası, A/B) → 72 saat sonra konuşma başı maliyete
göre en kötü 2'si kapanır, yerine A2 / G2 girer. (Kurallar: `05-kampanya.md`, aşama 5.)

## A1 v2 · HyperFrames ile profesyonel sürüm (2026-11-20)

`video/a1-v2/` — HTML/CSS + GSAP ile kurulmuş, HyperFrames (HeyGen, Apache-2.0) ile kare kare işlenmiş.
Sahne belgesi `video/a1-v2/SPEC.md`. Çıktı `kreatif/A1v2-gelmeyen-musteri.mp4`.

- Uygulamanın arayüzü HTML'de yeniden kuruldu: iPhone, WhatsApp sohbeti, kilit ekranı bildirimi,
  TimeFlow gün sütunu ve randevu kartı. Son karede uygulamanın gerçek ekran görüntüsü.
- Her yazı seslendirmedeki kelimesine oturuyor; ses kaydının durakları ölçülerek zamanlandı.
- **Instagram Reels güvenli alanı:** bütün yazı ve ürün 270–1248 px bandında (üstteki %14 ve alttaki
  %35 Instagram'ın kendi yazı/düğmeleriyle örtülür).
- Efekt sesleri: `motion-graphics/sound-effects` kütüphanesinden, hepsi **CC0** (Freesound, Kenney).
  Seslendirme: 13 Kasım ElevenLabs kaydı. **Müzik yok — kullanıcı kararı (2026-11-20).**
- Yeniden üretmek: `cd video/a1-v2 && HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.9.70 render -q delivery -o ../../kreatif/A1v2-gelmeyen-musteri.mp4`
  (FFmpeg gerekir; Homebrew ile kuruldu).

## A3 · "Bu mesajı siz yazmadınız" (2026-11-20)

`video/a3/` · sahne belgesi `video/a3/SPEC.md` · çıktı `kreatif/A3-bu-mesaji-siz-yazmadiniz.mp4`.

- **Seslendirme ve müzik yok**; sessiz izleyen yalnız yazıyla anlar. Kısık efekt sesleri (CC0), −18 LUFS.
- A1 v2 **kayıpla** açar (gelmedi, −₺1.200); A3 **merakla ve süreçle** açar. İkisi aynı reklam setinde A/B testi:
  hangisi daha ucuza WhatsApp konuşması getiriyor, ilk 72 saatte okunur.
- Akış: kilit ekranında bildirim + "Bu mesajı siz yazmadınız." → logo animasyonu + "yazdı. Sizin WhatsApp numaranızdan."
  → üç duraklı yol (randevu alınınca · 1 gün önce Evet/Hayır · 2 saat önce) "Siz işinize bakın."
  → Evet: "Gelirim dedi · koltuk dolu" / Hayır: "Saat boşalır · bekleme listesindekine teklif gider"
  → gerçek müdür Akış ekranı "Bütün gün tek ekranda." → teklif.
- Gerçek görüntüler: kilit ekranı ve Akış ekranı kullanıcının iPhone'undan.
- WhatsApp ön metin kodu: **A3**.

## D1 v2 · Teklif (2026-11-20)

`video/d1-v2/` · `video/d1-v2/SPEC.md` · `kreatif/D1v2-teklif.mp4` · seslendirme 13 Kasım (C.mp3), müzik yok, −14 LUFS.

- Kare 0: "Ankara'daki güzellik salonları" + yelpaze açılmış üç gerçek ekran; ikinci satır slot makinesi gibi döner
  (nail barlar → epilasyon merkezleri → kuaförler).
- Logo animasyonu → "7 gün ücretsiz" → "İlk 2 ay %50 indirim" → "399,50 TL'den başlayan paketler".
- Her kelimede telefon ekranı kayar: Randevu (takvim) · WhatsApp hatırlatma (Evet/Hayır) · Paket takibi ("4 seans kaldı") · Kasa (₺1.200).
- "Tek uygulamada. Telefonda da, bilgisayarda da.": telefon küçülür, arkadan bilgisayarda **yeni Gün planı** (uzman sütunları)
  gelir — `docs/gun-plani-tasarim/ekip.dc.html` tasarımından işlendi, kodu main'de (503a2f4).
  ⚠️ Reklam yayına girmeden yeni Gün planının canlıda olduğu doğrulanmalı (reklamda gösterilen ekran = müşterinin göreceği ekran).
- "Kurulumu birlikte yapıyoruz." → teklif kartı ve WhatsApp düğmesi. WhatsApp ön metin kodu: **D1**.
