# Codex Tasarım Prompt'ları — Diş Modülü Görsel Birleştirme

Amaç: aşağıdaki 3 yüzey hâlâ eski inline-tema tasarımında; TimeFlow'un yeni
`--dc-*` token dilinde yeniden tasarlanacak. Her prompt'u Codex'e TEK TEK ver;
çıktı olarak **tek, kendi kendine yeten HTML dosyası** iste. Gelen HTML'i bu
repoya Claude uygular (işlev/hook'lara dokunmadan görsel katman değişimi).

---

## ORTAK BLOK — her prompt'un başına aynen yapıştır

```
Sen kıdemli bir ürün tasarımcısısın. "LUERA TimeFlow" adlı Türkçe bir randevu/klinik
SaaS'ının DİŞ KLİNİĞİ modülü için bir sayfa tasarlayacaksın.

TASARIM SİSTEMİ (zorunlu):
- Renkler YALNIZ şu CSS değişkenleriyle: sayfa zemini var(--dc-page), kart
  var(--dc-surface), ikincil zemin var(--dc-surface2), üçüncül var(--dc-surface3),
  metin var(--dc-ink), soluk metin var(--dc-muted), çok soluk var(--dc-muted2),
  çizgiler var(--dc-border) / var(--dc-border2), vurgu turuncusu var(--dc-orange)
  (+ hover koyusu var(--dc-orange-d), yumuşak zemini var(--dc-orange-soft)),
  koyu blok var(--dc-inkbox) üstünde var(--dc-inkbox-fg),
  durum renkleri: var(--dc-green)/var(--dc-green-bg), var(--dc-red2)/var(--dc-red-bg),
  var(--dc-amber)/var(--dc-amber-bg), var(--dc-blue)/var(--dc-blue-bg),
  var(--dc-purple)/var(--dc-purple-bg).
- HTML'in başına şu :root bloğunu koy (ışık modu değerleri) ki dosya tek başına açılsın:
  --dc-ink:#0E0E0E; --dc-page:#F3ECE0; --dc-surface:#FAF7F3; --dc-surface2:#F0E9DF;
  --dc-surface3:#E9E1D5; --dc-border:rgba(14,14,14,.09); --dc-border2:rgba(14,14,14,.14);
  --dc-muted:rgba(14,14,14,.48); --dc-muted2:rgba(14,14,14,.30); --dc-orange:#FF5A1F;
  --dc-orange-d:#E8430F; --dc-orange-soft:rgba(255,90,31,.08); --dc-inkbox:#0E0E0E;
  --dc-inkbox-fg:#F3EDE3; --dc-green:#2D8F32; --dc-green-bg:#E8F5EA; --dc-red2:#C0392B;
  --dc-red-bg:#FBECEC; --dc-amber:#B87A00; --dc-amber-bg:rgba(184,121,10,.12);
  --dc-blue:#3B6FB0; --dc-blue-bg:rgba(59,111,176,.11); --dc-purple:#7B4FA0;
  --dc-purple-bg:rgba(123,79,160,.12); --dc-card:#FFFDFB;
- Tipografi: "Hanken Grotesk" (Google Fonts), rakamlar/saatler/tutarlar monospace
  (font-family: ui-monospace). Başlıklar font-weight 800, letter-spacing -0.02em.
  Bölüm etiketleri: 10px, uppercase, letter-spacing .1em, font-weight 800, --dc-muted.
- Köşeler: kartlar 16-22px, butonlar/inputlar 10-12px veya tam yuvarlak (pill).
  Gölge çok hafif: 0 1px 2px rgba(14,14,14,.04), 0 2px 8px rgba(14,14,14,.04).
- Birincil buton: koyu (var(--dc-inkbox)) zemin + açık yazı, pill. Vurgu aksiyonu
  turuncu. İkincil: şeffaf zemin + var(--dc-border2) çerçeve.
- Dil TÜRKÇE, terminoloji diş kliniği: "Hasta", "Hekim", "Tedavi", "Ünite", "₺".
- Masaüstü öncelikli (1280px+), ama 768px'e kadar responsive düşsün.
- ÇIKTI: tek HTML dosyası, tüm CSS inline <style> içinde, JS yok (hover/focus
  durumları yeterli), harici kaynak yalnız Google Fonts. Boş durum (empty state),
  yüklenme iskeleti ve hata satırı örneklerini de sayfada göster.
```

---

## PROMPT 1 — Tedavi Planları paneli (TreatmentPlans)

> Kaynak: `src/components/dental/TreatmentPlans.tsx` — Diş Şeması ve Vizit
> sayfalarının sağ sütununda yaşayan panel. En görünür tutarsızlık burada:
> çevresindeki her şey yeni dilde, bu panel eski.

Ortak bloktan sonra:

```
GÖREV: Diş kliniği "Tedavi Planları" yan paneli (~380px genişlik, dikey akış).

İçermesi gereken işlevler (hiçbirini düşürme):
1. Panel başlığı "Tedavi Planı" + hastanın toplam KALAN BAKİYESİ büyük monospace
   (ör. "4.200 ₺"). Bakiye sıfırsa yeşil "bakiye yok — tüm ödemeler alındı" satırı.
2. Plan kartları listesi. Her kartta:
   - Plan adı (ör. "13 Kompozit dolgu"), durum rozeti: Teklif (amber) / Aktif
     (turuncu) / Tamamlandı (yeşil) / İptal (soluk)
   - Ödenen/toplam ilerleme çubuğu + "1.800 ₺ / 1.800 ₺" monospace
   - Sorumlu hekim adı (küçük, soluk)
   - Seans sayacı varsa "Seans 2/3"
   - "Klinik: Tamamlandı" toggle satırı
   - Taksit listesi (varsa): sıra no, tutar, vade tarihi, Ödendi/Gecikti rozeti
3. Kart içi aksiyonlar: "Kısmi Tahsilat" (tutar girişi + Nakit/Kart/Havale seçimi),
   "Taksit Planla" (taksit sayısı 2-24 + ilk vade tarihi + aylık/haftalık seçimi)
4. Altta "+ Yeni Tedavi Planı" kesikli çerçeveli buton; açılınca ad + tutar +
   hekim seçimi formu.
5. Boş durum: "Aktif tedavi planı yok" + kısa açıklama.
Ayrıca bir yükleniyor iskeleti ve bir hata toast örneği çiz.
```

## PROMPT 2 — Kompakt Diş Şeması kartı (DentalChart)

> Kaynak: `src/components/dental/DentalChart.tsx` — Hastalar sayfası paneli ve
> mobil hasta detayında kullanılan küçük odontogram.

Ortak bloktan sonra:

```
GÖREV: Kompakt "Diş Şeması" kartı (~360-420px genişlik). Tam sayfa odontogramın
küçültülmüş, panel içi hâli.

İçermesi gereken işlevler:
1. FDI numaralı 32 diş; üst ark (18→28) ve alt ark (48→38) iki sıra. Her diş
   küçük bir hücre: diş numarası + durum rengi dolgusu. Durum renkleri:
   Sağlam (boş/çerçeve), Çürük var(--dc-red2), Dolgu var(--dc-blue),
   Kanal var(--dc-amber), Kron var(--dc-green), İmplant var(--dc-green),
   Çekilmiş var(--dc-muted2), Planlı işlem (turuncu kesikli çerçeve).
2. Renk lejantı (yatay, küçük).
3. Seçili diş detayı: diş no + tip etiketi ("Kanin · Sağ üst"), mevcut durum,
   durum değiştirme chip'leri, kısa not girişi, "Kaydet" butonu.
4. Seçili dişin geçmişi: 2-3 satırlık mini zaman çizelgesi (tarih + durum).
5. Boş durumlar: "Hasta seçilmedi" ve "Bu diş için kayıt yok".
Yüzey (MODBL) seçici YOK — bu kompakt görünümde bilinçli olarak yok.
```

## PROMPT 3 — Randevular sayfası (ReservationsPage, diş görünümü)

> Kaynak: `src/pages/ReservationsPage.tsx` — diş akışının ana giriş kapısı,
> tamamen eski tasarımda.

Ortak bloktan sonra:

```
GÖREV: Diş kliniği "Randevular" tam sayfası (masaüstü, sol menü hariç içerik alanı).

İçermesi gereken işlevler:
1. Üst bar: sayfa başlığı "Randevular", tarih seçici (bugün/yarın/takvimden seç),
   durum filtresi chip'leri (Tümü / Bekliyor / Onaylı / Tamamlandı / İptal),
   arama kutusu (hasta adı/telefon), sağda koyu "Yeni Randevu" birincil butonu.
2. Randevu listesi — saat sıralı satır kartları. Her satırda:
   - Saat aralığı monospace (10:00–10:45)
   - Hasta adı + telefon (soluk) + tedavi adı + hekim adı + ünite rozeti
   - Durum rozeti (Bekliyor amber / Onaylı mavi / Tamamlandı yeşil / İptal soluk)
   - Ödeme rozeti: "Ödendi" yeşil veya "4.500 ₺ bekliyor" amber
   - Satır aksiyonları: "Hasta Geldi", "Muayeneyi Başlat" (turuncu vurgu),
     "Hasta Ziyaretini Aç", üç nokta menüsü (Düzenle/İptal).
   NOT: satıra tıklamak diş kliniğinde vizit ekranını açar — satır tıklanabilir
   hissettirmeli. "Tamamlandı" aksiyonu bilinçli olarak YOK (vizit ekranından yapılır).
3. Gün özeti şeridi: toplam randevu, gelen, bekleyen, tahsil edilen ₺ (monospace).
4. Boş durum: "Bu gün için randevu yok" + "Yeni Randevu" CTA.
5. Telefonsuz/dosyasız randevu uyarı satırı: "Hasta dosyası bağlı değil" amber
   rozeti + "Dosya bağla" mini butonu.
```

## ~~PROMPT 4 — Hekimler sayfası~~ (İPTAL — Codex'e verme)

Furkan mevcut tasarımı canlıda inceledi (2026-08-02): kart düzeni, stat şeridi
ve haftalık program chip'leri temaya yeterince oturuyor; terminoloji
"Hekimler"e çevrildi. Yeniden tasarım gereksiz.

## ~~PROMPT 5 — Kasa sayfası~~ (İPTAL — Codex'e verme)

Kasa, Codex'e gitmeden çözüldü: diş sektörü ortak premium kasaya
(`BeautyCashRegister`, güzellik/kuaförle aynı 3 sütunlu tasarım) taşındı.
Tahsilat tedavi planlarına otomatik mahsup ediliyor, mahsup dökümü makbuzda
kalıcı görünüyor, vadesi gelen taksitler kuyruğun altında listeleniyor.

---

## Teslim akışı

1. Prompt'u Codex'e ver → tek HTML al.
2. HTML'i repo köküne `codex_html/` altına at (ör. `codex_html/treatment-plans.html`).
3. Claude'a "X tasarımı geldi, uygula" de — işlev/hook'lara dokunmadan görsel
   katman mevcut bileşene taşınır, dark mode `--dc-*` üzerinden otomatik gelir.
