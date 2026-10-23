import { useEffect, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { STAFF_ROLE_PERMISSIONS, type StaffRole, type StaffRoleOption } from '@/lib/staffPermissions';
import type { Staff, WorkingHours } from '@/types';
import { cn } from '@/utils/cn';
import './staffDrawer.css';

// ── Uzman ekle / düzenle · sağdan açılan çekmece (2026-10-24) ─────────────────
// Kullanıcı eski pencereyi "komple revize" istedi; dört taslak arasından D'yi
// seçti. Ekip listesi arkada görünür kalır. Üstte cümle canlı yazılır ve
// kutulu kelimeler doğrudan düzenlenir; ayrıntılar katlanmış bölümlerde.
// Form ve kaydetme StaffPage'de — burası yalnız sunum.

export interface StaffForm {
    name: string; role: StaffRole; specialty: string; phone: string; email: string;
    color: string; useCustomHours: boolean; workingHours: WorkingHours[]; pin: string;
    commissionRate: string;
}

const COLOR_NAMES: Record<string, string> = {
    '#FF5A1F': 'turuncu', '#E8973C': 'hardal', '#C95A3C': 'kiremit', '#CB5E84': 'gül',
    '#8E70B2': 'mor', '#3F9D9A': 'turkuaz', '#5E9C6C': 'yeşil', '#5B7CC2': 'mavi',
};
const DAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Section = 'contact' | 'role' | 'hours' | 'commission' | 'login';

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

export function StaffDrawer({
    editing, form, setForm, saving, onSave, onClose, roleOptions, staffWord, colors,
    businessHours, hasPin, reservationWord, customerWord,
}: Props) {
    const { dark } = useTheme();
    const [open, setOpen] = useState<Section | null>(editing ? null : 'contact');
    const [colorsOpen, setColorsOpen] = useState(false);
    const role = roleOptions.find((o) => o.value === form.role) ?? roleOptions[0];
    const colorName = COLOR_NAMES[form.color] ?? 'seçili renkte';
    const rate = Math.max(0, Math.min(100, Number(form.commissionRate) || 0));

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const set = <K extends keyof StaffForm>(k: K, v: StaffForm[K]) => setForm((p) => ({ ...p, [k]: v }));
    const setHour = (day: number, field: keyof WorkingHours, value: string | boolean) =>
        setForm((p) => ({ ...p, workingHours: p.workingHours.map((h) => (h.day === day ? { ...h, [field]: value } : h)) }));
    const toggle = (s: Section) => setOpen((cur) => (cur === s ? null : s));

    const summary: Record<Section, string> = {
        contact: [form.phone.trim() || 'telefon yok', form.email.trim() || 'e-posta yok'].join(' · '),
        role: `${role.label} · ${abilities(form.role, reservationWord, customerWord).filter((a) => a.on).length} yetki`,
        hours: form.useCustomHours ? `Kendine özel · ${hoursSummary(form.workingHours)}` : `İşletmenin saatleri · ${hoursSummary(businessHours)}`,
        commission: rate > 0 ? `%${rate} · bu kişinin tahsilatlarından` : 'Prim yok',
        login: form.pin.trim().length === 4
            ? 'Yeni PIN belirlendi'
            : editing && hasPin ? 'Şifresi var · değiştirmek için yeni PIN yaz' : "PIN'i ilk girişte telefondan kendisi belirleyecek",
    };

    const head = (s: Section, title: string) => (
        <button type="button" className="sdr-acc-h" aria-expanded={open === s} onClick={() => toggle(s)}>
            <span><b>{title}</b><small>{summary[s]}</small></span>
            <ChevronDown className={cn('sdr-chev', open === s && 'is-open')} />
        </button>
    );

    const nameOk = form.name.trim().length > 0;
    const futureVerb = editing ? 'çalışıyor' : 'katılıyor';

    return (
        <div className={cn('dash-theme sdr', dark && 'dark')}>
            <div className="sdr-scrim" onClick={onClose} />
            <aside className="sdr-panel" role="dialog" aria-label={editing ? `${staffWord} düzenle` : `Yeni ${staffWord}`}>
                <header className="sdr-head">
                    <div className="sdr-top">
                        <span className="sdr-eyebrow">{editing ? `${staffWord} düzenle` : `Yeni ${staffWord.toLocaleLowerCase('tr')}`}</span>
                        <button type="button" className="sdr-x" onClick={onClose} aria-label="Kapat"><X /></button>
                    </div>
                    {/* Cümle — kutulu kelimeler doğrudan düzenlenir */}
                    <p className="sdr-sentence">
                        <input className="sdr-tok" value={form.name} placeholder="Ad Soyad" autoFocus={!editing}
                            size={Math.max(8, form.name.length || 8)} onChange={(e) => set('name', e.target.value)} aria-label="Ad soyad" />
                        {' '}{editing ? 'ekipte' : 'ekibe'}{' '}
                        <span className="sdr-tok sdr-tok-sel">
                            <select value={form.role} onChange={(e) => set('role', e.target.value as StaffRole)} aria-label="Rol">
                                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </span>
                        {' '}olarak {futureVerb}. Uzmanlığı{' '}
                        <input className="sdr-tok" value={form.specialty} placeholder="ekle" size={Math.max(4, form.specialty.length || 4)}
                            onChange={(e) => set('specialty', e.target.value)} aria-label="Uzmanlık" />
                        . Takvimde{' '}
                        <button type="button" className="sdr-tok sdr-tok-color" style={{ ['--c' as string]: form.color }}
                            onClick={() => setColorsOpen((v) => !v)} aria-expanded={colorsOpen} aria-label="Takvim rengi">
                            <i />{colorName}
                        </button>
                        {' '}{editing ? 'görünüyor' : 'görünecek'}.
                    </p>
                    {colorsOpen && (
                        <div className="sdr-swatches" role="radiogroup" aria-label="Takvim rengi">
                            {colors.map((c) => (
                                <button key={c} type="button" role="radio" aria-checked={form.color === c} title={COLOR_NAMES[c]}
                                    className={cn(form.color === c && 'on')} style={{ background: c }}
                                    onClick={() => { set('color', c); setColorsOpen(false); }} />
                            ))}
                        </div>
                    )}
                </header>

                <div className="sdr-body">
                    <section className="sdr-acc">
                        {head('contact', 'İletişim')}
                        {open === 'contact' && (
                            <div className="sdr-acc-b sdr-g2">
                                <label className="sdr-field"><span>Telefon</span>
                                    <input type="tel" value={form.phone} placeholder="0532 xxx xx xx" onChange={(e) => set('phone', e.target.value)} /></label>
                                <label className="sdr-field"><span>E-posta <i>· isteğe bağlı</i></span>
                                    <input type="email" value={form.email} placeholder="ad@ornek.com" onChange={(e) => set('email', e.target.value)} /></label>
                            </div>
                        )}
                    </section>

                    <section className="sdr-acc">
                        {head('role', 'Rol ve yetkiler')}
                        {open === 'role' && (
                            <div className="sdr-acc-b">
                                <div className="sdr-roles" role="radiogroup" aria-label="Rol">
                                    {roleOptions.map((o) => (
                                        <button key={o.value} type="button" role="radio" aria-checked={form.role === o.value}
                                            className={cn('sdr-role', form.role === o.value && 'on')} onClick={() => set('role', o.value)}>
                                            <b>{o.label}</b><small>{o.description}</small>
                                        </button>
                                    ))}
                                </div>
                                <ul className="sdr-can" aria-label="Telefonda neler yapabilir">
                                    {abilities(form.role, reservationWord, customerWord).map((a) => (
                                        <li key={a.text} className={a.on ? 'on' : ''}><span>{a.on ? <Check /> : <X />}</span>{a.text}</li>
                                    ))}
                                </ul>
                                <p className="sdr-note">Rol telefonda görünen işlemleri belirler; PIN tek başına veritabanı yetkilendirmesi değildir.</p>
                            </div>
                        )}
                    </section>

                    <section className="sdr-acc">
                        {head('hours', 'Çalışma saatleri')}
                        {open === 'hours' && (
                            <div className="sdr-acc-b">
                                <button type="button" className="sdr-switch-row" aria-pressed={form.useCustomHours}
                                    onClick={() => set('useCustomHours', !form.useCustomHours)}>
                                    <span><b>Kendine özel saat</b><small>Kapalıyken işletmenin saatleri geçerli</small></span>
                                    <span className={cn('sdr-switch', form.useCustomHours && 'on')}><i /></span>
                                </button>
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
                        )}
                    </section>

                    <section className="sdr-acc">
                        {head('commission', 'Prim')}
                        {open === 'commission' && (
                            <div className="sdr-acc-b">
                                <label className="sdr-field sdr-suffix"><span>Prim oranı</span>
                                    <input type="number" min={0} max={100} step={1} value={form.commissionRate}
                                        onChange={(e) => set('commissionRate', e.target.value)} /><em>%</em></label>
                                <p className="sdr-note">Bu kişiye bağlı tahsilatların yüzdesi prim olarak hesaplanır. 0 = prim yok.</p>
                            </div>
                        )}
                    </section>

                    <section className="sdr-acc">
                        {head('login', 'Telefon girişi')}
                        {open === 'login' && (
                            <div className="sdr-acc-b">
                                <label className="sdr-field"><span>PIN <i>· isteğe bağlı, 4 hane</i></span>
                                    <input type="text" inputMode="numeric" maxLength={4} className="sdr-pin" value={form.pin}
                                        placeholder={editing ? 'Değiştirmek için yeni PIN' : 'Boş bırakabilirsin'}
                                        onChange={(e) => set('pin', e.target.value.replace(/\D/g, ''))} /></label>
                                <p className="sdr-note">Boş bırakırsan ilk girişte şifresini telefonundan kendisi belirler{editing ? '; mevcut PIN korunur' : ''}.</p>
                            </div>
                        )}
                    </section>
                </div>

                <footer className="sdr-foot">
                    <p>{editing ? 'Değişiklikler kaydedince geçerli olur.' : 'Kaydedince ekip kodu ekranında görünür.'}</p>
                    <div>
                        <button type="button" className="sdr-btn" onClick={onClose}>Vazgeç</button>
                        <button type="button" className="sdr-btn is-primary" onClick={onSave} disabled={saving || !nameOk}>
                            {saving ? 'Kaydediliyor…' : editing ? 'Kaydet' : 'Ekibe ekle'}
                        </button>
                    </div>
                </footer>
            </aside>
        </div>
    );
}
