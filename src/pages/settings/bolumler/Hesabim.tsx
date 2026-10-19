/**
 * A9 · Hesabım (YENİ). Eskiden sol alttaki "Profil" Ayarlar'ın Genel
 * sekmesine gidiyordu; ad, e-posta, şifre, giriş yöntemleri, oturumu kapatma
 * ve hesap silme masaüstünde hiç yoktu.
 *
 * Giriş yöntemleri SALT OKUNUR rozet — bağla/kopar yok (giriş servisinde elle
 * bağlama kapalı). E-posta değiştirme yok. Şifre: şifresi olan değiştirir;
 * yalnız Apple/Google ile girmiş olan "şifre belirler" ve e-postasıyla da
 * girebilir. Görünüm iki seçenek ("Sistem" bugün yok), anında uygulanır.
 *
 * Tehlikeli bölge yalnız işletme SAHİBİNE düğme gösterir; sunucu da yalnız
 * sahibe izin veriyor (`account-delete` · forbidden_role).
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { passwordOk } from '@/pages/login/girisKurallari';
import { roleLabel } from '../ayarlarModel';
import { useTaslak } from '../useTaslak';
import { Head, I, SaveBar, Seg } from '../parcalar';
import { HesapSil } from './HesapSil';
import { useAuthFacts } from '../useAuthFacts';

export function Hesabim() {
    const navigate = useNavigate();
    const { user, orgRole, logout } = useAuth();
    const { dark, setDark } = useTheme();
    const { facts, reload } = useAuthFacts();
    const [pwOpen, setPwOpen] = useState(false);
    const [pw, setPw] = useState('');
    const [pwBusy, setPwBusy] = useState(false);
    const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [delOpen, setDelOpen] = useState(false);

    const t = useTaslak<{ name: string }>({
        saved: { name: user?.name ?? '' },
        sectionLabel: 'Hesabım',
        labels: { name: 'Ad soyad' },
        validate: (d) => (d.name.trim() ? null : 'Ad soyad boş olamaz.'),
        save: async (d) => {
            const { error } = await supabase.auth.updateUser({ data: { name: d.name.trim() } });
            if (error) { console.error('updateUser name', error); return false; }
            return true;
        },
    });

    const providers = new Set((facts?.identities ?? []).map((i) => i.provider));
    const hasPassword = facts?.hasPassword ?? false;
    const owner = orgRole === 'owner';

    const savePassword = async () => {
        if (!passwordOk(pw) || pwBusy) return;
        setPwBusy(true); setPwMsg(null);
        const { error } = await supabase.auth.updateUser({ password: pw, data: { password_set: true } });
        setPwBusy(false);
        if (error) {
            const code = (error as { code?: string }).code;
            setPwMsg({ ok: false, text: code === 'same_password' ? 'Yeni şifre eskisiyle aynı olamaz.'
                : code === 'weak_password' ? 'Bu şifre çok zayıf — daha uzun ve tahmini zor bir şifre deneyin.'
                    : code === 'reauthentication_needed' ? 'Güvenlik için yeniden giriş yapmanız gerekiyor; çıkış yapıp tekrar girin.'
                        : 'Şifre kaydedilemedi — tekrar deneyin.' });
            return;
        }
        setPw(''); setPwOpen(false);
        setPwMsg({ ok: true, text: hasPassword ? 'Şifreniz değiştirildi.' : 'Şifreniz kaydedildi — artık e-postanızla da girebilirsiniz.' });
        reload();
    };

    const passwordForm = (
        <>
            <input type="password" className="ay-input" style={{ fontSize: 18, letterSpacing: '.2em' }} value={pw} autoComplete="new-password"
                aria-label={hasPassword ? 'Yeni şifre' : 'Şifre'} placeholder="••••••" autoFocus={pwOpen}
                onChange={(e) => { setPw(e.target.value); setPwMsg(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') void savePassword(); }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: passwordOk(pw) ? 'var(--grt)' : 'var(--tx2)' }}>
                {passwordOk(pw)
                    ? <I n="check" size={18} />
                    : <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.6px solid var(--bd2)', flex: 'none' }} />}
                En az 8 karakter olsun, içinde bir rakam bulunsun
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="ay-btn-pri" disabled={!passwordOk(pw) || pwBusy} onClick={() => void savePassword()}>{pwBusy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}</button>
                {hasPassword && <button type="button" className="ay-btn-ghost" onClick={() => { setPwOpen(false); setPw(''); setPwMsg(null); }}>Vazgeç</button>}
            </div>
        </>
    );

    return (
        <>
            <div className="ay-col">
                <Head title="Hesabım" lead={<>Size ait bilgiler. İşletmenin bilgileri <a href="/settings/isletme" onClick={(e) => { e.preventDefault(); navigate('/settings/isletme'); }}>İşletme profili</a>'nde.</>} />

                <div className="ay-row tight">
                    {t.isChanged('name') && <span aria-hidden="true" className="ay-changed" />}
                    <div className="ay-row-l narrow"><label className="ay-lbl" htmlFor="ay-adsoyad">Ad soyad</label><span className="ay-help">Sol alttaki menüde görünür.</span></div>
                    <div className="ay-row-r" style={{ flexBasis: 340 }}>
                        <input id="ay-adsoyad" className="ay-input" value={t.draft.name} autoComplete="name" onChange={(e) => t.set({ name: e.target.value })} />
                    </div>
                </div>
                <div className="ay-row tight">
                    <div className="ay-row-l narrow"><span className="ay-lbl">E-posta</span><span className="ay-help">Salt okunur.</span></div>
                    <div className="ay-row-r" style={{ flexBasis: 340, justifyContent: 'center', fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{user?.email || '—'}</div>
                </div>
                <div className="ay-row tight">
                    <div className="ay-row-l narrow"><span className="ay-lbl">Rolünüz</span></div>
                    <div className="ay-row-r" style={{ flexBasis: 340, fontSize: 16, fontWeight: 600 }}>{roleLabel(orgRole) ?? 'Okunamadı'}</div>
                </div>

                <h2 className="ay-h2">Giriş</h2>
                <div className="ay-row tight">
                    <div className="ay-row-l narrow"><span className="ay-lbl">Giriş yöntemleri</span><span className="ay-help">Bu hesaba bağlı olanlar.</span></div>
                    <div className="ay-row-r horiz" style={{ flexBasis: 340, gap: 8 }}>
                        {!facts && <span className="ay-skel" style={{ width: 180, height: 34, borderRadius: 999 }} aria-label="Okunuyor" />}
                        {facts && hasPassword && <span className="ay-tag big"><I n="check" />E-posta ve şifre</span>}
                        {providers.has('google') && <span className="ay-tag big"><I n="check" />Google</span>}
                        {providers.has('apple') && <span className="ay-tag big"><I n="apple" style={{ width: 15, height: 17 }} />Apple</span>}
                    </div>
                </div>
                <div className="ay-row tight">
                    <div className="ay-row-l narrow"><span className="ay-lbl">Şifre</span></div>
                    <div className="ay-row-r" style={{ flexBasis: 340, gap: 10 }}>
                        {facts && hasPassword && !pwOpen && (
                            <button type="button" className="ay-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setPwOpen(true)}>Şifreyi değiştir</button>
                        )}
                        {facts && hasPassword && pwOpen && passwordForm}
                        {facts && !hasPassword && (<><span style={{ fontSize: 15.5, fontWeight: 700 }}>Şifre belirleyin — e-postanızla da girebilirsiniz.</span>{passwordForm}</>)}
                        {pwMsg && <span role="status" style={{ fontSize: 14, fontWeight: 700, color: pwMsg.ok ? 'var(--grt)' : 'var(--rdt)' }}>{pwMsg.text}</span>}
                    </div>
                </div>

                <h2 className="ay-h2" id="ay-gorunum">Görünüm</h2>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, padding: '20px 0', borderTop: '1px solid var(--bd)' }}>
                    <Seg wide label="Görünüm" value={dark ? 'dark' : 'light'} onChange={(v) => setDark(v === 'dark')}
                        options={[{ v: 'light', t: 'Açık' }, { v: 'dark', t: 'Koyu' }]} />
                    <span className="ay-help">Seçince anında uygulanır.</span>
                </div>
                <div style={{ padding: '20px 0', borderTop: '1px solid var(--bd)' }}>
                    <button type="button" className="ay-btn h44" onClick={async () => { await logout(); navigate('/login'); }}><I n="logout" />Oturumu kapat</button>
                </div>

                <section aria-label="Tehlikeli bölge" id="ay-tehlikeli" className="ay-danger">
                    <span className="ay-kicker">TEHLİKELİ BÖLGE</span>
                    {owner ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ fontSize: 16.5, fontWeight: 800 }}>Hesabı sil</span>
                                <span style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx2)' }}>Hesabınız ve (tek sahipseniz) işletmenizin tüm verileri kalıcı olarak silinir.</span>
                            </div>
                            <button type="button" className="ay-btn-danger" onClick={() => setDelOpen(true)}>Hesabı sil…</button>
                        </div>
                    ) : (
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx2)' }}>
                            {orgRole ? 'Hesap silme yalnız işletme sahibine açık.' : 'Rolünüz okunamadı — sayfayı yenileyin.'}
                        </span>
                    )}
                </section>
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} />
            {delOpen && <HesapSil facts={facts} onClose={() => setDelOpen(false)} onDone={() => toast.dismiss()} />}
        </>
    );
}
