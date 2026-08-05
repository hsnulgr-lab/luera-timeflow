# 03 — Sektörler (14 adet)

Kaynak: `src/lib/sectorProfiles.ts` → `SECTOR_PROFILES`. Bu dosya o kaydın
insan okunur kopyasıdır. **Çelişki varsa koddaki kayıt kazanır.**

## Profil şeması

```ts
interface SectorProfile {
  label: string;                  // Ayarlar dropdown etiketi
  modules: Modules;               // varsayılan modül seti
  labels: Partial<Record<LabelKey, string>>;  // terminoloji farkları
  staffRoles?: SectorStaffRoles;  // rol ADLANDIRMASI (yetki DEĞİL)
  dashboardKpis: WidgetKey[];     // [0] = dashboard yüz anahtarı
  customFieldTemplates: FieldDef[];
  resourceTypes: string[];        // boş = kaynak UI gizli
  comms: SectorComms;             // WhatsApp dili
}
```

`LabelKey` seti: `customer`, `customers`, `reservation`, `reservations`,
`newReservation`, `service`, `services`, `staff`, `staffPlural`, `calendar`.
Varsayılanlar: Müşteri / Müşteriler / Randevu / Rezervasyonlar / Yeni randevu /
Hizmet / Hizmetler / Personel / Personel / Takvim.

Hazır modül setleri: `RANDEVU` = randevu+personel+hizmet+kasa+analiz;
`RANDEVU_KASASIZ` = aynısı ama kasa kapalı.

---

## Genel bakış tablosu

| Anahtar | Etiket | Dashboard | Kaynak tipi | Kasa | Sıra | Özel yüz |
|---|---|---|---|---|---|---|
| `genel` | Genel | randevuFace | — | ✓ | — | — |
| `guzellik` | Güzellik / Salon | guzellikFace | Kabin | ✓ | — | Paketler |
| `kuafor` | Kuaför | kuaforFace | Koltuk, Yıkama | ✓ | ✓ | **salon yüzü** + Paketler |
| `berber` | Berber | berberFace | Koltuk | ✓ | ✓ | — |
| `estetik` | Estetik Kliniği | estetikFace | Oda | ✓ | — | — |
| `dis` | Diş Hekimi | disFace | Ünite | ✓ | — | **Diş Şeması + Vizit** |
| `saglik` | Sağlık / Klinik | saglikFace | Oda | ✓ | — | — |
| `fizyoterapi` | Fizyoterapi | fizyoterapiFace | Terapi alanı, Cihaz | ✓ | — | — |
| `tattoo` | Tattoo / Piercing | dovmeFace | Kabin | ✓ | — | mobil DovmeHome |
| `avukat` | Avukatlık Bürosu | randevuFace | Toplantı odası | ✗ | — | — |
| `danismanlik` | Danışmanlık / Koçluk | randevuFace | — | ✓ | — | — |
| `gym` | Gym / PT | randevuFace | Salon alanı | ✓ | — | — |
| `gelinlikci` | Gelinlikçi | randevuFace | Prova odası | ✓ | — | — |
| `restoran` | Restoran / Kafe | masaFace | — | ✓ | — | **masa yüzü** |

**Satışa hazır kabul edilen 7 sektör (2026-07-31 denetimi):** güzellik, kuaför,
berber, estetik, diş, sağlık/klinik, fizyoterapi.

---

## Sektör detayları

### genel — Genel
Terminoloji farkı yok. Personel rolü: "Uzman".
**comms:** Randevulu hizmet veren işletme; samimi, nazik, net. Muhatap "müşterimiz",
hizmet "randevu"/"randevunuzu", emoji 🗓️. Recall yok.

### guzellik — Güzellik / Salon
**Terminoloji:** Randevu → **Seans**.
**Roller:** Uzman (bakım uygular, müşteri kaydını ve tahsilatı yönetir).
**Özel alanlar (müşteri):** Cilt tipi (Kuru/Yağlı/Karma/Hassas), Alerji bilgisi,
Hamilelik (checkbox — kontrendikasyon: lazer/bölgesel incelme kapatılır, UI uyarır).
**Kaynak:** Kabin. **Paketler sayfası açık.**
**comms:** Sıcak, samimi, şımartan. "müşterimiz" / "bakım" / "bakımınızı" / ✨.
Recall: *bakım yenileme*, 30 gün.

