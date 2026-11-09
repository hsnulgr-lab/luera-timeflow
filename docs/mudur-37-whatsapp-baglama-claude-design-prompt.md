# Müdür 37 · Telefondan WhatsApp bağlama — Claude Design promptu

**Yazıldı:** 2026-11-09. Luera TimeFlow'un telefon uygulamasında salonun
WhatsApp hattını **telefondan** bağlama ve yönetme ekranı. Bugün telefonda böyle
bir ekran yok; uygulama "WhatsApp bağlı değil · masaüstünden bağlanır" diyor.
Bilgisayarı olmayan tek kişilik salon hattını hiç bağlayamıyor. Oysa
hatırlatmalar, randevu onayları, iptal haberleri ve akıllı asistanın hepsi bu
hatta bağlı: hat yoksa salonun WhatsApp tarafı hiç yok.

Hedef: **tek elle, iki dakikada, ne yaptığını anlayarak bağlanan** bir akış ve
bağlandıktan sonra hattın sağlığını bir bakışta gösteren sakin bir sayfa.

**Effort: High.** Tek turda bitsin. Aşağıdaki her içerik maddesi gerçek ve
koddan doğrulandı: masaüstü `src/pages/settings/bolumler/WhatsApp.tsx`,
sunucu `supabase/functions/whatsapp-proxy/index.ts`, telefon
`mobile/src/lib/actionPill.ts`, `mobile/app/mudur/profile.tsx`. Uydurma alan,
uydurma sayı, uydurma özellik ekleme. Yeni bir veri gerekiyorsa
**"yeni veri"** diye işaretle; çizebilirsin ama ayrı tut.

---

## Ekler — `whatsapp-baglama-ekleri/` klasörü, yalnız bunlar

1. `01 masaustu-whatsapp-bagli.png` · `02 masaustu-whatsapp-bagli-degil.png` —
   masaüstündeki Ayarlar → WhatsApp. **İçerik envanteri olarak** bak: telefonda
   hangi bilginin olacağını buradan al (durum, son 24 saat, test mesajı,
   bağlantıyı kes). Masaüstünün düzeni ve kutu dili kopyalanmayacak.
   Görüntüdeki sayılar (14 / 0 / 2 / 9, %13) test düzeneğinin örnek verisi.
   Altta görünen asistan ayarları bu turun kapsamı dışında.
2. `03 Luera Mobil - Mudur 27 Profil.html` — telefondaki **İşletme** sekmesi.
   Yeni "WhatsApp" satırı bu listeye girecek; satırın dili, bölüm başlıkları ve
   alt sayfaya geçiş buradan.
3. `04 Luera Mobil - Mudur 16 Randevu Onayi.html` — randevu kurulunca açılan
   onay ekranı ve WhatsApp gönderimi (gönderiliyor / gönderildi / gönderilemedi).
   "WhatsApp bağlı değil" hatasından bu yeni akışa bir yol açılacak.
4. `05 Luera Mobil - Mudur 34 Eylem Hapi v2.html` — akıştaki eylem hapı. Bugün
   hat bağlı değilken hapın WhatsApp hücresi "WhatsApp bağlı değil ·
   masaüstünden bağlanır" diyor; bu, yeni akışa giden ikinci kapı olacak.
5. `06 Luera Mobil - Tek Kisilik v4.html` — telefonun **en son uygulanan
   görsel dili** (yazı, yüzey, renk, koyu tema, hareket ölçüsü). Yeni ekranlar
   bu seviyede olmalı.
6. Telefondan ekran görüntüleri (`07 …`, varsa): bugünkü İşletme sekmesi, açık
   ve koyu temada. Mevcut hâl; kopyalanacak olan değil.

`Luera Mobil - Durumlar.html` ve `Hareket Sözleşmesi.html` **verilmiyor**;
geçerli kurallar aşağıda yazılı.

---

## Bağlam — kim, nerede, ne için

- **Kim:** Salon sahibi ya da müdür. Tek kişilik salonda sahip aynı zamanda
  işi yapan kişi; bilgisayarı çoğu zaman yok.
- **Nerede:** Salonda, işler arasında, telefon elinde. Ekran başında oturmuyor.
- **Ne için:** Bir kez bağlanır ve aylarca dokunmaz. Sonra yalnız iki an var:
  1. **"Hat çalışıyor mu?"** Bir müşteri "mesaj gelmedi" dediğinde bakılır.
  2. **"Bağlantı düştü."** Telefon değişti, WhatsApp çıkış yaptı, uzun süre
     internetsiz kaldı. Yeniden bağlanır.

