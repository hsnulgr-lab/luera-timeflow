# Satın alma / fiyat sayfası — Claude Design promptu

Aşağıdaki metin olduğu gibi Claude Design'a yapıştırılacak. Çıkan HTML iki
yerdeki görünümü değiştirecek: `src/pages/public/PricingPage.tsx` (herkese açık
`/fiyatlar`) ve `src/pages/PaywallPage.tsx` (uygulama içi `/abonelik` duvarı).
İkisi de `src/components/billing/PlanCards.tsx` bileşenini paylaşıyor; fiyat ve
özellik listesi `src/lib/plans.ts`'ten geliyor — tasarımdaki rakamlar oraya
kopyalanmayacak, tasarım yalnız görünümü belirleyecek.

Şu an çalışan bir sürüm CANLIDA değil ama yerelde ayakta: `/fiyatlar`.
Tasarım geldiğinde yalnız görsel katman değişecek, akış aynı kalacak.

---

## PROMPT

Bir SaaS ürünü için **fiyatlandırma ve satın alma sayfası** tasarla. Türkçe.

### Ürün

**Luera TimeFlow** — Türkiye'deki küçük randevulu işletmeler için randevu ve
işletme yönetimi yazılımı. Aynı çekirdek 13 sektöre bürünüyor: güzellik salonu,
kuaför, berber, estetik kliniği, diş hekimi, sağlık kliniği, fizyoterapi, dövme
stüdyosu, avukatlık, danışmanlık, spor salonu, gelinlikçi, restoran.

Kullanıcı **teknik değil**: salon sahibi, diş hekimi, kuaför. 40–55 yaş sık.
Çoğu telefondan bakacak. "Alan", "entity", "SaaS" gibi yazılım dili kullanma.

### Çözülecek gerçek problem

Bu sayfa iki ayrı anda görünecek ve **ikisi de aynı tasarımı paylaşacak**:

1. **Herkese açık `/fiyatlar`** — henüz kayıt olmamış birine WhatsApp'tan link
   atılıyor. Görevi: ikna etmek.
2. **Uygulama içi duvar `/abonelik`** — denemesi bitmiş ya da ödemesi
   alınamamış bir kullanıcının karşısına çıkıyor. Görevi: utandırmadan,
   panikletmeden ödemeyi tamamlatmak. Bu ekran bir ceza değil, bir kapı.

### Planlar

Üç plan, aylık/yıllık geçişli (yıllıkta %20 indirim, "2 ay bedava" diye de
anlatılabilir):

| Plan | Aylık | Yıllık (aylığa bölünmüş) | Kim için |
|---|---|---|---|
| Başlangıç | ₺299 | ₺239 | Yeni başlayan işletmeler |
| **Pro** (en popüler) | ₺599 | ₺479 | Büyüyen işletmeler |
| İşletme | ₺1.199 | ₺959 | Çoklu şube & yüksek hacim |

- **Başlangıç:** 1 şube · 3 personele kadar · Randevu & takvim · Online randevu
  sayfası · Temel raporlar
- **Pro:** Sınırsız personel · WhatsApp hatırlatma · Kasa & tahsilat · Gelişmiş
  analiz · Müşteri paketleri · E-posta destek
- **İşletme:** Çoklu şube *(yakında)* · API erişimi · Öncelikli destek · Özel
  raporlar · Rol & yetki *(yakında)* · Kurulum desteği

"Yakında" etiketli özellikler görsel olarak ayrışmalı — henüz yok, satmıyoruz.

### Deneme mesajı (sayfanın kalbi)

**7 gün ücretsiz, kart bilgisi isteniyor.** Bu ikisini birlikte, dürüstçe ve
korkutmadan anlatmak sayfanın en zor işi. Kart istendiğini gizleme; tam tersine
güven veren bir çerçeveye al:

- "7 gün boyunca ücretsiz. İlk tahsilat 8. günde."
- "İstediğiniz an tek tıkla iptal — deneme içinde iptal ederseniz hiçbir ücret
  alınmaz."
- Tahsilatın **hangi tarihte** yapılacağı somut yazsın ("16 Ağustos'ta ₺599").

### Tasarlanması gereken durumlar

Sadece "mutlu yol"u değil, hepsini ayrı bölümler hâlinde göster:

1. **Herkese açık fiyat sayfası** — üst başlık, plan kartları, aylık/yıllık
   geçiş, SSS, güven satırı (iptal kolaylığı, veri sahipliği, KVKK, Türkiye'de
   fatura).
2. **Uygulama içi duvar — deneme bitti.** "Deneme süreniz doldu. Verileriniz
   duruyor, kaldığınız yerden devam edebilirsiniz." Panik yok, suçlama yok.
3. **Uygulama içi duvar — ödeme alınamadı (2 gün ek süre).** Kalan süre net
   görünsün ("2 gün 4 saat"), tek belirgin aksiyon: *Kartı güncelle*.
4. **Deneme sürüyor şeridi** — uygulamanın üstünde ince bir bant:
   "Denemenizin 3 günü kaldı" + *Planı seç*. Israrcı ama bağırmayan.
5. **Ödeme sonrası dönüş** — kısa bir teşekkür/işleniyor durumu; sonraki adım
   olarak kurulum sihirbazına yönlendirme.
6. **Aktif abonelik** — mevcut planı, bir sonraki tahsilat tarihini ve fatura
   geçmişini gösteren hâli (Ayarlar → Faturalandırma içinde yaşayacak).
7. **Mobil** — 375px genişlikte plan kartları ve duvar. Telefonda "en çok
   seçilen" plan en üstte olmalı.

### Tasarım kısıtları

Bunlar mevcut ürünün kuralları, uyulması şart:

- **Renkler CSS değişkeniyle**, sabit hex yazma: `--dc-page`, `--dc-surface`,
  `--dc-surface2`, `--dc-card`, `--dc-ink`, `--dc-muted`, `--dc-border`,
  `--dc-orange` `#FF5A1F` (tek vurgu rengi), `--dc-orange-d`, `--dc-green`,
  `--dc-red`, `--dc-amber`.
- **Aydınlık ve karanlık tema** — ikisi de çalışsın. Karanlıkta zemin `#120E08`,
  metin `#F3EDE3`.
- **Yazı tipi:** Hanken Grotesk (yedek: Inter, system-ui).
- **Glassmorphism YOK**, blur YOK, gradyan zemin YOK. Ürünün dili sıcak-nötr
  (krem/kahve tonları) ve düz yüzeyler.
- **Dokunma hedefleri en az 44px.**
- Emoji kullanma; ikon kullan (Lucide setiyle uyumlu, sade çizgi ikonlar).
- Fiyatlar **₺** ile ve binlik ayracıyla (₺1.199).
- Sektör kelimesi gömme: "salon" yerine `{İşletme}` gibi yer tutucu kullan.

### Ton

Sakin ve dürüst. Sahte kıtlık ("son 3 gün!"), abartılı vaat ("cironuzu 3'e
katlayın") ve karanlık desen yok. Duvar ekranlarında özellikle: kullanıcı zaten
bir sürtünme yaşıyor, tasarım onu suçlamamalı. İptal linkini gizleme.

### Çıktı

Tek bir kendi kendine yeten HTML dosyası: inline CSS, harici font/CDN yok.
**Tüm durumları aynı sayfada, alt alta bölümler hâlinde** göster ve her birini
etiketle ("Durum 3 — Ödeme alınamadı, 2 gün ek süre" gibi). Sekmeli prototip
yapma; bu HTML'i okuyup React'e taşıyacağım, o yüzden her ekranı aynı anda
görmem gerekiyor.
