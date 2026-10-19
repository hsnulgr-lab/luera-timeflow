/**
 * A12 · Verileriniz (eski "Veri" sekmesi — DataTab'ın yerini aldı).
 *
 * İki soruya cevap verir ve ikisi de satış görüşmesinde sorulur:
 *   "Verimi istediğimde alabilir miyim?"  → İndir (her biri CSV)
 *   "Elimdeki müşteri listesini taşır mı?" → Aktar (dosya → sütun eşleme → sonuç)
 *
 * Eşleme tasarımdaki yönde: DOSYADAKİ her sütun için bir TimeFlow alanı
 * seçilir (iç model hâlâ alan → sütun; `autoMapHeaders` aynen). Yalnız yeni
 * satırlar yazılır; mükerrer ve hatalı satırlar sayılır ama aktarılmaz.
 * Satır bazında "neden yazılamadı" bugün bilinmiyor — uydurulmaz.
 */
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useReservations } from '@/hooks/useReservations';
import { useDataTransfer } from '@/hooks/useDataTransfer';
import { parseCsv, toCsv, downloadCsv } from '@/lib/csv';
import {
    EXPORT_DATASETS, IMPORT_SPECS, importSpec, autoMapHeaders, prepareImport,
    type ImportDatasetId, type PreparedImport, type RawRow,
} from '@/lib/dataTransfer';
import type { Service } from '@/types';
import { SERVICE_SWATCHES } from '../ayarlarModel';
import { Dots, Head, I, Seg } from '../parcalar';

type Result = { kind: 'ok'; inserted: number; failed: number } | { kind: 'none' } | { kind: 'empty' };