### kuafor — Kuaför
**Modüller:** RANDEVU + **sira** (walk-in kuyruğu).
**Roller:** Kuaför (hizmet, renk formülü, müşteri ilişkisi), Çırak (hazırlık, yıkama, salon akışı).
**Özel alanlar:** Saç tipi, Saç dokusu, Kimyasal/ürün hassasiyeti, Saç ve stil tercihi,
Son renk formülü (müşteri) + **Renk formülü** (rezervasyon — bu alan geri yazılır:
seans sonunda müşterinin "son formül"ü güncellenir).
**Kaynak:** Koltuk, Yıkama. **Paketler açık.**
**Özel yüz:** Takvim / Rezervasyonlar / Müşteriler sayfalarında **salon tasarımı**
(`KuaforCalendarPage`, `KuaforReservationsPage`, `KuaforCustomersPage` — `kuaforSuite.css`).
**comms:** Samimi, enerjik, sohbet eder gibi. "işlem"/"işleminizi"/💇.
Recall: *saç bakımı / dip boyası zamanı*, 28 gün.

### berber — Berber
**Modüller:** RANDEVU + sira. **Roller:** Berber, Çırak. **Kaynak:** Koltuk.
Özel alan yok.
**comms:** Sıcak, kısa, rahat "delikanlı ağzı" (abartmadan). "kesim"/"kesiminizi"/💈.
Recall: *saç kesimi zamanı*, 21 gün.

### estetik — Estetik Kliniği
**Terminoloji:** Müşteri → **Danışan**, Randevu → **Seans**.
**Roller:** Uzman. **Özel alanlar:** Alerji, Kronik rahatsızlık. **Kaynak:** Oda.
**comms:** Güven veren, zarif, profesyonel. "danışanımız"/"seans"/"seansınızı"/✨.
Recall: *kontrol seansı*, 90 gün. **Guardrail:** tıbbi tavsiye verme, sonuç vaat etme.

### dis — Diş Hekimi  ★ en derin modül
**Terminoloji:** Hasta / Hastalar, Randevular, **Tedavi / Tedaviler**, **Hekim / Hekimler**.
**Roller:** Hekim (muayene, diş şeması, tedavi planı), Asistan (randevu ve hasta akışı).
**Özel alanlar:** Alerji, Kullandığı ilaçlar, Kronik rahatsızlık (müşteri) +
Tedavi notu (rezervasyon). Medikal uyarılar bu alanlardan türetilir — **yeni kolon yok**.
**Kaynak:** Ünite. **Paketler sayfası `/customers`'a redirect edilir.**
**comms:** Güven veren, sıcak, profesyonel. "hastamız"/"tedavi"/"tedavinizi"/🦷.
Recall: *diş kontrolü*, 180 gün. **Guardrail:** TIBBİ TAVSİYE VERME, teşhis koyma.

**Diş'e özel yüzeyler:**
- `/dental-chart` — odontogram (MODBL yüzey işaretleme) + **Periodontal** görünüm
  (diş başına 6 nokta PD + BOP + sallanma). Boş durumda "bugünkü hastalar" tek-tık kartları.
- `/dental-visit/:reservationId` — **vizit ekranı v7**: 3 durum (Bekliyor / Koltukta /
  Tamamlandı); şikayet chip taxonomy + 1.2 sn debounce otomatik kayıt; tanı odontogram
  bulgularından **türetilir** (elle yazılmaz); işlem önerisi `settings.services`
  kataloğundan (`SVC_HINTS`); dişsiz genel işlem `tooth:0` "GNL"; taksitlendirme;
  geçmiş vizitler; perio akordeonu.
- `/patient-file/:id` — hasta dosyası, bakiye, planlar.
- **Tedavi planı akışı:** `proposed` (teklif — bakiyeye GİRMEZ) → `active` (hasta
  onayladı) → `completed` / `cancelled`. Ara seanslar `session_count`/`sessions_done`
  ile sayılır; son seansta plan `completed`.
