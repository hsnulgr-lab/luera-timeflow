# MÜDÜR 36 · Akış kartının bağlam kutusu (PAKET · UYARI) — Claude Design promptu

Kullanıcı, TestFlight'taki müdür Akış'ında Vildan Ay'ın kartına bakarken
(2026-10-16):

> "bu biraz sade kalmış … biraz daha efektif, renkleri iyi; kalan seans da
> halka içinde mi olsa; biraz daha alanı iyi kullansak … 5 alternatif."

Bu tur **yalnız müdür Akış'ındaki "müşteri dosyası" kartının (A2) bağlam
kutusudur**: kartın ortasındaki koyu kutu, bugün tek satır
`PAKET · Lazer Epilasyon · 6 seans kaldı`. Kartın geri kalanı (baş harf
yuvarlağı, ad, hizmet satırı, sağdaki geri sayım, "Geldi · Yönet") ve
Akış'ın kendisi **değişmiyor**.

**Ekler — yalnız bunlar (başka dosya ekleme):**
1. `Luera Mobil - Mudur 34 Eylem Hapi v2.html` — Akış kart ailesinin onaylı
   son hâli: A1 (panel), A2 (müşteri dosyası), Yönet hapı, jetonlar.
2. `Luera Mobil - Mudur 25 Randevu Karti.html` — A2'ye/randevuya dokununca
   açılan randevu kartı; içindeki koyu müşteri kutusu paketi gösteriyor.
3. `Luera Mobil - Mudur 23 Musteri Karti.html` — müşteri kartı; "HESAP"
   bölümündeki paket satırı.
