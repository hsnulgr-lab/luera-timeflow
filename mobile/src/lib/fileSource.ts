/**
 * Personel 09b — müşteri DOSYASININ veri kaynağı.
 *
 * Şekil (`CustomerFile`) ve saf yardımcılar `customerFile.ts`'te kalıyor;
 * burası yalnız okuma ve sunucu cevabının o şekle indirgenmesi.
 *
 * ── Dört hâl, üç değil ──────────────────────────────────────────────────────
 *   loading  henüz bilmiyoruz
 *   missing  sunucu 404 dedi — kayıt gerçekten yok
 *   error    okuyamadık — "kayıt yok" DEĞİL
 *   ok       okuduk
 *
 * `missing` ile `error` bilerek ayrı: ekran "Müşteri bulunamadı · kayıt
 * silinmiş olabilir" diyor ve bunu bir ağ hatasında söylemek, duran bir kaydı
 * silinmiş gibi göstermek olurdu.
 *
 * ── Yoklama yok ─────────────────────────────────────────────────────────────
 * `bookSource` ile aynı gerekçe. Ama odağa her dönüşte OKUNUYOR ve bu kritik:
 * formül sayfasından dönen personel, az önce kaydettiği formülü geçmiş
 * satırında görmeli. Yoksa "Kaydet" yine hiçbir şey yapmamış gibi olur.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { LIVE_AUTH } from '../api/session';
import { api } from '../api/staff';
import { todayISO } from './calendar.ts';
import { demoCustomerFile, type CustomerFile } from './customerFile.ts';
// Saf eşleme yaprakta: burası React'e bağlı olduğu için testten çağrılamıyor,
// orası çağrılabiliyor (`freshness.ts` ile aynı gerekçe).
import {
    HISTORY_LIMIT, riskList, toCustomerFile,
    type RiskLine, type ServerFile,
} from './customerFileMap.ts';
export { noteMask, riskList, riskMask, toCustomerFile, HISTORY_LIMIT } from './customerFileMap.ts';

export type FileState = 'loading' | 'ok' | 'missing' | 'error';

export interface FileSnapshot {
    state: FileState;
    file: CustomerFile | null;
    /**
     * İşleyen risk kuralları, satır satır.
     *
     * Dosya sayfası bunları tek maskede topluyor, kumanda ayrı satırlar
     * hâlinde gösteriyor — ama İKİSİ DE buradan okuyor. Kumanda kendi
     * listesini müşterinin ADINA bakarak uyduruyordu; gerçek bir salonda
     * adaşı olan birine olmayan bir alerji yazardı.
     */
    risks: RiskLine[];
    /**
     * Bu müşteride DAHA ÖNCE kullanılmış kalemlerin adları.
     *
     * Kumandadaki `usedHere` işaretinin kaynağı: "bu boya bu kişide
     * kullanıldı mı" sorusunun cevabı salonun kataloğunda değil, o kişinin
     * geçmişinde. Sunucu `customer` ucunda `itemsUsed` olarak zaten
     * gönderiyor; bugüne kadar hiç okunmuyordu.
     */
    usedItems: Set<string>;
    reload: () => Promise<void>;
}

export function useCustomerFile(
    customerId: string | undefined,
    name: string | undefined,
): FileSnapshot & { capped: boolean } {
    const [state, setState] = useState<FileState>('loading');
    const [file, setFile] = useState<CustomerFile | null>(null);
    const [risks, setRisks] = useState<RiskLine[]>([]);
    const [usedItems, setUsedItems] = useState<Set<string>>(() => new Set());

    const read = useCallback((visible: boolean) => {
        const today = todayISO();
        /*
         * Sahte yol da SÖZ dönüyor, senkron değil. `await`siz bir dalda
         * `setState` çağırmak, derleyicinin "efektin içinde senkron setState"
         * kuralına takılıyor (react-hooks/set-state-in-effect) — ve haklı:
         * aynı fonksiyonun bir dalda senkron, ötekinde asenkron davranması
         * çağıranı iki ayrı zamanlama bilmeye zorlardı.
         */
        type Read = { file: CustomerFile | null; risks: RiskLine[]; used: Set<string> };
        const load: Promise<Read> = !LIVE_AUTH
            ? Promise.resolve((() => {
                const demo = demoCustomerFile({ id: customerId, name }, today);
                // Sahte katmanda kural listesi yok; maskeden TEK satır
                // türetiliyor ki kumanda sahte kipte de bir şey gösterebilsin.
                return {
                    file: demo,
                    risks: demo?.risk ? [{ kind: demo.risk.label, text: demo.risk.text }] : [],
                    // Sahte katmanda geçmiş kalem listesi yok.
                    used: new Set<string>(),
                };
            })())
            : customerId
                ? api.customer(customerId).then((raw) => {
                    const data = raw as ServerFile;
                    return {
                        file: toCustomerFile(data, today),
                        risks: riskList(data.riskRules ?? [], data.customer?.custom_fields),
                        used: new Set((data.history ?? []).flatMap((row) => (
                            Array.isArray(row.itemsUsed) ? row.itemsUsed.map(String) : []
                        ))),
                    };
                })
                : Promise.resolve({ file: null, risks: [], used: new Set<string>() });
        return load
            .then((next) => {
                setFile(next.file);
                setRisks(next.risks);
                setUsedItems(next.used);
                setState(next.file ? 'ok' : 'missing');
            })
            .catch((cause: unknown) => {
                // 404 KAYIT YOK demek; ötekiler OKUYAMADIK. İkisini aynı
                // ekrana düşürmek, duran bir kaydı silinmiş gibi gösterirdi.
                const status = (cause as { status?: number } | null)?.status;
                if (status === 404) { setFile(null); setRisks([]); setUsedItems(new Set()); setState('missing'); return; }
                if (visible) setState('error');
            });
    }, [customerId, name]);

    useEffect(() => { void read(true); }, [read]);

    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') void read(false);
        });
        return () => sub.remove();
    }, [read]);

    // Odağa dönüşte OKUNUYOR: formül sayfasından dönen personel kaydettiğini
    // geçmiş satırında görmeli.
    useFocusEffect(useCallback(() => { void read(false); }, [read]));

    const reload = useCallback(() => {
        setState('loading');
        return read(true);
    }, [read]);

    return { state, file, risks, usedItems, capped: (file?.history.length ?? 0) >= HISTORY_LIMIT, reload };
}
