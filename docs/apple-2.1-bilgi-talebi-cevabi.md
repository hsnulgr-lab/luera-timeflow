# Apple 2.1 · Bilgi talebi — cevap paketi

**Tarih:** 2026-09-27 · **Durum:** `Rejected · 2.1.0 Performance: App Completeness`
**Derleme:** 4 (1.0.0) · **Submission ID:** `b1a7f029-c73f-4355-b29a-f43f98023991`

## Bu ret NE DEĞİL

Apple derlemede bir hata bulduğunu **söylemiyor**. Metin "This app has been
submitted by a developer account that has a limited App Review history" ile
başlıyor: ilk uygulamasını gönderen hesaplara açılan standart bilgi talebi.
Çökme, kırık ekran, reddedilen özellik yok. İstenen altı şey verilip aynı
derleme yeniden gönderilir — **yeni derleme gerekmiyor.**

## Yapılacaklar (sırayla)

1. **Ekran kaydı** çek (§3) ve erişilebilir bir adrese koy
2. **App Review Information → Notes** alanını §2'deki metinle değiştir
3. **Reply to App Review**'a §1'deki metni yapıştır
4. **Resubmit to App Review**

---

## 1 · App Review'a cevap (aynen yapıştır)

> `<VIDEO-URL>` yerine ekran kaydının adresini yaz.
> `<ŞİFRE>` ASC'deki mevcut notta zaten yazılı; oradan kopyala.

