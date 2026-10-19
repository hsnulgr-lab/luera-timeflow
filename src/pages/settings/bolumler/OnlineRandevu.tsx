/**
 * A6 · Online randevu (eski "Booking Sayfam").
 *
 * Adres alanı önekli tek parça; Türkçe harfler yazarken çevrilir. Logo burada
 * yalnız önizleme — kaynağı İşletme profili; aynı bilgi iki yerde
 * düzenlenmez. Sağdaki küçük önizleme kaydetmeden önce güncellenir (geniş
 * ekranda; dar ekranda gizli). Web sitesi kodu katlanmış durur.
 *
 * Otomatik onay bir anahtar: anında kaydeder.
 */
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useReservations } from '@/hooks/useReservations';
import { useOrgProfile, slugify } from '@/hooks/useOrgProfile';
import { slugLive } from '../ayarlarModel';
import { useTaslak } from '../useTaslak';
import { Head, I, Pic, SaveBar, SwitchRow } from '../parcalar';

interface Draft { slug: string; cover: string; gallery: string[]; kvkk: string }

/** Gömülebilir (iframe) randevu ekranı — script yüksekliği içeriğe göre ayarlar. */
function buildEmbedCode(bookingUrl: string): string {
    const src = `${bookingUrl}?embed=1`;
    return `<!-- Luera TimeFlow randevu widget'ı -->
<iframe src="${src}" title="Online Randevu" loading="lazy"
  style="width:100%;max-width:464px;height:760px;border:none;border-radius:22px;display:block"></iframe>
<script>window.addEventListener("message",function(e){
  if(e.data&&e.data.type==="tf-embed-height"){
    document.querySelectorAll('iframe[src^="${bookingUrl}"]').forEach(function(f){f.style.height=e.data.height+"px"});
  }
});</script>`;
}