4. **Ekran görüntüleri (canlı telefon, demo müdür):**
   1. **A2 · koyu tema** — Vildan Ay · Kaş Tasarımı · 20 dk · Selin Kaya ile ·
      sağda turuncu "40 dk / 12:40" · kutu `PAKET  Lazer Epilasyon · 6 seans
      kaldı` · "Geldi" + "Yönet ⌃". Kullanıcının "sade kalmış" dediği hâl.
   2. **Akış · açık tema** — üstte "ADİSYON BEKLİYOR" (₺1.500), ortada aynı A2,
      altta bir A1 (Yasemin Kurt · GİRMESİNE 2 sa 1 dk · 15:30 · 45 dk).
      A1 paneli ve A2 kartı **temanın tersi** çiziliyor: açık temada koyu.
   3. **Akış · koyu tema** — krem A1 panelleri (ör. Uğur Şen · GİRMESİNE
      10 sa 24 dk · "Geldi / Yönet"). ⚠️ Bu görüntü ESKİ derlemeden: oradaki
      `Lazer Epilasyon · 6 Seans · 6 seans · 0/6`, `14:30 · 1 sa` ve kesik
      "Personelin bildirimi kapalı · gönd…" satırı DÜZELTİLDİ (bugün:
      `Lazer Epilasyon · 6 seans kaldı`, `14:30 · 60 dk`, "Personelin
      bildirimi kapalı" tek satırda). Bu görüntüye yalnız krem panelin ve
      koyu temanın GÖRÜNÜMÜ için bak; metinler 1. görüntüdeki gibi.
   4. **Randevu kartı (Müdür 25) · koyu ve açık tema** — müşteri kutusu:
      `VA · Lazer Epilasyon · 6 Seans · 0/6 · İlk ziyaret` + telefon rozeti +
      ok. Kutu **temanın tersi**: koyu temada krem, açık temada koyu.
   5. **Müşteri kartı (Müdür 23) · koyu ve açık tema** — HESAP: `Lazer
      Epilasyon · 6 Seans` / `6 seans kaldı · ₺7.500 ödenmedi` (amber) /
      sağda `0/6` · altında "Tahsilat Kasa'dan yapılır" (ekip modu).

   Demo salonda uyarı notlu müşteri yok; H5–H6'yı aşağıdaki metinden çiz.

**Effort: High.**

---

## Çıktı kuralı — önce bunu oku

- **Tek HTML dosyası:** `Mudur 36 - Baglam Kutusu.html`. Tur yarıda kesilirse
  "devam" dendiğinde kaldığın kareden sürdür.
- **BEŞ YOL**, birbirinden gerçekten farklı (aynı fikrin beş rengi değil).
  Kullanıcı karşılaştırıp seçecek. Sonda tek karşılaştırma tablosu
  (okunurluk · alan · renk · hangi soruyu ilk cevaplıyor · uygulama riski)
  ve **senin** önerin, tek paragraf gerekçeyle.
- Başlangıç fikirleri (birini ya da hepsini değiştirebilirsin):
  1. **Halka** — kalan seans bir halkanın içinde (kullanıcının fikri).
  2. **Seans dizisi** — toplam kadar küçük işaret, kullanılanlar sönük.
  3. **Levha** — müşteri kartının "Kalan seans" levhasının küçük kardeşi.
  4. **Satır içi rozet** — kutu yok; bilgi ad satırının altında tek rozet.
  5. **Serbest** — senin önerin.
- **Tema: tek bir koyu/açık düğmesi.** Aynı kareyi iki temada ayrı çizme.
- **Telefon ölçüsü:** kareler 393 × 852; her yolun **bir** karesi ayrıca
  375 × 667 (küçük ekranda neyin sığdığı asıl soru).
- Kartı Akış'ın İÇİNDE göster (üstte ve altta komşu satırlarla), tek başına
  kart değil: "alanı iyi kullanmak" komşularla birlikte okunur.

## Aynı paket ÜÇ yerde ÜÇ biçimde — bu tur tek dile bağlasın

Bugün aynı paketi müdür üç ekranda üç ayrı biçimde okuyor:

| Yer | Bugün | Ne söylüyor |
|---|---|---|
| Akış A2 kutusu | `Lazer Epilasyon · 6 seans kaldı` | KALAN |
| Randevu kartı (Müdür 25) | `Lazer Epilasyon · 6 Seans · 0/6` | KULLANILAN / toplam |
| Müşteri kartı (Müdür 23) | `6 seans kaldı · ₺7.500 ödenmedi` + sağda `0/6` | ikisi birden |

Akış'tan karta, karttan müşteriye geçen göz **her adımda başka bir sayı**
görüyor ("6 kaldı" → "0/6"). Bu turda A2 kutusunu tasarla; sonra **seçtiğin
dilin öteki iki yere nasıl taşındığını** her yol için **tek bir karede**
göster (randevu kartının müşteri kutusu + müşteri kartının HESAP satırı).
O iki ekranın düzeni değişmiyor — yalnız paket bilgisinin biçimi.

## Her yolda çizilecek hâller

| # | Hâl | Veri |
|---|---|---|
| H1 | Paket, hiç kullanılmamış | Lazer Epilasyon · 6 seans · 6 kaldı |
| H2 | Paket, yarıda | Ağda · 8 seans · 3 kaldı |
| H3 | **Son seans** | Cilt Bakımı · 4 seans · 1 kaldı — "yenileme konuşması" anı |
| H4 | Paket + **ödenmedi** | Lazer · 6 seans · 4 kaldı · ₺2.600 ödenmedi |
| H5 | **Uyarı + paket** (iki satır) | NOT: Hamilelik · gebelikte uygulanmaz · + H2 |
| H6 | Yalnız uyarı (paket yok) | NOT: Saç boyasına alerjisi var |
| H7 | Uzun ad | "Bölgesel Zayıflama ve Sıkılaştırma · 12 seans" · 7 kaldı |
| H8 | Gecikmiş randevu | sağdaki rakam kırmızı "12 dk / gecikti" + H4 — renkler çakışmasın |

## Veri — kartın bildiği ve BİLMEDİĞİ (uydurma)

- **Paket:** ad, toplam seans, kullanılan, kalan; o pakete kalan ödeme
  (bilinmiyorsa yazılmaz, ödenmişse 0 — "₺0" YAZILMAZ). Müşterinin
  **hakkı kalan ilk** paketi gösteriliyor; tükenmiş paket kutuya girmez.
- **Uyarı (NOT):** salonun kural motorundan bir ya da birkaç kısa cümle.
- **Bakiye satırı telefonda YOK** (bilinçli: bakiyenin tek kaynağı
  masaüstü) — tasarlama.
- **BİLİNMEYEN:** bu randevunun pakete bağlı olup olmadığı. Örnekte
  randevu Kaş Tasarımı, paket Lazer — kutu **müşteriyi** anlatıyor, bu
  randevuyu değil. Tasarım "bu seans paketten" iddiasında bulunmasın
  (ücretin paketten düşmesi ayrı bir kuralla, kumandada).

## Dokunulmaz (Akış'ın onaylı kuralları)

- Kronolojik sıra, saat rayı · nokta + etiket · kart anatomisi.
- **Tek kart tek eylem:** "Geldi" turuncu dolgu, ikinci yuva "Yönet". Kutuya
  düğme, ok, dokunma hedefi EKLENMEZ — kartın adına dokunmak zaten müşteri
  kartını açıyor.
- **Krom yok:** araç çubuğu, filtre, sekme yasak.
- Kutu **boşsa hiç çizilmez** (bağlamı olmayan müşteri A1'de kalır).
- **Boy bütçesi:** bugünkü kutu tek satırda ~44 pt. Her yol kutuya en çok
  **72 pt** versin; H5'te (iki satır) en çok **96 pt**. Her karede boyu yaz.

## Renk ve yazı

- **Renk işarette, yazı mürekkepte.** Turuncu bu üründe zaman ve eylem
  (geri sayım, "Geldi"); amber para ve uyarı (ödenmedi); yeşil bitmiş;
  kırmızı gecikme ve risk. Kalan seansa turuncu verirsen sağdaki turuncu
  geri sayımla yarışır — bunu bilerek seç ya da başka bir ton öner.
- Rakamlar tabular (zıplamasın). "6 seans kaldı" bölünmez bir ifade; satır
  sonunda ortadan kırılmasın.
- Yazı kuralı: teknik kelime yok ("kayıt", "sunucu", "senkronize", "hata
  kodu" yasak). "0/6" gibi kesirler değil, **kalan**: müdür randevu verirken
  kalanı sorar.

## Teknik sınır (uygulanabilirlik)

- React Native; halka/işaretler **react-native-svg** ile çizilebilir.
- Hareket yalnız `opacity`, `translateX/Y`, `scale` (yerli sürücü). Halkanın
  dolma animasyonu (çizgi uzunluğu) **yok** — halka durağan çizilir; istersen
  bir kez solarak/büyüyerek belirir.
- Gölge yok; ayrım kenarlık ve yüzey farkıyla (projenin kuralı).
