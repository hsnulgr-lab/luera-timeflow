# MASAÜSTÜ AYARLAR · timeflow.lueratech.com/settings — yeniden — Claude Design promptu

**Yazıldı:** 2026-10-19. Masaüstü giriş "Işık alanı" ile yenilendi; içerideki
en karışık sayfa Ayarlar kaldı. Salon sahibi bir ayarı **bulamıyor**: 9 sekme
iki satıra taşıyor, aynı bilgi (işletme bilgileri) iki ayrı sekmede, bir
ayarın etkisi başka bir sekmede yazıyor, kaydetmenin dört ayrı davranışı var.
Hedef: **bulması kolay, ne yaptığı belli, premium** bir Ayarlar — ve içinde
ilk kez **Hesabım** ile **Hesabı sil**.

**Effort: High.** Tek turda bitsin: aşağıdaki her içerik maddesi gerçek ve
koddan doğrulandı; uydurma alan, uydurma sayı, uydurma özellik ekleme.

---

## Ekler — `ayarlar-ekleri/` klasörü, yalnız bunlar

1. `01 bugun-genel.png` · `02 bugun-moduller-kaynaklar.png` ·
   `03 bugun-calisma-saatleri.png` · `04 bugun-hizmetler.png` ·
   `05 bugun-booking.png` · `06 bugun-whatsapp-mesajlar.png` ·
   `07 bugun-faturalandirma.png` · `08 bugun-veri.png` — bugünkü sayfa.
   **İçerik envanteri olarak** bak; düzen, hiyerarşi ve sekme çubuğu
   kopyalanmayacak.
2. `09 Luera Forms & Surfaces (yalniz bilesen dili).html` — web form kiti:
   alan, açılır liste, anahtar, kart, modal, toast ölçüleri ve hâlleri.
   **Yalnız bileşen dili için.** İçindeki İngilizce örnek metinler ürünümüz
   değil.
3. `10 Luera Masaustu - Giris v2 Isik Alani.html` — masaüstünün en yeni dili:
   marka, yazı, düğme, odak halkası, "eylem opak" kuralı. Işık alanı
   arka planı Ayarlar'a **gelmez** (uygulamanın içi sakin); ama tipografi ve
   bileşen kalitesi bu seviyede olmalı.
4. `11 Luera Fiyatlandirma (Durum 6 = abonelik bolumu).html` — "Aktif
   abonelik · Ayarlar → Faturalandırma" (Durum 6) zaten tasarlandı ve
   uygulandı. Abonelik bölümü **bunu yeni çerçeveye oturtur**, plan
   kartlarını yeniden tasarlamaz.
5. `12 Luera Mobil - Mudur 27 Profil (silme akisi).html` — telefondaki müdür
   profili ve **gerçek silme akışı**. Masaüstündeki silme aynı aileden,
   aynı kelimelerle olacak (bkz. H bölümü).

Durumlar.html ve Hareket Sözleşmesi bu işin eki DEĞİL.

---

## Çıktı kuralı

- **Tek HTML dosyası:** `Luera Masaustu - Ayarlar v1.html`. Kareler aşağıdaki
  sırayla, her karenin başında kodu (A0, A1 … H6).
- **Ana kare 1440 × 900**, uygulamanın bugünkü sol menüsü (luera timeflow
  logolu, Dashboard … Ayarlar, altta kullanıcı) **olduğu gibi** çizilir —
  o menü bu işin konusu değil. Ayrıca: **1280 × 800**, **1024 × 768** ve
  **768 × 1024** (masaüstü yüzü 768 px'e kadar açılıyor; daha darında
  telefon yüzü başka bir ekran, onu çizme).
- **Tema:** açık ve koyu; tek düğmeyle değişsin, kareyi iki kez çizme. A0,
  A1, A6 ve H3'ü iki temada göster.
- **Açıklama kısa:** karar başına tek cümle gerekçe; hareket için tek satır
  (özellik · ms · eğri).
- Web'de çalışacak: **CSS + az JS.** Ağır kütüphane, canvas, video yok.

---

## Bugünkü sayfa — sorunlar (ekran görüntülerinden ve koddan)

1. **9 sekme + başlıkta ayrı bir "Entegrasyonlar" düğmesi.** Sekme çubuğu
   iki satıra taşıyor ("Veri" tek başına alt satırda). Hangi ayarın hangi
   sekmede olduğu tahmin edilemiyor.
2. **Aynı bilgi iki yerde:** "İşletme bilgileri" başlığı hem Genel'de (ad)
   hem Booking'de (adres, telefon, Instagram, harita, hakkında) var. Logo
   Booking'de, ad Genel'de.