Yani bu bir "ayar sayfası" değil: **bir kez kurulan bir köprü ve onun sağlık
ışığı.** Kurulum anı biraz el tutmalı. Sonrası sakin ve kısa olmalı.

## En önemli gerçek — aynı telefon kendi QR'ını okuyamaz

WhatsApp'a başka bir cihaz bağlamanın iki yolu var. Masaüstü bugün yalnız
birincisini kullanıyor:

| Yol | Nasıl | Telefonda ne zaman doğru |
|---|---|---|
| **QR kod** | Bizim ekranımız QR gösterir; WhatsApp'ın kamerası okur (WhatsApp → Ayarlar → Bağlı Cihazlar → Cihaz Bağla). | Salonun WhatsApp'ı **başka bir telefonda** ise (örneğin salonun ayrı SIM'li telefonu): QR bu telefonda görünür, öteki telefon okur. |
| **Telefon numarasıyla bağlama** | Kullanıcı hattın numarasını yazar; biz **8 karakterlik eşleştirme kodu** gösteririz (ör. `K7RM-2P4X`). WhatsApp'ta Bağlı Cihazlar → Cihaz Bağla → *"Bunun yerine telefon numarasıyla bağla"* → kod girilir. | Salonun WhatsApp'ı **bu telefonda** ise. Küçük salonların çoğu böyle: hat sahibinin kendi numarası. QR burada imkânsız; telefon kendi ekranını okuyamaz. |

**Telefonda varsayılan yol numarayla bağlamadır.** QR, "WhatsApp başka bir
telefonda" seçilince çıkar. Bu ayrımı kullanıcıya teknik kelimeyle değil, tek
bir soruyla sor: **"Salonun WhatsApp'ı hangi telefonda?"** →
"Bu telefonda" / "Başka bir telefonda".

> **Yeni veri:** Eşleştirme kodu için sunucu, bağlanma isteğine numarayı
> ekleyip kodu döndürecek (WhatsApp sunucumuz bunu destekliyor; küçük bir
> ek). QR yolu bugün hazır.

## Tasarlanacak ekranlar

Her ekran **açık ve koyu temada**. En küçük telefon (iPhone SE, 375 pt) ve en
büyüğü (Pro Max) düşünülmeli; tek elle, alt yarıda basılır.

### A · Giriş noktaları (üç kapı, tek akış)

- **A1 · İşletme sekmesinde yeni "WhatsApp" satırı.** Satır hattın durumunu
  sağında söyler: **Bağlı** · **Bağlı değil** · **Bağlantı düştü**. Renk tek
  başına anlam taşımaz; kelime her zaman yazılı. Listede nerede duracağını sen
  öner. Bugünkü sıra: Çalışma saatleri, Hizmetler ve fiyatlar, Ekip, Personel,
  Paketler, Müşteriler, Hesap, Görünüm, Bildirimler, Yasal. Bizim önerimiz:
  Hizmetler'in altında, "müşteriyle iletişim" tarafında.
- **A2 · Eylem hapı.** Hat bağlı değilken WhatsApp hücresi bugün "masaüstünden
  bağlanır" diyor. Artık **"buradan bağlanır"** demeli ve bu akışı açmalı.
  Yalnız hücrenin açıklama metni ve hedefi değişir, hap tasarımı aynı kalır.
- **A3 · Randevu onayı ekranı.** Mesaj "WhatsApp bağlı değil" diye
  gönderilemediğinde, "Sonra"nın yanında **"WhatsApp'ı bağla"** yolu. Bağlanıp
  geri dönünce mesaj tekrar denenebilmeli.

### B · Bağlı değil — ilk tanışma

Hat hiç bağlanmamışken açılan sayfa. Sorduğu tek şey: *bağlayayım mı?*

- **Bağlanınca ne olacağı**, üç kısa maddeyle:
  - randevu onayları ve hatırlatmalar müşteriye salonun numarasından gider,
  - asistan açıksa müşteri hatırlatmaya "Evet / Hayır" diye cevap verebilir,
  - asistan açıksa gelen mesajlara cevap verir.

  Pazarlama cümlesi değil, olacak olanın düz anlatımı.
- **Güven cümlesi:** Bağlantı, telefondaki WhatsApp'ın "Bağlı Cihazlar"ına bir
  cihaz eklemektir. Telefondaki sohbetler yerinde kalır; istenince oradan da
  kaldırılabilir.
- **Tek ana düğme:** "WhatsApp'ı bağla".

### C · "Salonun WhatsApp'ı hangi telefonda?"

İki büyük, kolay seçenek:
- **Bu telefonda** · "Numaranızla bağlanırsınız". Varsayılan, önerilen.
- **Başka bir telefonda** · "O telefonla QR kodu okutursunuz".

### D · Numarayla bağlama (varsayılan yol)

1. **D1 · Numara:**
   - Hattın numarası, Türkiye biçiminde (`0532 000 00 00`).
   - İşletmenin kayıtlı telefonu varsa o hazır gelir ve değiştirilebilir.
   - Düğme: **"Kodu al"**.
2. **D2 · Kod:**
   - 8 karakterlik kod, ekranın kahramanı: büyük, eşit genişlikli, iki dörtlük blok (`K7RM-2P4X`). **Kopyala** düğmesi.
   - Kısa, numaralı adımlar:
     1. WhatsApp'ı açın.
     2. Ayarlar → **Bağlı Cihazlar** → **Cihaz Bağla**.
     3. **"Bunun yerine telefon numarasıyla bağla"**ya dokunun.
     4. Kodu girin.
   - WhatsApp bazen kendisi "kodu girin" bildirimi de gösteriyor; bunu bir yan not olarak söyle, adımları bozmasın.
   - **"WhatsApp'ı aç"** düğmesi (uygulamaya geçer).
   - Kodun süresi kısa (birkaç dakika). Süreyi sakin bir sayaçla göster. Süresi dolunca kod sönükleşir ve **"Yeni kod al"** çıkar. Kırmızı alarm gerekmez.
3. **D3 · Bekleme:**
   - Kullanıcı WhatsApp'tan dönünce ekran bağlantıyı kendiliğinden fark eder (her 3 saniyede bir sorulur).
   - "Bağlantı bekleniyor…" hâli sakin olsun; kullanıcı beklerken ne yapacağını bilsin.
   - "Vazgeç" her an mümkün.

### E · QR ile bağlama (başka telefon)

- QR büyük ve beyaz zemin üstünde (koyu temada da okunabilir olmalı).
- Altında üç adım:
  1. Diğer telefonda WhatsApp'ı açın.
  2. **Bağlı Cihazlar** → **Cihaz Ekle**.
  3. Kamerayı bu koda tutun.
- QR her **60 saniyede** yenilenir. Bunu bugünkü masaüstü gibi bir sayaçla göster ("0:42 sonra yenilenir"). Elle **Yenile** de olsun.
- Ekran parlaklığı düşükse okutmak zorlaşır. "Ekranı aydınlat" öneri olarak düşünülebilir; zorunlu değil.

### F · Bağlandı

- **F1 · Başarı anı:**
  - Kısa ve sevindirici, ama abartısız. Bağlandığı an.
  - Altında tek cümle: "Hatırlatmalar ve onaylar artık bu hattan gider."
  - Bir de **"Test mesajı gönder"** önerisi.
- **F2 · Bağlı sayfası** (sonraki her açılışta görülen hâl). Taşıması gerekenler, önem sırasıyla:
  1. **Durum:** "Bağlı · 29 Ekim'den beri". Hattın numarası sistemde kayıtlı değil; **numara uydurma**, yalnız tarih.
  2. **Son 24 saat** dört sayı: Gönderildi · Başarısız · Atlandı · Gelen. Hepsi sıfırsa bu da bir hâl: "Son 24 saatte mesaj yok".
  3. **Son hata** varsa tek satır, insan diliyle. Ham hata kodu yazılmaz.
  4. **Test mesajı:** numara alanı + "Gönder". Sonucu satırın altında: "Gönderildi. Telefonu kontrol edin." ya da sebebiyle "Gönderilemedi".
  5. **"Bağlantıyı kes…"** Ayrı, sakin ve en altta. Onay diyaloğu, masaüstündeki metinle: "Bağlantı kesilince hatırlatmalar ve mesajlar gitmez. Yeniden bağlamak için kodu tekrar almanız gerekir." İki düğme: **Vazgeç** (dolu, güvenli) · **Bağlantıyı kes**.
  6. **Kapsam dışı olanlar için tek satır:** "Asistan ve mesaj ayarları masaüstünde: Ayarlar → WhatsApp." Bu ekran onları taşımıyor (aşağıya bak).
- **F3 · Bağlı ama gelen mesajlar işlenmiyor** (nadir; masaüstünde de var):
  - Uyarı: "Hat bağlı ama gelen mesajlara bot cevap vermiyor. Giden hatırlatmalar etkilenmez."
  - Düğme: **Yeniden bağla**.

### G · Bağlantı düştü

- Hat daha önce bağlıydı, şimdi değil. En önemli uyarı hâli; masaüstü kırmızıyla gösteriyor.
- Söyleyeceği: "Hatırlatmalar ve mesajlar şu an gitmiyor."
- Tek ana düğme: **"Yeniden bağla"** (C'den başlar).
- Bu hâl **A1** satırında ve **A2** hapında da görünmeli: müdür sayfaya girmeden fark etmeli.

### H · Olmayan / okunamayan hâller (durum dili)

Bunlar **üç ayrı** hâldir ve birbirine karıştırılmaz:

| Hâl | Ne demek | Ne söylenir |
|---|---|---|
| **Yükleniyor** | Durum soruluyor | Kısa, iskeletli; "Kontrol ediliyor" |
| **Okunamadı** | Sunucuya ulaşılamadı ya da cevap bozuk | "Durum okunamadı" + **Tekrar dene**. "Bağlı değil" DEME: okunamamak, bağlı olmamak değildir. |
| **Bağlı değil** | Gerçekten bağlı değil | B ekranı |

- **H2 · Yetki yok:** Bağlantıyı yalnız **işletme sahibi** (ve yönetici) kurar ya da keser. Personel hesabı bu sayfayı görürse durumu okur, düğmeleri görmez. Tek cümle: "Bağlantıyı işletme sahibi kurar."
- **H3 · Kod alınamadı / QR alınamadı:** "Kod alınamadı, tekrar deneyin" + Tekrar. Sunucu adı, "instance", "webhook" gibi teknik kelime **yok**.

---

## Kurallar ve sınırlar

- **Dil:**
  - Türkçe, "siz" hitabı, kısa cümle.
  - Teknik kelime yok: instance, webhook, Evolution, API, QR string.
  - Ürün adı metinde geçmez; "salon" yerine sektörden bağımsız **"işletme"** de olur.
- **Renk anlam taşımaz:** Durum her zaman kelimeyle yazılı. Kırmızı yalnız "bağlantı düştü" ve "bağlantıyı kes" için.
- **Hareket:**
  - Uygulamada `react-native-reanimated` var.
  - `gesture-handler`, Lottie ve Skia **yok**; olmayacak.
  - Animasyon: opaklık, kaydırma, ölçek. Başarı anı bunlarla kurulmalı.
- **Ekran geçişleri:** Alt sayfa (sheet) mi, tam sayfa mı, sen öner. İşletme sekmesindeki diğer alt sayfalar tam sayfa açılıyor; kurulum akışı kendi içinde adım adım ilerliyor.
- **Klavye:** Numara alanında klavye açıkken "Kodu al" görünür kalmalı.
- **Geri ve vazgeç:** Her adımda net olmalı. Kod ya da QR beklenirken çıkılırsa bağlantı yarım kalır; bir dahaki açılışta B'den temiz başlanır.

## Kapsam dışı (bu turda çizme)

- Akıllı asistan ayarları ("kimlere cevap versin", deneme numaraları, kullanım). Bunlar masaüstünde.
- Mesaj şablonlarının önizlemesi ve açma/kapama anahtarları (onay, Google değerlendirme, sizi özledik…). Masaüstünde.
- Bilgi bankası.

Telefon bu turda yalnız **hattın kendisini** yönetiyor: bağla, sağlığına bak, sına, kes.

## Teslim

- Tek HTML: `Luera Mobil - Mudur 37 WhatsApp Baglama.html`.
- Bütün hâller yan yana, açık ve koyu: A1–A3, B, C, D1–D3, E, F1–F3, G, H.
- Her ekranın altında bir satır: **ne zaman görünür.**
- Yeni veri gerektiren yerler **"yeni veri"** etiketiyle: eşleştirme kodu.

---

### Claude Design'da küçük kutuya

> Luera TimeFlow telefon uygulaması: salonun WhatsApp hattını telefondan bağlama ve yönetme ekranı (Müdür 37). Ayrıntılar ekteki BRIEF dosyasında; ekler whatsapp-baglama-ekleri klasöründe. Telefonda varsayılan yol numarayla bağlama (eşleştirme kodu), QR yalnız "WhatsApp başka telefonda" için. Açık + koyu, tüm hâller yan yana, tek HTML.

**Effort: High.**