```
Thank you for the review. Below are the six items requested, in order. The
same information has been added to the Notes field of the App Review
Information section.

1. SCREEN RECORDING

<VIDEO-URL>

Recorded on a physical iPhone running the latest iOS, from the build
submitted (1.0.0 build 4). The recording starts with launching the app and
covers, in one take:
  - Launch and welcome screen
  - Sign-in with the demo account
  - The typical daily flow: Akis (today's flow), Takvim (calendar),
    creating an appointment, Kasa (cash register), Musteriler (customers)
  - Sign-out
  - Account REGISTRATION of a brand-new account, from the welcome screen
  - Account DELETION of that new account, from Profil > Hesap >
    Hesabimi sil, including the confirmation step and the return to the
    welcome screen

Two notes about what the recording shows. It was captured at 00:50 local
time, before the demo salon's working day begins (the salon opens at 09:00),
so the day's appointments are all still ahead and the cash register's
"Bugun" (Today) tab correctly reads 0. The month's takings are on the
"Bu ay" (This month) tab, and the reviewer will see the day populate during
Turkish business hours. Second, the appointment created during the recording
uses an invented customer name and phone number; no real customer data
appears anywhere in the video.

The app contains no user-generated content that is published or shared
between users, so no reporting or blocking mechanism is required. Please
see item 4 below for why. The app contains no paid content and no in-app
purchase, so there is nothing to show for that item.

Note on why deletion is demonstrated with a NEW account rather than the
demo account: the demo account is the sole owner of the demo salon, and
deleting it permanently removes the entire salon along with the data the
reviewer needs. The recording therefore creates a throwaway account and
deletes that one, which exercises exactly the same code path.

2. PURPOSE AND TARGET AUDIENCE

Luera TimeFlow is an appointment and day-management app for small
appointment-based businesses. Its primary market is hair salons, beauty
salons, barbers, and nail and tattoo studios; the sign-up screen also offers
a couple of adjacent categories for businesses that run the same
appointment-and-till day. The target user is the owner or manager, and their
employees.

The problem it solves: these businesses still run the day on a paper
appointment book kept at the reception desk. Whoever is not standing at that
desk - the owner who stepped out, the stylist working at a chair - cannot
see what is happening. Double bookings, forgotten arrivals and unrecorded
payments follow from that single point of truth sitting on a counter.

The app gives the owner the same day, live, in their pocket: who is waiting,
who is in service, who is ready to pay, and what has been collected today.
Employees get a separate, much simpler mode that shows only their own
appointments, so they can start and finish a service and send the bill to
the register without seeing the salon's finances or their colleagues'
customers.

The app is publicly available. Any salon owner in Turkey can download it and
create their own business account from inside the app - it is not built for
one specific company, and it is not an internal or employee-only tool. It is
a commercial product sold to independent small businesses.

3. SETUP AND ACCESS

DEMO ACCOUNT (manager)
  Email:    demo@lueratech.com
  Password: <ŞİFRE>

This account is pre-loaded with a demo salon that has staff, services,
packages, customers and a full day of appointments, so every screen can be
reviewed with realistic data. Its subscription is permanently active, so no
paywall or locked screen will ever appear.

The interface is in Turkish. Bottom tabs, left to right:
  Akis      = Flow (today's schedule: waiting / in service / ready to pay)
  Takvim    = Calendar
  Randevu   = New appointment
  Kasa      = Cash register (today's collected payments)
  Profil    = Profile (settings, staff, customers, legal, account)

Main features and where they are:
  - Today's flow:        Akis tab, opens by default
  - Calendar:            Takvim tab; tap any appointment to open its card
  - Create appointment:  Randevu tab
  - Collected payments:  Kasa tab
  - Customer book:       Profil > Musteriler
  - Staff list:          Profil > Personel
  - Account settings:    Profil > Hesap
  - Delete account:      Profil > Hesap > Hesabimi sil
  - Privacy and support: Profil > Yasal

SECOND ACCOUNT TYPE - STAFF MODE
The app has a second, simpler mode for employees, reached from the welcome
screen with "Burada calisiyorum" ("I work here"). Employees sign in with a
short-lived team code issued by the owner, so no static credential can be
written here. To try it on the same device:
  1. Signed in as the demo account: Profil > Personel > "Telefon bagla"
     (Connect a phone). A team code valid for 15 minutes appears.
  2. Profil > Hesap > "Oturumu kapat" (Sign out).
  3. On the welcome screen tap "Burada calisiyorum", enter the code, pick a
     staff member under "Siz kimsiniz?" (Who are you?), then set a password.
The employee then sees only their own appointments.

SAMPLE CUSTOMER-FACING PAGE
End customers do not use this app; they book through the salon's web page.
The demo salon's page is public and needs no credentials:
  https://timeflow.lueratech.com/book/demo-luera

4. EXTERNAL SERVICES AND PLATFORMS

  - Supabase (self-hosted). Our own server at
    supabase.timeflow.lueratech.com provides the database, authentication
    and server functions. This is our own infrastructure on a VPS we
    operate, not a third-party hosted service. All salon data lives here.
  - Expo Push Notification Service, which forwards to Apple APNs. Used only
    to deliver the app's own notifications (a customer arrived, an
    appointment changed). No content beyond the notification text is sent.
  - Evolution API (self-hosted, our own server). Sends appointment reminders
    to customers over the salon's OWN WhatsApp line, which the owner
    connects once on the web dashboard. This runs entirely on our server;
    the app never contacts it directly. The demo salon has no line
    connected, so the WhatsApp button on appointment cards appears dimmed
    and explains where the line is connected. This is expected, not a
    defect.
  - Dodo Payments, for the business's monthly subscription. This is handled
    entirely on the web by the owner. It is NOT reachable from the app: the
    app contains no price, no plan, no purchase, and no link or call to
    action to subscribe. We enforce this with an automated test in our
    repository so it cannot regress.

  There is NO analytics SDK, NO advertising SDK, NO tracking of any kind,
  and NO AI or machine-learning service in the app.

  The app hands off to the operating system in two places, with no data
  leaving the app other than what is in the link: tapping a customer's
  number opens the phone dialer (tel:), and in staff mode a WhatsApp button
  opens wa.me with that number.

  On user-generated content: the only free-text fields are private
  operational notes a salon writes about its own appointments and customers
  (for example "prefers a shorter cut"). This content is visible only inside
  that one salon's own account. It is never published, never shared between
  businesses, and no user can see another user's content. There is
  therefore no surface on which one user could encounter objectionable
  content from another, which is why no reporting or blocking mechanism is
  present.

5. REGIONAL DIFFERENCES

There are none. The app has a single Turkish interface, is offered only in
Turkey, and every feature behaves identically for every user. There is no
region-gated content, no region-specific pricing in the app (there is no
pricing in the app at all), and no feature that is enabled or disabled by
location.

6. REGULATED INDUSTRY AND THIRD-PARTY MATERIAL

The app is not used in a regulated industry. It is sold to hair salons,
beauty salons, barbers and nail and tattoo studios. It provides no medical
or health service, makes no health claim, gives no diagnosis or advice, and
is not a medical device. Dental and clinical sectors are deliberately
excluded from sign-up in the app.

For full transparency about our App Privacy declaration: we declared
"Health & Fitness" data there. That is a conservative declaration, not a
medical feature. A salon can type anything into the free-text note attached
to a customer, and in practice a beautician may write something like an
allergy to a product before a treatment. Because that text is stored, we
declared the category rather than claim we never store such a line. There is
no health screen, no health field, no health form and no health integration
anywhere in the app.

The app contains no third-party protected material. All text, icons and
illustrations are our own. The typeface is Hanken Grotesk, used under the
SIL Open Font License.

Please let us know if anything above needs to be expanded.
```

