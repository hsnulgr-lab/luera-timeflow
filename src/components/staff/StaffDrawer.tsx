import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, User, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { STAFF_ROLE_PERMISSIONS, type StaffRole, type StaffRoleOption } from '@/lib/staffPermissions';
import type { Staff, WorkingHours } from '@/types';
import { cn } from '@/utils/cn';
import './staffDrawer.css';

// ── Uzman ekle / düzenle · sağdan açılan çekmece, üç adım (2026-10-24) ────────
// İlk sürümdeki "kutulara yazılan cümle" beğenilmedi; üç taslak arasından F
// seçildi: her ekranda tek soru — Kim? → Ne yapacak? → Ne zaman? Düzenlerken
// adımlar sekmeye döner, her sekmeden kaydedilir. Ekip listesi arkada kalır.
// Form ve kaydetme StaffPage'de — burası yalnız sunum.

export interface StaffForm {
    name: string; role: StaffRole; specialty: string; phone: string; email: string;
    color: string; useCustomHours: boolean; workingHours: WorkingHours[]; pin: string;
    commissionRate: string;
}

const COLOR_NAMES: Record<string, string> = {
    '#FF5A1F': 'Turuncu', '#E8973C': 'Hardal', '#C95A3C': 'Kiremit', '#CB5E84': 'Gül',
    '#8E70B2': 'Mor', '#3F9D9A': 'Turkuaz', '#5E9C6C': 'Yeşil', '#5B7CC2': 'Mavi',
};
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const DAY_CHIP = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Step = 0 | 1 | 2;

interface Props {
    editing: Staff | null;
    form: StaffForm;
    setForm: React.Dispatch<React.SetStateAction<StaffForm>>;
    saving: boolean;
    onSave: () => void;
    onClose: () => void;
    roleOptions: StaffRoleOption[];
    staffWord: string;
    colors: string[];
    /** İşletmenin çalışma saatleri — özel saat yoksa geçerli olan */
    businessHours: WorkingHours[];
    /** Uzmanlık önerileri — işletmenin hizmet adları */
    suggestions?: string[];
    /** Düzenlenen kişinin şifresi var mı */
    hasPin?: boolean;
    reservationWord: string;
    customerWord: string;
}

/** Rolün telefonda neye izin verdiği — STAFF_ROLE_PERMISSIONS'tan okunur. */
function abilities(role: StaffRole, reservationWord: string, customerWord: string): { text: string; on: boolean }[] {
    const p = new Set(STAFF_ROLE_PERMISSIONS[role]);
    const res = reservationWord.toLocaleLowerCase('tr');
    return [
        { text: p.has('appointments:view-all') ? `Salonun bütün ${res}larını görür` : `Yalnız kendi ${res}larını görür`, on: true },
        { text: `${reservationWord} oluşturur`, on: p.has('appointments:create') },
        { text: `${customerWord} kaydını düzenler`, on: p.has('patients:edit') },
        { text: 'Paketleri düzenler', on: p.has('treatment-plans:edit') },
        { text: 'Tahsilat alır', on: p.has('payments:collect') },
    ];
}

function hoursSummary(hours: WorkingHours[]): string {
    const open = WEEK_ORDER.map((d) => hours.find((h) => h.day === d)).filter((h): h is WorkingHours => Boolean(h && !h.isOff));
    if (open.length === 0) return 'Hiç açık gün yok';
    const closed = WEEK_ORDER.filter((d) => !open.some((h) => h.day === d)).map((d) => DAY_SHORT[d]);
    const first = open[0];
    const same = open.every((h) => h.start === first.start && h.end === first.end);
    const range = same ? `${first.start}–${first.end}` : 'güne göre değişiyor';
    return `${range}${closed.length ? ` · ${closed.join(', ')} kapalı` : ''}`;
}

const splitSpecialty = (s: string) => s.split(/[,·]/).map((x) => x.trim()).filter(Boolean);
const initialsOf = (name: string) =>
    name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLocaleUpperCase('tr');

