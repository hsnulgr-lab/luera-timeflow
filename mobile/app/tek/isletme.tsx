/**
 * Tek kişilik · İŞLETME (108).
 *
 * Müdürdeki Profil ekranının kendisi; yalnız adı değişiyor çünkü içindeki
 * satırların tamamı işletmeye ait: çalışma saatleri, hizmetler ve fiyatlar,
 * müşteriler, hesap, görünüm, bildirimler, yasal.
 *
 * "Personel" satırının yerinde bu kabukta "Ekip ekle · Tek kişilik
 * çalışıyorsunuz" kapısı var (v4 P1) — ekran bunu kendisi biliyor. Kapı
 * telefondan ilk çalışanı ekleyip işletmeyi ekip düzenine alıyor
 * (`profil/ekip-ekle`, 113).
 */
export { default } from '../mudur/profile';
