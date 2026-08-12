import { Redirect } from 'expo-router';

// İlk küçük teslim: HTML tasarımındaki Personel 01 ekranı. Cihaz ve personel
// oturumlarına göre dallanma, sonraki auth ekranlarıyla birlikte eklenecek.
export default function Index() {
    return <Redirect href="/(auth)/pair" />;
}
