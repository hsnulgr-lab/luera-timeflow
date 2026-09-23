# BAŞLA BURADAN — Luera TimeFlow devir paketi

**Tarih:** 2026-09-23
**Neden:** Önceki oturumun kullanım limiti doldu. Bu paket, işin ikinci bir
Claude hesabından kesintisiz devam etmesi için yazıldı.

---

## Bu dosyaları hangi sırayla oku

| Dosya | Ne anlatıyor |
|---|---|
| **00-BASLA-BURADAN.md** (bu dosya) | Proje nedir, kurallar, kim ne yapar |
| **01-NE-YAPTIK.md** | Bu oturumda tamamlananlar, dosya dosya |
| **02-SIRADAKI-ADIMLAR.md** | Kullanıcının çalıştıracakları + doğrulama |
| **03-TUR-2-PLANI.md** | Bildirim işinin kalan yarısı, tam plan |
| **04-PROJE-GERCEGI.md** | Veri kaynakları, mimari, gelenekler |
| **05-KOMUTLAR.md** | Bütün komutlar tek yerde |
| **06-BORC-DEFTERI.md** | Ertelenenler ve bilinen hatalar |
| **07-GERI-ALMA.md** | Bir şey ters giderse — migration ve kod geri alma |

> **Bu klasör hem `~/Desktop/Luera TimeFlow - Devir Paketi/` hem de depo
> içinde `docs/devir/` altında duruyor.** Claude Code çalışma dizininin
> DIŞINDAKİ dosyaları okuyamıyor — yeni oturum depodaysa `docs/devir/`
> yolunu kullansın, masaüstündeki kopya yalnız senin okuman için.

---

## Proje nedir

**Luera TimeFlow** — salonlar (güzellik, kuaför, diş, fizyoterapi…) için
randevu ve işletme yönetimi. Üç parça:

- **Masaüstü** — React + Vite web uygulaması (`src/`). Müdürün ana aracı.
- **Mobil** — Expo SDK 57 uygulaması (`mobile/`). İki mod: **müdür** (cep
  desktop'u) ve **personel** (kumanda).
- **Sunucu** — kendi barındırılan Supabase (VPS `76.13.4.164`), edge
  function'lar `supabase/functions/`, migration'lar `supabase/*.sql`
  (numaralı düz dosyalar, `migrations/` klasörü YOK).

Depo: `/Users/furkanulger/Projects/luera-timeflow`
Dal: `chore/expo-57`

---

## DEVREDİLEMEZ KURALLAR

Bunlar tercih değil, projenin kimliği.

### Ürün

1. **Hiçbir ekran olmamış bir şeyi olmuş gibi göstermez.** Sunucu onaylamadan
   "kaydedildi" yazılmaz. Cevap gelmediğinde "yazılmadı" DA yazılmaz — çünkü
   yazılmış olabilir. Bkz. `mobile/src/lib/packageSale.ts` · `saleFailureText`.
2. **Veri uydurulmaz.** Bilinmeyen alan, tablo ya da akış varsa SOR.
3. **Hâller birleştirilmez.** `loading | ok | error` (+ `cached`, `missing`,
   ayrı `refusal`). "Okunamadı" asla "yok" gibi çizilmez.
4. **Karşılığı olmayan kontrol çizilmez.** Gitmeyen düğme, hiçbir şey yapmayan
   anahtar yok.
5. **Tasarım bel kemiğidir.** Doğru veri + bozuk görünüm = iş bitmemiş.
6. **Mevcut kart tasarımı ve Akış'ın sırası dokunulmaz.**

### Süreç

7. **Bütün SQL'i ve bütün ssh/deploy komutlarını KULLANICI çalıştırır.**
   Sen komutu hazırlarsın, o çalıştırır.
8. **İzinsiz commit ve push YOK.** Kullanıcı açıkça istemeden `git commit`
   atılmaz.
9. **Doğrulama telefonda.** iOS Simülatörü/Xcode yalnız açık emirle.
   *Bildirim işi için istisna: Expo Go uzak bildirimi desteklemiyor,
   geliştirme derlemesi şart.*
10. **Sır yazılmaz.** Şifre, token, PIN, API anahtarı hiçbir alana YAZILMAZ;
    kullanıcı kendisi yapıştırır.

### Güvenlik durumu

- **VPS root şifresi ve GitHub classic PAT ifşa olmuş kabul ediliyor.**
- VPS'e yalnız `~/.ssh/luera_vps` anahtarıyla bağlanılıyor.
- GitHub'a push KİLİTLİ (SSH anahtarı yok, token geçersiz). ~94 commit yalnız
  yerelde. Kullanıcı bunu bilerek sona bıraktı.

---

## Kod gelenekleri

- **Yorumlar Türkçe**, uzun, NEDEN'i anlatır ve çoğu zaman canlıda yaşanmış
  gerçek arızayı yazar. Biçim: `/** … */`, içinde `── Başlık ───` alt
  başlıkları, ~78 kolon.
- **Saf mantık React'siz ayrı dosyada durur** ki test gerçekten çağırabilsin.
  Desen: `mobile/src/lib/freshness.ts`.
- **Hareket:** yalnız `opacity`, `translateX/Y`, `scale`, hepsi
  `useNativeDriver: true`. `react-native-gesture-handler` YOK ve kurulmayacak
  (jestler `PanResponder`). `LayoutAnimation` yok. reanimated 4.5.1 kurulu ama
  yazılmış ekranlar taşınmıyor — yeni hareket yazarken **önce sor**.
  Kaynak: `mobile/AGENTS.md`.
- **Kurulu tipler bağlayıcıdır**, doküman değil. Şüphede
  `mobile/node_modules/**/*.d.ts` oku.
- **Testler:** `node --test tests/*.test.mjs`. İki desen: saf modülü import
  edip çalıştırma, ve `.tsx` kaynağını okuyup **yorumları sıyırdıktan sonra**
  regex ile doğrulama. Test adları Türkçe cümle ve nedeni söyler.

---

## Kim ne yapar

| İş | Kim |
|---|---|
| Kod yazma, test, plan | **Claude** |
| SQL / migration çalıştırma | **Kullanıcı** |
| `ssh`, `deploy-functions.sh`, `eas build` | **Kullanıcı** |
| Telefonda doğrulama | **Kullanıcı** |
| Commit (istenirse) | Claude, ama yalnız açık emirle |
| Tasarım kararı | **Kullanıcı** |

---

## Hemen bilmen gereken üç şey

1. **`git` şu an ÇALIŞMIYOR** — Xcode lisansı onaylanmamış. Commit aşamasına
   gelmeden kullanıcının şunu çalıştırması gerekiyor:
   `sudo xcodebuild -license`
2. **`supabase/101_live_doorbell_wide.sql` HENÜZ ÇALIŞTIRILMADI.** Kod hazır ve
   testli, ama veritabanında tetikleyiciler yok.
3. **Bildirim işinin Tur 1'i bitti, hiçbir şey deploy edilmedi.** Bkz.
   `02-SIRADAKI-ADIMLAR.md`.
