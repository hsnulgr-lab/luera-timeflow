/**
 * Tek kişilik · RANDEVU KURMA — müdür akışı. "Kim yapacak" adımının düşmesi CreateFlow'un içinde (tek personel varsa kendiliğinden seçiliyor).
 *
 * Yeniden dışa aktarım: ekran müdürünkiyle AYNI. Tek kişiye göre kısmalar
 * varsa ekranın içinde, `useInSoloShell` ile yapılıyor (108).
 */
export { default } from '../mudur/create';
