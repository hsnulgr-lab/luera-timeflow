# A3 · "Bu mesajı siz yazmadınız" — SPEC (A1'in alternatifi, sessiz)

GOAL:    Sessiz izleyen salon sahibi 3 saniyede anlar: "Hatırlatmayı benim numaramdan TimeFlow kendiliğinden gönderiyor,
         müşteri Evet/Hayır diyor, ben hiçbir şey yapmıyorum" ve WhatsApp'a yazar.
NEDEN AYRI: A1 v2 kayıpla açar (gelmedi, −₺1.200). A3 merakla ve süreçle açar (bu mesajı siz yazmadınız → nasıl işler).
         İkisi aynı reklam setinde A/B: hangi çerçeve daha ucuza konuşma getiriyor, ölçülür.
OUTPUT:  HyperFrames, 1080 × 1920, 30 fps · Meta Reels/Stories (Click-to-WhatsApp)
TIME:    20.5 s × 30 = 615 kare. SESLENDİRME YOK, MÜZİK YOK (kullanıcı kararı); yalnız ekrandaki olaylara bağlı kısık efektler.
         Saat = okuma süresi: her satır en az 0.5 s + 0.3 s/kelime ekranda.
LOOK:    A1 v2 ile aynı aile: zemin #0E0A06 + üstten sıcak ışık + %7 tane; mürekkep #F3EDE3; vurgu #FF5A1F (karede tek odak);
         onay #2FBF71; WhatsApp yeşili yalnız düğmede ve bildirim simgesinde. Başlık Hanken Grotesk 900, 96–120 px, satır ≤ 5 kelime.
OBJECTS: gerçek kilit ekranı (kullanıcının iPhone'u, alt yarı yakın çekim) + bildirim; dikey zaman çizgisi (3 durak, WhatsApp balonları);
         iki dallı cevap kartları (Evet / Hayır); gerçek müdür Akış ekranı telefonda; teklif kartı (A1 v2 ile aynı).
SHOTS:
  0.00–2.10  KANCA     Kare 0: kilit ekranında "Sizin Salonunuz" bildirimi + başlık "Bu mesajı / siz yazmadınız." (siz turuncu).
  2.10–4.40  CEVAP     Başlık yerinde değişir: logo animasyonu (luera → timeflow) + "yazdı." · alt satır "Sizin WhatsApp numaranızdan."
                       Bildirimin üstüne "OTOMATİK" hapı.
  4.40–8.80  YOL       Kilit ekranı aşağı iner; başlık "Siz işinize bakın." Dikey çizgi akar, 3 durak sırayla yanar:
                       RANDEVU ALININCA (onay) · 1 GÜN ÖNCE (Evet/Hayır sorusu) · 2 SAAT ÖNCE (son hatırlatma).
  8.80–12.80 DALLAR    Başlık "Müşteri cevap verir." · Kart 1: "Evet" → "Gelirim dedi ✓ · Koltuk dolu" (yeşil)
                       · Kart 2: "Hayır" → "Saat boşalır · Bekleme listesine teklif gider" (turuncu).
  12.80–15.30 KANIT    Gerçek müdür Akış ekranı telefonda yükselir; başlık "Bütün gün tek ekranda."
  15.30–20.50 TEKLİF   A1 v2 kapanışı: logo · ANKARA'YA ÖZEL · 7 gün ücretsiz · İlk 2 ay %50 · WhatsApp düğmesi · koşul · ≥ 2.5 s son kare.
BANNED:  A1 v2'deki yasakların hepsi + seslendirme/müzik + aynı anda birden çok satır okutma + rakam vaadi ("%X azalır").
QA:      0.0 · 1.0 · 3.3 · 6.5 · 8.4 · 10.0 · 12.3 · 14.5 · 18.0 · 20.3 — her karede yazı 270–1248 px bandında, okunur.
