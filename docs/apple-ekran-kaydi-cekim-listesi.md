# Apple ekran kaydı · çekim listesi

**Neden:** Apple 2.1 bilgi talebi. İstediği cümle aynen şu —
*"A screen recording captured on a physical device, running the latest
operating system, demonstrating the app's functionality. The recording must
begin with launching the app and show the typical user flow."*

Ve şunların **mutlaka** içinde olmasını istiyor:
- Hesap oluşturma (registration)
- Giriş (login)
- **Hesap silme (account deletion)**
- Kullanıcı üretimi içerik varsa, şikâyet/engelleme mekanizması
- Ücretli içeriğe erişim varsa o

Bizde son iki madde **yok** (aşağıda neden yok, yazılı). İlk üçü zorunlu.

Hedef süre: **3–5 dakika.** Tek çekim, kesintisiz.

---

## 0 · ÇEKİMDEN ÖNCE — atlanırsa video çöpe gider

### 0.1 🔴 Silmeyi ÖNCE provada dene

**Bu maddeyi atlama.** `account-delete` sunucu fonksiyonu, tek sahipli bir
hesabı silmeden önce Core'daki aboneliği iptal etmeye çalışıyor
(`supabase/functions/account-delete/index.ts:159`). Core'a ulaşamazsa
**502 döndürüyor ve silme HİÇ YAPILMIYOR** — ekranda kırmızı bir hata satırı
kalıyor.

Core hattının kopuk olduğunu biliyoruz: `dodo-webhook` loglarında
`org mirror { message: "no available server" }` görüldü (2026-09-14) ve
abonelik aynası o gün elle onarıldı.

Yani silme kamera karşısında patlayabilir.

**Yapılacak:** kayda BASMADAN, bir kere baştan sona dene —
yeni hesap aç → Profil → Hesap → Hesabımı sil → tamamla.
- **Silme çalışıyorsa:** sorun yok, çekime geç.
- **"Hesap silinemedi" gibi bir satır çıkıyorsa:** dur, bana söyle.
  Dar bir düzeltme hazırlayabilirim — yeni açılmış bir hesabın zaten
  aboneliği yok, iptal edilecek bir şey de yok; o durumda Core'a hiç
  sorulmaması gerekiyor.

### 0.2 iOS'u güncelle

Apple "running the latest operating system" diyor. Ayarlar → Genel →
Yazılım Güncelleme.

### 0.3 Doğru uygulamayı aç

**TestFlight'taki derleme 4.** Expo Go DEĞİL, geliştirme derlemesi DEĞİL.
Telefonda ikisi de varsa karışmasın: çekim öncesi diğerini sil.

Uygulamayı **TestFlight'ın içinden başlatma** — ana ekrandaki ikonuna bas.
Apple "uygulamanın açılışı" görmek istiyor, TestFlight'ın açılışını değil.

### 0.4 Demo tohumunu tazele

Tohumun görüntü ömrü ~1 saat: işlemdeki seans `şimdi−35dk`ya başlıyor, planı
50 dk, yani 15 dakika sonra kırmızı "UZADI"ya dönüyor. Çekimden hemen önce
çalıştır, yoksa akış ekranı ya boş ya bozuk görünür.

### 0.5 Telefonu sessize ve Rahatsız Etmeyin'e al

Gelen bir WhatsApp bildirimi videonun üstüne düşerse hem dikkat dağıtır hem
de başkasının kişisel bilgisi videoya girer. Odak → Rahatsız Etmeyin.

### 0.6 Pili doldur, ekran parlaklığını ortaya al

Kayıt sırasında düşük pil uyarısı çıkarsa video bölünür.

### 0.7 Kaydı başlat

Denetim Merkezi → Ekran Kaydı düğmesi.
**Mikrofon KAPALI** — anlatım gerekmiyor, metin zaten Reply'de.

---

## 1 · ÇEKİM — 14 adım

> Her adımda **2 saniye bekle**. Hızlı dokunuşlar hakemin ne olduğunu
> anlamasını engelliyor. Hakem Türkçe bilmiyor; ekranı okumuyor, **akışı**
> izliyor.

### Bölüm A — Açılış ve giriş

**1.** Uygulamayı çoklu görevden **tamamen kapat**. Ana ekrana dön.

