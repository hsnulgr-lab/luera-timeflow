# 05 — Prompt Mühendisliği Kütüphanesi

Beynin ikinci ana işi: Furkan'ın başka bir AI'ya (Codex, Claude Code, v0, Gemini)
vereceği **master prompt**'ları üretmek.

---

## Genel doktrin

1. **Kendi kendine yeten.** Hedef AI bu projeyi bilmiyor. Gerekli her token,
   terminoloji ve kısıt prompt'un içinde olmalı. "Bilirsin ya" yok.
2. **Kilit koy.** Tasarım prompt'unda: "mevcut prop arayüzünü, veri akışını ve
   hook'ları DEĞİŞTİRME; yalnız görsel katmanı üret." Kod prompt'unda: "şu dosyaların
   dışına çıkma."
3. **Çıktı formatını yaz.** Tek HTML mi, React bileşeni mi, diff mi; dosya adı ne.
4. **Boş / yükleniyor / hata durumlarını iste.** Unutulan hep bunlar.
5. **Tek prompt = tek yüzey.** Bir mesajda üç sayfa isteme; kalite düşer.
   Furkan'ın deneyimi: uzun/kalabalık Codex oturumu yerine **yeni oturum, her sayfa
   ayrı mesaj**.
6. **Neyin YAPILMAYACAĞINI yaz.** Yasak listesi, istek listesinden daha etkilidir.

---

## ORTAK TASARIM BLOĞU (masaüstü)

> Her tasarım prompt'unun başına aynen yapıştırılır. Sektör terminolojisi satırını
> hedef sektöre göre değiştir.

```
Sen kıdemli bir ürün tasarımcısısın. "LUERA TimeFlow" adlı Türkçe bir randevu/klinik
SaaS'ı için bir sayfa tasarlayacaksın.

TASARIM SİSTEMİ (zorunlu — dışına çıkma):
- Renkler YALNIZ şu CSS değişkenleriyle: sayfa zemini var(--dc-page), kart
  var(--dc-surface), ikincil zemin var(--dc-surface2), üçüncül var(--dc-surface3),
  metin var(--dc-ink), soluk metin var(--dc-muted), çok soluk var(--dc-muted2),
  çizgiler var(--dc-border) / var(--dc-border2), vurgu turuncusu var(--dc-orange)
  (hover koyusu var(--dc-orange-d), yumuşak zemini var(--dc-orange-soft)),
  koyu blok var(--dc-inkbox) üstünde var(--dc-inkbox-fg),
  durum renkleri: var(--dc-green)/var(--dc-green-bg), var(--dc-red2)/var(--dc-red-bg),
  var(--dc-amber)/var(--dc-amber-bg), var(--dc-blue)/var(--dc-blue-bg),
  var(--dc-purple)/var(--dc-purple-bg).
- HTML'in başına şu :root bloğunu koy (ışık modu) ki dosya tek başına açılsın:
  --dc-ink:#0E0E0E; --dc-page:#F3ECE0; --dc-surface:#FAF7F3; --dc-surface2:#F0E9DF;
  --dc-surface3:#E9E1D5; --dc-card:#FFFDFB; --dc-border:rgba(14,14,14,.09);
  --dc-border2:rgba(14,14,14,.14); --dc-muted:rgba(14,14,14,.48);
  --dc-muted2:rgba(14,14,14,.30); --dc-orange:#FF5A1F; --dc-orange-d:#E8430F;
  --dc-orange-soft:rgba(255,90,31,.08); --dc-inkbox:#0E0E0E; --dc-inkbox-fg:#F3EDE3;
  --dc-green:#2D8F32; --dc-green-bg:#E8F5EA; --dc-red2:#C0392B; --dc-red-bg:#FBECEC;
  --dc-amber:#B87A00; --dc-amber-bg:rgba(184,121,10,.12); --dc-blue:#3B6FB0;
  --dc-blue-bg:rgba(59,111,176,.11); --dc-purple:#7B4FA0;
  --dc-purple-bg:rgba(123,79,160,.12);
- Tipografi: "Hanken Grotesk" (Google Fonts). Rakam / saat / tutar / rozet MONOSPACE
  (ui-monospace). Gövde 15px, ikincil 14px. Başlıklar font-weight 800,
  letter-spacing -0.02em. Bölüm etiketleri: 10px, UPPERCASE, letter-spacing .1em,
  font-weight 800, var(--dc-muted).
- Köşeler: kart 16–22px, buton/input 10–12px veya tam pill (99px).
- Gölge çok hafif: 0 1px 2px rgba(14,14,14,.04), 0 2px 8px rgba(14,14,14,.04).
- Birincil buton: koyu var(--dc-inkbox) zemin + açık yazı, pill.
  Vurgu aksiyonu turuncu. İkincil: şeffaf zemin + var(--dc-border2) çerçeve.
- Focus: outline 3px solid rgba(255,90,31,.28), offset 2px.
- YASAK: mor/mavi gradyan, glassmorphism, gökkuşağı kartlar, emoji ikon,
  yukarıdaki listede olmayan hiçbir renk.
- Dil TÜRKÇE. Terminoloji: [SEKTÖRE GÖRE — örn. diş: "Hasta", "Hekim", "Tedavi",
  "Ünite"; kuaför: "Müşteri", "Kuaför", "İşlem", "Koltuk"]. Para birimi ₺.
- Masaüstü öncelikli (1280px+), 768px'e kadar responsive düşsün.
- ÇIKTI: tek, kendi kendine yeten HTML dosyası; tüm CSS inline <style> içinde;
  JS yok (hover/focus yeterli); harici kaynak yalnız Google Fonts.
  Sayfada ayrıca göster: boş durum (empty state), yüklenme iskeleti, hata satırı.
```

