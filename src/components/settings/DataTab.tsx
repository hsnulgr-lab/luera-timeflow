import { useMemo, useRef, useState } from 'react';
import { Download, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '@/contexts/ThemeContext';
import { useReservations } from '@/hooks/useReservations';
import { useDataTransfer } from '@/hooks/useDataTransfer';
import { parseCsv, toCsv, downloadCsv } from '@/lib/csv';
import {
    EXPORT_DATASETS, IMPORT_SPECS, importSpec, autoMapHeaders, prepareImport,
    type ImportDatasetId, type PreparedImport, type RawRow,
} from '@/lib/dataTransfer';
import type { Service } from '@/types';

// Ayarlar → Veri (Faz 2.6 / 2.6b).
//
// İki soruya cevap verir ve ikisi de satış görüşmesinde sorulur:
//   "Verimi istediğimde alabilir miyim?"  → dışa aktarma
//   "Elimdeki müşteri listesini taşır mı?" → içe aktarma
// Cevap "hayır" ise salon bağlanmıyor; bu yüzden ekran gizli bir köşede değil,
// kendi sekmesinde duruyor.

const LT = {
    ink: '#0E0E0E', surface: '#FAF7F3', surface2: '#F0E9DF', surface3: '#E9E1D5',
    border: 'rgba(14,14,14,0.09)', border2: 'rgba(14,14,14,0.14)',
    muted: 'rgba(14,14,14,0.48)', muted2: 'rgba(14,14,14,0.30)',
    r: '14px', rSm: '10px', rXs: '7px',
};
const DT = {
    ink: '#F3EDE3', surface: '#111009', surface2: '#191610', surface3: '#231E18',
    border: 'rgba(243,237,227,0.08)', border2: 'rgba(243,237,227,0.20)',
    muted: 'rgba(243,237,227,0.45)', muted2: 'rgba(243,237,227,0.28)',
    r: '14px', rSm: '10px', rXs: '7px',
};

const OK = '#5DBB63';
const WARN = '#E8973C';
const BAD = '#C94040';
const SERVICE_COLORS = ['#CCFF00', '#FF5A1F', '#5DBB63', '#4A90D9', '#C77DFF', '#E8973C'];

export function DataTab() {
    const { dark } = useTheme();
    const T = dark ? DT : LT;
    const { settings, updateSettings } = useReservations();
    const { busy, exportDataset, loadExistingKeys, importRows } = useDataTransfer();

    // ── İçe aktarma durumu ──
    const [importId, setImportId] = useState<ImportDatasetId>('customers');
    const [headers, setHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<string, number | null>>({});
    const [existing, setExisting] = useState<Set<string>>(new Set());
    const [fileName, setFileName] = useState('');
    const [writing, setWriting] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const spec = importSpec(importId);

    const prepared: PreparedImport | null = useMemo(() => {
        if (rawRows.length === 0) return null;
        return prepareImport(rawRows, spec, mapping, existing);
    }, [rawRows, spec, mapping, existing]);

    const reset = () => {
        setHeaders([]); setRawRows([]); setMapping({}); setFileName('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const pickDataset = (id: ImportDatasetId) => { setImportId(id); reset(); };

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        const text = await file.text();
        const parsed = parseCsv(text);
        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
            toast.error('Dosyada okunabilir satır bulunamadı');
            return;
        }
        const nextSpec = importSpec(importId);
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);
        setMapping(autoMapHeaders(parsed.headers, nextSpec));
        setFileName(file.name);
        setExisting(await loadExistingKeys(importId, (settings.services || []).map((s) => s.name)));
    };

    const downloadTemplate = () => {
        const [head, ...rows] = spec.sample;
        downloadCsv(
            `sablon-${spec.id}.csv`,
            toCsv(rows, head.map((h, i) => ({ header: h, value: (r: string[]) => r[i] }))),
        );
    };

    const runImport = async () => {
        if (!prepared || prepared.counts.new === 0) return;
        setWriting(true);
        try {
            if (importId === 'services') {
                // Hizmetler tabloda değil ayarların içinde; yazımı burada yapıyoruz.
                const added: Service[] = prepared.rows
                    .filter((r) => r.status === 'new')
                    .map((r, i) => ({
                        id: `svc-${Date.now()}-${i}`,
                        name: String(r.values.name),
                        duration: Number(r.values.duration) || 30,
                        color: SERVICE_COLORS[i % SERVICE_COLORS.length],
                        ...(r.values.price !== undefined ? { price: Number(r.values.price) } : {}),
                        ...(r.values.recallDays !== undefined ? { recallDays: Number(r.values.recallDays) } : {}),
                    }));
                updateSettings({ ...settings, services: [...(settings.services || []), ...added] });
                toast.success(`${added.length} hizmet eklendi`, { description: 'Hizmetler sekmesinden düzenleyebilirsiniz.' });
                reset();
                return;
            }
            const { inserted, failed } = await importRows(importId, prepared.rows);
            if (inserted > 0) {
                toast.success(`${inserted} kayıt eklendi`, {
                    description: failed > 0 ? `${failed} satır yazılamadı.` : undefined,
                });
                reset();
            } else {
                toast.error('Hiçbir kayıt eklenemedi');
            }
        } finally {
            setWriting(false);
        }
    };

    const label = (t: string) => (
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.muted, marginBottom: '10px' }}>{t}</div>
    );

    return (
        <div>
            {/* ── Dışa aktarma ── */}
            {label('Verilerimi İndir')}
            <div style={{ fontSize: '12.5px', color: T.muted, marginBottom: '14px', lineHeight: 1.5 }}>
                Her dosya Excel'de doğrudan açılır. Verileriniz size aittir; istediğiniz an tamamını indirebilirsiniz.
            </div>

            <div style={{ display: 'grid', gap: '8px', marginBottom: '28px' }}>
                {EXPORT_DATASETS.map((d) => {
                    const isBusy = busy === d.id;
                    return (
                        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.rSm }}>
                            <FileSpreadsheet size={16} color={T.muted} style={{ flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: T.ink }}>{d.label}</div>
                                <div style={{ fontSize: '11.5px', color: T.muted, marginTop: '1px' }}>{d.hint}</div>
                            </div>
                            <button
                                onClick={async () => {
                                    const local: RawRow[] | undefined = d.id === 'services'
                                        ? (settings.services || []) as unknown as RawRow[]
                                        : undefined;
                                    const count = await exportDataset(d, local);
                                    if (count === 0) toast('Bu listede kayıt yok', { description: 'Yine de boş bir başlık dosyası indirildi.' });
                                }}
                                disabled={Boolean(busy)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 13px', borderRadius: T.rXs, border: `1px solid ${T.border2}`, background: T.surface, color: T.ink, fontSize: '12px', fontWeight: 650, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: busy && !isBusy ? 0.5 : 1, flexShrink: 0 }}>
                                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                                CSV
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* ── İçe aktarma ── */}
            {label('Veri Aktar')}
            <div style={{ fontSize: '12.5px', color: T.muted, marginBottom: '14px', lineHeight: 1.5 }}>
                Elinizdeki listeyi Excel'de <strong style={{ color: T.ink }}>Farklı Kaydet → CSV</strong> ile kaydedin, sonra buraya yükleyin.
                Sütunlar otomatik tanınır; yanlış eşleşirse aşağıdan düzeltebilirsiniz.
            </div>

            <div style={{ display: 'flex', gap: '2px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: '4px', marginBottom: '14px' }}>
                {IMPORT_SPECS.map((s) => {
                    const active = importId === s.id;
                    return (
                        <button key={s.id} onClick={() => pickDataset(s.id)}
                            style={{ flex: 1, padding: '7px 10px', borderRadius: T.rXs, background: active ? T.surface : 'transparent', border: `1px solid ${active ? T.border : 'transparent'}`, fontSize: '12px', fontWeight: active ? 700 : 500, color: active ? T.ink : T.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {s.label}
                        </button>
                    );
                })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
                <button onClick={() => fileRef.current?.click()}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: T.rSm, border: 'none', background: dark ? '#231E18' : '#0E0E0E', color: '#F3EDE3', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Upload size={13} />CSV dosyası seç
                </button>
                <button onClick={downloadTemplate}
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px', borderRadius: T.rSm, border: `1px solid ${T.border2}`, background: T.surface, color: T.muted, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <Download size={13} />Örnek şablon
                </button>
                {fileName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: T.muted, padding: '9px 4px' }}>
                        <FileSpreadsheet size={13} />{fileName}
                    </div>
                )}
                <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => handleFile(e.target.files?.[0])} style={{ display: 'none' }} />
            </div>

            {prepared && (
                <div style={{ border: `1px solid ${T.border}`, borderRadius: T.rSm, overflow: 'hidden' }}>
                    {/* Sütun eşleme */}
                    <div style={{ padding: '14px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: T.ink, marginBottom: '10px' }}>Sütun eşleme</div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                            {spec.fields.map((f) => (
                                <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{ width: 110, fontSize: '12px', color: T.ink, flexShrink: 0 }}>
                                        {f.label}{f.required && <span style={{ color: BAD }}> *</span>}
                                    </div>
                                    <select
                                        value={mapping[f.key] ?? -1}
                                        onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) === -1 ? null : Number(e.target.value) })}
                                        style={{ flex: 1, padding: '7px 9px', borderRadius: T.rXs, border: `1px solid ${T.border2}`, background: T.surface, color: T.ink, fontSize: '12px', fontFamily: 'inherit' }}>
                                        <option value={-1}>— aktarma —</option>
                                        {headers.map((h, i) => <option key={i} value={i}>{h || `Sütun ${i + 1}`}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Özet */}
                    <div style={{ display: 'flex', gap: '18px', padding: '13px 14px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
                        <Stat icon={<CheckCircle2 size={13} color={OK} />} color={OK} n={prepared.counts.new} text="eklenecek" T={T} />
                        <Stat icon={<Info size={13} color={T.muted} />} color={T.muted} n={prepared.counts.duplicate} text="zaten kayıtlı" T={T} />
                        <Stat icon={<AlertTriangle size={13} color={BAD} />} color={BAD} n={prepared.counts.invalid} text="hatalı" T={T} />
                    </div>

                    {/* Önizleme — ilk 12 satır */}
                    <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                        {prepared.rows.slice(0, 12).map((r) => (
                            <div key={r.line} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderBottom: `1px solid ${T.border}`, fontSize: '12px' }}>
                                <span style={{ width: 26, color: T.muted2, fontSize: '11px', flexShrink: 0 }}>{r.line}</span>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: r.status === 'new' ? OK : r.status === 'duplicate' ? WARN : BAD }} />
                                <span style={{ flex: 1, minWidth: 0, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {spec.fields.map((f) => r.values[f.key]).filter(Boolean).join(' · ') || '—'}
                                </span>
                                {r.problem && <span style={{ color: r.status === 'invalid' ? BAD : T.muted, fontSize: '11.5px', flexShrink: 0 }}>{r.problem}</span>}
                            </div>
                        ))}
                        {prepared.rows.length > 12 && (
                            <div style={{ padding: '9px 14px', fontSize: '11.5px', color: T.muted }}>
                                …ve {prepared.rows.length - 12} satır daha
                            </div>
                        )}
                    </div>

                    {/* Aksiyon */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 14px', background: T.surface2 }}>
                        <button onClick={runImport} disabled={writing || prepared.counts.new === 0}
                            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: T.rSm, border: 'none', background: prepared.counts.new > 0 ? OK : T.surface3, color: prepared.counts.new > 0 ? '#fff' : T.muted2, fontSize: '12.5px', fontWeight: 700, cursor: writing || prepared.counts.new === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            {writing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                            {prepared.counts.new} kaydı aktar
                        </button>
                        <button onClick={reset}
                            style={{ padding: '9px 14px', borderRadius: T.rSm, border: `1px solid ${T.border2}`, background: 'none', color: T.muted, fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                            Vazgeç
                        </button>
                        <span style={{ fontSize: '11.5px', color: T.muted, lineHeight: 1.4 }}>
                            Mevcut kayıtların üzerine yazılmaz — yalnız yeni satırlar eklenir.
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ icon, color, n, text, T }: { icon: React.ReactNode; color: string; n: number; text: string; T: typeof LT }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {icon}
            <span style={{ fontSize: '13px', fontWeight: 800, color }}>{n}</span>
            <span style={{ fontSize: '12px', color: T.muted }}>{text}</span>
        </div>
    );
}
