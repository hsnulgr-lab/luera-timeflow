import type { FieldDef } from '@/lib/sectorProfiles';

type CFValues = Record<string, string | number | boolean>;

// Sektöre özel alanların form bölümü — hem masaüstü hem mobil formlarda kullanılır.
// Alan tanımları sektör şablonundan gelir (profileForSector().customFieldTemplates);
// stil, çağıran formun tema tokenlarıyla (T) uyumlu nötr inline-style.
interface Props {
    defs: FieldDef[];
    values: CFValues;
    onChange: (next: CFValues) => void;
    T: { ink: string; muted: string; surface2: string; border2: string; rSm?: string | number };
}

export const CustomFieldsSection = ({ defs, values, onChange, T }: Props) => {
    if (!defs.length) return null;
    const set = (key: string, v: string | number | boolean) => onChange({ ...values, [key]: v });
    const inputStyle: React.CSSProperties = {
        width: '100%', background: T.surface2, border: `1px solid ${T.border2}`,
        borderRadius: T.rSm ?? 10, padding: '10px 13px', fontFamily: 'inherit',
        fontSize: '13.5px', color: T.ink, outline: 'none',
    };
    return (
        <>
            {defs.map((f) => (
                <div key={f.key} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: T.muted, marginBottom: 6 }}>
                        {f.label}{f.required ? ' *' : ''}
                    </div>
                    {f.type === 'select' ? (
                        <select value={String(values[f.key] ?? '')} onChange={(e) => set(f.key, e.target.value)} style={inputStyle}>
                            <option value="">Seçiniz</option>
                            {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                    ) : f.type === 'checkbox' ? (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.ink, cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
                            {f.label}
                        </label>
                    ) : (
                        <input
                            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                            value={String(values[f.key] ?? '')}
                            onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
                            style={inputStyle}
                        />
                    )}
                </div>
            ))}
        </>
    );
};

// Detay görünümü — kayıtlı özel alan değerlerini salt-okunur listeler.
export const CustomFieldsDisplay = ({ defs, values, T }: Omit<Props, 'onChange'>) => {
    const filled = defs.filter((f) => values[f.key] !== undefined && values[f.key] !== '');
    if (!filled.length) return null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filled.map((f) => (
                <div key={f.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
                    <span style={{ color: T.muted, flexShrink: 0 }}>{f.label}</span>
                    <span style={{ color: T.ink, fontWeight: 650, textAlign: 'right' }}>
                        {typeof values[f.key] === 'boolean' ? (values[f.key] ? 'Evet' : 'Hayır') : String(values[f.key])}
                    </span>
                </div>
            ))}
        </div>
    );
};
