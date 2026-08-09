import { Redirect } from 'expo-router';

// Giriş kapısı. Cihaz eşleşmesi ve personel oturumu (auth) sonraki adımda
// yazılacak; şimdilik doğrudan kumandaya.
export default function Index() {
    return <Redirect href="/(staff)" />;
}
