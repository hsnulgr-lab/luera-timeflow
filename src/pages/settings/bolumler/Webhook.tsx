/**
 * A13 · Webhook (Gelişmiş).
 *
 * Eski metin "oluşturulduğunda, güncellendiğinde veya iptal edildiğinde"
 * diyordu ve örnek veri gerçeğinden farklıydı. Gerçek: istek YALNIZ
 * `public-booking` (online randevu sayfası) ve `whatsapp-booking` (bot) yeni
 * randevu yazınca gidiyor; olay hep `reservation.created`. Panelden girilen
 * randevular, değişiklikler ve iptaller gönderilmez. Aşağıdaki biçim
 * `public-booking/index.ts`'teki gövdenin aynısı.
 *
 * "Test gönder" çizilmez — sunucuda karşılığı yok.
 */
import { useReservations } from '@/hooks/useReservations';
import { useTaslak } from '../useTaslak';
import { SaveBar } from '../parcalar';

const PAYLOAD = `{
  "event": "reservation.created",
  "source": "timeflow",
  "timestamp": "2026-10-20T07:12:00.000Z",
  "data": {
    "id": "…", "customer_name": "Ayşe Demir", "customer_phone": "+90…",
    "customer_email": null, "date": "2026-10-21",
    "start_time": "10:00", "end_time": "10:30",
    "service": "Cilt bakımı", "status": "confirmed",
    "notes": "", "source": "booking"
  }
}`;

export function Webhook() {
    const { settings, updateSettings } = useReservations();
    const t = useTaslak<{ url: string }>({
        saved: { url: settings.webhookUrl || '' },
        sectionLabel: 'Webhook',
        labels: { url: 'Webhook adresi' },
        validate: (d) => (d.url.trim() && !/^https?:\/\/\S+$/i.test(d.url.trim()) ? 'Adres http:// ya da https:// ile başlamalı.' : null),
        save: (d) => updateSettings({ ...settings, webhookUrl: d.url.trim() || undefined }),
    });

    return (
        <>
            <div className="ay-col">
                <div className="ay-head" style={{ gap: 10 }}>
                    <span className="ay-kicker" style={{ alignSelf: 'flex-start' }}>GELİŞMİŞ</span>
                    <h1 className="ay-h1">Webhook</h1>
                    <p className="ay-lead" style={{ lineHeight: 1.55 }}>
                        Müşteri <b>online randevu sayfasından</b> ya da <b>WhatsApp botundan</b> yeni randevu aldığında bu adrese
                        bildirim gönderilir. Panelden girilen randevular, değişiklikler ve iptaller gönderilmez.
                    </p>
                </div>
                <div className="ay-stack" style={{ position: 'relative' }}>
                    {t.isChanged('url') && <span aria-hidden="true" className="ay-changed" />}
                    <label className="ay-lbl" htmlFor="ay-webhook">Webhook adresi</label>
                    <input id="ay-webhook" className="ay-input mono" type="url" value={t.draft.url} placeholder="https://…"
                        aria-invalid={t.state === 'invalid' || undefined} onChange={(e) => t.set({ url: e.target.value })} />
                    <span className="ay-help">Boş bırakırsanız hiçbir şey gönderilmez.</span>
                </div>
                <div className="ay-stack" style={{ gap: 10 }}>
                    <span className="ay-lbl">Gönderilen veri</span>
                    <pre className="ay-code">{PAYLOAD}</pre>
                </div>
            </div>
            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} />
        </>
    );
}
