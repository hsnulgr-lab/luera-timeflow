import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
    ArrowDownLeft, ArrowUpRight, Banknote, ChevronLeft, ChevronRight, CreditCard, Landmark,
    Lock, Plus, Printer, ReceiptText, Search, ShieldCheck, Undo2, WalletCards, X,
} from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { useKasaDefteri, type CashClosing } from '@/hooks/useKasaDefteri';
import { EXPENSE_CATEGORY_LABELS } from '@/lib/expenses';
import { buildMoves, presetRange, shiftDay, summarize, type KasaMove, type KasaSummary, type RangePreset } from '@/lib/kasaDefteri';
import { todayISO } from '@/utils/date';
import type { ExpenseCategory, Payment, PaymentMethod } from '@/types';
import './kasaDefteri.css';

// ── Kasa defteri ekranları (2026-10-31) ──────────────────────────────────────
// Eskiden "Hareketler" yalnız bugünün tahsilatlarını gösteren küçük bir
// pencere, "Gün sonu" yalnız toplamdı; "Yazdır" bütün sayfayı bulanık arka
// planıyla basıyordu. Kullanıcı kararları (2026-10-31): tahsilat + iptal +
// gider tek listede, kasa sayılıp KAPATILIR (göç 133), baskı A4 rapor.

const tl = (n: number) => `₺${Math.round(n).toLocaleString('tr-TR')}`;
const tlSigned = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${tl(Math.abs(n))}`;
const METHOD_LABEL: Record<PaymentMethod, string> = { cash: 'Nakit', card: 'Kart', transfer: 'Havale', other: 'Diğer' };
const INCOME_LABEL = { service: 'Hizmet', package: 'Paket', product: 'Ürün', other: 'Diğer' } as const;
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dayLabel = (d: string) => { const x = new Date(`${d}T12:00:00`); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
const dayLong = (d: string) => `${dayLabel(d)} · ${DAYS[new Date(`${d}T12:00:00`).getDay()]}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('tr', { hour: '2-digit', minute: '2-digit' });
const rangeLabel = (from: string, to: string) => (from === to ? dayLong(from) : `${dayLabel(from)} – ${dayLabel(to)}`);

function MethodIcon({ m, size = 15 }: { m: PaymentMethod; size?: number }) {
    if (m === 'cash') return <Banknote size={size} />;
    if (m === 'card') return <CreditCard size={size} />;
    if (m === 'transfer') return <Landmark size={size} />;
    return <WalletCards size={size} />;
}

function moveTitle(m: KasaMove, customerName: (id?: string) => string | undefined): string {
    if (m.kind === 'expense') return m.description || EXPENSE_CATEGORY_LABELS[m.expenseCategory || 'diger'];
    return m.description || customerName(m.customerId) || (m.kind === 'void' ? 'Silinen tahsilat' : 'Tahsilat');
}
function moveTag(m: KasaMove): string {
    if (m.kind === 'expense') return `Gider · ${EXPENSE_CATEGORY_LABELS[m.expenseCategory || 'diger']}`;
    if (m.kind === 'void') return 'İptal';
    return INCOME_LABEL[m.income || 'other'];
}

// ── A4 baskı ────────────────────────────────────────────────────────────────
// Rapor body'ye portal ile eklenir; yazdırırken body'ye `tf-printing` sınıfı
// konur ve CSS yalnız raporu bırakır. Sınıf yalnız bu baskı süresince durur —
// Kasa'nın fiş yazdırması gibi öteki window.print() çağrıları etkilenmez.
interface PrintDoc {
    title: string;
    range: string;
    business: string;
    summary: KasaSummary;
    moves: KasaMove[];
    closing?: CashClosing | null;
    customerName: (id?: string) => string | undefined;
}

function useA4Print() {
    const [doc, setDoc] = useState<PrintDoc | null>(null);
    useEffect(() => {
        if (!doc) return;
        document.body.classList.add('tf-printing');
        const done = () => { document.body.classList.remove('tf-printing'); setDoc(null); };
        window.addEventListener('afterprint', done, { once: true });
        // Portal DOM'a yazılsın diye bir kare beklenir.
        const t = window.setTimeout(() => window.print(), 50);
        return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('tf-printing'); };
    }, [doc]);
    const node = doc ? createPortal(<KasaRapor doc={doc} />, document.body) : null;
    return { print: setDoc, node };
}

