/**
 * A0 · Özet — Ayarlar'ın açılışı.
 *
 * Bir durum listesi: her satır bir OLGU ve bölümüne bağlantı. Puan, yüzde,
 * ilerleme çubuğu YOK — kurulum ilerlemesi uygulamanın üstündeki şeritte
 * (`SetupBanner`, tek kaynak `setupProgress`) zaten sayılıyor; ikinci bir
 * sayaç bir gün onunla çelişirdi (panelde yaşandı, 2026-10-19).
 *
 * Durum renkle birlikte KELİMEYLE de yazılır. "Okunamadı" kesik çizgili gri
 * noktayla ve Yenile düğmesiyle çizilir; "yok" gibi amber DEĞİLDİR.
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { useBilling } from '@/hooks/useBilling';
import { useEntitlement } from '@/hooks/useEntitlement';
import { planById } from '@/lib/plans';
import { genitiveOf, sectionHref, sinceText, trDate, type SectionId } from '../ayarlarModel';
import { Head, I } from '../parcalar';

type Tone = 'ok' | 'warn' | 'bad' | 'unk' | 'load';

interface Line { title: string; tone: Tone; body: ReactNode; to: SectionId; retry?: () => void }

export function Ozet() {
    const navigate = useNavigate();
    const { settings, isSettingsLoading, settingsError } = useReservations();
    const { profile, loading: profileLoading, error: profileError } = useOrgProfile();
    const wa = useWhatsApp();
    const billing = useBilling();
    const ent = useEntitlement();
    // Sayfanın açıldığı an — render saf kalsın diye bir kez okunur.
    const [openedAt] = useState(() => Date.now());

    const lines: Line[] = [];

    // WhatsApp
    if (wa.loading) lines.push({ title: 'WhatsApp', tone: 'load', body: null, to: 'whatsapp' });
    else if (wa.setupError) lines.push({ title: 'WhatsApp', tone: 'unk', body: <><b>Okunamadı</b> · bağlantı durumu şu an alınamıyor</>, to: 'whatsapp', retry: () => void wa.refresh() });
    else if (wa.isBroken) lines.push({ title: 'WhatsApp', tone: 'bad', body: <><b>Bağlantı düştü</b> — hatırlatmalar gitmiyor</>, to: 'whatsapp' });
    else if (wa.isConnected) {
        const since = sinceText(wa.connection.connectedAt);
        lines.push({ title: 'WhatsApp', tone: 'ok', body: <><b>Bağlı</b>{since ? ` · ${since}` : ''}</>, to: 'whatsapp' });
    } else lines.push({ title: 'WhatsApp', tone: 'warn', body: <><b>Bağlı değil</b> — hatırlatmalar gitmiyor</>, to: 'whatsapp' });

    // Online randevu adresi
    const profileState: Tone | null = profileLoading ? 'load' : profileError ? 'unk' : null;
    if (profileState) {
        lines.push({ title: 'Online randevu adresi', tone: profileState, body: profileState === 'unk' ? <><b>Okunamadı</b> · işletme bilgileri şu an alınamıyor</> : null, to: 'online-randevu', retry: () => window.location.reload() });
    } else if (profile.slug) {
        lines.push({ title: 'Online randevu adresi', tone: 'ok', body: <span className="mono" style={{ fontSize: 14, color: 'var(--tx)' }}>/book/{profile.slug}</span>, to: 'online-randevu' });
    } else {
        lines.push({ title: 'Online randevu adresi', tone: 'warn', body: <><b>Adres yok</b> — müşteri kendi randevusunu alamıyor</>, to: 'online-randevu' });
    }

    // Hizmetler
    // Yüklenirken `settings` varsayılan hizmetleri taşıyor (fiyatsız 5 örnek) —
    // onları saymak "5'inin ücreti yok" diye uydurma bir satır çizerdi.
    if (isSettingsLoading) lines.push({ title: 'Hizmetler', tone: 'load', body: null, to: 'hizmetler' });
    else if (settingsError) lines.push({ title: 'Hizmetler', tone: 'unk', body: <><b>Okunamadı</b> · hizmet listesi şu an alınamıyor</>, to: 'hizmetler', retry: () => window.location.reload() });
    else {
        const named = settings.services.filter((s) => s.name.trim());
        const noPrice = named.filter((s) => !(s.price ?? 0)).length;
        if (named.length === 0) lines.push({ title: 'Hizmetler', tone: 'warn', body: <><b>Hizmet yok</b> — randevu alınamıyor</>, to: 'hizmetler' });
        else if (noPrice > 0) lines.push({ title: 'Hizmetler', tone: 'warn', body: <>{named.length} hizmet · <b>{genitiveOf(noPrice)} ücreti yok</b></>, to: 'hizmetler' });
        else lines.push({ title: 'Hizmetler', tone: 'ok', body: <>{named.length} hizmet · <b>hepsinin ücreti var</b></>, to: 'hizmetler' });
    }

    // Google değerlendirme linki + KVKK
    if (profileState) {
        lines.push({ title: 'Google değerlendirme linki', tone: profileState, body: profileState === 'unk' ? <><b>Okunamadı</b></> : null, to: 'whatsapp', retry: () => window.location.reload() });
        lines.push({ title: 'KVKK aydınlatma linki', tone: profileState, body: profileState === 'unk' ? <><b>Okunamadı</b></> : null, to: 'online-randevu', retry: () => window.location.reload() });
    } else {
        lines.push(profile.googleReviewUrl
            ? { title: 'Google değerlendirme linki', tone: 'ok', body: <><b>Tanımlı</b> · tahsilattan sonra değerlendirme daveti gider</>, to: 'whatsapp' }
            : { title: 'Google değerlendirme linki', tone: 'warn', body: <><b>Yok</b> — değerlendirme mesajı gitmiyor</>, to: 'whatsapp' });
        lines.push(profile.kvkkUrl
            ? { title: 'KVKK aydınlatma linki', tone: 'ok', body: <><b>Tanımlı</b> · randevu sayfasında onay kutusunun yanında</>, to: 'online-randevu' }
            : { title: 'KVKK aydınlatma linki', tone: 'warn', body: <><b>Yok</b> — randevu sayfasında bağlantı çıkmıyor (onay kutusu yine zorunlu)</>, to: 'online-randevu' });
    }

    // Abonelik
    const sub = billing.subscription;
    const plan = planById(sub?.plan) ?? planById(ent.plan);
    if (billing.loading) lines.push({ title: 'Abonelik', tone: 'load', body: null, to: 'abonelik' });
    else if (billing.error) lines.push({ title: 'Abonelik', tone: 'unk', body: <><b>Okunamadı</b> · plan bilgisi şu an alınamıyor</>, to: 'abonelik', retry: () => void billing.refresh() });
    else if (sub?.comp && sub.status === 'active') lines.push({ title: 'Abonelik', tone: 'ok', body: <><b>{plan?.name ?? 'Plan'} · Hediye</b> · {ent.shownUntil ?? sub.expires_at ? `bitiş ${trDate(ent.shownUntil ?? sub.expires_at)}` : 'süresiz'}</>, to: 'abonelik' });
    else if (ent.effective === 'trial') lines.push({ title: 'Abonelik', tone: 'ok', body: <><b>{plan?.name ?? 'Plan'} · Deneme</b> · deneme bitiyor {trDate(ent.shownUntil)}</>, to: 'abonelik' });
    else if (sub && sub.status === 'on_hold') lines.push({ title: 'Abonelik', tone: 'bad', body: <><b>{plan?.name ?? 'Plan'} · Ödeme bekleniyor</b></>, to: 'abonelik' });
    else if (sub && sub.status === 'active' && sub.cancel_at_period_end) lines.push({ title: 'Abonelik', tone: 'warn', body: <><b>{plan?.name ?? 'Plan'} · Dönem sonunda iptal</b> · erişim bitiyor {trDate(ent.shownUntil ?? sub.expires_at)}</>, to: 'abonelik' });
    else if (sub && sub.status === 'active') {
        // Dönem sonu geçmiş ama durum hâlâ "aktif": yenileme kaydı gelmemiş
        // (devir 10 · yenileme günü). Geçmiş tarih "sonraki tahsilat" diye yazılmaz.
        const end = ent.shownUntil ?? sub.expires_at;
        const past = end ? new Date(end).getTime() < openedAt : false;
        lines.push(past
            ? { title: 'Abonelik', tone: 'warn', body: <><b>{plan?.name ?? 'Plan'} · Aktif</b> · dönem sonu {trDate(end)} — bu tarih geçti</>, to: 'abonelik' }
            : { title: 'Abonelik', tone: 'ok', body: <><b>{plan?.name ?? 'Plan'} · Aktif</b> · sonraki tahsilat {trDate(end)}</>, to: 'abonelik' });
    }
    else lines.push({ title: 'Abonelik', tone: 'warn', body: <><b>Abonelik yok</b> — bir plan seçin</>, to: 'abonelik' });

    return (
        <div className="ay-col">
            <Head large title="Özet" lead="Ayarlarınızın bugünkü durumu. Bir satıra tıklayınca ilgili bölüm açılır." />
            <div role="list" className="ay-ozet">
                {lines.map((l) => l.tone === 'unk' ? (
                    <div role="listitem" key={l.title} className="ay-oz">
                        <span className="ay-dot unk" /><b>{l.title}</b><span>{l.body}</span>
                        <button type="button" className="ay-btn" style={{ height: 36, padding: '0 12px', fontSize: 14 }} onClick={l.retry}>
                            <I n="refresh" size={16} />Yenile
                        </button>
                    </div>
                ) : (
                    <a role="listitem" key={l.title} href={sectionHref(l.to)} className="ay-oz"
                        onClick={(e) => { e.preventDefault(); navigate(sectionHref(l.to)); }}>
                        {l.tone === 'load' ? <span className="ay-dot ay-skel" style={{ width: 10, height: 10 }} /> : <span className={`ay-dot ${l.tone}`} />}
                        <b>{l.title}</b>
                        {l.tone === 'load'
                            ? <span aria-label="Okunuyor"><span className="ay-skel" style={{ display: 'block', height: 14, maxWidth: 240 }} /></span>
                            : <span>{l.body}</span>}
                        <I n="chr" />
                    </a>
                ))}
            </div>
            <div className="ay-legend">
                <span><span className="ay-dot s8 ok" />Yolunda</span>
                <span><span className="ay-dot s8 warn" />Eksik — bir şey gitmiyor</span>
                <span><span className="ay-dot s8 bad" />Bozuk — bağlantı düştü</span>
                <span><span className="ay-dot s8 unk" />Okunamadı</span>
            </div>
        </div>
    );
}