- **Kasa:** diş, ortak premium kasaya (`BeautyCashRegister`) taşındı;
  `cashSectorProfiles.ts`'te `dis` varyantı `allocatePlans: true`, `customerHref → /patient-file`.
  Tahsilat FIFO mahsup edilir, mahsup dökümü makbuzda kalıcı gösterilir, "vadesi gelen
  taksitler" rayı (7 gün + gecikmiş) listelenir.
- **Diş hizmet seed'lerinde `recallDays`:** çoğu 180, beyazlatma 365, çekim yok.
- **Renewal ("paketiniz bitti") mesajı diş sektöründe kapalı.**

**Diş'te bilinçli ERTELENENLER (öneri gelirse karşı çık):** röntgen arşivi (storage
sprint'i), `customers.balance` kolonu (denormalizasyon — bakiye hesaplanır), süt
dişleri (FDI 51–85 / pedodonti), reçete, ICD-10, sesli not, imzalı onam, mobil diş
yüzeyi (`disFace` mobili yok, `MobileDentalEncounter` zayıf — bilinçli ikinci faz).

### saglik — Sağlık / Klinik
**Terminoloji:** Hasta / Hastalar, Randevu (kapsayıcı kalır), Hekim / Hekimler.
**Roller:** Hekim, Yardımcı personel.
**Özel alanlar:** Alerji (müşteri) + **Ziyaret türü** (rezervasyon:
İlk muayene / Kontrol / Sonuç görüşmesi / İşlem). Ziyaret türü **idari** bir
sınıflandırmadır — ayrı bir rezervasyon `status`'ü değildir, klinik uygunluk anlamına gelmez.
**Kaynak:** Oda.
**comms:** Güven veren, ölçülü. "hastamız"/"muayene"/"muayenenizi"/🩺.
Recall: *kontrol muayenesi*, 180 gün. **Guardrail:** TIBBİ TAVSİYE VERME, teşhis koyma.

### fizyoterapi — Fizyoterapi
**Terminoloji:** Hasta / Hastalar, Randevu → **Seans**. **Rol:** Fizyoterapist.
**Özel alanlar:** İşlevsel hedef, Klinik uyarı (düşme riski vb.), Ev programı,
Haftalık uygulanan gün (0–7) (müşteri) + Ağrı bildirimi 0–10, Hareket açıklığı (°) (rezervasyon).
**Kaynak:** Terapi alanı, Cihaz.
⚠️ **Mimari not:** klinik plan (`treatment_plans`) ile ticari paket hakkı
(`customer_packages`) **ayrı kaynaklardır**; buraya "kalan seans" gibi birleşik bir
sayaç EKLENMEZ.
**comms:** Motive edici ama profesyonel. "danışanımız"/"seans"/"seansınızı"/🤸.
Recall: *kontrol seansı*, 60 gün. **Guardrail:** tıbbi tavsiye verme, egzersiz reçetesi yazma.