## ORTAK TASARIM BLOĞU (mobil)

Masaüstü bloğunun aynısı, şu farklarla:
- Token öneki `--dc-*` yerine `--lt-*`; **koyu tema ana temadır**:
  `--lt-ink:#F3EDE3; --lt-bg:#120E08; --lt-surface:#1C1710; --lt-surface2:#252015;
  --lt-surface3:#30281A; --lt-border:rgba(243,237,227,.12);
  --lt-border2:rgba(243,237,227,.22); --lt-muted:rgba(243,237,227,.50);
  --lt-muted2:rgba(243,237,227,.28); --lt-orange:#FF5A1F; --lt-orangeD:#FF7A45;
  --lt-green:#7CC47F; --lt-blue:#6B9FD4; --lt-amber:#E0A84E; --lt-red:#E07070;
  --lt-purple:#C98BDB;`
- Viewport 390×844 (iPhone 15 Pro). Dokunma hedefi min 44×44px.
- `env(safe-area-inset-top/bottom)` payı bırak.
- Alt eylem çubuğu ve bottom-sheet deseni kullan; masaüstü modal deseni kullanma.
- Rol felsefesini belirt: **müdür ekranı = cepteki desktop** (her şeyi görür) veya
  **personel ekranı = kumanda** (yalnız kendi işi, tek elle kullanılabilir, büyük hedefler).

---

## ŞABLON A — Yeni ekran tasarımı (Codex/v0)

```
[ORTAK TASARIM BLOĞU]

GÖREV: <ekranın adı> — <tek cümlede ne işe yarar>.

BAĞLAM: Bu ekranı <kim> <hangi anda> kullanır. Ekranda geçirdiği süre <x>.
En sık yaptığı 3 iş: 1) … 2) … 3) …

DÜZEN:
- <bölge 1: ölçü + içerik>
- <bölge 2: …>
(Genişlik/oran gibi ölçüleri açıkça yaz. "Sol sütun 380px sabit, sağ esner" gibi.)

VERİ (gerçekçi Türkçe örnek doldur):
- <alan> — <örnek değerler>
…

DURUMLAR: boş · yükleniyor (iskelet) · hata · <ekrana özel durumlar>

ÖNCELİK: Ekranın en önemli bilgisi <X>. Kullanıcı 2 saniyede bunu görmeli.

YAPMA: <yasaklar — örn. "grafik ekleme", "ikon kalabalığı yapma",
"tabloyu 6 kolondan geniş yapma">
```

## ŞABLON B — Mevcut ekranın yeniden tasarımı (görsel yenileme)

```
[ORTAK TASARIM BLOĞU]

GÖREV: Mevcut bir ekranın GÖRSEL yenilenmesi. İşlev birebir korunacak.

EKRANIN BUGÜN YAPTIKLARI (hepsi kalmalı, hiçbiri çıkarılmayacak):
1. …
2. …

BUGÜNKÜ SORUN: <örn. "eski inline tema kullanıyor, çevresindeki her şey yeni
--dc-* dilinde; en görünür tutarsızlık burada">

KISIT: Aynı bilgi kümesi, aynı aksiyonlar, aynı sıra mantığı. Bilgi EKLEME,
bilgi ÇIKARMA. Yalnız düzen, hiyerarşi, tipografi ve renk yenilenecek.

ÇIKTI: tek HTML. Her aksiyon butonunun yanına HTML yorumu olarak eski adını yaz
(<!-- action: onApprovePlan -->) ki koda geri taşırken eşleşme kaybolmasın.
```

> Bu son madde önemli: Furkan gelen HTML'i mevcut React bileşenine **işlev
> bozulmadan** taşıyor. Aksiyon eşlemesi olmadan bu taşıma hataya açık.

## ŞABLON C — Claude Code'a özellik geliştirme prompt'u

