import { useState } from 'react';
import { Users, Plus, Bell, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { useQueue } from '@/hooks/useQueue';
import { useReservations } from '@/hooks/useReservations';
import { sendTextMessage, buildQueueJoinMessage, buildQueueReadyMessage } from '@/services/evolutionApi';
import type { QueueEntry } from '@/types';

const LT = {
  ink: '#0E0E0E', orange: '#FF5A1F', surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
  border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)', muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
  green: '#2E8A35', red: '#C0392B', r: '14px', rSm: '10px',
};
const DT = {
  ink: '#F3EDE3', orange: '#FF5A1F', surface: '#111009', surface2: '#191610', surface3: '#231E18',
  border: 'rgba(243,237,227,0.08)', border2: 'rgba(243,237,227,0.20)', muted: 'rgba(243,237,227,0.45)', muted2: 'rgba(243,237,227,0.28)',
  green: '#7CC47F', red: '#E07070', r: '14px', rSm: '10px',
};

const waitMin = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export const QueuePage = () => {
  const { dark } = useTheme();
  const T = dark ? DT : LT;
  const { waiting, called, addEntry, callEntry, serveEntry, removeEntry } = useQueue();
  const { settings } = useReservations();
  const avg = settings.slotDuration || 20;
  const wa = settings.whatsappInstance;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState('');

  const add = async () => {
    if (!name.trim()) { toast.error('İsim gerekli'); return; }
    const pos = waiting.length + 1;
    const row = await addEntry({ customerName: name.trim(), customerPhone: phone.trim() || undefined, service: service.trim() || undefined });
    if (row) {
      if (wa && row.customerPhone) {
        const msg = buildQueueJoinMessage({ customerName: row.customerName, businessName: settings.businessName, position: pos, etaMin: (pos - 1) * avg });
        sendTextMessage(wa, row.customerPhone, msg).catch(() => toast.error('WhatsApp mesajı gönderilemedi'));
      }
      toast.success('Sıraya eklendi');
      setName(''); setPhone(''); setService('');
    }
  };

  const call = (e: QueueEntry) => {
    callEntry(e.id);
    if (wa && e.customerPhone) sendTextMessage(wa, e.customerPhone, buildQueueReadyMessage({ customerName: e.customerName, businessName: settings.businessName })).catch(() => toast.error('WhatsApp mesajı gönderilemedi'));
    toast.success('Çağrıldı');
  };

  const inp: React.CSSProperties = { background: T.surface2, border: `1px solid ${T.border2}`, borderRadius: T.rSm, padding: '9px 12px', fontSize: '13.5px', fontFamily: 'inherit', color: T.ink, outline: 'none' };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: T.surface, padding: '24px 28px 40px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 22 }}>
          <div style={{ width: 40, height: 40, background: 'rgba(255,90,31,0.12)', borderRadius: 10, display: 'grid', placeItems: 'center' }}><Users size={18} color={T.orange} /></div>
          <div>
            <div style={{ fontSize: '21px', fontWeight: 800, letterSpacing: '-0.03em', color: T.ink }}>Sıra</div>
            <div style={{ fontSize: '11.5px', color: T.muted, marginTop: 2 }}>{waiting.length} bekliyor{called.length ? ` · ${called.length} çağrıldı` : ''}</div>
          </div>
        </div>

        {/* Ekle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Müşteri adı" style={{ ...inp, flex: 2, minWidth: 140 }} />
          <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Telefon (opsiyonel)" inputMode="tel" style={{ ...inp, flex: 1.5, minWidth: 120 }} />
          <input value={service} onChange={e => setService(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Hizmet (opsiyonel)" style={{ ...inp, flex: 1.5, minWidth: 120 }} />
          <button onClick={add} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: T.rSm, background: T.orange, color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><Plus size={14} /> Sıraya Ekle</button>
        </div>

        {/* Çağrıldı */}
        {called.length > 0 && (
          <>
            <Label T={T}>Çağrıldı</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {called.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,90,31,0.06)', border: '1px solid rgba(255,90,31,0.25)', borderRadius: T.r }}>
                  <Bell size={18} color={T.orange} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: T.ink }}>{e.customerName}</div>
                    <div style={{ fontSize: '11.5px', color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>{e.service || 'Hizmet yok'}{e.calledAt ? ` · ${waitMin(e.calledAt)} dk önce çağrıldı` : ''}</div>
                  </div>
                  <button onClick={() => { serveEntry(e.id); toast.success('Tamamlandı'); }} style={btn(T, 'green')}><Check size={13} /> Geldi</button>
                  <button onClick={() => removeEntry(e.id)} style={btn(T, 'red')}><X size={14} /></button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Bekliyor */}
        <Label T={T}>Bekliyor</Label>
        {waiting.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: T.muted, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '13.5px' }}>Sıra boş. Gelen müşteriyi yukarıdan ekleyin.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {waiting.map((e, i) => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: i === 0 ? T.orange : T.surface3, color: i === 0 ? '#fff' : T.muted, display: 'grid', placeItems: 'center', fontSize: '14px', fontWeight: 900, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: T.ink }}>{e.customerName}</div>
                  <div style={{ fontSize: '11.5px', color: T.muted, fontFamily: "'JetBrains Mono',monospace" }}>{e.service ? `${e.service} · ` : ''}{waitMin(e.joinedAt)} dk bekliyor · tahmini ~{i * avg} dk</div>
                </div>
                <button onClick={() => call(e)} style={btn(T, 'orange')}><Bell size={13} /> Çağır</button>
                <button onClick={() => removeEntry(e.id)} style={btn(T, 'red')}><X size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function Label({ children, T }: { children: React.ReactNode; T: any }) {
  return <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: T.muted, marginBottom: '12px' }}>{children}</div>;
}
function btn(T: any, kind: 'orange' | 'green' | 'red'): React.CSSProperties {
  const map = {
    orange: { bg: T.orange, fg: '#fff', bd: 'none' },
    green: { bg: 'transparent', fg: T.green, bd: `1px solid ${T.border2}` },
    red: { bg: 'transparent', fg: T.red, bd: `1px solid ${T.border2}` },
  }[kind];
  return { display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: T.rSm, background: map.bg, color: map.fg, border: map.bd, fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 };
}
