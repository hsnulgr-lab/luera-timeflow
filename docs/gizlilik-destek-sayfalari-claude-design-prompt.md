# Gizlilik ve Destek Sayfaları · Web — Claude Design promptu

**Ekler:**
1. `Luera Mobil - Giris v3 Isik Alani.html` — markanın ve ışık alanının kaynağı.
2. `Luera Landing.html` / `Luera Landing Light.html` — Luera'nın web dili.

**Effort: Medium.**

---

## 0 · Bu tur neden var

App Store, uygulama sayfasında iki **herkese açık web adresi** zorunlu tutuyor:

- **Gizlilik politikası adresi** — uygulamanın hangi veriyi topladığı ve ne
  yaptığı. İncelemeci bu sayfayı açıp okuyor.
- **Destek adresi** — kullanıcının sorun yaşayınca ulaşacağı yer.

İkisi de bugün yok ve yayını bekletiyor. Bu tur **iki sayfanın düzenini**
tasarlıyor. Metnin hukuki içeriği ayrıca yazılacak (bkz. §3); tasarım yeri ve
okunuşu belirliyor.

---

## 1 · Verilmiş kararlar — değişmez

- **Fiyat, plan, satın alma bağlantısı YOK.** Uygulama ücretsiz bir
  tamamlayıcı (App Store 3.1.3(f)); bu sayfalardan satış sayfasına çağrı
  yapılmıyor.
- **Uydurma iletişim bilgisi YOK.** E-posta, telefon, adres, şirket unvanı
  tasarımda `[ … ]` yer tutucusuyla gösterilir; gerçek değerleri işletme
  sahibi girecek.
- **Uydurma iddia YOK:** "ISO sertifikalı", "uçtan uca şifreli", "verileriniz
  Türkiye'de" gibi cümleler kanıtlanmadan yazılmaz — yer tutucu olarak
  bırakılır.
- Tek dil: **Türkçe**.

---

## 2 · Sayfa 1 — Gizlilik

Uzun hukuki metin okunacak; tasarımın işi onu **okunur** kılmak.

- İçindekiler (bölüme atlama), mobilde de çalışmalı.
- Bölüm başlıkları (öneri — metin ayrıca yazılacak):
  1. Kim sorumlu — **veri sorumlusu her salonun kendisi**, Luera veri
     işleyen. Bu ayrım sayfanın en başında ve açık olmalı.
  2. Hangi veriler toplanıyor (hesap, salon, müşteri, personel kayıtları).
  3. Ne için kullanılıyor.
  4. Kiminle paylaşılıyor.
  5. Ne kadar saklanıyor — **hesap silme uygulamanın içinden yapılıyor**;
     silme hemen başlar, yedeklerdeki kopyalar 30 gün içinde döngüden çıkar.
     Bu cümle uygulamadakiyle aynı olmalı.
  6. Haklarınız (KVKK md. 11) ve başvuru yolu.
  7. Değişiklikler ve son güncelleme tarihi.
- "Hesabınızı nasıl silersiniz" kısa bir kutu: **Profil → Hesap → Hesabımı
  sil**. Apple bunu arıyor.

## 3 · Sayfa 2 — Destek

Kısa ve eyleme dönük. Kitle 40–55 yaş salon sahibi.

- Tek birincil iletişim yolu (`[destek e-postası]`), ne kadar sürede dönüleceği
  `[ … ]` yer tutucusu.
- Sık sorulan 4–6 soru — öneriler (cevaplar gerçek davranışa göre
  yazılacak):
  - Personelimi telefona nasıl bağlarım? (ekip kodu)
  - Personel şifresini unuttu.
  - Telefonumu kaybettim / değiştirdim.
  - Hesabımı nasıl silerim?
  - Masaüstündeki değişiklik telefonda görünmüyor.
- Gizlilik sayfasına bağlantı.

---

## 4 · Görsel dil

- Luera web dili: ışık alanı yalnız başlık bölgesinde, gövde **düz ve
  okunaklı** (uzun metin ışık alanı üstünde okunmaz).
- Marka: `luera` + turuncu hap içinde `timeflow`. Turuncu `#FF5A1F` yalnız
  bağlantı ve eylemde.
- Yazı tipi **Hanken Grotesk**; gövde en az 17 px, satır uzunluğu ~70 karakter.
- **Koyu ve açık** tema, sistem tercihine göre.
- Telefonda (375 px) yatay kaydırma yok.

---

## 5 · Çıktı

1. **Gizlilik** sayfası — masaüstü (1280) + telefon (375), koyu + açık.
2. **Destek** sayfası — aynı ölçüler.
3. Tek dosya HTML, dış bağımlılık yalnız Google Fonts — statik olarak
   barındırılabilsin.
4. Doldurulacak yer tutucuların listesi.

---

## Kutuya yazılacak cümle

> Luera TimeFlow'un App Store sayfası için zorunlu iki web sayfası tasarla:
> **Gizlilik politikası** ve **Destek**. Türkçe; uzun hukuki metni okunur
> kılan bir düzen (içindekiler, bölüm başlıkları, telefonda da rahat).
> Veri sorumlusu her salonun kendisi, Luera veri işleyen — bu en başta.
> Hesap silme uygulamanın içinden (Profil → Hesap → Hesabımı sil). Fiyat,
> plan, satın alma yok; iletişim bilgisi ve kanıtlanmamış iddialar `[ … ]`
> yer tutucusu. Luera web dili, Hanken Grotesk, koyu + açık, tek dosya HTML.

**Effort: Medium.**