function KasaRapor({ doc }: { doc: PrintDoc }) {
    const s = doc.summary;
    return (
        <div className="tf-print-only kd-print">
            <header>
                <div><small>{doc.business}</small><h1>{doc.title}</h1><p>{doc.range}</p></div>
                <div className="kd-print-meta">Basım: {new Date().toLocaleString('tr', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            </header>
            <table className="kd-print-sum"><tbody>
                <tr><th>Tahsilat ({s.count} işlem)</th><td>{tl(s.income)}</td><th>Gider ({s.expenseCount})</th><td>{tl(s.expense)}</td></tr>
                <tr><th>Net</th><td><b>{tl(s.net)}</b></td><th>İptal ({s.voidCount})</th><td>{tl(s.voidTotal)}</td></tr>
                <tr><th>Nakit</th><td>{tl(s.byMethod.cash)}</td><th>Kart</th><td>{tl(s.byMethod.card)}</td></tr>
                <tr><th>Havale</th><td>{tl(s.byMethod.transfer)}</td><th>Diğer</th><td>{tl(s.byMethod.other)}</td></tr>
                <tr><th>Hizmet</th><td>{tl(s.byIncome.service)}</td><th>Paket</th><td>{tl(s.byIncome.package)}</td></tr>
                <tr><th>Ürün</th><td>{tl(s.byIncome.product)}</td><th>Beklenen nakit</th><td><b>{tl(s.expectedCash)}</b></td></tr>
            </tbody></table>
            {doc.closing && (
                <div className="kd-print-close">
                    <b>Kasa kapanışı</b> · {new Date(doc.closing.closedAt).toLocaleString('tr', { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}Sayılan {tl(doc.closing.countedCash)} · Beklenen {tl(doc.closing.expectedCash)}
                    {' · '}Fark <b>{tlSigned(doc.closing.difference)}</b>
                    {doc.closing.note && <div>Not: {doc.closing.note}</div>}
                </div>
            )}
            <table className="kd-print-moves">
                <thead><tr><th>Zaman</th><th>Açıklama</th><th>Tür</th><th>Yöntem</th><th>Tutar</th></tr></thead>
                <tbody>
                    {doc.moves.map((m) => (
                        <tr key={m.id} className={`is-${m.kind}`}>
                            <td>{doc.range.includes('–') ? `${dayLabel(m.day)} ` : ''}{timeOf(m.at)}</td>
                            <td>{moveTitle(m, doc.customerName)}{m.kind !== 'expense' && m.description && doc.customerName(m.customerId) ? ` · ${doc.customerName(m.customerId)}` : ''}</td>
                            <td>{moveTag(m)}</td>
                            <td>{METHOD_LABEL[m.method]}</td>
                            <td>{m.kind === 'expense' ? `−${tl(m.amount)}` : m.kind === 'void' ? `(${tl(m.amount)})` : tl(m.amount)}</td>
                        </tr>
                    ))}
                    {doc.moves.length === 0 && <tr><td colSpan={5}>Bu aralıkta hareket yok.</td></tr>}
                </tbody>
            </table>
            <footer>İptal satırları parantez içindedir ve toplamlara girmez. Tekrarlı giderler (kira, maaş) kasa defterinde değil, Analiz'de sayılır.</footer>
        </div>
    );
}

// ── Gider ekleme ────────────────────────────────────────────────────────────
function ExpenseForm({ onSave, onCancel }: { onSave: (e: { category: ExpenseCategory; amount: number; method: PaymentMethod; description: string; spentOn: string }) => Promise<boolean>; onCancel: () => void }) {
    const [category, setCategory] = useState<ExpenseCategory>('malzeme');
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('cash');
    const [description, setDescription] = useState('');
    const [spentOn, setSpentOn] = useState(todayISO());
    const [busy, setBusy] = useState(false);
    const ok = Number(amount) > 0;
    return (
        <div className="kd-expense-form">
            <div className="kd-expense-grid">
                <label><span>Kategori</span>
                    <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
                        {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => <option key={k} value={k}>{EXPENSE_CATEGORY_LABELS[k]}</option>)}
                    </select>
                </label>
                <label><span>Tutar</span><input type="number" min={0} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₺0" autoFocus /></label>
                <label><span>Tarih</span><input type="date" value={spentOn} max={todayISO()} onChange={(e) => setSpentOn(e.target.value)} /></label>
                <label className="is-wide"><span>Açıklama</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="örn. Oksidan alımı, kargo" maxLength={120} /></label>
            </div>
            <div className="kd-expense-foot">
                <div className="kd-seg" role="radiogroup" aria-label="Ödeme yöntemi">
                    {(['cash', 'card', 'transfer'] as PaymentMethod[]).map((m) => (
                        <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}><MethodIcon m={m} size={14} />{METHOD_LABEL[m]}</button>
                    ))}
                </div>
                <button type="button" className="kd-btn" onClick={onCancel}>Vazgeç</button>
                <button type="button" className="kd-btn is-primary" disabled={!ok || busy}
                    onClick={async () => { setBusy(true); const done = await onSave({ category, amount: Number(amount), method, description, spentOn }); setBusy(false); if (done) onCancel(); }}>
                    {busy ? 'Kaydediliyor…' : 'Gideri kaydet'}
                </button>
            </div>
        </div>
    );
}

// ── Hareketler ──────────────────────────────────────────────────────────────
type KindFilter = 'all' | 'income' | 'expense' | 'void';
const PRESETS: [RangePreset, string][] = [['today', 'Bugün'], ['yesterday', 'Dün'], ['week', 'Bu hafta'], ['month', 'Bu ay']];

export function KasaHareketleri({ payments, customerName, business, onClose }: {
    payments: Payment[];
    customerName: (id?: string) => string | undefined;
    business: string;
    onClose: () => void;
}) {
    const today = todayISO();
    const [preset, setPreset] = useState<RangePreset | null>('today');
    const [range, setRange] = useState(() => presetRange('today', today));
    const [kind, setKind] = useState<KindFilter>('all');
    const [method, setMethod] = useState<PaymentMethod | 'all'>('all');
    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(false);
    const { expenses, addExpense, available: expensesOn } = useExpenses();
    const { voids } = useKasaDefteri(range.from, range.to);
    const { print, node: printNode } = useA4Print();

    const all = useMemo(() => buildMoves(payments, voids, expensesOn ? expenses : [], range.from, range.to), [payments, voids, expenses, expensesOn, range]);
    const summary = useMemo(() => summarize(all), [all]);
    const shown = useMemo(() => {
        const q = query.trim().toLocaleLowerCase('tr');
        return all.filter((m) => (kind === 'all' || m.kind === kind) && (method === 'all' || m.method === method)
            && (!q || `${moveTitle(m, customerName)} ${moveTag(m)}`.toLocaleLowerCase('tr').includes(q)));
    }, [all, kind, method, query, customerName]);
    const multiDay = range.from !== range.to;

    const pick = (p: RangePreset) => { setPreset(p); setRange(presetRange(p, today)); };

    return (
        <div className="kd-overlay" onClick={onClose}>
            <div className="kd-sheet" role="dialog" aria-modal="true" aria-label="Kasa hareketleri" onClick={(e) => e.stopPropagation()}>
                <header className="kd-head">
                    <span className="kd-head-icon"><ReceiptText size={18} /></span>
                    <div className="kd-head-copy"><h2>Kasa hareketleri</h2><p>{rangeLabel(range.from, range.to)}</p></div>
                    <div className="kd-head-actions">
                        {expensesOn && <button type="button" className="kd-btn" onClick={() => setAdding((v) => !v)}><Plus size={15} />Gider ekle</button>}
                        <button type="button" className="kd-btn" onClick={() => print({ title: 'Kasa hareketleri', range: rangeLabel(range.from, range.to), business, summary, moves: shown, customerName })}><Printer size={15} />Yazdır</button>
                        <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
                    </div>
                </header>

                <div className="kd-toolbar">
                    <div className="kd-seg" role="group" aria-label="Tarih aralığı">
                        {PRESETS.map(([p, label]) => <button key={p} type="button" aria-pressed={preset === p} onClick={() => pick(p)}>{label}</button>)}
                    </div>
                    <div className="kd-dates">
                        <input type="date" value={range.from} max={range.to} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: e.target.value || r.from })); }} aria-label="Başlangıç" />
                        <span>–</span>
                        <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: e.target.value || r.to })); }} aria-label="Bitiş" />
                    </div>
                </div>

                {adding && (
                    <ExpenseForm onCancel={() => setAdding(false)} onSave={async (e) => {
                        const row = await addExpense({ category: e.category, amount: e.amount, method: e.method, description: e.description, spentOn: e.spentOn });
                        if (row) toast.success(`Gider kaydedildi · ${tl(row.amount)}`);
                        return Boolean(row);
                    }} />
                )}

                <div className="kd-stats">
                    <div><small>Tahsilat</small><strong className="is-green">{tl(summary.income)}</strong><span>{summary.count} işlem</span></div>
                    <div><small>Gider</small><strong className={summary.expense > 0 ? 'is-red' : ''}>{tl(summary.expense)}</strong><span>{summary.expenseCount} kalem</span></div>
                    <div><small>Net</small><strong>{tl(summary.net)}</strong><span>tahsilat − gider</span></div>
                    <div><small>Kasadaki nakit</small><strong>{tl(summary.expectedCash)}</strong><span>nakit giriş − nakit gider</span></div>
                    <div><small>İptal</small><strong className={summary.voidCount > 0 ? 'is-amber' : ''}>{summary.voidCount}</strong><span>{summary.voidCount > 0 ? `${tl(summary.voidTotal)} silindi` : 'silinen yok'}</span></div>
                </div>

                <div className="kd-filters">
                    <div className="kd-seg" role="group" aria-label="Hareket türü">
                        {([['all', 'Tümü'], ['income', 'Tahsilat'], ['expense', 'Gider'], ['void', 'İptal']] as [KindFilter, string][]).map(([k, label]) => (
                            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
                        ))}
                    </div>
                    <select className="kd-select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod | 'all')} aria-label="Yöntem">
                        <option value="all">Tüm yöntemler</option>
                        {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
                    </select>
                    <label className="kd-search"><Search size={15} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Müşteri, açıklama ara" /></label>
                </div>

                <div className="kd-table" role="table" aria-label="Hareket listesi">
                    <div className="kd-row is-head" role="row">
                        <span>{multiDay ? 'Tarih' : 'Saat'}</span><span>Açıklama</span><span>Tür</span><span>Yöntem</span><span>Tutar</span>
                    </div>
                    {shown.map((m) => (
                        <div key={m.id} className={`kd-row is-${m.kind}`} role="row">
                            <span className="kd-when">{multiDay && <b>{dayLabel(m.day).slice(0, -5)}</b>}{timeOf(m.at)}</span>
                            <span className="kd-what">
                                <i className="kd-dir">{m.kind === 'income' ? <ArrowDownLeft size={14} /> : m.kind === 'expense' ? <ArrowUpRight size={14} /> : <Undo2 size={14} />}</i>
                                <span><strong>{moveTitle(m, customerName)}</strong>{m.kind === 'income' && m.description && customerName(m.customerId) && <small>{customerName(m.customerId)}</small>}</span>
                            </span>
                            <span><em className={`kd-tag is-${m.kind}`}>{moveTag(m)}</em></span>
                            <span className="kd-method"><MethodIcon m={m.method} size={14} />{METHOD_LABEL[m.method]}</span>
                            <span className="kd-amount">{m.kind === 'expense' ? `−${tl(m.amount)}` : tl(m.amount)}</span>
                        </div>
                    ))}
                    {shown.length === 0 && <div className="kd-empty">{all.length === 0 ? 'Bu aralıkta hareket yok.' : 'Filtreye uyan hareket yok.'}</div>}
                </div>
                <footer className="kd-foot">
                    <span>{shown.length} satır gösteriliyor</span>
                    <span>İptal satırları üstü çizili gösterilir, toplamlara girmez. Tekrarlı giderler (kira, maaş) Analiz'de.</span>
                </footer>
            </div>
            {printNode}
        </div>
    );
}