export function OnlineRandevu() {
    const navigate = useNavigate();
    const { settings } = useReservations();
    const { profile, savePartial, uploadImage } = useOrgProfile();
    const [embedOpen, setEmbedOpen] = useState(false);
    const [uploading, setUploading] = useState<'cover' | 'gallery' | null>(null);
    const coverRef = useRef<HTMLInputElement>(null);
    const galRef = useRef<HTMLInputElement>(null);

    const host = typeof window !== 'undefined' ? window.location.host : 'timeflow.lueratech.com';
    const savedUrl = profile.slug ? `${window.location.origin}/book/${profile.slug}` : '';

    const t = useTaslak<Draft>({
        saved: { slug: profile.slug, cover: profile.coverUrl, gallery: profile.galleryUrls, kvkk: profile.kvkkUrl },
        sectionLabel: 'Online randevu',
        labels: { slug: 'Randevu adresi', cover: 'Kapak fotoğrafı', gallery: 'Galeri', kvkk: 'KVKK aydınlatma linki' },
        save: async (d, s) => {
            const patch: Parameters<typeof savePartial>[0] = {};
            if (d.slug !== s.slug) patch.slug = slugify(d.slug);
            if (d.cover !== s.cover) patch.coverUrl = d.cover;
            if (JSON.stringify(d.gallery) !== JSON.stringify(s.gallery)) patch.galleryUrls = d.gallery;
            if (d.kvkk !== s.kvkk) patch.kvkkUrl = d.kvkk.trim();
            if (Object.keys(patch).length === 0) return true;
            let code: string | undefined;
            const ok = await savePartial(patch, { quiet: true, onError: (c) => { code = c; } });
            if (ok) return true;
            return code === '23505' ? 'Bu adres başka bir işletmede kullanılıyor — başka bir adres deneyin.' : false;
        },
    });
    const d = t.draft;
    const bar = (k: keyof Draft) => t.isChanged(k) && <span aria-hidden="true" className="ay-changed" />;

    const upload = async (file: File | undefined, kind: 'cover' | 'gallery') => {
        if (!file) return;
        setUploading(kind);
        const url = await uploadImage(file, kind);
        setUploading(null);
        if (!url) return;
        if (kind === 'cover') t.set({ cover: url });
        else t.set({ gallery: [...d.gallery, url] });
    };

    const addrLine = (profile.address || '').split('\n').map((s) => s.trim()).filter(Boolean).pop() ?? '';

    return (
        <>
            <div className="ay-col w900">
                <div className="ay-a6">
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <Head title="Online randevu" lead="Müşterileriniz bu adresten kendi randevularını alır. Adresi Instagram bio'nuza, Google işletme profilinize ya da web sitenize ekleyin." />

                        <div className="ay-stack" id="ay-adres" style={{ gap: 10, position: 'relative' }}>
                            {bar('slug')}
                            <label className="ay-lbl" htmlFor="ay-slug">Randevu adresi</label>
                            <div className="ay-affix">
                                <span className="pre-box">{host}/book/</span>
                                <input id="ay-slug" value={d.slug} placeholder="salonunuzun-adi" autoComplete="off" spellCheck={false}
                                    onChange={(e) => t.set({ slug: slugLive(e.target.value) })}
                                    onBlur={() => { if (d.slug !== slugify(d.slug)) t.set({ slug: slugify(d.slug) }); }} />
                            </div>
                            {profile.slug || d.slug ? (
                                <>
                                    <span className="ay-help">Küçük harf ve tire; Türkçe harfler kendiliğinden çevrilir.</span>
                                    {savedUrl && (
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                                            <button type="button" className="ay-btn" onClick={() => { void navigator.clipboard.writeText(savedUrl); toast.success('Adres kopyalandı'); }}><I n="copy" />Kopyala</button>
                                            <a className="ay-btn" href={savedUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><I n="ext" />Sayfayı aç</a>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <span style={{ fontSize: 14.5, fontWeight: 700 }}>Bir adres belirleyin.</span>
                                    <span className="ay-help">Adres yokken müşteri kendi randevusunu alamıyor.</span>
                                </>
                            )}
                        </div>

                        <div id="ay-otomatik-onay" style={{ borderTop: '1px solid var(--bd)' }}>
                            <SwitchRow large title="Otomatik onay" titleClass="md"
                                desc={profile.bookingAutoConfirm ? 'Gelen randevular anında onaylanır.' : 'Gelen randevular önce onayınızı bekler.'}
                                value={profile.bookingAutoConfirm}
                                onSave={(v) => savePartial({ bookingAutoConfirm: v }, { quiet: true })} />
                        </div>

                        <div className="ay-stack" id="ay-gorseller" style={{ gap: 12, position: 'relative' }}>
                            {(t.isChanged('cover') || t.isChanged('gallery')) && <span aria-hidden="true" className="ay-changed" />}
                            <span className="ay-lbl">Görseller</span>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>Kapak fotoğrafı</span>
                                <Pic url={d.cover} style={{ height: 120, borderRadius: 14, border: '1px solid var(--bd2)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: 10 }}>
                                    <span className="mono" style={{ fontSize: 11.5, color: 'var(--tx2)' }}>{d.cover ? '' : 'kapak fotoğrafı · geniş'}</span>
                                    <span style={{ display: 'flex', gap: 6 }}>
                                        {d.cover && <button type="button" className="ay-btn" style={{ height: 34, padding: '0 12px', fontSize: 14 }} onClick={() => t.set({ cover: '' })}>Kaldır</button>}
                                        <button type="button" className="ay-btn" style={{ height: 34, padding: '0 12px', fontSize: 14 }} disabled={uploading === 'cover'} onClick={() => coverRef.current?.click()}>
                                            {uploading === 'cover' ? 'Yükleniyor…' : d.cover ? 'Değiştir' : 'Yükle'}
                                        </button>
                                    </span>
                                </Pic>
                                <input ref={coverRef} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0], 'cover'); e.currentTarget.value = ''; }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>Galeri</span>
                                <div className="ay-gal">
                                    {d.gallery.map((u, i) => (
                                        <Pic key={`${u}-${i}`} url={u} className="ay-gal-i">
                                            <button type="button" aria-label="Görseli kaldır" onClick={() => t.set({ gallery: d.gallery.filter((_, j) => j !== i) })}><I n="x" /></button>
                                        </Pic>
                                    ))}
                                    <button type="button" className="ay-gal-add" aria-label="Galeriye ekle" disabled={uploading === 'gallery'} onClick={() => galRef.current?.click()}>
                                        {uploading === 'gallery' ? <span className="ay-dots sm"><i /><i /><i /></span> : <I n="plus" />}
                                    </button>
                                    <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0], 'gallery'); e.currentTarget.value = ''; }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
                                <Pic url={profile.logoUrl} className="s3" style={{ width: 44, height: 44, borderRadius: 11, border: '1px solid var(--bd2)' }} />
                                <span className="ay-help">Logo · <a href="/settings/isletme" style={{ fontWeight: 700 }} onClick={(e) => { e.preventDefault(); navigate('/settings/isletme', { state: { anchor: 'ay-logo' } }); }}>İşletme profilinden değiştirin</a></span>
                            </div>
                        </div>

                        <div className="ay-stack" id="ay-kvkk" style={{ position: 'relative' }}>
                            {bar('kvkk')}
                            <label className="ay-lbl" htmlFor="ay-kvkk-in">KVKK aydınlatma metni linki</label>
                            <input id="ay-kvkk-in" className="ay-input mono" value={d.kvkk} placeholder="https://…/kvkk" onChange={(e) => t.set({ kvkk: e.target.value })} />
                            <span className="ay-help">Randevu sayfasındaki onay kutusunun yanında görünür. Metni siz yayımlarsınız; veri sorumlusu işletmenizdir.</span>
                        </div>

                        <button type="button" aria-expanded={embedOpen} className="ay-fold" onClick={() => setEmbedOpen((v) => !v)}>
                            <I n="chr" />
                            <span className="ay-fold-t"><b>Web sitenize gömün</b><span>Kodu sitenizin HTML'ine yapıştırın; randevu ekranı sitenizin içinde açılır.</span></span>
                        </button>
                        {embedOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0 4px' }}>
                                {savedUrl ? (
                                    <>
                                        <pre className="ay-code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{buildEmbedCode(savedUrl)}</pre>
                                        <button type="button" className="ay-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { void navigator.clipboard.writeText(buildEmbedCode(savedUrl)); toast.success('Kod kopyalandı'); }}>
                                            <I n="copy" />Kodu kopyala
                                        </button>
                                    </>
                                ) : <span className="ay-help">Önce bir randevu adresi belirleyip kaydedin.</span>}
                            </div>
                        )}
                    </div>

                    <aside aria-label="Randevu sayfası önizlemesi" className="ay-preview">
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tx2)' }}>Müşterinin gördüğü</span>
                        <div className="ay-pv-card">
                            <Pic url={d.cover} style={{ height: 110, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 8 }}>
                                {!d.cover && <span className="mono" style={{ fontSize: 10.5, color: 'var(--tx2)' }}>kapak</span>}
                            </Pic>
                            <div style={{ padding: '0 16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <Pic url={profile.logoUrl} className="s3" style={{ width: 54, height: 54, marginTop: -27, borderRadius: 14, border: '3px solid var(--card)' }} />
                                <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.02em' }}>{settings.businessName || 'İşletmeniz'}</span>
                                {addrLine && <span style={{ fontSize: 13, color: 'var(--tx2)' }}>{addrLine}</span>}
                                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8, borderTop: '1px solid var(--bd)' }}>
                                    {settings.services.filter((s) => s.name.trim()).slice(0, 4).map((s, i, arr) => (
                                        <span key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--bd)' : 0, fontSize: 13.5, fontWeight: 600 }}>
                                            {s.name}<span style={{ color: 'var(--tx2)', flex: 'none' }}>{s.duration} dk</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--tx2)' }}>Kapak, logo ve ad kaydetmeden önce burada güncellenir.</span>
                    </aside>
                </div>
            </div>

            <SaveBar state={t.state} summary={t.summary} error={t.error} onSave={() => void t.save()} onDiscard={t.discard} maxWidth={900} />
        </>
    );
}
