# 🚀 ULTIMATE DENTAL MODULE BLUEPRINT v3.0 (Görsel Analizli Tam Sürüm)
**Target System:** Luera TimeFlow (React 19 + TypeScript + Supabase)
**Goal:** Diş Hekimi Modülünü "Arşa Çıkarmak" - Global klinik yönetim standartlarında (Dentrix, Curve Dental vb.) kusursuz, ultra-hızlı ve kullanıcı dostu bir arayüz/mimari inşa etmek.

*Ekran görüntülerinden (Dashboard, Hasta Profili, Diş Şeması ve Randevu Modalı) elde edilen kritik bulgularla zenginleştirilmiş nihai "Master Prompt" belgesidir.*

---

## 1. EKRAN GÖRÜNTÜSÜ (VİSUAL) BULGULARI VE DOMAİN ADAPTASYONU

Gönderdiğiniz arayüz fotoğraflarını derinlemesine inceledim. Tasarım dili (Luera v2) son derece temiz, ferah ve modern. Ancak sistemin köklerinde veya test verilerinde "Güzellik Salonu" (Kuaför, Makyaj, Saç) izleri var. Diş hekimliğinde **"Ultimate"** seviyeye çıkmak için şu adaptasyonlar şarttır:

### A. Personel ve Kaynak (Koltuk) Yönetimi (Randevu Modalı Analizi)
*   **Sorun:** Yeni randevu modalında personel seçilirken altında "saç", "makyaj", "cilt bakımı" yazıyor. Ayrıca diş kliniklerinde sadece hekim değil, **Koltuk (Chair)** rezerve edilir.
*   **Çözüm (Domain Adaptation):** 
    *   Personel rolleri kesin olarak "Uzman Hekim", "Ortodontist", "Asistan", "Hijyenist" olarak güncellenmelidir.
    *   **Koltuk/Oda Ataması:** Randevu modalına "Zaman" ve "Personel" haricinde **"Klinik/Koltuk"** (Örn: Koltuk 1, Cerrahi Odası) seçimi eklenmelidir. İki hekim aynı anda aynı koltuğa randevu yazamamalıdır.

### B. Röntgen ve Laboratuvar Takibi (Dashboard Analizi)
*   **Bulgu:** Dashboard'da sağ altta "Yakında: Röntgen Arşivi" ve "Lab Takibi" modüllerini gördüm. Bu harika bir vizyon.
*   **Geliştirme Planı:** Röntgenler doğrudan `DentalChartPage` içine entegre edilmelidir. Diş şemasında bir dişe (örn: 16) tıklandığında, sadece durumu değil, o dişe ait geçmiş periapikal röntgenler de panelde "Röntgenler" sekmesi altında küçük resim (thumbnail) olarak gelmelidir.

### C. Hasta Profili ve MiniArch Görünümü (Customers Page Analizi)
*   **Sorun:** Hasta detay sayfasındaki "DİŞ ŞEMASI" (MiniArch) çok yatay ve uzun bir alana yayılmış. Bir bakışta kavraması zor.
*   **Çözüm:** MiniArch daha kompakt, anatomik çene kavisini (U şekli) andıran daha dar bir grid yapısına sokulmalıdır. Ayrıca hastanın finansal kısmında sadece "Toplam Harcama" değil, **"Kalan Bakiye (Borç)"** dev puntolarla gösterilmelidir.

### D. Diş Şeması Renklendirme Problemi (Dental Chart Analizi)
*   **Sorun:** "Çürük" veya "Dolgu" seçildiğinde bütün diş (kron) kıpkırmızı veya masmavi oluyor. Bu, klinik açıdan çok agresif ve yanıltıcı bir görüntüdür (Ufacık bir oklüzal çürük için tüm diş kırmızı yanıyor).
*   **Çözüm (Zorunlu):** Yüzey Seçici (Surface Charting - MODBL) lüksten ziyade **mecburiyettir**. Çürük sadece dişin ortasında (Oklüzal) küçük bir nokta/şekil olarak kırmızı yanmalıdır.

---

## 2. VERİTABANI MİMARİSİ (SUPABASE BACKEND)

Mevcut yapıya dokunmadan, onu genişletecek olan `056_dental_ultimate.sql` migration dosyası gereksinimleri:

### A. `customers` Tablosu Geliştirmeleri
```sql
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS recall_date DATE, -- Bir sonraki kontrol randevusu
ADD COLUMN IF NOT EXISTS medical_alerts TEXT[], -- ['Penilisin Alerjisi', 'Diyabet']
ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) DEFAULT 0; -- Hastanın kalan borcu
```

