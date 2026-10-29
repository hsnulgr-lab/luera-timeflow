/**
 * H2–H6 · Hesabı sil — telefondaki gerçek silme akışının masaüstü kardeşi
 * (Mudur 27 · "Hesap · ve gerçek silme akışı"). AYNI kelimeler, AYNI kurallar:
 *
 *   • "SİL" yazdırmak YOK; 30 gün "bekleyen silme" YOK — silme basılı tutma
 *     bittiği anda başlar, geri alınamaz.
 *   • Yedek cümlesi bir SAKLAMA süresidir, vazgeçme penceresi değil
 *     (`scripts/vps-backup.sh` · KEEP_DAYS=30).
 *   • Sayılar sunucudan gelir; gelene kadar iskelet çizilir.
 *   • İşletmenin başka sahibi varsa onay kutusu çizilmez, liste iki satır.
 *   • Hesapta Apple girişi varsa son adımdan önce Apple ile doğrulanır (B
 *     yolu): dönen kod sunucuda belgeye çevrilip Apple'da iptal edilir.
 *     Apple'a ulaşılamıyorsa silme yine yapılabilir.
 *
 * Onay kutusu pencerenin SABİT alt kısmında, basılı tutma düğmesinin üstünde
 * (v1.1): 900 px yükseklikte kaydırma alanında kalıp görünmüyordu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useReservations } from '@/hooks/useReservations';
import { useOrgProfile } from '@/hooks/useOrgProfile';
import { clearAllCache } from '@/lib/swrCache';
import { showLoginNotice } from '@/lib/loginNotice';
import { supabase } from '@/lib/supabase';
import { appleReauth, appleSubOf, prepareApple } from '@/pages/login/sosyalGiris';
import { holdCaption, nameGenitive, nameLocative } from '../ayarlarModel';
import { deleteAccount, fetchDeletionFacts, type AppleProof, type DeletionFacts, type DeleteFailure } from '../hesapSilApi';
import { Dots, I, Modal } from '../parcalar';
import type { AuthFacts } from '../useAuthFacts';

const HOLD_MS = 2000;

type AppleStep =
    | { s: 'idle' } | { s: 'busy' } | { s: 'ok'; proof: AppleProof }
    | { s: 'mismatch' } | { s: 'unreachable' } | { s: 'failed' };

export function HesapSil({ facts, onClose, onDone }: { facts: AuthFacts | null; onClose: () => void; onDone: () => void }) {
    const navigate = useNavigate();
    const { user, orgId } = useAuth();
    const { settings } = useReservations();
    const { profile } = useOrgProfile();

    const [info, setInfo] = useState<DeletionFacts | null>(null);
    const [infoErr, setInfoErr] = useState(false);
    const [tries, setTries] = useState(0);
    const userId = user?.id;
    useEffect(() => {
        if (!orgId || !userId) return;
        let alive = true;
        fetchDeletionFacts(orgId, userId)
            .then((f) => { if (alive) { setInfo(f); setInfoErr(false); } })
            .catch((e) => { console.error('silme sayıları', e); if (alive) setInfoErr(true); });
        return () => { alive = false; };
    }, [orgId, userId, tries]);
    const load = () => { setInfoErr(false); setTries((n) => n + 1); };

    const [checked, setChecked] = useState(false);
    const needsApple = Boolean(facts?.appleSub);
    const [apple, setApple] = useState<AppleStep>({ s: 'idle' });
    const [phase, setPhase] = useState<'ready' | 'deleting' | 'done'>('ready');
    const [failure, setFailure] = useState<DeleteFailure | null>(null);
    const [online, setOnline] = useState(() => navigator.onLine !== false);
    useEffect(() => {
        const on = () => setOnline(true); const off = () => setOnline(false);
        window.addEventListener('online', on); window.addEventListener('offline', off);
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    }, []);

    const sole = info?.soleOwner ?? false;
    const appleOk = !needsApple || apple.s === 'ok' || apple.s === 'unreachable';
    const ready = Boolean(info) && (!sole || checked) && appleOk && online && phase === 'ready' && failure !== 'unknown';

    // ── Apple ile doğrula ── (önceden hazırlanır: iPhone Safari pencereyi ancak dokunuşun içinde açar)
    useEffect(() => {
        if (needsApple) void prepareApple().catch(() => undefined);
    }, [needsApple]);
    const verifyApple = async () => {
        setApple({ s: 'busy' });
        const r = await appleReauth();
        if (!r.ok) {
            setApple(r.reason === 'cancelled' ? { s: 'idle' } : r.reason === 'unreachable' ? { s: 'unreachable' } : { s: 'failed' });
            return;
        }
        const sub = appleSubOf(r.idToken);
        if (sub && facts?.appleSub && sub !== facts.appleSub) { setApple({ s: 'mismatch' }); return; }
        setApple({ s: 'ok', proof: { code: r.code, redirectUri: r.redirectUri } });
    };

    // ── Silme ──
    const run = useCallback(async () => {
        setPhase('deleting'); setFailure(null);
        const res = await deleteAccount(orgId, apple.s === 'ok' ? apple.proof : null);
        if (res.ok) {
            setPhase('done');
            await supabase.auth.signOut().catch(() => undefined);
            clearAllCache();
            onDone();
            navigate('/login', { replace: true });
            window.setTimeout(() => showLoginNotice('Hesabınız silindi.'), 300);
            return;
        }
        setPhase('ready');
        setFailure(res.reason);
        // Apple kodu tek kullanımlık — yeniden doğrulama gerekir.
        if (res.reason === 'apple_mismatch') setApple({ s: 'mismatch' });
        else if (res.reason === 'apple_code_invalid') setApple({ s: 'idle' });
    }, [orgId, apple, navigate, onDone]);

    // ── Basılı tut ──
    const [hold, setHold] = useState(0);
    const holding = useRef(false);
    const raf = useRef(0);
    const t0 = useRef(0);
    useEffect(() => () => cancelAnimationFrame(raf.current), []);
    const start = () => {
        if (!ready || holding.current) return;
        holding.current = true;
        t0.current = performance.now();
        const tick = () => {
            const p = Math.min(1, (performance.now() - t0.current) / HOLD_MS);
            setHold(p);
            if (p < 1 && holding.current) raf.current = requestAnimationFrame(tick);
            else if (p >= 1) { holding.current = false; void run(); }
        };
        raf.current = requestAnimationFrame(tick);
    };
    const end = () => {
        if (!holding.current) return;
        holding.current = false;
        cancelAnimationFrame(raf.current);
        const p0 = hold; const b0 = performance.now();
        const back = () => { const k = Math.min(1, (performance.now() - b0) / 200); setHold(p0 * (1 - k)); if (k < 1) raf.current = requestAnimationFrame(back); };
        raf.current = requestAnimationFrame(back);
    };

    // Ad yoksa cins isim ("İşletmenizin") — kesme işaretli ek yalnız özel ada.
    const bizName = settings.businessName?.trim() || '';
    const biz = bizName || 'İşletmeniz';
    const bizGen = bizName ? nameGenitive(bizName) : 'İşletmenizin';
    const bizLoc = bizName ? `${nameLocative(bizName)}ki` : 'Bu işletmedeki';
    const place = (profile.address || '').split('\n').map((s) => s.trim()).filter(Boolean).pop()?.split('/')[0]?.trim();
    const busy = phase !== 'ready';

    return (
        <Modal labelledBy="ay-del" onClose={() => { if (!busy) onClose(); }} closable={!busy}>
            <div className="ay-modal-h" style={{ paddingBottom: 4 }}>
                <h2 id="ay-del">Hesabı sil</h2>
                {!busy && <button type="button" className="ay-icon-btn" aria-label="Kapat" onClick={onClose}><I n="x" size={20} /></button>}
            </div>
            <div className="ay-modal-b" style={{ paddingTop: 10 }}>
                <span style={{ fontSize: 17, fontWeight: 800 }}>Bu işlem geri alınamaz.</span>
                {info && (sole
                    ? <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)', marginTop: -8 }}>{bizGen} <b style={{ color: 'var(--tx)' }}>tek sahibi</b> sizsiniz. İşletmeniz sizinle birlikte silinir.</p>
                    : <p style={{ fontSize: 15.5, lineHeight: 1.5, color: 'var(--tx2)', marginTop: -8 }}>İşletme, randevular ve müşteriler yerinde kalır; yalnız kişisel hesabınız silinir.</p>)}

                {!info && !infoErr && (
                    <div role="status" aria-label="Silinecekler sayılıyor" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '6px 0' }}>
                        {[60, 80, 70].map((w) => (
                            <div key={w} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                <span className="ay-skel" style={{ width: 8, height: 8, borderRadius: '50%' }} />
                                <span className="ay-skel" style={{ flex: 1, height: 14, maxWidth: `${w}%` }} />
                            </div>
                        ))}
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>Silinecekler sayılıyor…</span>
                    </div>
                )}
                {infoErr && (
                    <div role="status" className="ay-box plain" style={{ justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="ay-dot unk" />Silinecekler sayılamadı — yenileyin.</span>
                        <button type="button" className="ay-btn" style={{ height: 38, fontSize: 14 }} onClick={load}><I n="refresh" size={16} />Yenile</button>
                    </div>
                )}

                {info && (
                    <div className="ay-del-list">
                        <div><span className="ay-dot s8 bad" /><span><b>Hesabınız</b><small>{[user?.name, user?.email].filter(Boolean).join(' · ')}</small></span></div>
                        {sole ? (
                            <>
                                <div><span className="ay-dot s8 bad" /><span><b>{biz}{place ? ` · ${place}` : ''}</b><small>{info.appointments} randevu · {info.customers} müşteri · {info.services} hizmet · çalışma saatleri</small></span></div>
                                {info.staff > 0 && <div><span className="ay-dot s8 bad" /><span><b>{info.staff} personelin bu işletmeye erişimi</b><small>Personelin kendi hesapları durur, yalnız bu işletmeden düşer.</small></span></div>}
                                <div><span className="ay-dot s8 bad" /><span><b>Aboneliğiniz hemen iptal edilir</b><small>Bundan sonra ücret alınmaz.</small></span></div>
                                <div><span className="ay-dot s8 ok" /><span><b>Silinmeyen</b><small>Mevzuat gereği saklanan ödeme belgeleri kalır; pazarlama için kullanılmaz.</small></span></div>
                            </>
                        ) : (
                            <div><span className="ay-dot s8 bad" /><span><b>{bizLoc} sahipliğiniz</b><small>İşletmenin diğer sahibi yönetmeye devam eder.</small></span></div>
                        )}
                    </div>
                )}

                <div className="ay-box warn" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4, fontWeight: 400, fontSize: 14.5, lineHeight: 1.5 }}>
                    <span>Silme onayın bittiği anda başlar ve geri alınamaz; oturumunuz kapanır.</span>
                    <span>Yedeklerde kalan kopyalar <b>30 gün içinde</b> yedek döngüsünden çıkar ve geri getirilemez.</span>
                </div>
                <span style={{ fontSize: 14.5, color: 'var(--tx2)' }}>Silmeden önce verilerinizi indirmek isterseniz: <a href="/settings/verileriniz" style={{ fontWeight: 700 }} onClick={(e) => { e.preventDefault(); if (!busy) { onClose(); navigate('/settings/verileriniz'); } }}>Verileriniz →</a></span>

                {needsApple && info && (
                    <AppleAdimi step={apple} onVerify={() => void verifyApple()} />
                )}
            </div>

            <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 28px 22px', borderTop: '1px solid var(--bd)' }}>
                {phase === 'deleting' || phase === 'done' ? (
                    <>
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--rd)' }} />
                        <div role="status" className="ay-hold" style={{ background: 'transparent' }}>Siliniyor<Dots /></div>
                        <span style={{ fontSize: 13.5, color: 'var(--tx2)', textAlign: 'center' }}>Pencere kapatılamaz; sayfadan ayrılırsanız silme yine sürer.</span>
                    </>
                ) : failure === 'unknown' ? (
                    <>
                        <div role="status" className="ay-box warn top"><I n="alert" style={{ marginTop: 1 }} />Sonucu doğrulayamadık. Giriş yapmayı deneyin — giriş yapamıyorsanız silme tamamlanmıştır.</div>
                        <button type="button" className="ay-btn h46" style={{ height: 50, fontSize: 16, fontWeight: 800 }} onClick={async () => {
                            await supabase.auth.signOut().catch(() => undefined); clearAllCache(); navigate('/login', { replace: true });
                        }}>Giriş sayfasına git</button>
                    </>
                ) : (
                    <>
                        {failure && <FailureBox reason={failure} />}
                        {!online && <div role="status" className="ay-box plain">İnternet yok — bağlanınca silebilirsiniz.</div>}
                        {info && sole && (
                            <button type="button" role="checkbox" aria-checked={checked} className="ay-check big" style={{ alignItems: 'flex-start', gap: 12, padding: '2px 0 6px', textAlign: 'left' }}
                                onClick={() => setChecked((v) => !v)}>
                                <span className="box">{checked && <I n="check" />}</span>
                                <span style={{ fontSize: 15.5, fontWeight: 700, lineHeight: 1.45 }}>İşletmenin tüm verilerinin silineceğini anlıyorum.</span>
                            </button>
                        )}
                        <div aria-hidden="true" className="ay-hold-track"><i style={{ transform: `scaleX(${hold})` }} /></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, fontWeight: 600, color: 'var(--tx2)', flexWrap: 'wrap' }}>
                            <span role="status" aria-live="polite" style={{ fontWeight: 700, color: 'var(--tx)' }}>{holdCaption(hold, false)}</span>
                            <span>Klavyede: Enter ya da Boşluk'u basılı tutun</span>
                        </div>
                        <button type="button" className="ay-hold" aria-disabled={!ready || undefined}
                            onPointerDown={(e) => { if (e.button === 0) start(); }} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
                            onKeyDown={(e) => { if (e.key !== 'Enter' && e.key !== ' ') return; e.preventDefault(); if (!e.repeat) start(); }}
                            onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') end(); }} onBlur={end}>
                            <I n="trash" />Silmek için basılı tutun
                        </button>
                        {info && sole && !checked && <span role="status" style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', marginTop: -2 }}>Önce kutuyu işaretleyin.</span>}
                        {info && needsApple && !appleOk && (sole ? checked : true) && <span role="status" style={{ fontSize: 14, fontWeight: 700, textAlign: 'center', marginTop: -2 }}>Doğrulanınca basılı tutma açılır.</span>}
                        <button type="button" className="ay-btn-ghost" style={{ height: 46, justifyContent: 'center', fontSize: 15.5, color: 'var(--tx)' }} onClick={onClose}>Vazgeç</button>
                    </>
                )}
            </div>
        </Modal>
    );
}

function AppleAdimi({ step, onVerify }: { step: AppleStep; onVerify: () => void }) {
    if (step.s === 'ok') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderRadius: 14, border: '1px solid var(--bd2)', fontSize: 15.5, fontWeight: 800 }}>
                <I n="check" size={20} style={{ color: 'var(--grt)' }} />Apple ile doğrulandı<span style={{ fontWeight: 500, fontSize: 14, color: 'var(--tx2)' }}>· basılı tutma açıldı</span>
            </div>
        );
    }
    if (step.s === 'unreachable') {
        return (
            <div className="ay-box warn top" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, padding: 16, borderRadius: 14 }}>
                <span style={{ display: 'flex', gap: 8, fontWeight: 800 }}><I n="alert" />Apple'a şu an ulaşılamıyor.</span>
                <span style={{ fontSize: 14.5, lineHeight: 1.5, fontWeight: 400 }}>Silme yine yapılabilir. Apple bağlantısını <b>Ayarlar → Apple Kimliği → Apple ile Giriş</b>'ten siz de kaldırabilirsiniz.</span>
            </div>
        );
    }
    const mismatch = step.s === 'mismatch';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 14, border: `1px solid ${mismatch ? 'var(--rdbd)' : 'var(--bd2)'}` }}>
            {mismatch ? (
                <span role="alert" style={{ display: 'flex', gap: 8, fontSize: 15, fontWeight: 700, lineHeight: 1.45, color: 'var(--rdt)' }}>
                    <I n="alert" style={{ marginTop: 1 }} />Bu Apple Kimliği bu hesaba ait değil — hesabı açtığınız Apple Kimliğiyle deneyin.
                </span>
            ) : (
                <>
                    <span style={{ fontSize: 15.5, fontWeight: 800 }}>Apple ile doğrulama</span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx2)' }}>Apple Kimliğinizdeki TimeFlow bağlantısını da kaldırmak için Apple ile bir kez daha doğrulayın.</span>
                </>
            )}
            {step.s === 'failed' && <span role="alert" style={{ fontSize: 14, fontWeight: 700, color: 'var(--rdt)' }}>Apple doğrulaması tamamlanamadı — tekrar deneyin.</span>}
            <button type="button" className="ay-btn-apple" disabled={step.s === 'busy'} onClick={onVerify}>
                {step.s === 'busy' ? <Dots /> : <><I n="apple" />Apple ile doğrula</>}
            </button>
            {!mismatch && <span style={{ fontSize: 13.5, color: 'var(--tx2)' }}>Doğrulanınca basılı tutma açılır.</span>}
        </div>
    );
}

function FailureBox({ reason }: { reason: DeleteFailure }) {
    const text: Record<DeleteFailure, string> = {
        subscription: 'Aboneliğiniz iptal edilemedi; hiçbir şey silinmedi. Biraz sonra tekrar deneyin.',
        forbidden: 'Hesap silme yalnız işletme sahibine açık; hiçbir şey silinmedi.',
        'no-session': 'Oturumunuz düşmüş; hiçbir şey silinmedi. Yeniden giriş yapıp tekrar deneyin.',
        apple_mismatch: 'Bu Apple Kimliği bu hesaba ait değil; hiçbir şey silinmedi.',
        apple_code_invalid: 'Apple doğrulamasının süresi doldu; hiçbir şey silinmedi. Yeniden doğrulayın.',
        offline: 'İnternet yok — bağlanınca silebilirsiniz.',
        // Sunucu yarıda kalmış olabilir (ör. işletme silindi, giriş kaydı kalmadı) —
        // "hiçbir şey silinmedi" ya da "hesabınız duruyor" DENMEZ.
        server: 'Silme tamamlanamadı. Biraz sonra tekrar deneyin; sorun sürerse info@lueratech.com adresine yazın.',
        unknown: '',
    };
    return (
        <div role="alert" className="ay-box err top"><I n="alert" style={{ marginTop: 1 }} />{text[reason]}</div>
    );
}
