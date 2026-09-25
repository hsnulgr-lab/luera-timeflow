# App Store Connect — doldurulacak metinler

**Tarih:** 2026-09-25
**Kaynak:** Hepsi koddan çıkarıldı, tahmin yok. Doğrulama komutları en altta.

Bu dosya üç şey içeriyor:
- **mağaza sayfası** (Türkçe; App Store'da herkesin gördüğü metinler)
- **hakem notu** (İngilizce; forma aynen girilecek)
- **gizlilik etiketleri** (form sorularının karşılıkları)

---

## 0 · Mağaza sayfası

> Her özellik iddiası koddan doğrulandı (Yönerge 2.3: metaveri doğru olmalı).
> Karakter sınırları ölçüldü. İki yasak kelime grubu tarandı, ikisi de yok:
> satın almaya çağrı (3.1.3(f)) ve sağlık/klinik dili (5.1.1(ix) · bireysel hesap).

**Birincil dil:** Türkçe · **Ad:** `Luera TimeFlow` (14/30)

### Alt başlık (30)

| Öneri | Uzunluk | Not |
|---|---|---|
| **`Kuaför ve salon randevu takibi`** | 30/30 | **Tavsiye.** Arama kelimesi taşıyor: kuaför, salon, randevu |
| `Salon randevu ve gün yönetimi` | 29/30 | Daha genel |
| `Salonunuzun günü, cebinizde` | 27/30 | Daha sıcak ama arama kelimesi az |

### Tanıtım metni (170)

Uygulama güncellemesi olmadan değiştirilebilir. 133/170.

```
Günün akışı, takvim ve kasa tek uygulamada. Müşteri geldiğinde ekibiniz anında haberdar olur; siz salonunuzu cebinizden yönetirsiniz.
```

### Anahtar kelimeler (100)

93 karakter / 98 bayt; form hangisini sayarsa saysın sığar. Ad ve alt
başlıktaki kelimeler (luera, timeflow, kuaför, salon, randevu) tekrar
edilmedi. Apple onları zaten indeksliyor, tekrar boşa yer harcar.

```
güzellik,berber,ajanda,takvim,personel,müşteri,adisyon,kasa,işletme,dövme,rezervasyon,vardiya
```

### Açıklama (4000)

1695/4000.

```
Luera TimeFlow; kuaför, güzellik salonu, berber ve dövme stüdyosu gibi randevuyla çalışan işletmeler için gün yönetimi uygulamasıdır. İşletme sahibi salonun tamamını görür, çalışanlar yalnızca kendi gününü.

İŞLETME SAHİBİ İÇİN
• Günün akışı: bekleyen, işlemde ve ödemeye hazır müşteriler canlı olarak tek ekranda.
• Geldi ve gelmedi işaretleri tek dokunuşla. WhatsApp hattı bağlı salonlarda geciken müşteriye salonun numarasından hazır mesaj.
• Takvim: randevuları görün, sürükleyerek taşıyın, telefondan yeni randevu oluşturun.
• Kasa: günün tahsilatlarını ve bekleyen adisyonları takip edin.
• Müşteri defteri: geçmiş ziyaretler, notlar ve paketler; müşteriye paket satışı.
• Personel: ekibinizin telefonunu kısa süreli bir kodla bağlayın, kimin giriş yaptığını görün.
• Çalışma saatlerini, hizmet listesini ve ücretlerini telefondan düzenleyin.
• Müşteri kendisi randevu aldığında bildirim.

ÇALIŞANLAR İÇİN
• Kendi günü bir bakışta: sıradaki müşteri, saat ve hizmet.
• İşlemi başlatın ve bitirin; adisyona hizmet ve ürün ekleyip kasaya gönderin.
• Müşteri kartı, randevu notu ve boya formülü kaydı.
• Haftalık vardiya görünümü.
• Müşteri geldiğinde, yeni randevu atandığında ya da randevu iptal olduğunda anında bildirim.
• Kişiye özel dört haneli şifreyle hızlı giriş.

HER ZAMAN GÜNCEL
• Ekipte yapılan değişiklikler herkesin telefonuna anında yansır.
• Sinyal zayıfken çalışanın günü okunabilir kalır; yapılan işlemler bağlantı gelince gönderilir.
• Face ID ile hızlı açılış, açık ve koyu görünüm.

GİZLİLİK
Uygulamada reklam ve takip yoktur. Müşteri bilgileri işletmenize aittir.

Luera TimeFlow işletme hesabınızla giriş yapabilir ya da uygulamadan yeni bir işletme oluşturabilirsiniz.
```

**Bilerek YAZILMAYANLAR:**
- Fiyat, abonelik, deneme süresi, "web'den üye olun" (3.1.3(f)).
- Diş, klinik, sağlık, alerji, hasta (5.1.1(ix)).
- "Hizmet ücretleri" salonun kendi fiyat listesi; uygulamanın satışı değil.

**Kaynaklar** (her madde koddan):
- Akış ve Geldi/Gelmedi: `app/mudur/index.tsx`, 098.
- WhatsApp gözü: `org_whatsapp`, bağlı değilse sönük.
- Sürükleyerek taşıma: `mobile-mudur-takvim-surukleme`.
- Kasa: bekleyen adisyonlar `fetchOpenTicketRows`, salt okunur.
- Paket satışı: `createPackage`.
- Personel kodu ve giriş durumu: 099.
- Saatler, hizmetler ve ücretler: `saveWorkingHours`, `saveSalonService`.
- Müdür bildirimi: 107, "müşteri kendisi aldığında".
- Personel akışı: `visit.start/finish/items/formula`, vardiya `shift`.
- Personel bildirimleri: atama, geldi, iptal.
- Çevrimdışı: `mobile-cevrimdisi-okuma`, `mobile-gonderilemeyenler`.
- Face ID ve Görünüm.

### Kategori, URL'ler, telif

| Alan | Değer | Not |
|---|---|---|
| Birincil kategori | **İş** (Business) | |
| İkincil kategori | **Verimlilik** (Productivity) | |
| Destek URL | `https://timeflow.lueratech.com/destek.html` | zorunlu, canlıda 200 |
| Gizlilik URL | `https://timeflow.lueratech.com/gizlilik.html` | zorunlu, canlıda 200 |
| Pazarlama URL | **BOŞ BIRAK** | Sitede `/fiyatlar` sayfası var. Metaveriden fiyat sayfasına bağlantı, 3.1.3(f)'nin yasakladığı "dışarıda satın almaya çağrı" sayılabilir |
| Telif | `2026 Luera` | Bireysel hesapta da marka adı yazılabilir |

### Yaş derecelendirmesi — beklenen sonuç: 4+

Apple'ın 2025 anketinde her soruya **Yok / Hayır**:

| Soru grubu | Cevap | Gerekçe |
|---|---|---|
| Şiddet, silah, korku, küfür, cinsellik, alkol/tütün/uyuşturucu, olgun temalar | Yok | içerik uygulaması değil |
| Kumar, simüle kumar, yarışma, ganimet kutusu | Yok | |
| Tıbbi ya da tedavi bilgisi · sağlık/esenlik konuları | Yok | Uygulama sağlık içeriği sunmuyor; işletme notları özel kayıt |
| Kısıtlamasız web erişimi | Hayır | Bağlantılar Safari'de açılıyor, uygulama içi tarayıcı yok |
| Kullanıcı üretimi içerik | Hayır | Notlar yalnız işletmenin kendi ekibine görünür, herkese açık değil |
| Mesajlaşma ve sohbet | Hayır | Kullanıcılar arası sohbet yok; müşteriye giden mesaj salonun hazır bildirimi |
| Reklam | Hayır | reklam SDK'sı yok |
| Ebeveyn denetimi · yaş doğrulama | Hayır | |

### Fiyat, bölge, sürüm

| Alan | Değer | Neden |
|---|---|---|
| Fiyat | **Ücretsiz** | 3.1.3(f): ücretli web aracının ücretsiz refakatçisi |
| Bölge | **Yalnız Türkiye** | Arayüz tamamen Türkçe. AB'de dağıtım, DSA "tacir" beyanı (adres, telefon herkese açık) ister |
| İçerik hakları | "Üçüncü taraf içerik yok" | |
| Yayın | **Elle yayımla** (Manually release) | Onaydan sonra ne zaman çıkacağına sen karar verirsin |

### Ekran görüntüleri — iPhone Air ile

iPhone Air, Apple'ın zorunlu **6.9″ grubunda** ve **1260×2736** çözünürlüğü
kabul ediliyor (resmi tablo doğrulandı, 2026-09-25). Doğrudan telefondan
çekilir; simülatör gerekmiyor. En az 3, en çok 10 görüntü yüklenebilir. İlk
üçü arama sonuçlarında görünür.

| Sıra | Ekran | Neden |
|---|---|---|
| 1 | **Akış**: Bekliyor / İşlemde / Kasada dolu (canlı kip) | Ürünün kalbi; ilk bakışta ne olduğunu söyler |
| 2 | **Takvim**: dolu bir gün | Randevu uygulaması olduğunu gösterir |
| 3 | **Personel kumandası**: sıradaki müşteri | İki rollü olduğunu gösterir |
| 4 | Randevu oluşturma | |
| 5 | Müşteri kartı (geçmiş + notlar) | Güzellik sektörünün "Müşteri bilgileri" ızgarasında **Alerji / Hamilelik** alan etiketleri var: o kısım kareye GİRMESİN (5.1.1(ix)) |
| 6 | Kasa | |
| 7 | Adisyon (personel) | |

**Çekimden önce:**
- Demo tohumu **10:30–17:00** arasında çalışmalı, çıktıda `CANLI KİP` yazmalı.
- Pil dolu, bildirimler kapalı (Rahatsız Etmeyin).
- Yalnız demo veri. Gerçek müşteri adı ya da numarası görünmesin.
- Görüntülere yazı eklemek isteğe bağlı. Düz ekran görüntüsü de kabul ediliyor.
- **Personel ekranları (3 ve 7) için telefonu personel olarak bağla.** Hakemin
  yolunun aynısı: müdür olarak Profil → Personel → Telefon bağla, sonra
  Oturumu kapat, sonra "Burada çalışıyorum" + kod. Demo personelin şifresi
  yok, ilk girişte belirlenir. Önce müdür ekranlarını çek, sonra personele
  geç.

### İnceleme iletişim bilgisi (senden)

Ad, soyad, telefon, e-posta. Hakem sorun yaşarsa buradan arar. Oturum
gerekiyor: **Evet**, demo hesap aşağıda §1'de.

---

## 1 · App Review Information → Notes

> Aşağıdaki metni olduğu gibi kullan. `<ŞİFRE>` yerine demo hesabının
> şifresini **sen** yaz — Claude şifreyi görmedi ve yazmamalı.

> 🔴 **Göndermeden önce canlıda kayıt düzeltmesi (devir §3.4) BİTMİŞ olmalı.**
> Metin "Sign-up is available in the app" diyor. Bugün canlıda kaydolan kişi
> giremiyor (SMTP yok + doğrulama zorunlu). Hakem "Kaydol"a basarsa 2.1'den
> ret gelir.

```
DEMO ACCOUNT
  Email:    demo@lueratech.com
  Password: <ŞİFRE>

This account is pre-loaded with a demo salon ("Demo Güzellik Salonu") that
has staff, services, packages, customers and appointments, so every screen
can be reviewed with realistic data. Its subscription is permanently active,
so the reviewer will never hit a paywall or a locked screen.

WHAT THE APP IS
Luera TimeFlow is an appointment and day-management tool for hair salons,
beauty salons and similar studios. The manager sees the day's flow, the
staff see only their own work. Everything shown in the app is the
business's own operational data. The app does not provide medical or
health services.

NO PURCHASES IN THE APP — GUIDELINE 3.1.3(f)
The app is a free companion to a paid web service. There is no in-app
purchase, no price, no plan, no upgrade prompt, and no call to action to
purchase anywhere outside the app. Subscriptions are handled entirely on the
web by the business owner, and the app never links to or mentions them. This
is enforced by an automated test in our repository
(tests/apple-yonlendirme-yasagi.test.mjs) so it cannot regress.

ACCOUNT CREATION AND DELETION
Sign-up is available in the app. Account deletion is also available in the
app. The interface is in Turkish, so here are the exact labels to tap:

  Profil (bottom tab, rightmost)
    -> Hesap            ("Account", first row of the second group,
                         right below "Müşteriler")
      -> Hesabımı sil   ("Delete my account", red button at the bottom)

The deletion screen lists exactly what will be removed and performs a real
server-side deletion, not a local sign-out.

PLEASE TEST DELETION WITH A NEW ACCOUNT. The demo account is the sole owner
of the demo salon, so deleting it permanently removes the whole salon and
the demo account stops working. Tap "Yeni işletme oluştur" (Create a new
business) on the welcome screen, sign up with any email - you are signed in
immediately - and delete that account instead.

STAFF MODE
The app has a second, simpler mode for employees ("Burada çalışıyorum" /
"I work here"). Staff sign in with a short-lived team code from the owner,
so no static code can be written here. To try it on the same device:
  1. Signed in as the demo account: Profil -> Personel -> "Telefon bağla"
     (Connect a phone). A 15-minute team code appears.
  2. Profil -> Hesap -> "Oturumu kapat" (Sign out).
  3. On the welcome screen tap "Burada çalışıyorum", enter the code, pick a
     staff member in "Siz kimsiniz?" (Who are you?) and set a 4-digit PIN.

WHATSAPP
Customer messages are sent from the business's own WhatsApp line, which the
owner connects once on the web dashboard. The demo salon has no line
connected, so the WhatsApp button on appointment cards appears dimmed and
explains where the line is connected. This is expected, not a defect.

HOW TO REVIEW
1. Sign in with the demo account above.
2. The bottom tabs, left to right: Akış, Takvim, Randevu, Kasa, Profil.
3. "Akış" (Flow) shows the salon's day: waiting, in service, ready for
   payment.
4. "Takvim" (Calendar) shows appointments; "Randevu" creates a new one;
   "Kasa" (Cash) shows the day's collected payments.
5. The customer book is under Profil -> "Müşteriler" (Customers).
6. The public booking page used by end customers is at
   https://timeflow.lueratech.com/book/demo-luera

The interface language is Turkish; the app is sold in Turkey. Key labels:
  Akış = Flow (today's schedule)   Takvim = Calendar
  Randevu = Appointment            Kasa = Cash register
  Müşteriler = Customers           Uzmanlar / Personel = Staff
  Profil = Profile                 Geldi = Customer arrived
```

**Salon odağı (2026-09-25):** Geliştirici hesabı bireysel. Yönerge 5.1.1(ix)
düzenlenmiş alanları (sağlık) şirket hesabına bağlıyor. Bu yüzden:
- Not, mağaza metinleri ve ekran görüntüleri **salon/güzellik** diliyle
  yazılıyor.
- Mobil kayıttan Diş ve Klinik sektörleri çıkarıldı.
- **Health gizlilik etiketi KALIYOR.** Bu doğru bir beyan; kaldırmak yanlış
  beyan olur.
- 5.1.1(ix) reddi gelirse yol şirket hesabı (Ltd/A.Ş. + D-U-N-S).

**Neden bu metin:** 3.1.3(f) muafiyeti koşulludur — uygulama içinde satın alma
**ya da dışarıda satın almaya çağrı** olmaması gerekiyor. Metin bunu açıkça
söylüyor ve testle kilitlendiğini ekliyor. Hakem hesabın kapalı kapıya
çarpmayacağı da baştan yazılı.

---

## 2 · App Privacy (gizlilik etiketleri)

### Önce en kritik iki cevap

| Soru | Cevap | Gerekçe |
|---|---|---|
| **Data Used to Track You** | **NO** | Bağımlılıklarda tek bir reklam/analitik/takip SDK'sı yok (31 paketin hepsi Expo/RN çekirdeği). IDFA istenmiyor, veri simsarına gitmiyor |
| **Data collected but not linked** | — | Toplanan her şey hesaba bağlı; "not linked" kutusu boş |

### Toplanan veri türleri — hepsi "Linked to You"

Her birinin amacı: **App Functionality**. Hiçbiri Analytics, Advertising,
Product Personalization ya da Third-Party Advertising değil.

| Kategori | Alt tür | Ne | Kaynak |
|---|---|---|---|
| **Contact Info** | Name | Müdürün adı, personel adları, müşteri adları | `customers`, `staff`, kayıt akışı |
| | Email Address | Hesap e-postası | Supabase Auth |
| | Phone Number | Müşteri telefonları | `customers.phone`, `reservations.customer_phone` |
| **🔴 Health & Fitness** | Health | Müşteri notlarına girilen sağlık bilgisi (alerji, hamilelik vb.) | `customers.notes` (müdür), `reservations.notes` (personel · `visit.note`) |
| **Purchases** | Purchase History | Müşteriye satılan paket, adisyona eklenen hizmet kalemleri | `treatment_plans` (paket satışı), `reservations.adisyon_items` |
| **Financial Info** | Other Financial Info | Tutarlar, indirimler | aynı satırlar |
| **User Content** | Other User Content | Randevu notları, müşteri notları, boya formülü | `reservations.notes`, `customers.notes`, `visit.formula` |
| **Identifiers** | User ID | Supabase kullanıcı kimliği, personel kimliği | oturum |
| | Device ID | Bildirim için cihaz jetonu (Expo push token) | `push_subscriptions` |

### 🔴 Health kategorisi — neden işaretleniyor

> **Düzeltme (2026-09-25):** Bu belgenin ilk hâli iki yanlış kanıta
> dayanıyordu. `customerCard.ts`'teki "Saç boyasına alerjisi var" satırı
> **sahte örnek veri** (`mockCustomers`), mobilin `treatment_plans`'a yazdığı
> da sağlık değil **paket satışı** (`plan_kind: 'paket'`). Sonuç aynı kaldı,
> gerekçe değişti.

Gerçek durum:

- Mobilde sağlık için **ayrı bir giriş alanı YOK.** Alerji, hamilelik, ilaç,
  kronik rahatsızlık alanları (`sectorFields.ts`) masaüstünde yazılıyor;
  telefon onları yalnız **gösteriyor.**
- Ama telefon **serbest metin not** yazıyor: müdür müşteri notunu
  (`saveCustomerNotes`), personel randevu notunu (`visit.note`). Salonların
  bu notlara ne yazdığı bellidir — `public/gizlilik.html` de açıkça
  *"Salon … sağlık notları girebilir (örneğin hamilelik)"* diyor.

Apple'ın tanımı *"kullanıcının sağladığı her türlü sağlık ya da tıbbi veri"*.
Fazla beyan hiçbir incelemeyi tetiklemez; eksik beyan, sonradan fark
edilirse **mağazadan kaldırma** sebebidir. O yüzden işaretleniyor — ve
gizlilik metniyle çelişmemesi için de gerekli.

**Sensitive Info işaretlenmiyor.** Apple'ın listesinde hamilelik de var,
ama uygulamanın o alana yazan bir ekranı yok; serbest nottaki sağlık bilgisi
zaten Health altında beyan ediliyor. Aynı veriyi iki kategoride saymak
gerekmiyor.

### Toplanmayanlar — kutuları BOŞ bırak

Location · Contacts (cihaz rehberi) · Browsing History · Search History ·
Photos or Videos · Audio Data · Usage Data · Diagnostics ·
Advertising Data · Sensitive Info (gerekçe yukarıda)

**Diagnostics özellikle boş:** projede çökme/hata toplayıcı **yok** (Sentry
bilinen bir borç). Yoksa işaretlenmez.

### Üçüncü taraf verisi hakkında not

Toplanan verinin çoğu uygulamayı kullanan kişiye değil, **onun müşterilerine**
ait. Apple yine de beyan edilmesini istiyor — "kim hakkında" değil,
"uygulama topluyor mu" sorusu soruluyor. Yukarıdaki tablo buna göre yazıldı.

---

## 3 · İzinler ve manifest — zaten hazır

Kontrol edildi, ek iş yok:

- **İzinler:** yalnız `USE_BIOMETRIC` / `USE_FINGERPRINT`. Kamera, konum,
  rehber, fotoğraf izni **istenmiyor** — bu, gizlilik incelemesini
  kolaylaştırır.
- **`NSPrivacyAccessedAPITypes`** `mobile/app.json` içinde dolu: UserDefaults
  (CA92.1), FileTimestamp (C617.1), SystemBootTime (35F9.1), DiskSpace
  (E174.1).
- **Üçüncü taraf girişi yok** → "Sign in with Apple" zorunluluğu doğmuyor.

---

## 4 · Doğrulama komutları

Bu dosyadaki iddiaları yeniden kontrol etmek için:

```bash
# Takip/analitik SDK var mı (boş çıkmalı)
cd mobile && python3 -c "
import json;d=json.load(open('package.json'))['dependencies']
print([k for k in d if any(x in k.lower() for x in ('analytic','firebase','segment','amplitude','mixpanel','sentry','facebook','admob','ads','track','branch','appsflyer','adjust'))] or 'YOK')"

# İzinler
python3 -c "
import json;d=json.load(open('mobile/app.json'))['expo']
print((d.get('android') or {}).get('permissions'))
print([k for k in ((d.get('ios') or {}).get('infoPlist') or {}) if 'UsageDescription' in k] or 'ios izin metni yok')"

# Sağlık bilgisinin yolu: serbest notlar (müdür + personel) ve gizlilik metni
grep -n "update({ notes" mobile/src/lib/managerWrite.ts supabase/functions/staff-api/index.ts
grep -n "sağlık notları" public/gizlilik.html
# Mobilin treatment_plans'a yazdığı PAKET — sağlık değil
grep -n "plan_kind: 'paket'" mobile/src/lib/managerWrite.ts

# Dışarıda satın almaya çağrı yasağı hâlâ kilitli mi
node --test tests/apple-yonlendirme-yasagi.test.mjs
```