3. **Ayar, etkisinden uzak:** Google değerlendirme linki Booking sekmesinde;
   onun yokluğunda gitmeyen mesaj WhatsApp sekmesinde ("Gönderilmiyor —
   Ayarlar → İşletme Profili'nde … boş" — öyle bir yer bile yok). "Sıradaki
   randevu otomasyonu" bir WhatsApp mesajı ama Genel'de duruyor.
4. **Dört farklı kaydetme davranışı, hiçbiri söylenmiyor:**
   - anında kaydedilenler (slot süresi, sadakat ve sıradaki randevu
     anahtarları, modüller, kabin ekle/sil),
   - yalnız sağ üstteki **Kaydet** ile kaydedilenler (ad, sektör, saatler,
     hizmetler, booking alanları, otomatik onay, webhook),
   - alandan çıkınca kaydedilenler (sadakat ödülü, teşvik metni),
   - kendi küçük Kaydet düğmesi olanlar (indirim teklifi, mesaj dili).
   Kullanıcı neyin kaydedildiğini bilemiyor.
5. **Ölü ya da yanlış söyleyen satırlar:**
   - "Yönetici PIN (Mobil)" — telefon uygulaması kullanmıyor; yalnız eski web
     "Personel Modu"nu açıyor. **Yeni tasarımda YOK** (kullanıcı kararı).
   - "Bildirim Ayarları — webhook ayarlarından yapılandırılabilir" kutusu
     yanlış: gerçek bildirimler telefona gidiyor. **Yerine Bildirimler
     bölümü geliyor.**
   - Webhook metni "oluşturulduğunda, güncellendiğinde veya iptal
     edildiğinde" diyor; gerçekte **yalnız yeni randevuda** ve **yalnız online
     randevu sayfası + WhatsApp botundan** gidiyor. Örnek veri biçimi de
     gerçeğinden farklı. (Doğrusu S13'te.)
   - "Entegrasyonlar" (LeadFlow / CallFlow) — karşı sunucu haftalardır
     kapalı. **Yeni tasarımda çizilmez** (kullanıcı kararı).
   - Sektör açıklaması "AI hatırlatma tonu sektörüne göre uyarlanır" diyor;
     ton aslında WhatsApp → Mesaj dili'nden düzenleniyor.
6. **Hesap diye bir yer yok.** Sol alttaki kullanıcı menüsünde "Profil" var
   ama Ayarlar'ın Genel sekmesine gidiyor; ad, e-posta, şifre, giriş
   yöntemleri (Apple / Google), oturumu kapatma ve **hesap silme** masaüstünde
   hiç yok.
7. **Tehlikeli eylemler sıradan görünüyor:** sektör değiştirmek (veriyi
   yanlış ekranlarda gösterir) bir açılır listede, diğer alanlarla aynı
   ağırlıkta.
8. Kutu içinde kutu içinde kutu: her satır krem bir kart, kartlar krem bir
   panelde, panel krem bir zeminde. Hiyerarşi kenarlıkla kurulmaya çalışılmış.
9. Etiketler BÜYÜK HARF + geniş aralık + 9–11 px — 40–55 yaş hedef kitle
   için küçük ve bağırgan.

---

## Ana fikir — üç söz

1. **Bul.** Her ayar en fazla iki tıkta ya da **aramayla** bulunur. Menü
   gruplu ve kısa; adlar salon sahibinin kelimeleri ("Booking Sayfam" değil
   "Online randevu").
2. **Anla.** Her ayarın yanında **neyi etkilediği** yazar ("Müşterinin
   aldığı WhatsApp mesajında görünür", "Kasa'da hizmet seçilince gelen
   tutar"). Etkisi başka yerde görünen ayar, **etkisinin yanında** durur.
3. **Güven.** Neyin kaydedildiği her an bellidir (tek kural, aşağıda).
   Sunucu onaylamadan "Kaydedildi" yazılmaz. Tehlikeli eylemler ayrı ve
   sakin bir yerde, ne olacağını önceden söyleyerek.

---

## Bilgi mimarisi

Ayarlar = uygulama menüsünün sağında **iki bölmeli** bir sayfa: solda
Ayarlar'ın kendi menüsü (gruplu, yapışkan, ~240 px), sağda seçili bölümün
içeriği (okuma genişliği ~720–760 px; tablo gereken bölümlerde daha geniş).
Menünün en üstünde **"Ayarlarda ara"** alanı.

```
Özet                                   (A0 — açılış)
İŞLETME
  İşletme profili                      (A1)
  Çalışma saatleri                     (A2)
  Hizmetler                            (A3)
  {Kaynak}lar  — Kabinler / Koltuklar / Üniteler …  (A4, sektörde yoksa gizli)
  Modüller                             (A5)
MÜŞTERİLERLE İLETİŞİM
  Online randevu                       (A6)
  WhatsApp                             (A7)
  Sadakat kartı                        (A8)
HESAP
  Hesabım                              (A9  — içinde "Hesabı sil")
  Bildirimler                          (A10)
  Abonelik ve faturalar                (A11)
  Verileriniz                          (A12)
GELİŞMİŞ
  Webhook                              (A13)
```

Bölüm adları ve gruplar önerimdir; daha iyisini bulursan gerekçesini yaz.
Ama: **9 düz sekme ya da iki satıra taşan sekme çubuğu yok**, Entegrasyonlar
düğmesi yok.

**{Kaynak}** sektöre göre adlanır: Güzellik/Tattoo → Kabin · Kuaför → Koltuk,
Yıkama · Berber → Koltuk · Estetik, Sağlık → Oda · Diş → Ünite · Fizyoterapi
→ Terapi alanı, Cihaz · Avukat → Toplantı odası · Gym → Salon alanı ·
Gelinlikçi → Prova odası · Danışmanlık, Restoran, Genel → **yok** (menü satırı
çizilmez). Çizerken güzellik salonu (Kabin) örneğini kullan.

### Derin bağlantılar korunur
Uygulamanın başka yerlerinden Ayarlar'a bağlantı var; yeni adresler bunları
karşılamalı (tasarımda yalnız adres adlarını yaz):

| Bugün | Yeni bölüm |
|---|---|
| `/settings` | Özet |
| `?tab=booking` (sol menüdeki "Booking Sayfam" de buraya gidiyor) | Online randevu |
| `?tab=hours` | Çalışma saatleri |
| `?tab=services` | Hizmetler |
| `?tab=whatsapp` | WhatsApp |
| `?tab=billing` (abonelik e-postaları, ödeme dönüşü) | Abonelik ve faturalar |
| `?tab=data` (ve bugün kırık olan `?tab=veri`) | Verileriniz |
| kullanıcı menüsü → "Profil" | Hesabım |

---

## Kaydetme — TEK kural, her yerde aynı

| Ne | Nasıl kaydedilir | Ekranda |
|---|---|---|
| **Anahtarlar ve tek dokunuşluk seçimler** (modül aç/kapa, mesaj aç/kapa, otomatik onay, sadakat aç/kapa, AI asistan, bildirim anahtarları, tema) | **Anında** | Kontrolün yanında 2 sn "Kaydedildi ✓"; hata olursa kontrol eski hâline döner + satırda "Kaydedilemedi — tekrar deneyin" |
| **Yazılan alanlar ve tablolar** (profil, saatler, hizmetler, kaynak adları, mesaj dili, indirim teklifi, sadakat ödülü, webhook …) | **Bölüm başına taslak** | Bir şey değişince içerik bölmesinin altında **yapışkan çubuk**: "Kaydedilmemiş değişiklik · [Vazgeç] [Kaydet]". Değişen alanın solunda ince turuncu çizgi. Çubuk varken başka bölüme geçilirse sor: "Değişiklikler kaydedilmedi — Kaydet / Atma / Kal" |
| **Kendi akışı olan işler** (WhatsApp bağlama, test mesajı, CSV indir/yükle, plan değiştirme, şifre, hesap silme) | Kendi düğmesiyle | Kendi hâlleri (aşağıda) |

- Sağ üstte genel bir "Kaydet" **yok**.
- "Kaydediliyor…" sürerken çubuk kilitli. **Cevap gelmezse**: "Kaydedildiğini
  doğrulayamadık. Sayfayı yenileyip kontrol edin." — ne "kaydedildi" ne
  "kaydedilmedi" (cevap gelmemesi yazılmadığı anlamına gelmez).
- İnternet yoksa çubuktaki Kaydet kapalı, üstünde "İnternet yok — bağlanınca
  kaydedebilirsiniz."

---

## Arama — "Ayarlarda ara"

- Menünün en üstünde; `/` tuşu odaklar. Yazdıkça sonuç listesi: **ayarın
  adı** + gri yol ("İşletme · Hizmetler"). Enter ya da tık → o bölüm açılır,
  alan görünür yere kayar ve 1,5 sn turuncu odak halkasıyla belirir.
- Eş anlamlılar çalışır. Tasarımda bu örneklerle göster:

| Yazılan | Bulduğu |
|---|---|
| fiyat · ücret · tutar | Hizmetler › Ücret |
| saat · mesai · kapalı gün | Çalışma saatleri |
| logo · kapak · galeri · fotoğraf | İşletme profili › Logo · Online randevu › Görseller |
| link · adres · bio · instagram | Online randevu › Randevu adresi · İşletme profili |
| yorum · google · değerlendirme | WhatsApp › Google değerlendirme |
| indirim · kupon | WhatsApp › Sizi özledik › İndirim teklifi |
| onay · otomatik onay | Online randevu › Otomatik onay |
| kabin · koltuk · oda | {Kaynak}lar |
| şifre · e-posta · apple · google | Hesabım |
| sil · hesabı sil · kapat | Hesabım › Hesabı sil |
| fatura · ödeme · plan · iptal | Abonelik ve faturalar |
| excel · csv · yedek · aktar | Verileriniz |
| kvkk · aydınlatma | Online randevu › KVKK aydınlatma metni |

- Sonuç yoksa: "‘{yazılan}’ için ayar bulunamadı." — öneri uydurma.

---

## Bölümler — içerik (hepsi gerçek, bugün var olan veriler)

Her alanın altında tek satırlık **"Nerede görünür / ne işe yarar"** yazısı
olsun (aşağıdaki tırnaklı metinler önerimdir, iyileştirebilirsin). Etiketler
normal harf, okunur boyda; büyük harf yalnız grup başlıklarında.

### A0 · Özet (açılış)
Ayarların **durumunu** tek bakışta gösteren sakin bir sayfa — puan, yüzde,
ilerleme çubuğu **YOK** (kurulum ilerlemesi zaten uygulamanın üstündeki
şeritte; ikinci bir sayaç çelişir). Yalnız olgular, her biri bölümüne
bağlantılı:
- **WhatsApp:** Bağlı · Bağlı değil ("Hatırlatmalar gitmiyor") · Bağlantı
  düştü (kırmızı).
- **Online randevu adresi:** `/book/fuki-salon` · ya da "Adres yok — müşteri
  kendi randevusunu alamıyor".
- **Hizmetler:** "3 hizmet · 1'inin ücreti yok".
- **Google değerlendirme linki:** yoksa "Değerlendirme mesajı gitmiyor".
- **KVKK aydınlatma linki:** yoksa "Randevu sayfasında bağlantı çıkmıyor
  (onay kutusu yine zorunlu)".
- **Abonelik:** plan + durum (Deneme / Aktif / Ödeme bekleniyor / Dönem
  sonunda iptal / Abonelik yok).
- Her satırın **okunamadı** hâli ayrı: "Okunamadı" asla "yok" gibi çizilmez.
- Her şey yolundaysa sayfa yine sakin bir liste; kutlama, konfeti yok.

### A1 · İşletme profili
- **İşletme adı** — "Müşterilere giden WhatsApp mesajlarında ve randevu
  sayfasında görünür."
- **Logo** — kare, yükle / değiştir / kaldır. "Randevu sayfasında."
- **Adres** · **Telefon** · **Instagram** · **Harita linki** ("Hatırlatma
  mesajındaki 📍 bu linke gider") · **Hakkında** (çok satır).
- Alanların yanında küçük rozetler: "Randevu sayfasında" · "WhatsApp'ta".
- **Sektör** — ayrı bir blok, en altta, sakin uyarıyla. Seçenekler:
  Genel · Güzellik / Salon · Kuaför · Berber · Estetik Kliniği · Diş Hekimi ·
  Sağlık / Klinik · Fizyoterapi · Tattoo / Piercing Stüdyosu · Avukatlık
  Bürosu · Danışmanlık / Koçluk · Gym / PT · Gelinlikçi · Restoran / Kafe.
  "Sektör; müşteri kartındaki alanları, kaynak adlarını, uygunluk
  kurallarını ve mesaj dilini belirler." Değiştirince onay penceresi (bugünkü
  metin): kayıtlar silinmez ama yeni sektörün ekranlarında yanlış
  görünebilir; dolu bir işletmede önerilmez. Modüller **kendiliğinden
  değişmez** → sonra Modüller'de "Sektör önerisini uygula" hatırlatması.

### A2 · Çalışma saatleri
- Yedi gün, **Pazartesi'den başlayarak**. Her gün: Açık/Kapalı anahtarı +
  başlangıç – bitiş. **Günde tek aralık** (öğle arası yok — veri modeli tek
  aralık; "mola ekle" çizme).
- Kolaylık: "Pazartesiyi hafta içine uygula" (aynı veriyi yazar).
- Hata: bitiş başlangıçtan önceyse satırda kırmızı not, Kaydet kapalı.
- **Randevu aralığı:** 15 · 30 · 60 dk — "Takvim ve online randevu sayfası
  saatleri bu aralıkla gösterir." (Bugün Genel'de "Slot süresi" adıyla.)

### A3 · Hizmetler
- Tablo: **Renk** (8 hazır renk + özel) · **Ad** · **Ücret** (₺) · **Süre**
  (dk, 5'er) · **Dönüş** (gün; boş = kapalı) · satır menüsü (düzenle, sil).
- **Ücret boş ≠ ₺0:** boşsa satırda "Ücret yok" rozeti ve tablonun üstünde
  tek uyarı: "1 hizmetin ücreti yok — Kasa'da ₺0 açılır ve hızlı listede
  görünmez."
- Ayrıntılar **sağdan açılan panelde** (satıra tıklayınca ya da "Hizmet
  ekle"):
  - **Reçete** — "Bu hizmette tüketilen sarf": Stoklar'daki stok takipli
    ürünlerden satır (ürün · miktar · birim). "İşlem kasaya gönderilince
    stoktan düşer; personel o müşteri için düzeltebilir." Stokta ürün yoksa:
    "Önce Stoklar'dan ürün ekleyin." + bağlantı.
  - **Uygunluk etiketleri** — yalnız kuralı olan sektörlerde (güzellikte:
    *lazer*, *medikal*). "Müşterinin sağlık bilgisiyle çakışan işlem
    seçilemez. Etiketsiz hizmette kural yalnız hizmet adına bakar."
  - **Dönüş** — "Seans bitince kaç gün sonrasına hatırlatma kurulsun."
- Boş hâl: "Henüz hizmet yok — ilk hizmetinizi ekleyin."

### A4 · {Kaynak}lar (örnek: Kabinler)
- Liste: ad · tür (sektörün türleri) · kapasite ("aynı saate kaç kişi").
  "Randevular personelin yanında bir {kaynağa} da bağlanabilir."
- Ekle / sil (silmede onay). Boş hâl: "Henüz {kaynak} yok."

### A5 · Modüller
- Yedi modül: **Randevu** (Takvim, rezervasyonlar ve online randevu) ·
  **Personel** · **Hizmet** · **Kasa** (Tahsilat, gelir ve ürün satışı) ·
  **Analiz** · **Sıra** (kuaför/berber sırasız bekleme) · **Masa** (restoran).
- Sektörün önerdikleri üstte; bu sektörde genelde kullanılmayanlar
  ("Masa", "Sıra" güzellikte) altta, katlanmış "Diğer modüller".
- **Sektör önerisini uygula** — "Güzellik / Salon için: Randevu, Personel,
  Hizmet, Kasa, Analiz."
- Kural: Masa açıkken Kasa kapatılamaz (kilitli, gerekçesi yazılı: "Adisyon
  tahsilatı kasadan yapılır"). Masa açılınca Kasa da açılır.
- Not: "Müşteriler, Dashboard ve Ayarlar her zaman açıktır; kapalı modül
  menüde görünmez."
- Kasa açık ve Masa kapalıysa küçük yol tarifi kartı: "Ürün kataloğu
  Stoklar'da. [Stoklar'a git]".

### A6 · Online randevu
- **Randevu adresi:** `timeflow.lueratech.com/book/` + düzenlenebilir kısım
  (küçük harf, tire; Türkçe harfler kendiliğinden çevrilir) · **Kopyala** ·
  **Sayfayı aç**. Adres boşsa yalnız alan + "Bir adres belirleyin".
- **Otomatik onay** anahtarı — açık: "Gelen randevular anında onaylanır" ·
  kapalı: "Gelen randevular önce onayınızı bekler".
- **Görseller:** Kapak fotoğrafı (geniş) + Galeri (çoklu; ekle, sil).
  Logo İşletme profili'nde — burada küçük önizleme + "İşletme profilinden
  değiştirin".
- **KVKK aydınlatma metni linki** — "Randevu sayfasındaki onay kutusunun
  yanında görünür. Metni siz yayımlarsınız; veri sorumlusu işletmenizdir."
- **Web sitenize gömün** — katlanmış; açınca kod bloğu + "Kodu kopyala".
  "Kodu sitenizin HTML'ine yapıştırın; randevu ekranı sitenizin içinde
  açılır."
- Sağda (geniş ekranda) randevu sayfasının **küçük canlı önizlemesi**
  (logo, kapak, ad) önerilir — gerekçeni yaz.

### A7 · WhatsApp
Üç blok, bu sırayla:

**1 · Bağlantı** — durumlar ayrı ayrı çizilsin:
- *Kontrol ediliyor* · *Bağlı değil*: "Bağla'ya bastığınızda işletmenize özel
  bir WhatsApp hattı hazırlanır ve QR kod çıkar. Telefonunuzdan WhatsApp →
  Bağlı Cihazlar → Cihaz Ekle ile okutun." + **[WhatsApp'ı bağla]**
- *Hazırlanıyor* · *QR* (kod + 60 sn geri sayım + "Yenile")
- *Bağlı*: hat adı · **son 24 saat**: Gönderildi · Başarısız · Atlandı ·
  Gelen (dört sayı) · son hata varsa kodu · **Test mesajı gönder**
  (telefon + Gönder; "Randevu onay mesajıyla aynı yoldan gider") ·
  **Bağlantıyı kes** (ikincil, onaylı)
- *Bağlantı düştü* (kırmızı): son hata + **[Yeniden bağlan]**
- *Hat bağlı ama gelen mesaj botu sessiz* uyarısı (amber)

**2 · AI asistan** (yalnız bağlıyken) — anahtar. Açık: "Hattınıza yazan
müşteriye bot cevap veriyor: hizmet, gün ve saati anlayıp müsait saatleri
sunuyor, onay alınca randevuyu oluşturuyor." Kapalı: "Bot cevap vermiyor;
mesajlar kaydediliyor, siz telefonunuzdan yanıtlarsınız." Not: "‘DUR’ yazan
müşterinin çıkış hakkı her zaman çalışır."

**3 · Gönderilen mesajlar** — her biri bir kart: ad · **ne zaman gider** ·
anahtar · WhatsApp baloncuğunda **gerçek önizleme** (işletme adı, ilk
hizmet, harita linki ile doldurulmuş) · gerekiyorsa **etkisinin yanındaki
ayar**:
- **24 saat önce** ve **2 saat önce** hatırlatma — anahtarı YOK, WhatsApp
  bağlıyken her zaman gider (öyle yazılsın).
- **Randevu onayı** — "Randevu oluşur oluşmaz; panelden, online randevudan
  ve WhatsApp botundan."
- **Google değerlendirme** — "Hesap kapandıktan ~3 saat sonra, randevu
  başına bir kez." **Google değerlendirme linki alanı BURADA** ("Google
  işletme profilinizde Yorum iste → bağlantıyı kopyala"). Link boşsa kart:
  "Link yok — bu mesaj gitmiyor."
- **Dönüş hatırlatması** — yalnız sektörde varsa (ör. "bakım yenileme"):
  "Son ziyaretten ~30 gün sonra, tarihe 2 gün kala bir kez."
- **Sizi özledik** — "60 günden uzun gelmeyen, ileri randevusu olmayan
  müşteriye bir kez." + **İndirim teklifi**: oran (%) · geçerlilik (gün);
  oran 0 ise "Mesaj indirimsiz gider". "Her müşteriye özel kod üretilir;
  Kasa'da girilince uygulanır ve kimin döndüğü ölçülür."
- **Paket yenileme** — "Tüm seansları biten paketin sahibine paket başına
  bir kez."
- **Sıradaki randevu daveti** (bugün Genel'deki "Sıradaki Randevu
  Otomasyonu") — "Randevu tamamlanınca tekrar randevu daveti." + isteğe
  bağlı **teşvik satırı** ("🎁 …" olarak eklenir). Gerekenler: WhatsApp
  bağlı + randevu adresi tanımlı; eksikse kart söyler.
- WhatsApp bağlı değilse kartlar sönük + üstte tek satır: "WhatsApp bağlı
  değil — bu mesajların hiçbiri gitmiyor."

**Mesaj dili** (katlanmış, "Mesaj dilini düzenle"): **Karakter** ("AI bu
tonu kullanır") · **Muhatap** (ör. "müşterimiz") · **"…hatırlatmak
istedik" ifadesi** (ör. "bakımınızı") · **Emoji** (en çok 4) · sektörde varsa
**Dönüş kavramı** + **kaç gün sonra**. Altında salt okunur "Güvenlik kuralı
korunur: …". Rozet: "Sektör varsayılanı" ya da "Kendi mesaj diliniz" +
"Sektör varsayılanına dön".

### A8 · Sadakat kartı
- Anahtar: **Dijital müşteri kartı** — "Her tamamlanan randevu 1 damga."
- Açıkken: **Eşik** (5 · 6 · 8 · 10 · 12 · 15 · 20 ziyaret) · **Ödül**
  (yazı; ör. "Ücretsiz hizmet"). Önizleme cümlesi: "10 gelişte 1 ücretsiz
  hizmet".

### A9 · Hesabım (YENİ)
- **Ad soyad** (sol alttaki menüde görünen) · **E-posta** (salt okunur) ·
  **Rolünüz:** İşletme sahibi / Yönetici.
- **Giriş yöntemleri** — salt okunur rozetler: E-posta ve şifre · Google ·
  Apple (hangileri bağlıysa). Bağla / kopar düğmesi **yok**.
- **Şifre** — şifresi olan: "Şifreyi değiştir" (yeni şifre + kural: "En az 8
  karakter olsun, içinde bir rakam bulunsun"). Yalnız Apple/Google ile
  girmiş, şifresi olmayan: "Şifre belirleyin — e-postanızla da girebilirsiniz."
- **Görünüm:** Açık · Koyu (iki seçenek; "Sistem" seçeneği bugün yok).
- **Oturumu kapat.**
- **Tehlikeli bölge** — sayfanın en altında, ince kırmızı kenarlı sakin bir
  alan: "Hesabı sil" (bkz. H bölümü). Yalnız **işletme sahibi** görür;
  yöneticide düğme yok, yerine: "Hesap silme yalnız işletme sahibine açık."

### A10 · Bildirimler (YENİ masaüstünde)
- Üç anahtar, telefondakiyle **aynı tercih** (biri değişince öteki de):
  - **Yeni randevu** — "Müşteri online randevu sayfasından ya da WhatsApp'tan
    randevu alınca. Kendi girdiğiniz randevuda bildirim gelmez."
  - **Randevu iptali**
  - **Adisyon kasada** — "İşlem bitti, ödeme bekliyor."
- Üstte tek cümle: "Bildirimler TimeFlow telefon uygulamanıza gelir.
  Telefonda bildirim izni kapalıysa hiçbiri gelmez."
- Not: "Üçü de kapalıysa bildirim gelmez; ayrı bir ana anahtar yok.
  Personel kendi bildirimlerini kendi telefonundan yönetir."
- Tercih okunamadıysa anahtarlar "kapalı" çizilmez: "Tercihler okunamadı —
  yenileyin."

### A11 · Abonelik ve faturalar
- Ek 11'deki **Durum 6** olduğu gibi: mevcut plan + durum rozeti · sonraki
  tahsilat / deneme bitişi · kullanım · **Planı değiştir** · plan kartları
  (Başlangıç ₺299 · Pro ₺599 · İşletme ₺1.199; yıllıkta ₺239 / ₺479 / ₺959) ·
  fatura geçmişi · **iptal bağlantısı açıkça görünür**.
- Abonelik yokken: "Aktif aboneliğiniz yok. Bir plan seçin — ilk 7 gün
  ücretsiz, deneme içinde iptal ederseniz ücret alınmaz."
- Yalnız yeni çerçeveye oturt; kart tasarımını değiştirme.

### A12 · Verileriniz
- **İndir** (her biri CSV, "Excel'de doğrudan açılır"): Müşteriler ·
  Randevular · Tahsilatlar · Hizmetler · Paketler / Planlar · Ürünler / Stok —
  her satırda içerdiği alanlar tek satırda.
- **Aktar:** Müşteriler · Hizmetler · Ürünler (seçici) → "CSV dosyası seç" ·
  "Örnek şablon" → **sütun eşleme** adımı ("Sütunlar otomatik tanınır;
  yanlış eşleşirse düzeltin") → sonuç ("42 kayıt eklendi · 3 satır
  yazılamadı" — satır bazında neden bugün bilinmiyor, uydurma) ya da
  "Hiçbir kayıt eklenemedi" · "Dosyada okunabilir satır bulunamadı".
- Üst cümle: "Verileriniz size aittir; istediğiniz an tamamını
  indirebilirsiniz."

### A13 · Webhook (Gelişmiş)
- Katlanmış bir "Gelişmiş" grubunda, sade.
- **Doğru metin:** "Müşteri **online randevu sayfasından** ya da **WhatsApp
  botundan** yeni randevu aldığında bu adrese bildirim gönderilir. Panelden
  girilen randevular, değişiklikler ve iptaller gönderilmez."
- **Webhook adresi** alanı.
- **Gönderilen veri** (gerçek biçim):
```json
{
  "event": "reservation.created",
  "source": "timeflow",
  "timestamp": "2026-10-20T07:12:00.000Z",
  "data": {
    "id": "…", "customer_name": "Ayşe Demir", "customer_phone": "+90…",
    "customer_email": null, "date": "2026-10-21",
    "start_time": "10:00", "end_time": "10:30",
    "service": "Cilt bakımı", "status": "confirmed",
    "notes": "", "source": "booking"
  }
}
```
- "Test gönder" düğmesi **çizme** (sunucuda karşılığı yok).

---

## H · Hesabı sil — masaüstü akışı

Telefondaki akışın (ek 12, "Hesap · ve gerçek silme akışı") masaüstü
kardeşi. **Aynı kelimeler, aynı kurallar:**
- "SİL" yazdırmak **yok** (reddedildi). 30 gün "bekleyen silme" **yok** —
  silme onayın bittiği anda başlar, geri alınamaz.
- Yedek cümlesi tam olarak: "Yedeklerde kalan kopyalar **30 gün içinde**
  yedek döngüsünden çıkar ve geri getirilemez." (Bu bir vazgeçme süresi
  değil, saklama süresi.)
- Sayılar **sunucudan** gelir; bilinmeden liste çizilmez (yükleniyor hâli).

**H1 · Giriş** — Hesabım'ın en altındaki tehlikeli bölge satırı:
"Hesabı sil — Hesabınız ve (tek sahipseniz) işletmenizin tüm verileri
kalıcı olarak silinir." [Hesabı sil…] (kırmızı yazılı, ikincil düğme).

**H2 · Ne silinecek** — ortada bir pencere ya da ayrı sayfa (seçimini
gerekçelendir). İki hâl ayrı çizilsin:
- **Tek sahip:** "İşletmeniz sizinle birlikte silinir." Liste: **312
  randevu · 148 müşteri · 9 hizmet · 2 personelin** bu işletmeye erişimi
  (personelin kendi hesapları durur, yalnız bu işletmeden düşer) ·
  **aboneliğiniz hemen iptal edilir, bundan sonra ücret alınmaz**. Onay
  kutusu: "İşletmenin tüm verilerinin silineceğini anlıyorum."
- **İşletmenin başka bir sahibi varsa:** "İşletme, randevular ve müşteriler
  yerinde kalır; yalnız kişisel hesabınız silinir." Onay kutusu **çizilmez**,
  liste iki satır.
- Ayrıca küçük not: "Silmeden önce verilerinizi indirmek isterseniz:
  Verileriniz →" (A12'ye bağlantı).

**H3 · Apple ile doğrulama** — yalnız hesapta **Apple** giriş yöntemi
varsa, son adımdan önce: "Apple Kimliğinizdeki TimeFlow bağlantısını da
kaldırmak için Apple ile bir kez daha doğrulayın." [ Apple ile doğrula]
(Apple'ın web düğmesi kuralı: siyah/beyaz, Apple logosu). Pencere
kapatılırsa sessiz, adım bekler. Hâller: doğrulandı ✓ · "Bu Apple Kimliği bu
hesaba ait değil — hesabı açtığınız Apple Kimliğiyle deneyin." · "Apple'a
şu an ulaşılamıyor." (bu son durumda silme yine yapılabilir; ekranda: "Apple
bağlantısını Ayarlar → Apple Kimliği → Apple ile Giriş'ten siz de
kaldırabilirsiniz.")

**H4 · Son onay — basılı tut** — "Silmek için basılı tutun" düğmesi, 2 sn;
dolan halka/çubuk ile. Klavye: odaktayken **Enter ya da Boşluk'u basılı
tutmak** aynı işi yapar (erişilebilirlik — yazılı göster). Bırakılırsa
sıfırlanır.

**H5 · Siliniyor / hata hâlleri**
- Sürüyor: "Siliniyor…" (iptal düğmesi yok — başladı).
- "Aboneliğiniz iptal edilemedi; hiçbir şey silinmedi. Biraz sonra tekrar
  deneyin." (abonelik iptal edilemezse silme yapılmaz.)
- İnternet yok: başlamadan önce durdurur.
- **Cevap gelmedi:** "Sonucu doğrulayamadık. Giriş yapmayı deneyin — giriş
  yapamıyorsanız silme tamamlanmıştır." (ne "silindi" ne "silinmedi").

**H6 · Bitti** — oturum kapanır, giriş sayfası açılır; üstte giriş
sayfasının mevcut bildirim notu: "Hesabınız silindi." (A9 ve giriş
sayfasıyla aynı sakin dil.)

---

## Kısıtlar

### Marka ve malzeme
- Uygulamanın içi: **sakin krem/mürekkep yüzeyler**. Bugünkü değerler —
  açık: zemin `#FAF7F3`, yüzey 2 `#F0E9DF`, yüzey 3 `#E9E1D5`, mürekkep
  `#0E0E0E`, krem `#F3EDE3`; koyu: zemin `#111009`, yüzey 2 `#191610`,
  yüzey 3 `#231E18`, metin `#F3EDE3`. İyileştirebilirsin ama aynı aileden.
- **Kutu içinde kutu yok.** Hiyerarşi boşluk, tipografi ve ince ayraçla;
  kart yalnız gerçekten ayrı bir nesne için (mesaj kartı, bağlantı kartı).
- Yazı tipi **Hanken Grotesk**; sayılar ve kod için JetBrains Mono.
- Renk: turuncu `#FF5A1F` yalnız **birincil eylem** (Kaydet, Bağla, Ekle),
  açık anahtar ve odak. Kırmızı `#E07272`/`#C94040` yalnız hata ve tehlikeli
  bölge; amber `#D9A43B`/`#B87A00` uyarı; yeşil `#5FBF64`/`#2D8F32` olumlu.
  WhatsApp yeşili yalnız WhatsApp logosunda ve baloncuk önizlemelerinde.
- Marka: "luera" + turuncu "timeflow" etiketi (sol menüde zaten var).

### Metin
- **Siz** dili, kısa, sakin. Hedef kitle 40–55 yaş salon sahibi.
- İngilizce ya da teknik kelime yok: "Booking" → Online randevu, "Slot" →
  Randevu aralığı, "Modül" kalabilir. "Webhook" yalnız Gelişmiş'te.
- **Uydurma yok:** olmayan özellik, sayı, rozet, "önerilen", "yeni" yok.
  Ekrandaki sayılar örnek veri olarak (312 randevu vb.) yalnız çizim için.
- Boş, okunamadı ve yükleniyor hâlleri birbirinden ayrı çizilir.

### Erişilebilirlik ve web
- Klavyeyle tam gezinme; görünür odak halkası (turuncu, 2 px, ofsetli).
  Menü ok tuşlarıyla, arama `/` ile.
- Kontrast WCAG AA (metin ≥ 4.5:1) iki temada da.
- Anahtarlar `role="switch"`; durum yazıyla da söylenir (yalnız renk değil).
- `prefers-reduced-motion`: kayma ve dolma animasyonları kapanır; bilgi
  (Kaydedildi ✓, basılı tutma ilerlemesi yazıyla) yine görünür.

### Hareket
- Bölüm değişimi: içerik çapraz solma 160 ms, kayma yok.
- Yapışkan kaydet çubuğu: alttan 12 px + opaklık, 200 ms.
- Arama sonucuna gidiş: kaydırma + 1,5 sn odak halkası.
- Basılı tut: halka/çubuk doğrusal 2 sn; bırakınca 200 ms geri.
- Yalnız opaklık, kayma ve ölçek; gölge patlaması, zıplama yok.

---

## Kareler

- **A0** Özet — 1440 × 900 (açık + koyu); bir de "okunamadı" satırlı hâli.
- **A1** İşletme profili — taslak çubuğu görünür hâlde (ad değiştirilmiş).
- **A2** Çalışma saatleri — bir gün kapalı, bir gün hatalı (bitiş < başlangıç).
- **A3** Hizmetler — tablo + bir satırda "Ücret yok"; sağ panel açık
  (reçete + uygunluk etiketleri dolu).
- **A4** Kabinler — dolu ve boş hâl.
- **A5** Modüller — Masa açık, Kasa kilitli hâl ayrıca.
- **A6** Online randevu — adres dolu (açık + koyu); adres boş hâl küçük.
- **A7** WhatsApp — **bağlı** (sağlık sayıları, test mesajı, AI asistan,
  mesaj kartları); ayrıca **bağlı değil**, **QR**, **bağlantı düştü** küçük
  kareler; Mesaj dili açık hâli.
- **A8** Sadakat kartı — açık hâli.
- **A9** Hesabım — e-posta + Google bağlı hesap; ayrıca yalnız Apple'lı,
  şifresiz hesap ("Şifre belirleyin"); yönetici (silme yok) hâli küçük.
- **A10** Bildirimler — üç anahtar + okunamadı hâli.
- **A11** Abonelik — Durum 6'nın çerçeveye oturmuş hâli + abonelik yok hâli.
- **A12** Verileriniz — indir listesi + sütun eşleme adımı.
- **A13** Webhook — Gelişmiş içinde.
- **S1** Arama — "fiyat" yazılmış, sonuç listesi açık; sonuç yok hâli.
- **S2** Kaydedilmemiş değişiklikle başka bölüme geçme sorusu.
- **S3** Kaydetme hâlleri: kaydediliyor · kaydedildi · cevap gelmedi ·
  internet yok · anahtar hatası (geri dönen anahtar).
- **H1–H6** Hesabı sil — tek sahip ve ikinci sahip; Apple adımı; basılı
  tutma ortası (%60 dolu); hata ve bitti hâlleri. H3 iki temada.
- **R1** 1280 × 800 ve **R2** 1024 × 768 — Ayarlar menüsü daralır (yalnız
  simge + ad, ya da üstte açılır seçici — gerekçeni yaz).
- **R3** 768 × 1024 — menü içerik üstünde açılır liste; kaydet çubuğu
  ekranın altında.

---

## Kitten alma (ek 9) — bunlar ÜRÜNÜMÜZ DEĞİL
İngilizce metinler · "Workspace", "API keys", "Active sessions", "Weekly
digest", "Mention alerts" gibi bizde olmayan bölümler · profil fotoğrafı
yükleme (kişi fotoğrafı yok; logo işletmenin) · iki adımlı doğrulama, güvenlik
anahtarı · e-posta değiştirme · dil seçimi. Kitten alınacak olan yalnız
bileşen ölçüleri ve hâlleri.

## Çizmeyeceklerin
- Uygulamanın sol menüsü (olduğu gibi kalır), Dashboard, takvim.
- Telefon yüzü (768 px altı başka ekran) ve telefon uygulamasının profili.
- Personel yönetimi (Uzmanlar sayfası ayrı), Stoklar, Paketler.
- Kurulum sihirbazı (ayrı iş, ayrı brief).
- Fiyat sayfası ve ödeme duvarları (ek 11'de var).
- Yönetici PIN, Entegrasyonlar (LeadFlow / CallFlow) — tasarımdan çıktı.