export function Verileriniz() {
    const { settings, updateSettings } = useReservations();
    const { busy, exportDataset, loadExistingKeys, importRows } = useDataTransfer();

    const [importId, setImportId] = useState<ImportDatasetId>('customers');
    const [headers, setHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<string[][]>([]);
    const [mapping, setMapping] = useState<Record<string, number | null>>({});
    const [existing, setExisting] = useState<Set<string>>(new Set());
    const [fileName, setFileName] = useState('');
    const [writing, setWriting] = useState(false);
    const [result, setResult] = useState<Result | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const spec = importSpec(importId);

    const prepared: PreparedImport | null = useMemo(
        () => (rawRows.length === 0 ? null : prepareImport(rawRows, spec, mapping, existing)),
        [rawRows, spec, mapping, existing],
    );

    const reset = () => {
        setHeaders([]); setRawRows([]); setMapping({}); setFileName('');
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleFile = async (file: File | undefined) => {
        if (!file) return;
        setResult(null);
        const parsed = parseCsv(await file.text());
        if (parsed.headers.length === 0 || parsed.rows.length === 0) { setResult({ kind: 'empty' }); return; }
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);
        setMapping(autoMapHeaders(parsed.headers, spec));
        setFileName(file.name);
        setExisting(await loadExistingKeys(importId, (settings.services || []).map((s) => s.name)));
    };

    const downloadTemplate = () => {
        const [head, ...rows] = spec.sample;
        downloadCsv(`sablon-${spec.id}.csv`, toCsv(rows, head.map((h, i) => ({ header: h, value: (r: string[]) => r[i] }))));
    };

    /** Sütun → alan seçimi (iç model alan → sütun; bir alan tek sütuna). */
    const fieldOfColumn = (col: number) => spec.fields.find((f) => mapping[f.key] === col)?.key ?? '';
    const setColumnField = (col: number, fieldKey: string) => {
        const next = { ...mapping };
        for (const f of spec.fields) if (next[f.key] === col) next[f.key] = null;
        if (fieldKey) next[fieldKey] = col;
        setMapping(next);
    };

    const runImport = async () => {
        if (!prepared || prepared.counts.new === 0) return;
        setWriting(true);
        try {
            if (importId === 'services') {
                // Hizmetler tabloda değil ayarların içinde; yazımı burada yapıyoruz.
                const added: Service[] = prepared.rows.filter((r) => r.status === 'new').map((r, i) => ({
                    id: `svc-${Date.now()}-${i}`,
                    name: String(r.values.name),
                    duration: Number(r.values.duration) || 30,
                    color: SERVICE_SWATCHES[i % SERVICE_SWATCHES.length],
                    ...(r.values.price !== undefined ? { price: Number(r.values.price) } : {}),
                    ...(r.values.recallDays !== undefined ? { recallDays: Number(r.values.recallDays) } : {}),
                }));
                const ok = await updateSettings({ ...settings, services: [...(settings.services || []), ...added] });
                setResult(ok ? { kind: 'ok', inserted: added.length, failed: 0 } : { kind: 'none' });
                if (ok) reset();
                return;
            }
            const { inserted, failed } = await importRows(importId, prepared.rows);
            if (inserted > 0) { setResult({ kind: 'ok', inserted, failed }); reset(); }
            else setResult({ kind: 'none' });
        } finally {
            setWriting(false);
        }
    };

    return (
        <div className="ay-col">
            <Head title="Verileriniz" lead="Verileriniz size aittir; istediğiniz an tamamını indirebilirsiniz." />

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingBottom: 10 }}>
                <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.015em' }}>İndir</h2>
                <span className="ay-help">Her biri CSV; Excel'de doğrudan açılır.</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bd)' }}>
                {EXPORT_DATASETS.map((dset) => (
                    <div key={dset.id} style={{ display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto', gap: 14, alignItems: 'center', padding: '14px 0', borderTop: '1px solid var(--bd)' }}>
                        <I n="doc" style={{ color: 'var(--tx2)' }} />
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 16, fontWeight: 700 }}>{dset.label}</span>
                            <span className="ay-help">{dset.hint}</span>
                        </span>
                        <button type="button" className="ay-btn h40" disabled={Boolean(busy)} onClick={async () => {
                            const local: RawRow[] | undefined = dset.id === 'services' ? (settings.services || []) as unknown as RawRow[] : undefined;
                            const count = await exportDataset(dset, local);
                            if (count === 0) toast('Bu listede kayıt yok', { description: 'Yine de boş bir başlık dosyası indirildi.' });
                        }}>
                            {busy === dset.id ? <Dots small /> : <I n="dl" />}CSV indir
                        </button>
                    </div>
                ))}
            </div>

            <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.015em', marginTop: 40, paddingBottom: 12 }}>Aktar</h2>

            {!prepared ? (
                <>
                    <div style={{ alignSelf: 'flex-start' }}>
                        <Seg label="Ne aktarılacak" value={importId} onChange={(id) => { setImportId(id); reset(); setResult(null); }}
                            options={IMPORT_SPECS.map((s) => ({ v: s.id, t: s.label }))} />
                    </div>
                    <p style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--tx2)', marginTop: 14, maxWidth: 620 }}>
                        Elinizdeki listeyi Excel'de <b style={{ color: 'var(--tx)' }}>Farklı Kaydet → CSV</b> ile kaydedin, sonra buraya yükleyin.
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
                        <button type="button" className="ay-btn h44" onClick={() => fileRef.current?.click()}><I n="up" />CSV dosyası seç</button>
                        <button type="button" className="ay-link-btn" onClick={downloadTemplate}>Örnek şablon</button>
                        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => void handleFile(e.target.files?.[0])} />
                    </div>
                </>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 20, fontWeight: 800 }}>Sütunları eşleyin</span>
                        <span className="mono" style={{ fontSize: 12.5, color: 'var(--tx2)' }}>2 / 3 · {fileName} · {rawRows.length} satır</span>
                    </div>
                    <p style={{ fontSize: 15, color: 'var(--tx2)' }}>Sütunlar otomatik tanınır; yanlış eşleşirse düzeltin.</p>
                    <div role="table" style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--bd)' }}>
                        <div role="row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 230px', gap: 16, padding: '0 0 10px', fontSize: 13.5, fontWeight: 700, color: 'var(--tx2)' }}>
                            <span>Dosyadaki sütun</span><span>İlk satır</span><span>TimeFlow alanı</span>
                        </div>
                        {headers.map((h, col) => {
                            const fk = fieldOfColumn(col);
                            return (
                                <div role="row" key={col} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 230px', gap: 16, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--bd)' }}>
                                    <span style={{ fontSize: 15.5, fontWeight: 700 }}>{h || `Sütun ${col + 1}`}</span>
                                    <span style={{ fontSize: 14.5, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rawRows[0]?.[col] ?? ''}</span>
                                    <select className="ay-select sm" aria-label={`${h || `Sütun ${col + 1}`} eşleşmesi`} value={fk}
                                        style={{ height: 42, fontWeight: 700, borderColor: fk ? undefined : 'var(--am)', color: fk ? 'var(--tx)' : 'var(--tx2)' }}
                                        onChange={(e) => setColumnField(col, e.target.value)}>
                                        <option value="">Eşleşmedi — seçin</option>
                                        {spec.fields.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>)}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 14, fontWeight: 600, color: 'var(--tx2)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="ay-dot s8 ok" /><b style={{ color: 'var(--tx)' }}>{prepared.counts.new}</b> eklenecek</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="ay-dot s8 warn" /><b style={{ color: 'var(--tx)' }}>{prepared.counts.duplicate}</b> zaten kayıtlı</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span className="ay-dot s8 bad" /><b style={{ color: 'var(--tx)' }}>{prepared.counts.invalid}</b> hatalı</span>
                    </div>
                    <span className="ay-help">Mevcut kayıtların üzerine yazılmaz — yalnız yeni satırlar eklenir.</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <button type="button" className="ay-btn h44" disabled={writing} onClick={reset}>Geri</button>
                        <button type="button" className="ay-btn-pri" disabled={writing || prepared.counts.new === 0} onClick={() => void runImport()}>
                            {writing && <Dots small />}{prepared.counts.new} satırı aktar
                        </button>
                    </div>
                </div>
            )}

            {result && (
                <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--bd2)' }}>
                    {result.kind === 'ok' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, flexWrap: 'wrap' }}>
                            <span className="ay-dot s9 ok" />{result.inserted} kayıt eklendi
                            {result.failed > 0 && <><span style={{ color: 'var(--tx3)' }}>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="ay-dot s9 warn" />{result.failed} satır yazılamadı</span></>}
                        </div>
                    )}
                    {result.kind === 'none' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700 }}><span className="ay-dot s9 bad" />Hiçbir kayıt eklenemedi.</div>}
                    {result.kind === 'empty' && <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700 }}><span className="ay-dot s9 bad" />Dosyada okunabilir satır bulunamadı.</div>}
                </div>
            )}
        </div>
    );
}
