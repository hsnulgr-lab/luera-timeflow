/**
 * A1 · İşletme profili — müşterinin gördüğü işletme bilgileri.
 *
 * Bugüne kadar "İşletme bilgileri" iki sekmeye bölünmüştü: ad Genel'de;
 * adres, telefon, Instagram, harita ve hakkında Booking'de; logo da
 * Booking'de. Hepsi burada birleşti ve her alanın yanında NEREDE göründüğü
 * yazar.
 *
 * Kayıt iki tabloya gider: ad `settings`'e (updateSettings), kalanı
 * `organizations`'a (savePartial · yalnız değişenler). Sektör ayrı bir akış:
 * onay penceresinden geçer ve anında yazılır.
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { SECTOR_PROFILES, profileForSector } from '@/lib/sectorProfiles';
import { instagramHandle, instagramUrl } from '../ayarlarModel';
import { useTaslak } from '../useTaslak';
import { Head, I, Modal, Pic, RowLabel, SaveBar } from '../parcalar';

interface Draft {
    name: string;
    logo: string;
    address: string;
    phone: string;
    instagram: string;
    maps: string;
    bio: string;
}

export function Isletme() {
    const { settings, updateSettings } = useReservations();
    const { profile, savePartial, uploadImage } = useOrgProfile();
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const [sectorOpen, setSectorOpen] = useState(false);

    const saved: Draft = {
        name: settings.businessName || '',
        logo: profile.logoUrl,
        address: profile.address,
        phone: profile.publicPhone,
        instagram: instagramHandle(profile.instagramUrl),
        maps: profile.mapsUrl,
        bio: profile.bio,
    };

    const t = useTaslak<Draft>({
        saved,
        sectionLabel: 'İşletme profili',
        labels: { name: 'İşletme adı', logo: 'Logo', address: 'Adres', phone: 'Telefon', instagram: 'Instagram', maps: 'Harita linki', bio: 'Hakkında' },
        validate: (d) => (d.name.trim() ? null : 'İşletme adı boş olamaz.'),
        save: async (d, s) => {
            if (d.name !== s.name) {
                const ok = await updateSettings({ ...settings, businessName: d.name.trim() });
                if (!ok) return false;
            }
            const patch: Parameters<typeof savePartial>[0] = {};
            if (d.logo !== s.logo) patch.logoUrl = d.logo;
            if (d.address !== s.address) patch.address = d.address;
            if (d.phone !== s.phone) patch.publicPhone = d.phone;
            if (d.instagram !== s.instagram) patch.instagramUrl = instagramUrl(d.instagram);
            if (d.maps !== s.maps) patch.mapsUrl = d.maps.trim();
            if (d.bio !== s.bio) patch.bio = d.bio;
            if (Object.keys(patch).length === 0) return true;
            return savePartial(patch, { quiet: true });
        },
    });
    const d = t.draft;
    const bar = (k: keyof Draft) => t.isChanged(k) && <span aria-hidden="true" className="ay-changed" />;

    const pickLogo = async (file: File | undefined) => {
        if (!file) return;
        setUploading(true);
        const url = await uploadImage(file, 'logo');
        setUploading(false);
        if (url) t.set({ logo: url });
    };

    return (
        <>
            <div className="ay-col">
                <Head title="İşletme profili" lead="Müşterinin gördüğü işletme bilgileri. Her alanın yanında nerede göründüğü yazar." />

                <div className="ay-row">
                    {bar('name')}
                    <RowLabel htmlFor="ay-ad" label="İşletme adı" help="Müşterilere giden WhatsApp mesajlarında ve randevu sayfasında görünür." tags={["WhatsApp'ta", 'Randevu sayfasında']} />
                    <div className="ay-row-r">
                        <input id="ay-ad" className="ay-input" value={d.name} aria-invalid={!d.name.trim() || undefined}
                            onChange={(e) => t.set({ name: e.target.value })} placeholder="İşletmenizin adı" />
                        {t.isChanged('name') && saved.name && <span className="ay-help sm">Kayıtlı: {saved.name}</span>}
                    </div>
                </div>

                <div className="ay-row" id="ay-logo">
                    {bar('logo')}
                    <RowLabel label="Logo" help="Kare görsel, en az 400 × 400 px önerilir." tags={['Randevu sayfasında']} />
                    <div className="ay-row-r horiz">
                        <Pic url={d.logo} style={{ width: 76, height: 76, flex: 'none', borderRadius: 16, border: '1px solid var(--bd2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {!d.logo && <span className="mono" style={{ fontSize: 11, color: 'var(--tx2)' }}>logo</span>}
                        </Pic>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" className="ay-btn" disabled={uploading} onClick={() => fileRef.current?.click()}>
                                <I n="up" />{uploading ? 'Yükleniyor…' : d.logo ? 'Değiştir' : 'Yükle'}
                            </button>
                            {d.logo && <button type="button" className="ay-btn-ghost" onClick={() => t.set({ logo: '' })}>Kaldır</button>}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickLogo(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                    </div>
                </div>

                <h2 className="ay-h2">Konum ve iletişim</h2>

                <div className="ay-row">
                    {bar('address')}
                    <RowLabel htmlFor="ay-adres" label="Adres" tags={['Randevu sayfasında']} />
                    <div className="ay-row-r">
                        <textarea id="ay-adres" className="ay-input addr" rows={2} value={d.address} placeholder="Mahalle, cadde, no · ilçe / il"
                            onChange={(e) => t.set({ address: e.target.value })} />
                    </div>
                </div>

                <div className="ay-row">
                    {bar('phone')}
                    <RowLabel htmlFor="ay-tel" label="Telefon" tags={['Randevu sayfasında']} />
                    <div className="ay-row-r">
                        <input id="ay-tel" className="ay-input" type="tel" inputMode="tel" value={d.phone} placeholder="0212 xxx xx xx"
                            onChange={(e) => t.set({ phone: e.target.value })} />
                    </div>
                </div>

                <div className="ay-row">
                    {bar('instagram')}
                    <RowLabel htmlFor="ay-ig" label="Instagram" tags={['Randevu sayfasında']} />
                    <div className="ay-row-r">
                        <div className="ay-affix">
                            <span className="pre">@</span>
                            <input id="ay-ig" value={d.instagram} placeholder="kullaniciadi" autoComplete="off"
                                onChange={(e) => t.set({ instagram: e.target.value.replace(/^@/, '') })} />
                        </div>
                    </div>
                </div>

                <div className="ay-row">
                    {bar('maps')}
                    <RowLabel htmlFor="ay-harita" label="Harita linki" help="Hatırlatma mesajındaki 📍 bu linke gider." tags={["WhatsApp'ta"]} />
                    <div className="ay-row-r">
                        <input id="ay-harita" className="ay-input mono" value={d.maps} placeholder="Google Maps linki"
                            onChange={(e) => t.set({ maps: e.target.value })} />
                    </div>
                </div>

                <div className="ay-row">
                    {bar('bio')}
                    <RowLabel htmlFor="ay-hakkinda" label="Hakkında" help="Randevu sayfasında işletme adının altında." tags={['Randevu sayfasında']} />
                    <div className="ay-row-r">
                        <textarea id="ay-hakkinda" className="ay-input" rows={3} value={d.bio} placeholder="İşletmenizi kısaca tanıtın…"
                            onChange={(e) => t.set({ bio: e.target.value })} />
                    </div>
                </div>

                <div id="ay-sektor" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 44, paddingTop: 28, borderTop: '1px solid var(--bd2)' }}>
                    <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.015em' }}>Sektör</h2>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 18, fontWeight: 800 }}>{profileForSector(settings.sector).label}</span>
                        <button type="button" className="ay-btn" onClick={() => setSectorOpen(true)}>Sektörü değiştir…</button>
                    </div>
                    <p style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx2)', maxWidth: 600, textWrap: 'pretty' }}>
                        Sektör; müşteri kartındaki alanları, kaynak adlarını, uygunluk kurallarını ve mesaj dilini belirler.
                        Dolu bir işletmede değiştirmek önerilmez: kayıtlar silinmez ama yeni sektörün ekranlarında yanlış görünebilir.
                    </p>
                </div>
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} />
            {sectorOpen && <SektorPenceresi onClose={() => setSectorOpen(false)} />}
        </>
    );
}

function SektorPenceresi({ onClose }: { onClose: () => void }) {
    const { settings, updateSettings } = useReservations();
    const current = settings.sector || 'genel';
    const firstOther = Object.keys(SECTOR_PROFILES).find((k) => k !== current) ?? current;
    const [next, setNext] = useState(firstOther);
    const [busy, setBusy] = useState(false);

    const apply = async () => {
        if (next === current) { onClose(); return; }
        setBusy(true);
        const ok = await updateSettings({ ...settings, sector: next });
        setBusy(false);
        if (!ok) return;
        onClose();
        toast('Sektör güncellendi', {
            description: `Modülleri ${profileForSector(next).label} önerisine almak için Modüller'de “Sektör önerisini uygula”yı kullanın.`,
            duration: 7000,
        });
    };

    return (
        <Modal labelledBy="ay-sek" onClose={() => { if (!busy) onClose(); }}>
            <div className="ay-modal-h">
                <h2 id="ay-sek">Sektörü değiştir</h2>
                <button type="button" className="ay-icon-btn" aria-label="Kapat" onClick={onClose} disabled={busy}><I n="x" size={20} /></button>
            </div>
            <div className="ay-modal-b">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ay-lbl sm" htmlFor="ay-yeni-sektor">Yeni sektör</label>
                    <select id="ay-yeni-sektor" className="ay-select" value={next} onChange={(e) => setNext(e.target.value)}>
                        {Object.entries(SECTOR_PROFILES).map(([key, p]) => (
                            <option key={key} value={key}>{p.label}</option>
                        ))}
                    </select>
                    <span className="ay-help sm">Şu an: {profileForSector(current).label}</span>
                </div>
                <div className="ay-box warn top" style={{ padding: '14px 16px', fontWeight: 400, lineHeight: 1.5 }}>
                    <I n="alert" style={{ marginTop: 2 }} />
                    <span><b>Kayıtlarınız silinmez</b>, ama yeni sektörün ekranlarında yanlış görünebilir. Dolu bir işletmede önerilmez.</span>
                </div>
                <p style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx2)', textWrap: 'pretty' }}>
                    Modüller kendiliğinden değişmez. Değiştirdikten sonra Modüller'de “Sektör önerisini uygula” ile güncelleyebilirsiniz.
                </p>
            </div>
            <div className="ay-modal-f">
                <button type="button" className="ay-btn" onClick={onClose} disabled={busy}>Vazgeç</button>
                <button type="button" className="ay-btn-inv" onClick={() => void apply()} disabled={busy || next === current}>
                    {busy ? 'Değiştiriliyor…' : 'Sektörü değiştir'}
                </button>
            </div>
        </Modal>
    );
}
