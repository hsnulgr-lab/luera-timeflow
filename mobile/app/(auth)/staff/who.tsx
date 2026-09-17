import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
    authApi,
    type AuthBusiness,
    type StaffRosterMember,
} from '../../../src/api/session';
import {
    AuthActionButton,
    AuthBackBar,
    AuthBanner,
    AuthHeader,
    AuthIdentityBar,
    AuthStaffRow,
} from '../../../src/components/ui';
import { authMetrics, useTheme } from '../../../src/theme';
import { LightField } from '../../../src/components/LightField';

interface RosterView {
    business: AuthBusiness;
    staff: StaffRosterMember[];
}

export default function ChooseStaff() {
    const { c } = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const [roster, setRoster] = useState<RosterView | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    /** Kadro okunamadı — eşleşme sorunu DEĞİL, okuma sorunu. */
    const [listError, setListError] = useState(false);

    const load = useCallback(() => {
        authApi.staff.roster().then((result) => {
            if (result.ok) {
                setRoster({ business: result.data.business, staff: result.data.staff });
                setListError(false);
                return;
            }
            // YALNIZ "cihaz eşleşmemiş" eşleştirme ekranına gönderiyor.
            //
            // Eskiden HER başarısızlık oraya atıyordu: ağ hatası, zaman
            // aşımı, sunucu hıçkırığı. Telefon pekâlâ işletmeye bağlıyken
            // "bu telefonu işletmeye bağlayın" ekranı açılıyor ve kullanıcı
            // yeni bir kod aramaya gidiyordu. "Okuyamadım"dan "eşleşmemişsin"
            // sonucu çıkarmak, gecenin tekrar eden hatası.
            if (result.error === 'not_paired') {
                router.replace('/(auth)/staff/pair');
                return;
            }
            // Abonelik: "bağlantınızı kontrol edin" demek yalan olurdu.
            if (result.error === 'subscription_inactive') {
                router.replace('/(auth)/locked');
                return;
            }
            setListError(true);
        }).catch(() => setListError(true));
    }, [router]);

    useEffect(() => { load(); }, [load]);

    // Açılış doğrudan buraya yönlendirdiyse geri gidilecek ekran yok.
    const leave = () => {
        if (router.canGoBack()) router.back();
        else router.replace('/(auth)/welcome');
    };

    const choose = async (staffId: string) => {
        if (busyId) return;
        setBusyId(staffId);
        setFailed(false);
        const result = await authApi.staff.select(staffId);
        setBusyId(null);
        // Başarısızlıkta eskiden HİÇBİR ŞEY olmuyordu: personel adına
        // dokunuyor, ekran duruyordu. Sessizce çalışmayan bir kontrol,
        // kullanıcıya uygulamanın bozuk olduğunu düşündürür.
        if (!result.ok) { setFailed(true); return; }
        router.push('/(auth)/staff/pin');
    };

    return (
        <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
            <LightField profile="form" />
            {/* İşletme adı YOKSA kimlik bandı çizilmiyor, yalnız geri düğmesi.
                Sunucunun `roster` ucu işletme bilgisi dönmüyor ve istemci onu
                boş bir nesneyle dolduruyordu: ekranın tepesinde adı ve yeri
                olmayan boş bir şerit kalıyordu. Boş bir bant bilgi vermez,
                yalnız yer kaplar. */}
            {roster?.business.name ? (
                <AuthIdentityBar
                    overField
                    title={roster.business.name}
                    subtitle={roster.business.location}
                    onBack={leave}
                />
            ) : (
                <AuthBackBar onPress={leave} />
            )}

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: insets.bottom + authMetrics.staffListBottom }}
                showsVerticalScrollIndicator={false}
            >
                <AuthHeader selection title="Siz kimsiniz?" body="Listeden kendinizi seçin" />
                {roster ? (
                    // Plakalar arası 10 pt: aradan ışık alanı görünsün diye.
                    <View style={{
                        paddingHorizontal: authMetrics.selectionRowX,
                        gap: authMetrics.staffRowGap,
                    }}>
                        {roster.staff.map((member) => (
                            <AuthStaffRow
                                key={member.id}
                                // Şifresi olmayan personel LİSTEDE (099): satır kendi
                                // üçüncü satırıyla "ilk giriş"i söylüyor.
                                member={member}
                                onPress={() => choose(member.id)}
                            />
                        ))}
                    </View>
                ) : null}
                {roster && roster.staff.length === 0 ? (
                    /*
                     * BOŞ LİSTE — çıkmaz sokak değil. Liste bütün aktif
                     * personeli gösteriyor (099); boşsa işletmede kimse
                     * eklenmemiş demek. Ekran eskiden yalnız başlık çiziyordu.
                     */
                    <View style={{
                        paddingHorizontal: authMetrics.selectionRowX,
                        gap: authMetrics.staffRowGap,
                    }}>
                        <AuthBanner kind="error" inset={false}>
                            Bu işletmede henüz personel yok. Telefon bağlandı — müdürünüz sizi
                            Personel sayfasından ekledikten sonra bu listede görüneceksiniz.
                        </AuthBanner>
                        <AuthActionButton
                            label="Tekrar dene"
                            onPress={() => { setRoster(null); load(); }}
                        />
                    </View>
                ) : null}
                {listError ? (
                    <View style={{
                        paddingHorizontal: authMetrics.selectionRowX,
                        gap: authMetrics.staffRowGap,
                    }}>
                        <AuthBanner kind="error" inset={false}>
                            Listeyi alamadık. Bağlantıyı kontrol edip tekrar deneyin. Telefonun
                            bağlantısı bozulmadı; kodu yeniden yazmanız gerekmiyor.
                        </AuthBanner>
                        <AuthActionButton
                            label="Tekrar dene"
                            // Sıfırlama OLAY İŞLEYİCİSİNDE: efektin içinde
                            // senkron `setState` zincirleme render tetikliyor.
                            onPress={() => { setListError(false); load(); }}
                        />
                    </View>
                ) : null}
                {failed ? (
                    <AuthBanner kind="error" style={{ marginTop: authMetrics.businessInfoTop }}>
                        Seçim kaydedilemedi. Bağlantınızı kontrol edip tekrar deneyin.
                    </AuthBanner>
                ) : null}
                <AuthBanner style={{ marginTop: authMetrics.businessInfoTop }}>
                    Listede yoksanız müdür sizi Personel sayfasından eklemeli.
                </AuthBanner>
            </ScrollView>
        </View>
    );
}