// ── Gün sonu ────────────────────────────────────────────────────────────────
export function KasaGunSonu({ payments, customerName, business, onClose, onOpenMoves }: {
    payments: Payment[];
    customerName: (id?: string) => string | undefined;
    business: string;
    onClose: () => void;
    onOpenMoves: () => void;
}) {
    const today = todayISO();
    const [day, setDay] = useState(today);
    const { expenses, available: expensesOn } = useExpenses();
    const { voids, closings, closingsAvailable, closeDay } = useKasaDefteri(day, day);
    const { print, node: printNode } = useA4Print();
    const moves = useMemo(() => buildMoves(payments, voids, expensesOn ? expenses : [], day, day), [payments, voids, expenses, expensesOn, day]);
    const s = useMemo(() => summarize(moves), [moves]);
    const closing = closings.find((c) => c.businessDay === day) || null;
    const [counted, setCounted] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    // Gün ya da kapanış değişince sayım alanı o günün kapanışından (varsa) dolar.
    // Efekt yerine çizimde eşitleme (React'in "önceki değeri sakla" kalıbı).
    const syncKey = `${day}|${closing?.closedAt || ''}`;
    const [syncedKey, setSyncedKey] = useState(syncKey);
    if (syncedKey !== syncKey) {
        setSyncedKey(syncKey);
        setCounted(closing ? String(closing.countedCash) : '');
        setNote(closing?.note || '');
    }

    const countedNum = counted.trim() === '' ? null : Number(counted);
    const diff = countedNum === null || Number.isNaN(countedNum) ? null : Math.round((countedNum - s.expectedCash) * 100) / 100;
    const drift = closing ? Math.round((s.expectedCash - closing.expectedCash) * 100) / 100 : 0;

    const doClose = async () => {
        if (countedNum === null || Number.isNaN(countedNum) || countedNum < 0) return;
        setBusy(true);
        const row = await closeDay({ day, expectedCash: s.expectedCash, countedCash: countedNum, totals: s, note });
        setBusy(false);
        if (row) toast.success(row.difference === 0 ? 'Kasa kapatıldı · fark yok' : `Kasa kapatıldı · fark ${tlSigned(row.difference)}`);
    };

    const methods = (['cash', 'card', 'transfer', 'other'] as PaymentMethod[]).filter((m) => s.byMethod[m] > 0 || m !== 'other');
    const methodMax = Math.max(1, ...methods.map((m) => s.byMethod[m]));

    return (
        <div className="kd-overlay" onClick={onClose}>
            <div className="kd-sheet is-narrow" role="dialog" aria-modal="true" aria-label="Gün sonu" onClick={(e) => e.stopPropagation()}>
                <header className="kd-head">
                    <span className="kd-head-icon"><ShieldCheck size={18} /></span>
                    <div className="kd-head-copy"><h2>Gün sonu</h2><p>{business}</p></div>
                    <div className="kd-head-actions">
                        <button type="button" className="kd-btn" onClick={() => print({ title: 'Gün sonu raporu', range: dayLong(day), business, summary: s, moves, closing, customerName })}><Printer size={15} />Yazdır</button>
                        <button type="button" className="kd-icon-btn" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
                    </div>
                </header>

                <div className="kd-daybar">
                    <button type="button" className="kd-icon-btn" onClick={() => setDay((d) => shiftDay(d, -1))} aria-label="Önceki gün"><ChevronLeft size={17} /></button>
                    <div><strong>{dayLong(day)}</strong>{day === today && <small>Bugün</small>}</div>
                    <button type="button" className="kd-icon-btn" disabled={day >= today} onClick={() => setDay((d) => shiftDay(d, 1))} aria-label="Sonraki gün"><ChevronRight size={17} /></button>
                    {closing
                        ? <span className="kd-status is-closed"><Lock size={13} />Kapatıldı · {timeOf(closing.closedAt)}</span>
                        : <span className="kd-status">Açık</span>}
                </div>

                <div className="kd-body">
                    <div className="kd-hero">
                        <div><small>Günün tahsilatı</small><strong>{tl(s.income)}</strong><span>{s.count} işlem{s.voidCount > 0 ? ` · ${s.voidCount} iptal (${tl(s.voidTotal)})` : ''}</span></div>
                        <div><small>Gider</small><strong className={s.expense > 0 ? 'is-red' : ''}>{tl(s.expense)}</strong><span>{s.expenseCount} kalem</span></div>
                        <div><small>Net</small><strong>{tl(s.net)}</strong><span>tahsilat − gider</span></div>
                    </div>

                    <div className="kd-cols">
                        <section className="kd-card">
                            <h3>Yönteme göre</h3>
                            {methods.map((m) => (
                                <div key={m} className="kd-bar-row">
                                    <span><MethodIcon m={m} />{METHOD_LABEL[m]}</span>
                                    <i><b style={{ width: `${(s.byMethod[m] / methodMax) * 100}%` }} /></i>
                                    <strong>{tl(s.byMethod[m])}</strong>
                                </div>
                            ))}
                        </section>
                        <section className="kd-card">
                            <h3>Türe göre</h3>
                            {(Object.keys(INCOME_LABEL) as (keyof typeof INCOME_LABEL)[]).filter((k) => k !== 'other' || s.byIncome.other > 0).map((k) => (
                                <div key={k} className="kd-line"><span>{INCOME_LABEL[k]}</span><strong>{tl(s.byIncome[k])}</strong></div>
                            ))}
                            <div className="kd-line is-muted"><span>Nakit gider</span><strong>{s.cashOut > 0 ? `−${tl(s.cashOut)}` : tl(0)}</strong></div>
                        </section>
                    </div>

                    <section className="kd-count">
                        <div className="kd-count-head">
                            <h3>Kasa sayımı</h3>
                            <span>Beklenen nakit = nakit tahsilat {tl(s.cashIn)} − nakit gider {tl(s.cashOut)}</span>
                        </div>
                        <div className="kd-count-grid">
                            <div className="kd-count-cell"><small>Beklenen</small><strong>{tl(s.expectedCash)}</strong></div>
                            <label className="kd-count-cell is-input"><small>Sayılan nakit</small>
                                <div><b>₺</b><input type="number" min={0} inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="Çekmecedeki tutar" disabled={!closingsAvailable} /></div>
                            </label>
                            <div className={`kd-count-cell ${diff === null ? '' : diff === 0 ? 'is-ok' : diff > 0 ? 'is-over' : 'is-short'}`}>
                                <small>Fark</small>
                                <strong>{diff === null ? '—' : diff === 0 ? 'Fark yok' : tlSigned(diff)}</strong>
                                {diff !== null && diff !== 0 && <span>{diff > 0 ? 'Kasada fazla var' : 'Kasada eksik var'}</span>}
                            </div>
                        </div>
                        <input className="kd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Not (isteğe bağlı) — örn. 200 TL bozuk para ayrıldı" maxLength={200} disabled={!closingsAvailable} />
                        {closing && drift !== 0 && (
                            <div className="kd-warn">Kapanıştan sonra nakit hareket değişti: beklenen {tl(closing.expectedCash)} → {tl(s.expectedCash)}. Yeniden sayıp kapatın.</div>
                        )}
                        {!closingsAvailable && <div className="kd-warn">Kasa kapanış kaydı henüz etkin değil (veritabanı göçü 133 bekliyor). Rapor ve yazdırma çalışır.</div>}
                        <div className="kd-count-actions">
                            <button type="button" className="kd-btn" onClick={onOpenMoves}><ReceiptText size={15} />Hareketleri gör</button>
                            <button type="button" className="kd-btn is-primary" disabled={!closingsAvailable || busy || countedNum === null || Number.isNaN(countedNum) || countedNum < 0} onClick={() => void doClose()}>
                                <Lock size={15} />{busy ? 'Kaydediliyor…' : closing ? 'Yeniden kapat' : 'Kasayı kapat'}
                            </button>
                        </div>
                    </section>

                    {closingsAvailable && closings.length > 0 && (
                        <section className="kd-card">
                            <h3>Son kapanışlar</h3>
                            {closings.slice(0, 7).map((c) => (
                                <button key={c.id} type="button" className={`kd-line is-button${c.businessDay === day ? ' is-current' : ''}`} onClick={() => setDay(c.businessDay)}>
                                    <span>{dayLong(c.businessDay)}</span>
                                    <span className="kd-line-sub">Sayılan {tl(c.countedCash)}</span>
                                    <strong className={c.difference === 0 ? 'is-green' : c.difference > 0 ? 'is-amber' : 'is-red'}>{c.difference === 0 ? 'Fark yok' : tlSigned(c.difference)}</strong>
                                </button>
                            ))}
                        </section>
                    )}
                </div>
            </div>
            {printNode}
        </div>
    );
}
