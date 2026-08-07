# Kurulum Sihirbazı — Claude Design promptu (#33)

Aşağıdaki metin olduğu gibi Claude Design'a yapıştırılacak. Çıkan HTML
`src/pages/ClinicSetupPage.tsx`'in yerine geçecek şekilde React'e taşınacak.

---

## PROMPT

Bir SaaS ürünü için **tek seferlik kurulum sihirbazı** tasarla. Türkçe.

### Ürün

**Luera TimeFlow** — Türkiye'deki küçük randevulu işletmeler için randevu ve
işletme yönetimi yazılımı. Aynı çekirdek **13 sektöre bürünüyor**: güzellik
salonu, kuaför, berber, estetik kliniği, diş hekimi, sağlık kliniği,
fizyoterapi, dövme stüdyosu, avukatlık, danışmanlık, spor salonu, gelinlikçi,
restoran.

### Çözülecek gerçek problem

Bugün yeni bir işletme hesabı açıldığında kullanıcı **bomboş bir uygulamaya**
düşüyor: hizmet yok, çalışma saati yok, personel yok, WhatsApp bağlı değil.
Hiçbir şey onu kuruluma yönlendirmiyor ve ilk izlenim "bu program çalışmıyor"
oluyor. Bu ekran o boşluğu kapatacak — kullanıcının ilk 10 dakikası.

Kullanıcı **teknik değil**: salon sahibi, diş hekimi, kuaför. 40-55 yaş
aralığı sık. Çoğu telefondan bakacak. "Alan", "kayıt", "entity" gibi yazılım
dili kullanma.

### Adımlar

Sekiz adım. Her adım tek bir soruya odaklanmalı — bir ekranda on alan olmasın.

1. **Hoş geldiniz** — ne yapılacağını 3 maddeyle anlatan giriş; "yaklaşık 6
   dakika sürer" gibi dürüst bir süre. Tek büyük buton: *Başlayalım*.
2. **Sektör** — 13 sektör arasından biri. Görsel kart seçimi, ikonlu. Seçim
   yapıldığında altta "Bu seçim şunları açar: ..." diye canlı bir özet
   belirsin (ör. diş için *hasta dosyası, diş şeması, kontrol çağrısı*).
   Sektör sonradan değiştirilebilir ama veri girildikten sonra riskli — bunu
   nazikçe belirt.
3. **İşletme kimliği** — işletme adı, adres, telefon, Google Maps linki,
   (opsiyonel) logo. Adres ve telefon *önemli*: WhatsApp botu "neredesiniz",
   "kaçta açıksınız" sorularını bu bilgilerle cevaplıyor. Bunu kullanıcıya
   tek cümleyle söyle — alanın neden dolduruldu­ğunu bilirse doldurur.
4. **Çalışma saatleri** — 7 gün. Hızlı olsun: "Hafta içi 09:00–19:00,
   Cumartesi 10:00–16:00, Pazar kapalı" gibi hazır bir şablon tek tıkla
   uygulanabilsin, sonra tek tek düzeltilebilsin. Randevu aralığı (15/20/30/
   45/60 dk) de burada.
5. **Hizmetler** — sektöre göre **önerilen hizmet listesi hazır gelir**,
   kullanıcı istemediklerini çıkarır, kendi ekler. Her satır: ad, süre, ücret,
   renk. Boş bir tabloya "hizmet ekle" demek en büyük terk noktası — hazır
   liste bunu çözüyor, tasarım bunu öne çıkarsın.
6. **Kaynaklar** — kabin / koltuk / oda / masa (sektöre göre adı değişir).
   "Kaç tane?" diye sor, isimlendirmeyi sonraya bırak. Tek kişilik işletmede
   bu adım **atlanabilir** olmalı.
