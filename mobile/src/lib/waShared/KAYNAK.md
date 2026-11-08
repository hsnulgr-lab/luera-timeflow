# waShared — sunucunun mesaj kalıplarının BİREBİR kopyası

Kaynak: `supabase/functions/_shared/booking/` → `messages.ts`, `tr.ts`, `slots.ts`,
`identity.ts`, `hitap.ts`. Telefon uygulaması (Metro) `mobile/` dışını
paketleyemediği için dosyalar burada **aynen** duruyor; hiçbirine elle
dokunulmaz.

Güncellemek: `node mobile/scripts/sync-wa-shared.mjs` (kaynaktan yeniden kopyalar).
`tests/mobil-wa-tek-ses.test.mjs` kopyaların kaynakla bayt bayt aynı olduğunu
ve telefonun metninin masaüstününkiyle aynı çıktığını denetler; kaynak değişip
kopya güncellenmezse test kırılır.

Telefon yalnız kalıpları kullanır; tarih etiketini kendi `calendar.ts`'iyle
üretir (`waText.ts · waDateLabel`): Hermes'in `Intl` desteğine güvenilmiyor.