export function StaffDrawer({
    editing, form, setForm, saving, onSave, onClose, roleOptions, staffWord, colors,
    businessHours, suggestions = [], hasPin, reservationWord, customerWord,
}: Props) {
    const { dark } = useTheme();
    const [step, setStep] = useState<Step>(0);
    const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
    const [nameErr, setNameErr] = useState(false);
    const [otherOpen, setOtherOpen] = useState(false);
    const [other, setOther] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);

    // Uzman kartıyla aynı geri düşüş: rolü tanınmayan kayıt "Personel" sayılır
    const role = roleOptions.find((o) => o.value === form.role) ?? roleOptions.find((o) => o.value === 'staff') ?? roleOptions[0];
    const colorName = COLOR_NAMES[form.color] ?? 'Seçili renk';
    const nameOk = form.name.trim().length > 0;
    const picked = splitSpecialty(form.specialty);
    const offered = Array.from(new Set(suggestions.map((s) => s.trim()).filter(Boolean)))
        .filter((s) => !picked.some((p) => p.toLocaleLowerCase('tr') === s.toLocaleLowerCase('tr')))
        .slice(0, 6);
    const staffLower = staffWord.toLocaleLowerCase('tr');
    // Rengi olmayan eski kayıtlarda rozet boş kalmasın
    const tint = { ['--c' as string]: form.color || 'var(--dc-orange)' } as React.CSSProperties;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const set = <K extends keyof StaffForm>(k: K, v: StaffForm[K]) => setForm((p) => ({ ...p, [k]: v }));
    const setHour = (day: number, field: keyof WorkingHours, value: string | boolean) =>
        setForm((p) => ({ ...p, workingHours: p.workingHours.map((h) => (h.day === day ? { ...h, [field]: value } : h)) }));
    const setSpecialty = (list: string[]) => set('specialty', list.join(', '));
    const addOther = () => {
        const v = other.trim();
        if (v && !picked.includes(v)) setSpecialty([...picked, v]);
        setOther(''); setOtherOpen(false);
    };

    /** Ad yoksa ilk adıma dön ve ad kutusunu göster. */
    const requireName = () => {
        if (nameOk) return true;
        setNameErr(true); setDir('back'); setStep(0);
        setTimeout(() => nameRef.current?.focus(), 0);
        return false;
    };
    const go = (to: Step) => {
        if (to > 0 && !requireName()) return;
        setDir(to >= step ? 'fwd' : 'back'); setStep(to);
    };
    const primary = () => {
        if (!requireName()) return;
        if (editing || step === 2) onSave();
        else go((step + 1) as Step);
    };

    const tabs = editing ? ['Kişi', 'Rol', 'Saatler'] : ['Kim?', 'Ne yapacak?', 'Ne zaman?'];
    const titles = editing
        ? ['Kişi bilgileri', 'Rol ve yetkiler', 'Saatler, prim, giriş']
        : ['Ekibe kim katılıyor?', 'Ekipte ne yapacak?', 'Ne zaman çalışacak?'];
    const subs = [
        'Uzmanlık takvimde adının altında görünür; renk takvimdeki yerini belirler.',
        'Rol, telefonda neleri yapabileceğini belirler.',
        'Dokunmadıkların işletmenin ayarlarıyla çalışır.',
    ];
    const next = ['Sırada: rol ve yetkiler', 'Sırada: saatler, prim, telefon girişi', 'Kaydedince ekip kodu ekranında görünür.'];
    const shownHours = form.useCustomHours ? form.workingHours : businessHours;

    return (
        <div className={cn('dash-theme sdr', dark && 'dark')}>
            <div className="sdr-scrim" onClick={onClose} />
            <aside className="sdr-panel" role="dialog" aria-label={editing ? `${staffWord} düzenle` : `Yeni ${staffLower}`}>
                <header className="sdr-head">
                    <div className="sdr-top">
                        <span className="sdr-eyebrow">
                            {editing ? `${staffWord} düzenle` : `Yeni ${staffLower} · ${step + 1} / 3`}
                        </span>
                        <button type="button" className="sdr-x" onClick={onClose} aria-label="Kapat"><X /></button>
                    </div>
                    <nav className="sdr-steps" role="tablist" aria-label="Adımlar">
                        {tabs.map((t, i) => (
                            <button key={t} type="button" role="tab" aria-selected={step === i}
                                className={cn(step === i && 'on', i < step && 'done')} onClick={() => go(i as Step)}>
                                {t}
                            </button>
                        ))}
                    </nav>
                    <div className="sdr-title">
                        <h2>{titles[step]}</h2>
                        <p>{subs[step]}</p>
                    </div>
                    {step > 0 && (
                        <div className="sdr-ident" style={tint}>
                            <span className="sdr-av sm">{initialsOf(form.name) || <User />}</span>
                            <b>{form.name.trim()}</b><span>· {role.label}</span>
                        </div>
                    )}
                </header>

                <form className={cn('sdr-body', dir)} key={step} noValidate
                    onSubmit={(e) => { e.preventDefault(); primary(); }}>
                    {step === 0 && (
                        <>
                            <div className="sdr-who">
                                <span className="sdr-av" style={tint} aria-hidden>
                                    {initialsOf(form.name) || <User />}
                                </span>
                                <label className={cn('sdr-field', nameErr && !nameOk && 'is-err')}><span>Ad soyad</span>
                                    <input ref={nameRef} value={form.name} placeholder="Örn. Derya Toprak" autoFocus={!editing}
                                        onChange={(e) => { set('name', e.target.value); setNameErr(false); }} />
                                    {nameErr && !nameOk && <em className="sdr-err">Devam etmek için adını yaz</em>}
                                </label>
                            </div>
                            <div className="sdr-g2">
                                <label className="sdr-field"><span>Telefon</span>
                                    <input type="tel" value={form.phone} placeholder="0532 xxx xx xx" onChange={(e) => set('phone', e.target.value)} /></label>
                                <label className="sdr-field"><span>E-posta <i>· isteğe bağlı</i></span>
                                    <input type="email" value={form.email} placeholder="ad@ornek.com" onChange={(e) => set('email', e.target.value)} /></label>
                            </div>
                            <div className="sdr-group" style={tint}>
                                <span className="sdr-flabel">Uzmanlık <i>· isteğe bağlı</i></span>
                                <div className="sdr-chips">
                                    {picked.map((p) => (
                                        <button key={p} type="button" className="sdr-chip on" aria-pressed
                                            onClick={() => setSpecialty(picked.filter((x) => x !== p))} title="Çıkar">
                                            <Check />{p}
                                        </button>
                                    ))}
                                    {offered.map((s) => (
                                        <button key={s} type="button" className="sdr-chip" aria-pressed={false}
                                            onClick={() => setSpecialty([...picked, s])}>
                                            <Plus />{s}
                                        </button>
                                    ))}
                                    {otherOpen ? (
                                        <input className="sdr-chip-in" value={other} autoFocus placeholder="Yaz, Enter"
                                            onChange={(e) => setOther(e.target.value)} onBlur={addOther}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addOther(); }
                                                if (e.key === 'Escape') { e.stopPropagation(); setOther(''); setOtherOpen(false); }
                                            }} />
                                    ) : (
                                        <button type="button" className="sdr-chip ghost" onClick={() => setOtherOpen(true)}>
                                            <Plus />{offered.length || picked.length ? 'Başka…' : 'Uzmanlık ekle'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="sdr-group">
                                <span className="sdr-flabel sdr-flabel-row">Takvim rengi <i>{colorName}</i></span>
                                <div className="sdr-swatches" role="radiogroup" aria-label="Takvim rengi">
                                    {colors.map((c) => (
                                        <button key={c} type="button" role="radio" aria-checked={form.color === c} title={COLOR_NAMES[c]}
                                            className={cn(form.color === c && 'on')} style={{ background: c }}
                                            onClick={() => set('color', c)} />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {step === 1 && (
                        <>
                            <div className="sdr-roles" role="radiogroup" aria-label="Rol">
                                {roleOptions.map((o) => (
                                    <button key={o.value} type="button" role="radio" aria-checked={form.role === o.value}
                                        className={cn('sdr-role', form.role === o.value && 'on')} onClick={() => set('role', o.value)}>
                                        <b>{o.label}</b><small>{o.description}</small>
                                    </button>
                                ))}
                            </div>
                            <div className="sdr-group">
                                <span className="sdr-flabel">Telefonda neler yapabilir</span>
                                <ul className="sdr-can">
                                    {abilities(form.role, reservationWord, customerWord).map((a) => (
                                        <li key={a.text} className={a.on ? 'on' : ''}><span>{a.on ? <Check /> : <X />}</span>{a.text}</li>
                                    ))}
                                </ul>
                                <p className="sdr-note">Rol telefonda görünen işlemleri belirler; PIN tek başına veritabanı yetkilendirmesi değildir.</p>
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <div className="sdr-group">
                                <span className="sdr-flabel">Çalışma saatleri</span>
                                <div className="sdr-box" style={tint}>
                                    <button type="button" className="sdr-switch-row" aria-pressed={!form.useCustomHours}
                                        onClick={() => set('useCustomHours', !form.useCustomHours)}>
                                        <span>
                                            <b>İşletmenin saatleri</b>
                                            <small>{form.useCustomHours ? 'Kapalı · kendi saatleri aşağıda' : hoursSummary(businessHours)}</small>
                                        </span>
                                        <span className={cn('sdr-switch', !form.useCustomHours && 'on')}><i /></span>
                                    </button>
                                    {!form.useCustomHours && (
                                        <div className="sdr-week" aria-label="Açık günler">
                                            {WEEK_ORDER.map((d) => {
                                                const h = shownHours.find((x) => x.day === d);
                                                return <span key={d} className={cn((!h || h.isOff) && 'off')}>{DAY_CHIP[d]}</span>;
                                            })}
                                        </div>
                                    )}
                                    {form.useCustomHours && (
                                        <div className="sdr-hours">
                                            {WEEK_ORDER.map((d) => form.workingHours.find((h) => h.day === d)).filter((h): h is WorkingHours => Boolean(h)).map((h) => (
                                                <div key={h.day} className={cn('sdr-hour', h.isOff && 'off')}>
                                                    <label><input type="checkbox" checked={!h.isOff} onChange={(e) => setHour(h.day, 'isOff', !e.target.checked)} />{h.dayName}</label>
                                                    {h.isOff ? <span className="sdr-closed">Kapalı</span> : (
                                                        <span className="sdr-times">
                                                            <input type="time" value={h.start} onChange={(e) => setHour(h.day, 'start', e.target.value)} />
                                                            <i>–</i>
                                                            <input type="time" value={h.end} onChange={(e) => setHour(h.day, 'end', e.target.value)} />
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="sdr-g2">
                                <label className="sdr-field"><span>Prim oranı</span>
                                    <span className="sdr-suf">
                                        <input type="number" min={0} max={100} step={1} value={form.commissionRate}
                                            onChange={(e) => set('commissionRate', e.target.value)} /><em>%</em>
                                    </span>
                                    <small>Bağlı tahsilatların yüzdesi · 0 = prim yok</small></label>
                                <label className="sdr-field"><span>Telefon PIN'i <i>· isteğe bağlı</i></span>
                                    <input type="text" inputMode="numeric" maxLength={4} className="sdr-pin" value={form.pin}
                                        placeholder={editing ? 'Yeni PIN' : 'Boş bırakabilirsin'}
                                        onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} />
                                    <small>{editing && hasPin ? 'Boşsa mevcut PIN korunur' : 'Boşsa ilk girişte kendisi belirler'}</small></label>
                            </div>
                        </>
                    )}
                    <button type="submit" hidden aria-hidden tabIndex={-1} />
                </form>

                <footer className="sdr-foot">
                    <p>{editing ? 'Değişiklikler kaydedince geçerli olur.' : next[step]}</p>
                    <div>
                        {editing || step === 0 ? (
                            <button type="button" className="sdr-btn" onClick={onClose}>Vazgeç</button>
                        ) : (
                            <button type="button" className="sdr-btn" onClick={() => go((step - 1) as Step)}><ArrowLeft />Geri</button>
                        )}
                        <button type="button" className="sdr-btn is-primary" onClick={primary} disabled={saving}>
                            {saving ? 'Kaydediliyor…' : editing ? 'Kaydet' : step < 2 ? <>Devam<ArrowRight /></> : `Ekibe ekle`}
                        </button>
                    </div>
                </footer>
            </aside>
        </div>
    );
}