**2.** Kayda bas. **Ana ekrandaki TimeFlow ikonuna dokun.**
Açılış ekranı (turuncu Luera işareti) → karşılama ekranı gelsin. 2 sn bekle.

Karşılamada üç şey görünecek:
- `İşletmemi yönetiyorum` — "E-posta ve şifrenizle girin"
- `Burada çalışıyorum` — "İşletmeden aldığınız kodla girin"
- `Yeni işletme oluştur`

**3.** `İşletmemi yönetiyorum` → demo hesabıyla gir.
E-postayı ve şifreyi yazarken **elini çekme, akıcı yaz** — hakem kimlik
bilgisinin çalıştığını görmeli.

> Bildirim izni penceresi çıkarsa **İzin Ver** de. Gerçek bir iOS akışı,
> göstermek iyi.

### Bölüm B — Günlük kullanım (asıl "typical user flow")

**4. Akış** (açılışta gelen sekme). Yavaşça aşağı kaydır. Görünecekler:
bekleyen müşteri, işlemdeki seans, kasaya hazır adisyon. 3–4 sn dur.

**5.** Bir randevu kartına dokun, kart açılsın — müşteri adı, hizmet, saat,
personel görünsün. 3 sn bekle, geri dön.

**6. Takvim** sekmesi. Haftanın günlerini bir sağa bir sola kaydır, dolu
takvimi göster. 3 sn.

**7. Randevu** sekmesi (ortadaki +). Yeni bir randevu kur:
müşteri ara ya da yeni ad yaz → telefon → hizmet seç → saat seç → oluştur.
Onay ekranını göster. **Bu en önemli adımlardan biri** — uygulamanın
gerçekten veri yazdığını kanıtlıyor.

**8. Kasa** sekmesi. Günün tahsilatı ve bekleyen ödemeler görünsün. 3 sn.

**9. Profil** sekmesi → `Müşteriler`. Listeyi göster, bir müşteriye dokun,
kartını aç. 3 sn. Geri dön.

### Bölüm C — Apple'ın adıyla istediği üç akış

**10.** `Profil` → `Hesap` → `Oturumu kapat`.
Karşılama ekranına dönüldüğünü göster. Bu **login/logout** kanıtı.

**11. KAYIT.** Karşılamada `Yeni işletme oluştur`:
- `Hesabınızı açalım` → **kullanılmamış** bir e-posta + şifre → `Devam`
- `İşletmeniz` → işletme adı yaz (ör. "Test Salon") → sektör seç → `Devam`
- `... hazır` ekranı → `Uygulamayı kullanmaya başla`

Uygulamaya girildiğini göster. Yeni işletme **boş** olacak — normal, hakem
de bunu bekliyor.

**12. SİLME.** `Profil` → `Hesap` → `Hesabımı sil`.

Açılan ekranda **yavaş aşağı kaydır** ve şunları göster:
- Neyin silineceğini sayan liste
- `Önce kayıtlarınızı indirin` satırı
- `SÜRE` notu
- "Silme tamamlandığında oturumunuz kapanır ve bu e-posta ile giriş
  yapılamaz." cümlesi

