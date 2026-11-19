# A1 v2 · Gelmeyen müşteri — SPEC

GOAL:    Salon sahibi "hatırlatma benim numaramdan kendiliğinden gidiyor, gelmeyen azalıyor" der ve WhatsApp'a yazar.
OUTPUT:  HyperFrames, 1080 × 1920, 30 fps, Meta Reels/Stories reklamı (Click-to-WhatsApp)
TIME:    22.8 s × 30 = 684 kare. Saat = seslendirme (vo-a.mp3, ElevenLabs), 1.35 s'de girer; öncesi sessiz kanca.
LOOK:    zemin #0E0A06 + üstten sıcak ışık (turuncu %16, 60 % × 40 %) + sabit tane %6;
         mürekkep #F3EDE3, vurgu #FF5A1F (karede tek odak), kötü haber #FF4D3D, onay #2FBF71, WhatsApp yeşili #25D366 YALNIZ düğmede.
         Başlık: Hanken Grotesk 900, 120–230 px, -4 % aralık; arayüz yazısı Inter 400/700 (WhatsApp) ve Hanken 500–800 (TimeFlow).
         Ortam: gerçek ürün arayüzü (iPhone, WhatsApp sohbeti, kilit ekranı bildirimi, TimeFlow gün görünümü ve kartı) HTML'de yeniden kurulmuş.
         Gölge: 0 40 px 80 px %55 siyah. Telefon gövdesi #1C1813, köşe 96 px.
OBJECTS: iPhone (çerçeve + ada), WhatsApp sohbeti (gerçek renkler, duvar kâğıdı dokusu), kilit ekranı + bildirim,
         TimeFlow gün sütunu (09:00–12:00, 10:30'da Ayşe Kaya · cilt bakımı · ₺1.200), TimeFlow randevu kartı (BEKLENİYOR → ONAYLADI),
         yeşil WhatsApp düğmesi.
MOTION:  giriş expo.out 0.4–0.6 s · kamera/sel power2.inOut 0.4 s · çıkış/zoom power3.in 0.3–0.45 s · yay back.out(1.6) yalnız düğme ve ₺ damgası.
         Kelime girişi: blur 8→0, 0.13 s, 0.07 s arayla. Kare başına bir kahraman hareket. Hareket bulanıklığı açık.
SHOTS:
  0.00–1.45  KANCA   "Bugün kaç / randevunuz" kare 0'da ekranda; "GELMEDİ?" 0.38'de çarpar (impact), sarsıntı; 1.30'da yukarı kırbaç (whoosh).
  1.45–3.30  ONAY    Telefon alttan bulanık girer; WhatsApp'ta onay balonu (pop 1.95). Başlık "Randevu alındı ✓" (1.62).
  3.00–8.80  GÜN     Telefon kameraya doğru büyüyüp geçer (whoosh) → gün sütunu dünyası. "ERTESİ GÜN · 10:30" (3.2);
                     "Müşteri gelmedi." 5.15'te kart kızarır + sarsılır (impact); 6.16 kart boşalır "BOŞ · 60 dk", başlık "Koltuk boş.";
                     7.30 "−₺1.200" damgası (pop), başlık "1 saat boşa gitti."
  8.50–13.20 HATIRLATMA  Turuncu sel (8.55) + "TimeFlow" (8.95); sel yukarı çekilir, kilit ekranlı telefon yükselir (9.65);
                     bildirim düşer 10.25 (pop); "OTOMATİK · 2 SAAT ÖNCE" 11.0; başlık üç satır kelimeyle; 12.70 dokunuş (click) → iris.
  12.85–16.30 CEVAP  WhatsApp sohbeti; "Evet, geliyorum" yazılır (tick) ve gider (pop 13.8);
                     TimeFlow kartı girer 14.6, BEKLENİYOR → ONAYLADI ✓ 15.1 (confirm). Yatay kırbaçla çıkış (whoosh 16.0).
  16.10–22.80 TEKLİF  logo · "ANKARA'YA ÖZEL" 16.38 · riser → "7 gün ücretsiz" 17.64 · "İlk 2 ay %50 indirim" 18.93 ·
                     WhatsApp düğmesi 20.45, basılır 21.2 (click) · koşul satırı · 1.6 s sabit son kare.
BANNED:  boşlukta küçük öğeler; parlama/neon; mor-mavi gradyan; her şeyin aynı anda solarak gelmesi; okunurken kayan yazı;
         köşe etiketleri/HUD; köşeye yapışık logo; sentetik bip; gerçek salon gibi sunulan isim (yalnız "Sizin Salonunuz"); rakip adı;
         WhatsApp'ın kendi logosu ve bildirim sesi.
QA:      0.0 (kapak: kanca okunuyor) · 0.6 (GELMEDİ?) · 2.4 (onay balonu) · 5.4 (kırmızı kart) · 7.6 (−₺1.200) · 9.1 (TimeFlow seli)
         · 11.2 (bildirim) · 14.0 (Evet) · 15.4 (ONAYLADI) · 19.2 (teklif) · 22.5 (son kare). Yazılar 168–1330 px bandında.

## Ses
Seslendirme: ElevenLabs (13 Kasım, A.mp3). Efektler: motion-graphics/sound-effects kütüphanesi, hepsi **CC0**
(Freesound/Kenney; kaynaklar o deponun LICENSES.md'sinde). Müzik: henüz yok (kullanıcı onayı bekleniyor).
