# KULLANMA — tarihsel dosyalar

Bu klasördeki dosyalar erken geliştirme döneminden kalan toplu SQL dökümleridir
ve `supabase/` altındaki sıra numaralı migration'larla (002, 003, …) çakışır.

- `migration.sql` — ilk kurulum dökümü (multi-tenant öncesi şema)
- `update_database.sql` — birkaç migration'ın elle birleştirilmiş kopyası

Yeni bir ortam kurarken **bunları çalıştırma**; sıra numaralı migration'ları
sırayla uygula. Bu dosyalar yalnızca tarihsel referans için saklanıyor.