### tattoo — Tattoo / Piercing Stüdyosu
**Terminoloji:** Randevu → Seans, Personel → **Artist**. **Rol:** Artist (tasarım, seans, kapora).
**Özel alanlar (rezervasyon):** Vücut bölgesi, Tasarım tarzı,
**Talep aşaması** (Talep Alındı / Tasarım Bekliyor / Onay Bekliyor / Onaylandı —
`reservation.status`'a paralel, dashboard durum rozetini besler),
**Kapora durumu** (Alınmadı / Kısmi / Tam), Kapora tutarı (₺); + Alerji (müşteri).
**Kaynak:** Kabin. Mobilde `MobileDovmeHome` özel yüzü var.
**comms:** Havalı, rahat, sanatçı. "seans"/"seansınızı"/🖤.
Recall: *dokunuş (touch-up) zamanı*, 45 gün.

### avukat — Avukatlık Bürosu
**Modüller:** RANDEVU_KASASIZ — **kasa kapalı** (ücret dosya/fatura üzerinden yürür,
gün sonu kasası tutulmaz). Kasa yüzeyleri kendiliğinden gizlenir. Not: `cashier`
rolü hâlâ anlamlı ("Muhasebe" — tahsilat dışı `payments:view` yetkileri için).
**Terminoloji:** Müvekkil / Müvekkiller, **Görüşme**, Danışmanlık, Avukat.
**Roller:** Avukat, Katip, Muhasebe.
**Özel alanlar:** Dosya numarası, Mahkeme, Dava türü. **Kaynak:** Toplantı odası.
**comms:** Resmi, saygılı, net. **Asla senli benli konuşma.** "müvekkilimiz"/"görüşme"/⚖️.
Recall yok. **Guardrail:** HUKUKİ TAVSİYE VERME, dava sonucu yorumlama, dosya içeriğine değinme.

### danismanlik — Danışmanlık / Koçluk
**Terminoloji:** Danışan / Danışanlar, Görüşme. **Rol:** Danışman.
Özel alan ve kaynak yok. **comms:** saygılı, net, profesyonel. 📌. Recall yok.

### gym — Gym / PT
**Terminoloji:** Üye / Üyeler, **Ders / Dersler**, Antrenör. **Rol:** Antrenör.
**Özel alanlar:** Hedef, Sağlık notu. **Kaynak:** Salon alanı.
**comms:** Enerjik, motive edici. "üyemiz"/"antrenman"/"antrenmanınızı"/💪.
Recall: *üyelik yenileme*, 30 gün.

### gelinlikci — Gelinlikçi
**Terminoloji:** **Prova / Provalar**, **Model / Modeller**.
**Roller:** Satış danışmanı, Terzi.
**Özel alanlar:** Beden, Ölçüler, Düğün tarihi (müşteri) + Model kodu (rezervasyon).
**Kaynak:** Prova odası. **comms:** zarif, heyecanlı, özel hissettiren. "prova"/👰. Recall yok.

### restoran — Restoran / Kafe
**Modüller:** randevu ✗, personel ✓ (garson ataması + push), hizmet ✗, kasa ✓,
**masa ✓**, analiz ✓, sira ✗.
**Roller:** Şef garson (masa açar, adisyon + tahsilat), Garson, Personel (kendi masaları).
**Yüz:** `masaFace` + `MobileMasaHome`. Eski `KasaPage` **yalnız restorana** kaldı.
**comms:** sıcak, davetkâr, iştah açan. "misafirimiz"/"rezervasyon"/🍽️. Recall yok.

---

## Türkçe iyelik eki uyarısı

`servicePhrase` **elle yazılır**, kuraldan türetilmez. "işlem" → "işleminizi" doğru,
kural uydurulursa "işlemnizi" çıkar. Yeni sektör eklerken bu alanı mutlaka gözle kontrol et.

---

## Yeni sektör ekleme reçetesi

1. `src/lib/sectorProfiles.ts` → `SECTOR_PROFILES`'a yeni kayıt ekle
   (label, modules, labels, staffRoles, dashboardKpis, customFieldTemplates,
   resourceTypes, comms — `servicePhrase`'i elle yaz).
2. Dashboard'u varsa: bileşeni `src/components/dashboard/` altına yaz →
   `DASHBOARD_FACES` (`src/pages/DashboardPage.tsx`) + gerekirse `MOBILE_FACES`
   (`src/mobile/pages/MobileHome.tsx`) haritasına ekle → `dashboardKpis[0]`'a anahtarı yaz.
   Dashboard yoksa `RANDEVU_KPIS` yeterli.
3. Sayfa tasarımı farklıysa: `src/lib/calendarSectorProfiles.ts`'e satır ekle
   (`berber: SALON` kadar kısa olabilir); gerçekten yeni bir akış gerekiyorsa yeni
   `FaceKey` aç ve `src/pages/sectorFaces.tsx`'e bileşeni bağla.
4. Kasa davranışı farklıysa: `src/lib/cashSectorProfiles.ts`.
5. Sadece o sektörde görünen/gizlenen menü varsa: `src/lib/nav.ts` →
   `sectorOnly` / `hideInSector`.
6. Hizmet seed'i gerekiyorsa: `src/lib/serviceSeeds.ts`.
7. `settings.comms` JSONB'ye yazım otomatiktir (066) — edge function **yalnız oradan**
   okur; edge tarafına ikinci bir sektör tablosu KOYMA (eski `SECTOR_HINTS` kopyası
   8 sektörü ıskaladığı için silindi).

**Kod içinde `if (sector === 'x')` yazman gerekiyorsa yanlış yoldasın** — o davranışı
bir profile taşı.