```
TimeFlow reposunda çalışıyorsun (React 19 + TS + Vite + Supabase self-hosted).

GÖREV: <özellik>

MİMARİ KURALLAR (ihlal etme):
- Sektöre göre değişen davranış koda `if (sector === 'x')` olarak YAZILMAZ;
  ilgili profile satır eklenir: sectorProfiles.ts / calendarSectorProfiles.ts /
  cashSectorProfiles.ts / nav.ts.
- Bakiye hesabı YALNIZ src/lib/patientBalance.ts; tahsilat dağıtımı YALNIZ
  src/lib/allocatePayment.ts. Yeni formül yazma.
- src/lib/ altındaki dosyalar SAF kalır (React import etmez) — node testleri
  doğrudan import eder.
- Yeni tenant tablosunda RLS deseni: organization_id IN (SELECT auth_user_org_ids()).
- Realtime gerekiyorsa: publication'a ekle + REPLICA IDENTITY FULL.
- Yorumlar Türkçe, 4 boşluk girinti, @/ alias.

DOKUNULACAK DOSYALAR: <liste> — bunların dışına çıkma.
DOKUNMA: <liste>

BİTİRME ÖLÇÜTÜ: npm run lint temiz, npm run build geçiyor, npm run test yeşil.
Migration gerekiyorsa supabase/NNN_ad.sql olarak yaz ve UYGULAMA — Furkan elle uygular.
```

## ŞABLON D — Yeni sektör ekleme prompt'u

```
GÖREV: TimeFlow'a "<sektör adı>" sektörünü ekle.

1. src/lib/sectorProfiles.ts → SECTOR_PROFILES'a "<anahtar>" kaydı:
   - label: "<Ayarlar'da görünecek ad>"
   - modules: <RANDEVU | RANDEVU_KASASIZ | özel set>
   - labels: <terminoloji farkları — customer/reservation/service/staff>
   - staffRoles: <doctor/assistant/cashier/staff için ad + açıklama>
   - dashboardKpis: ['<yüzAnahtarı>'] veya RANDEVU_KPIS
   - customFieldTemplates: <müşteri ve rezervasyon özel alanları>
   - resourceTypes: <örn. ['Oda'] — boş bırakırsan kaynak UI gizlenir>
   - comms: persona / audience / serviceWord / servicePhrase / emoji /
     recall{concept, afterDays} / guardrail
     ⚠ servicePhrase iyelik ekiyle ELLE yazılır ("işlem" → "işleminizi").
     ⚠ Sağlık/hukuk gibi alanlarda guardrail ZORUNLU.
2. Sayfa tasarımı farklıysa calendarSectorProfiles.ts'e satır ekle.
3. Sadece bu sektörde görünen menü varsa nav.ts → sectorOnly.
4. Hizmet seed'i gerekiyorsa serviceSeeds.ts.
5. Test: tests/ altına profilin çözümlendiğini doğrulayan bir vaka ekle.

Edge function tarafına İKİNCİ bir sektör tablosu ekleme — comms yalnız
settings.comms JSONB'den okunur (066).
```

## ŞABLON E — Hata ayıklama prompt'u

```
BELİRTİ: <kullanıcının gördüğü>
BEKLENEN: <olması gereken>
ORTAM: <yerel / canlı> · sektör: <x> · rol: <müdür/personel> · cihaz: <masaüstü/mobil>

ÖNCE ŞUNU YAP, tahmin yürütme:
- WhatsApp ilgiliyse: Ayarlar → WhatsApp → test gönderimi çalıştır, ham reason'ı oku
  (quota / not_connected / invalid_phone / opt_out).
- Randevu çakışması ilgiliyse: DB trigger (060) mi client kontrolü mü reddediyor, ayır.
- Realtime ilgiliyse: tablo supabase_realtime publication'ında mı, REPLICA IDENTITY
  FULL mü, kontrol et.
- Edge function ilgiliyse: canlıdaki dosya deploy edilmiş mi? Yerelde düzeltilip
  deploy edilmemiş bir düzeltme "canlıda etkisiz"dir.

Kök nedeni bulmadan kod değiştirme. Bulduğunda önce tek cümleyle söyle.
```

## ŞABLON F — Ürün/strateji danışma prompt'u (beynin kendine)

Furkan "ne yapmalıyım" diye sorduğunda cevap iskeleti:

```
KARAR: <tek cümle, net>
GEREKÇE: <2–4 madde — ticari + teknik>
NASIL: <somut adımlar, dosya adlarıyla>
RİSK: <ne ters gidebilir, nasıl anlaşılır>
ERTELENEBİLİR: <bu işin şimdi yapılmayacak parçası ve nedeni>
```

---

## Prompt kalite kontrol listesi

Bir prompt'u vermeden önce kendine sor:

- [ ] Hedef AI projeyi hiç bilmese bu prompt'la doğru çıktı üretir mi?
- [ ] Renk paleti **tam** ve `:root` bloğu gömülü mü?
- [ ] Terminoloji hedef sektöre göre yazılmış mı? (diş'te "Müşteri" yazıyorsa hatalı)
- [ ] Çıktı formatı ve dosya adı belli mi?
- [ ] Boş / yükleniyor / hata durumları isteniyor mu?
- [ ] Yasak listesi var mı?
- [ ] İşlev kilidi ("veri akışını değiştirme") konmuş mu?
- [ ] Tek yüzey mi istiyor, yoksa şişmiş mi?
