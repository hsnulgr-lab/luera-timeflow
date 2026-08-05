# 07 — LUERA Beyni Kurulum Kılavuzu

## Adım 1 — Projeyi oluştur

claude.ai → sol menüde **Projects** → **New project**

| Alan | Ne yazacaksın |
|---|---|
| **What are you working on?** | `LUERA Beyni — TimeFlow` |
| **What are you trying to achieve?** | `LUERA AI ekosisteminin ve TimeFlow modülünün master beyni. Mimari, 14 sektör, tasarım dili, kararlar defteri ve prompt mühendisliği tek yerde. Sorulara TimeFlow'un gerçek koduna dayanarak cevap verir; tasarım ve geliştirme promptları üretir.` |

**"Use a folder" seçeneğini kullanma** — bu, projeyi bir bilgisayar klasörüne bağlar
ve dosya senkronu ister; sen bilgi dosyalarını elle yükleyeceksin.

## Adım 2 — Talimatları yapıştır

Proje açıldıktan sonra sağ üstteki **⚙ / "Set project instructions"** (bazı sürümlerde
"Add instructions") alanına **`00_PROJE_TALIMATLARI.md` dosyasının tam içeriğini**
yapıştır.

> Bu, projenin sistem promptudur. Beynin kimliği, kuralları ve tonu buradan gelir.

## Adım 3 — Bilgi dosyalarını yükle

Proje sayfasında **Add content / Project knowledge** → **Upload files**.
Şu 6 dosyayı yükle (hepsi `luera_brain/` klasöründe):

```
01_LUERA_EKOSISTEM.md
02_TIMEFLOW_MIMARI.md
03_SEKTORLER.md
04_TASARIM_DILI.md
05_PROMPT_KUTUPHANESI.md
06_KARARLAR_VE_YOLHARITASI.md
```

`00_PROJE_TALIMATLARI.md`'yi **yükleme** — o zaten talimat alanında.
`07_KURULUM.md`'yi de yükleme — o sadece senin için.

### Ek olarak yüklemeye değer repo dosyaları (opsiyonel ama tavsiye)
Beynin kod desenini birebir görmesi için:
- `src/lib/sectorProfiles.ts` — sektör kaydının kendisi
- `src/lib/nav.ts` — navigasyon deseni
- `src/index.css` — token'ların ham hali
- `codex_dental_prompts.md` — mevcut prompt üslubun

## Adım 4 — Doğrula

Yeni bir sohbet aç ve şu 5 soruyu sor. Beyin hepsini **dosyalara dayanarak**
cevaplamalı; uydurursa bir şey eksik yüklenmiştir.

1. `TimeFlow'da kaç sektör var, hangileri satışa hazır?`
   → 14 sektör; hazır 7: güzellik, kuaför, berber, estetik, diş, sağlık, fizyoterapi.
2. `Gym sektörünün WhatsApp personası ve recall süresi ne?`
   → Enerjik/motive edici, "üyemiz", üyelik yenileme 30 gün, 💪.
3. `Bir ekranda bu turuncuyu kullanabilir miyim: #F97316?`
   → Hayır. Marka turuncusu `#FF5A1F` (hover `#E8430F` / dark `#FF7A45`).
4. `Hasta bakiyesini yeni bir ekranda göstereceğim, nasıl hesaplayayım?`
   → Kendi formülünü yazma; `computePatientFinance` (`src/lib/patientBalance.ts`).
5. `customers tablosuna balance kolonu ekleyelim mi?`
   → Hayır — 2026-07-13'te reddedildi, denormalizasyon.

## Adım 5 — İlk gerçek kullanım

```
Diş modülünün Rezervasyonlar sayfası için Codex'e vereceğim tasarım
prompt'unu yaz. Tek HTML istiyorum, masaüstü öncelikli.
```

Beyin sana `05_PROMPT_KUTUPHANESI` ortak bloğu + Şablon B ile eksiksiz,
kopyala-yapıştır bir prompt üretmeli.

---

## Bakım

Beyin ancak dosyaları kadar iyidir. Şu üç durumda dosyayı güncelle ve **yeniden yükle**
(Claude Projects'te dosya "replace" edilir):

| Ne değişti | Hangi dosya |
|---|---|
| Yeni sektör, terminoloji, comms profili | `03_SEKTORLER.md` |
| Yeni renk token'ı, tipografi kararı, animasyon | `04_TASARIM_DILI.md` |
| Yeni migration, edge function, tablo, deploy yöntemi | `02_TIMEFLOW_MIMARI.md` |
| Yeni karar, biten/eklenen roadmap maddesi | `06_KARARLAR_VE_YOLHARITASI.md` |

**Pratik alışkanlık:** her önemli oturumun sonunda beyne sor —
`Bu oturumda karara bağladığımız şeyleri 06 dosyasına eklenecek satırlar hâlinde yaz.`
Sonra o satırları dosyaya yapıştır, dosyayı yeniden yükle. Beyin böylece kendi
hafızasını beslemende sana yardım eder.

## Claude Code ile ilişkisi

Bu proje **düşünme/tasarım/karar** katmanıdır — kod yazmaz, repoyu görmez.
Kodu Claude Code (bu terminal) yazar.

Doğal iş akışı:
1. **Claude Projesi'ne sor** → karar + prompt al.
2. Prompt'u **Codex/v0'a** ver → tasarım HTML'i al.
3. HTML'i repoya koy (`codex_html/`) → **Claude Code**'a "bunu mevcut bileşene
   işlev bozmadan uygula" de.

İstersen aynı içeriği repo içinde `CLAUDE.md` olarak da tutabilirsin; o zaman
Claude Code da her oturumda bu bilgiyi otomatik yükler. Şu an repoda `CLAUDE.md`
**yok** — istersen `luera_brain/` dosyalarına işaret eden kısa bir `CLAUDE.md`
oluşturabilirim.