---

## 2 · Notes alanı — yeni metin

Apple açıkça "add this information to the Notes field" diyor. Mevcut not
korunuyor, **başına** şu blok ekleniyor (video adresi dahil):

```
SUBMISSION NOTES FOR APP REVIEW

Screen recording (physical device, build 1.0.0 (4), starts with app launch,
covers sign-in, the daily flow, account registration and account deletion):
  <VIDEO-URL>

PURPOSE. Appointment and day-management app for hair and beauty salons,
barbers, nail and tattoo studios. The owner sees the day live; employees see
only their own work. Publicly available to any salon in Turkey - this is a
commercial product for independent small businesses, not an internal or
employee-only tool.

EXTERNAL SERVICES. Self-hosted Supabase (our own VPS) for database, auth and
server functions; Expo Push / Apple APNs for notifications; self-hosted
Evolution API for WhatsApp reminders sent from the salon's own line
(server-side only, the app never contacts it); Dodo Payments for the web
subscription, which is not reachable from the app. No analytics, no
advertising, no tracking, no AI service.

USER-GENERATED CONTENT. The only free-text fields are private operational
notes a salon writes about its own appointments and customers. They are
visible only inside that salon's own account, never published and never
shared between businesses. No user can see another user's content, so no
reporting or blocking mechanism is required.

REGIONS. No regional differences. Single Turkish interface, offered only in
Turkey, identical behaviour for every user.

REGULATED INDUSTRY. None. No medical or health service, no health claim, no
diagnosis, not a medical device. Dental and clinical sectors are excluded
from sign-up in the app. Our App Privacy declaration includes "Health &
Fitness" only because a salon's free-text customer note may contain a line
such as a product allergy; there is no health screen or health field in the
app.

THIRD-PARTY MATERIAL. None. All text, icons and illustrations are our own.
Typeface: Hanken Grotesk, SIL Open Font License.

----------------------------------------------------------------------
```

Bunun **altına** mevcut not (DEMO ACCOUNT ile başlayan blok) aynen kalır.

---

## 3 · Ekran kaydı — çekim listesi

**Cihaz:** iPhone 16 Plus, TestFlight'taki **derleme 4**. Expo Go DEĞİL,
geliştirme derlemesi DEĞİL — mağazaya giden paketin aynısı.

**Önce:** iOS'u güncelle (Apple "latest operating system" istiyor).
**Önce:** demo tohumunu yeniden çalıştır — kayıt sırasında akışın dolu
görünmesi gerekiyor ve tohumun görüntü ömrü ~1 saat
(bkz. [[app_store_yolu]] · Dersler).

Kayıt: Denetim Merkezi → Ekran Kaydı. Mikrofon **kapalı** (sese gerek yok).

### Sıra — tek çekimde, durmadan