### B. `dental_records` ve `periodontal_records`
```sql
ALTER TABLE dental_records 
-- Yüzeyler: 'M' (Mesial), 'O' (Occlusal), 'D' (Distal), 'B' (Buccal), 'L' (Lingual)
ADD COLUMN IF NOT EXISTS surfaces TEXT[] DEFAULT '{}', 
ADD COLUMN IF NOT EXISTS record_type TEXT NOT NULL DEFAULT 'existing' CHECK (record_type IN ('existing', 'planned')),
ADD COLUMN IF NOT EXISTS treatment_plan_id UUID REFERENCES treatment_plans(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.periodontal_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    tooth_number SMALLINT CHECK (tooth_number BETWEEN 11 AND 48),
    pocket_depth_buccal INTEGER[], -- [Mesial, Mid, Distal]
    pocket_depth_lingual INTEGER[],
    bleeding_on_probing BOOLEAN DEFAULT false,
    mobility SMALLINT CHECK (mobility BETWEEN 0 AND 3),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### C. `reservations` Tablosu (Koltuk Takibi İçin)
```sql
ALTER TABLE reservations
-- Randevunun hangi koltukta/odada gerçekleşeceği
ADD COLUMN IF NOT EXISTS resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;
```

---

## 3. FRONTEND UI & UX MİMARİSİ (Arayüz Detayları)

### A. Dashboard (`DisDashboard.tsx`) - "Komuta Merkezi"
1.  **Kontrol Zamanı (Recall) Widget'ı:** "Recall listesi bağlandığında dolacak" statik metni kalkacak. Yerine yaklaşan 1 hafta içindeki hastalar listelenecek ve **"WhatsApp ile Hatırlat"** butonu konacak.
2.  **Medical Alert Banner:** Dashboard'da "Bugünkü Hasta Akışı" listesinde, sistemik hastalığı olan hastanın isminin yanında minik kırmızı bir `Heart` veya `AlertTriangle` ikonu belirmeli.

### B. Dev Diş Şeması (`DentalChartPage.tsx`) - "Odontogram"
1.  **Yüzey Çizimleri (Crucial Fix):** `ToothSVG.tsx` baştan yazılacak. SVG path'leri sadece dişin dış hatlarını değil, 5 yüzeyi (M, O, D, B, L) ayrı ayrı path'ler olarak barındıracak. Tıklanan yüzey renk alacak.
2.  **Röntgen Entegrasyonu:** Ekrandaki "DİŞ ETİ" gradyanının alt kısmında veya yan panelde bir "Röntgenler" butonu eklenecek.
3.  **Geçmişi Görüntüleme:** Bir dişe tıklandığında açılan Popover/Modal'ın sağ tarafında **"Diş Geçmişi" (History)** sekmesi olmalı ve yapılan tüm işlemler kronolojik gösterilmelidir.

### C. Takvim Modülü ve Randevu Modalı (`CalendarPage.tsx`)
*   **Koltuk (Chair) Seçimi:** Yeni randevu modalında "Personel" sekmesinin yanına "Koltuk/Birim" (Örn: Koltuk 1, Panoramik Röntgen Odası) seçimi eklenmelidir.
*   **Granular States:** `upcoming -> inService -> done` akışına `Arrived` (Bekleme Salonunda) ve `Seated` (Koltukta) durumları (state'leri) eklenmelidir. Bu, klinik içindeki hasta akış trafiğini yönetmek için şarttır.

---

## 4. FRONTEND KODLAMA DİREKTİFLERİ (Claude/Fable 5 İçin)

1.  **Refactoring:** `CalendarPage.tsx` 1200 satırdan uzun, inline CSS'lerle dolu. Bu dosya kesinlikle modüllere bölünmelidir (`ReservationModal.tsx`, `CalendarGrid.tsx` vb.).
2.  **Temalandırma:** Mevcut krem/bej arka planlar (`var(--dc-page)`) çok başarılı. Göz yormuyor. Yeni eklenecek Periodontal Şema ve Surface Selector (Yüzey Seçici) bu renk paletine (`var(--dc-orange)`, `var(--dc-ink)`) sadık kalarak inşa edilmelidir.
3.  **Optimizasyon:** Diş SVG'leri karmaşıklaşacağı için (Yüzey path'leri ekleneceği için) `ToothSVG` bileşeni kesinlikle `React.memo` ile sarmalanmalıdır ki performans (Zero-Latency) düşmesin.

---
### 🛠 Nasıl Başlamalıyız? (Sıradaki Adımlar)
Claude / Fable 5'e bu dökümanı verdikten sonra uygulanması gereken işlem sırası:
1. `CalendarPage.tsx` refactoring işlemini yap ve randevu modalına **Koltuk (Resource)** seçimini ekle. Test verilerindeki "Saç/Makyaj" labellerini kaldır.
2. `supabase/056_dental_ultimate.sql` dosyasını çalıştır.
3. `ToothSVG.tsx`'i yüzeyleri (MODBL) destekleyecek şekilde SVG path'leriyle yeniden çiz. Dişi tek renk boyama mantığını bırak.
4. Tedavi Planı (TreatmentPlans) ve Diş Şeması (DentalChart) arasındaki **otomatik senkronizasyonu** kur.
5. Dashboard'daki Röntgen ve Recall (WhatsApp) widget'larını aktifleştir.