7. **Ekip** — burada kritik bir seçenek var: **"Yalnız ben çalışıyorum"**.
   Bunu ikinci sınıf bir link değil, eşit ağırlıkta bir seçenek olarak tasarla
   — Türkiye'deki hedef kitlenin büyük kısmı tek kişilik. Ekip varsa: isim +
   rol. Roller sektöre göre adlanıyor (hekim/asistan, kuaför/çırak, uzman).
8. **WhatsApp** — QR kod okutma ekranı ve **"AI randevu asistanı"** anahtarı.
   Anahtar varsayılan olarak KAPALI ve bu bilinçli; tasarım kullanıcıya ne
   yaptığını açıkça anlatmalı: "Müşterileriniz WhatsApp'tan yazınca bot
   randevu oluşturur, fiyat ve saat sorularını yanıtlar." Bu adım da
   atlanabilir olmalı — QR okutmak için telefonun elde olması gerekiyor.
9. **Bitti** — özet kartı + üç öneri aksiyon ("İlk randevunu oluştur",
   "Müşterilerini Excel'den aktar", "Online randevu linkini paylaş").

### Tasarlanması gereken durumlar

Bunları ayrı bölümler hâlinde göster, sadece "mutlu yol"u değil:

- **İlerleme göstergesi** — kaçıncı adımda olduğu her an belli olsun.
- **Sonra devam etme** — kullanıcı yarıda bırakırsa. Uygulamada üstte kalıcı
  bir şerit: "Kurulumun %60'ı tamamlandı — devam et".
- **Atlanan adım** — atlanmış bir adım bitiş özetinde nasıl görünür.
- **Boş liste** — hizmet listesi boşken.
- **Hata** — WhatsApp QR süresi dolduğunda.
- **Mobil** — 375px genişlikte tüm adımlar.

### Tasarım kısıtları

Bunlar mevcut ürünün kuralları, uyulması şart:

- **Renkler CSS değişkeniyle**, sabit hex yazma. Kullanılacak isimler:
  `--dc-page` (sayfa zemini), `--dc-surface` / `--dc-surface2` / `--dc-card`,
  `--dc-ink` (ana metin), `--dc-muted` (ikincil metin), `--dc-border`,
  `--dc-orange` `#FF5A1F` (tek vurgu rengi), `--dc-orange-d`, `--dc-green`,
  `--dc-red`, `--dc-amber`.
- **Aydınlık ve karanlık tema** — ikisi de çalışsın. Karanlık temada zemin
  `#120E08`, metin `#F3EDE3`.
- **Yazı tipi:** Hanken Grotesk (yedek: Inter, system-ui).
- **Glassmorphism YOK**, blur YOK, gradyan zemin YOK. Ürünün dili sıcak-nötr
  (krem/kahve tonları) ve düz yüzeyler.
- **Dokunma hedefleri en az 44px.**
- **Sektör kelimeleri gömülü olmasın.** "Klinik", "Tedavi", "Ünite" gibi
  sözcükler sektöre göre değişiyor; tasarımda bunları `{İşletme}`,
  `{Hizmet}`, `{Kaynak}` gibi yer tutucularla göster ki hangi metnin değişken
  olduğu belli olsun.
- Emoji kullanma; ikon kullan (Lucide setiyle uyumlu, sade çizgi ikonlar).

### Ton

Cesaretlendirici ama abartısız. "Harika iş!" değil, "Tamamdır, bu kadar."
Kullanıcıya her adımda o adımın **neye yaradığını** bir cümleyle söyle —
Türkiye'de küçük işletme sahibi, ne işe yaradığını bilmediği alanı boş
bırakır.

### Çıktı

Tek bir kendi kendine yeten HTML dosyası: inline CSS, harici font/CDN yok.
**Tüm adımları ve tüm durumları aynı sayfada, alt alta bölümler hâlinde**
göster (etiketli: "Adım 3 — İşletme kimliği", "Durum: WhatsApp QR süresi
doldu" gibi). Sekmeli bir prototip değil; ben bu HTML'i okuyup React'e
taşıyacağım, o yüzden her ekranı aynı anda görmem gerekiyor.