| # | Ne yapılacak | Neden |
|---|---|---|
| 1 | Uygulamayı **kapalıyken** aç (çoklu görevden temizle, sonra ikona bas) | Apple "must begin with launching the app" diyor |
| 2 | Açılış ekranı → karşılama ekranı görünsün, 2 sn bekle | Kayıt uygulamanın kendisinden başlıyor |
| 3 | Demo hesabıyla gir | 2.1 · demo hesabın çalıştığı görülsün |
| 4 | **Akış**: kaydır, bekleyen / işlemde / kasaya hazır satırları geç | Ana ekran |
| 5 | **Takvim**: bir randevuya dokun, kart açılsın, geri dön | Gerçek veri |
| 6 | **Randevu**: yeni bir randevu kur, onay ekranını gör | Yazma yolu çalışıyor |
| 7 | **Kasa**: günün tahsilatına bak | Para ekranı |
| 8 | **Profil → Müşteriler**: listeye ve bir müşteri kartına bak | Müşteri defteri |
| 9 | **Profil → Hesap → Oturumu kapat** | Kayıt adımına geçiş |
| 10 | Karşılamada **"Yeni işletme oluştur"** → yeni bir e-postayla kaydol | **ZORUNLU** — hesap oluşturma |
| 11 | Kayıt bitince uygulamaya girildiğini göster | Kaydın gerçekten çalıştığı |
| 12 | **Profil → Hesap → Hesabımı sil** → neyin silineceğini gösteren ekranı okut → onayla | **ZORUNLU** — hesap silme |
| 13 | Karşılama ekranına dönüldüğünü göster, 2 sn bekle, kaydı durdur | Silme gerçekten oldu |

**10–12 arası pazarlığa kapalı.** Apple bu ikisini adıyla istiyor ve eksikse
ikinci kez reddediyor.

**Silmeyi ASLA demo hesabıyla yapma** — demo salonun tek sahibi o, silersen
bütün demo veri gider ve hakem hiçbir ekranı göremez.

### İsteğe bağlı 14. adım — personel modu

Apple istemedi ama gösterirsen ikinci bir soru turu ihtimali düşer.
Riski var: ekip kodu üretimi bir kez "üretilemedi" dedi (bkz. 1.0.1 listesi).
**Kural: önce kayıtsız prova et.** İlk denemede kod geliyorsa çek, gelmiyorsa
bu adımı atla — not zaten yolu anlatıyor.

### Videoyu nereye koyacağız

ASC'nin `Attachment` alanı küçük dosya bekliyor; 3–5 dakikalık bir ekran
kaydı genelde sığmıyor. En temizi kendi sunucumuz:

```bash
scp -i ~/.ssh/luera_vps ~/Desktop/timeflow-review.mp4 root@76.13.4.164:/tmp/timeflow-review.mp4
```

Sonra dosyayı `timeflow.lueratech.com` altında yayınlayıp adresi ver —
üçüncü bir hesap gerekmez, bağlantı bizim denetimimizde kalır. Dosyayı nereye
koyacağımızı sunucuda birlikte bakarız.

Alternatif: listelenmemiş YouTube bağlantısı. Apple kabul ediyor, ama video
bizim elimizden çıkmış olur.

---

## 4 · Gönderim

1. Notes alanını §2 ile güncelle → **Save**
2. `App Review` → `Reply to App Review` → §1'i yapıştır → gönder
3. `Resubmit to App Review`

Derleme 4 aynen kalıyor; yeni derleme yüklenmiyor.

---

## 5 · Sonraki turda çıkabilecek iki soru — hazırlığı şimdiden

- **3.2 Other Business Models.** Ret mesajının "Prevent Common Issues"
  kısmında geçiyor. Cevabımız §1.2'nin son paragrafında: uygulama halka
  açık, kayıt uygulamanın içinden yapılıyor, tek bir şirkete özel değil.
  Bu cümle silinmemeli.
- **5.1.1(ix) düzenlenmiş alan.** §1.6'da sağlık etiketini kendimiz
  açıkladık. Yine de gelirse kullanıcının kararı belli: şirket hesabına
  geçilir (bkz. denetim raporu · Y5).
