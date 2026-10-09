/**
 * Tek kişilik · GÜN (108).
 *
 * Müdürün Akış ekranının kendisi. Tek fark personel şeridinin çizilmemesi ve
 * onu ekran kendisi hallediyor: hangi kabukta olduğunu adresten okuyor
 * (`useInSoloShell`). Burada kopya bir dosya yok — iki kabuk aynı ekranı
 * paylaşıyor, yoksa her düzeltme iki yerde yapılacaktı ve biri unutulurdu.
 *
 * ── Bu, tasarımın son hâli DEĞİL ────────────────────────────────────────────
 * v4 tasarımındaki Gün ekranı başka: üstte gün başlığı ve hafta şeridi, onun
 * altında dokunulabilir bir hâl kartı (Başlat / Kumandayı aç), sonra kart
 * biçiminde randevular. O ekran Faz 2'nin işi.
 *
 * Faz 1'de Akış'ın seçilme sebebi biçim değil İŞLEV: randevu kurma, bekleme,
 * tahsil etme ve gün değiştirme burada ÇALIŞIYOR. Kabuğun ayakta olduğunu
 * ancak işleyen bir ekranla kanıtlayabiliriz; doğru görünen ama hiçbir şey
 * yapmayan bir ekran bunu kanıtlamaz.
 */
export { default } from '../mudur/index';