**13.** Onay kutusunu işaretle ("İşletmenin ve içindeki tüm randevuların
silineceğini anlıyorum") → `Hesabı sil — basılı tutun` düğmesini
**parmağını çekmeden basılı tut**, dolum tamamlanana kadar.

**14.** Karşılama ekranına dönülecek ve üstte **"Hesabınız silindi"** plakası
çıkacak. O plaka 6 saniye duruyor — **kaybolana kadar bekle**, sonra kaydı
durdur.

> Bu son kare Apple'ın asıl aradığı şey: silmenin yerel bir çıkış değil,
> gerçek bir silme olduğunun kanıtı.

---

## 2 · Videoda OLMAMASI gerekenler

| Olmayacak | Neden |
|---|---|
| **Demo hesabının silinmesi** | Demo salonun tek sahibi o. Silersen bütün demo veri cascade ile gider, hakem hiçbir ekranı göremez ve işler haftalarca uzar |
| **Expo Go / geliştirme derlemesi** | Apple mağazaya giden paketi görmek istiyor. Geliştirme kabuğu ret sebebi |
| **TestFlight'tan başlatmak** | "Must begin with launching the app" — ana ekran ikonundan aç |
| **Masaüstü / web paneli** | İncelenen şey iOS uygulaması. Web'i göstermek "asıl ürün başka yerde" izlenimi verir |
| **Fiyat, plan, abonelik, "satın al"** | Yönerge 3.1.3(f). Uygulamada zaten yok; Safari açıp fiyat sayfasına gitme |
| **Başka uygulamadan bildirim** | Rahatsız Etmeyin'i aç |
| **Kesme, hızlandırma, montaj** | Apple kesintisiz akış istiyor. Atlanan adım "gizlendi" sayılır |
| **Boş Akış ekranı** | Tohum tazelenmezse uygulama ölü görünür |
| **Kırmızı hata satırı** | Prova (§0.1) tam bu yüzden var |
| **Anlatım sesi** | Gerekmiyor; metin Reply'de. Mikrofon kapalı |
| **Kişisel veri** | Kayıt ekranında kendi asıl e-postanı kullanma; tek kullanımlık bir adres yeter |

---

## 3 · Apple'ın listesinde olup BİZDE OLMAYAN iki şey

Bunları videoda aramayacağız, çünkü uygulamada yoklar. İkisinin de gerekçesi
Reply metninde yazılı:

**Kullanıcı üretimi içerik + şikâyet/engelleme.** Uygulamadaki tek serbest
metin alanı, bir salonun **kendi** randevusuna ve **kendi** müşterisine
yazdığı özel not. Başka hiçbir salon onu göremiyor, hiçbir yerde
yayımlanmıyor. Bir kullanıcının başka bir kullanıcının içeriğiyle
karşılaşabileceği tek bir ekran yok — bu yüzden şikâyet ya da engelleme
mekanizması gerekmiyor.

**Ücretli içerik.** Uygulamada satın alma yok, fiyat yok, plan yok, yükseltme
çağrısı yok. Abonelik tamamen web'de. Bu bir testle kilitli
(`tests/apple-yonlendirme-yasagi.test.mjs`).

---

## 4 · İsteğe bağlı: personel modu

Apple istemedi. Göstermek ikinci bir soru turu ihtimalini düşürür ama
**riski var**: ekip kodu üretimi bir kez "üretilemedi" dedi ve sebebi hâlâ
hiçbir yere yazılmıyor (`issuePairCode` insert hatasını yutuyor).

**Kural:** kayıt kapalıyken bir kez prova et. Kod ilk denemede geliyorsa
videonun sonuna ekle; gelmiyorsa hiç girme — Notes metni personel modunun
yolunu zaten adım adım anlatıyor.

Eklersen sırası: demo hesabıyla gir → `Profil` → `Personel` →
`Telefon bağla` → kod çıksın → `Profil` → `Hesap` → `Oturumu kapat` →
karşılamada `Burada çalışıyorum` → kod → `Siz kimsiniz?` → personeli seç →
şifre belirle → personelin kendi ekranı.

---

## 5 · Çekimden sonra

**1.** Videoyu izle. Şu üçü net görünüyor mu:
- Uygulamanın ana ekrandan açılışı
- Yeni hesap oluşturma
- "Hesabınız silindi" plakası

Biri eksikse **yeniden çek.** Apple eksik videoyu ikinci kez reddediyor.

**2.** Fotoğraflar'dan dışa aktar. 1080p yeter, 4K gereksiz büyük.

**3.** Sunucumuza koy:

```bash
scp -i ~/.ssh/luera_vps ~/Desktop/timeflow-review.mp4 root@76.13.4.164:/tmp/timeflow-review.mp4
```

Sonra `timeflow.lueratech.com` altında yayınlayıp adresini alırız —
üçüncü bir hesap gerekmez, bağlantı bizde kalır. Yerini birlikte ayarlarız.

Alternatif: listelenmemiş YouTube bağlantısı. Apple kabul ediyor.

**4.** Adresi iki yere birden yaz:
`docs/apple-2.1-bilgi-talebi-cevabi.md` §1 (Reply) ve §2 (Notes).

**5.** Notes → Save → `Reply to App Review` → `Resubmit to App Review`.

Derleme 4 aynen kalıyor. Yeni derleme yok.
