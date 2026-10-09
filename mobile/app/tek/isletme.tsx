/**
 * Tek kişilik · İŞLETME (108).
 *
 * Müdürdeki Profil ekranının kendisi; yalnız adı değişiyor çünkü içindeki
 * satırların tamamı işletmeye ait: çalışma saatleri, hizmetler ve fiyatlar,
 * müşteriler, hesap, görünüm, bildirimler, yasal.
 *
 * "Personel" satırı bu kabukta ÇİZİLMİYOR — ekran bunu kendisi biliyor.
 * Yerine gelecek "Tek kişilik çalışıyorsunuz · Ekip ekle" kapısı Faz 3'te:
 * önkoşulu telefondan personel eklemek ve o yol henüz yok. Olmayan bir kapıyı
 * şimdiden çizmek, dokunulduğunda hiçbir şey yapmayan bir kontrol olurdu.
 */
export { default } from '../mudur/profile';
