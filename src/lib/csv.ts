// CSV okuma/yazma — TEK KAYNAK. Bağımlılık yok (bkz. 2.6/2.6b).
//
// Neden elle yazıldı: bundle zaten 2 MB; SheetJS tek başına ~600 KB ekliyor ve
// buradaki ihtiyaç RFC 4180'in tamamı değil. Salonun Excel'i CSV'yi sorunsuz
// açıyor — yeter ki iki tuzağa düşmeyelim:
//
//  1) AYRAÇ. Excel'in Türkçe yerelinde liste ayracı NOKTALI VİRGÜLdür. Virgülle
//     yazılan dosya tek sütuna yapışık açılır ve kullanıcı "veri bozuk" der.
//     Yazarken ';' kullanıyoruz, OKURKEN ayracı dosyadan tespit ediyoruz
//     (başka programdan gelen dosya virgüllü olabilir).
//  2) BOM. UTF-8 BOM'suz dosyada Excel Türkçe karakterleri bozar (ÅŸ, Ä±).
//     download() BOM ekler; parse() gelen BOM'u atar.

export const CSV_DELIMITER = ';';

/**
 * Formül enjeksiyonu koruması. Excel/Sheets, '=' '+' '-' '@' ile başlayan bir
 * hücreyi FORMÜL olarak çalıştırır; müşteri adına `=HYPERLINK(...)` yazan biri
 * dışa aktarılan dosyayı açan kişide kod çalıştırabilir. Değeri bozmadan
 * zararsızlaştırmanın standart yolu başına tek tırnak koymaktır.
 */
function neutralize(value: string): string {
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function quote(value: string, delimiter: string): string {
    const needs = value.includes(delimiter) || value.includes('"')
        || value.includes('\n') || value.includes('\r');
    return needs ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface CsvColumn<T> {
    header: string;
    /** Hücre değeri. undefined/null boş hücre olur. */
    value: (row: T) => string | number | boolean | null | undefined;
}

/** Satırları CSV metnine çevirir. Sonucu download() ile indir. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], delimiter = CSV_DELIMITER): string {
    const cell = (raw: string | number | boolean | null | undefined): string => {
        if (raw === null || raw === undefined) return '';
        return quote(neutralize(String(raw)), delimiter);
    };
    const lines = [columns.map((c) => cell(c.header)).join(delimiter)];
    for (const row of rows) {
        lines.push(columns.map((c) => cell(c.value(row))).join(delimiter));
    }
    // CRLF: Excel'in beklediği satır sonu.
    return lines.join('\r\n');
}

/** Metinde hangi ayracın kullanıldığını ilk satıra bakarak kestirir. */
export function detectDelimiter(text: string): string {
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    let best = CSV_DELIMITER;
    let bestCount = -1;
    for (const candidate of [';', ',', '\t', '|']) {
        // Tırnak içindekiler sayılmasın diye kaba bir temizlik yeter: başlık
        // satırında tırnaklı alan nadirdir, yanlış tahminde kullanıcı zaten
        // önizlemede görür.
        const count = (firstLine.replace(/"[^"]*"/g, '').match(
            new RegExp(candidate === '|' ? '\\|' : candidate, 'g'),
        ) || []).length;
        if (count > bestCount) { bestCount = count; best = candidate; }
    }
    return bestCount > 0 ? best : CSV_DELIMITER;
}

export interface ParsedCsv {
    headers: string[];
    rows: string[][];
    delimiter: string;
}

/**
 * CSV metnini ayrıştırır. Tırnaklı alanları, kaçışlı tırnağı ("") ve alan
 * içindeki satır sonlarını destekler. Boş satırlar atılır.
 */
export function parseCsv(input: string, forcedDelimiter?: string): ParsedCsv {
    const text = input.replace(/^\uFEFF/, '');   // BOM
    const delimiter = forcedDelimiter || detectDelimiter(text);

    const records: string[][] = [];
    let field = '';
    let record: string[] = [];
    let inQuotes = false;
    let fieldWasQuoted = false;

    const endField = () => {
        // Tırnaksız alanlarda kenar boşluğu kullanıcı hatasıdır, temizle.
        record.push(fieldWasQuoted ? field : field.trim());
        field = '';
        fieldWasQuoted = false;
    };
    const endRecord = () => {
        endField();
        if (record.some((c) => c !== '')) records.push(record);
        record = [];
    };

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += ch;
            continue;
        }
        if (ch === '"') { inQuotes = true; fieldWasQuoted = true; continue; }
        if (ch === delimiter) { endField(); continue; }
        if (ch === '\r') { if (text[i + 1] === '\n') i++; endRecord(); continue; }
        if (ch === '\n') { endRecord(); continue; }
        field += ch;
    }
    if (field !== '' || record.length > 0) endRecord();

    const headers = records.shift() || [];
    // Kısa satırları başlık uzunluğuna tamamla — eksik hücre "yok" demektir,
    // undefined okumak değil.
    const rows = records.map((r) => {
        const padded = r.slice(0, headers.length);
        while (padded.length < headers.length) padded.push('');
        return padded;
    });
    return { headers, rows, delimiter };
}

/** Tarayıcıda dosya indirir. BOM eklenir — Excel Türkçe karakterleri bozmasın. */
export function downloadCsv(filename: string, csv: string): void {
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Sekme kapanana kadar tutmanın anlamı yok; tıklama senkron başlar.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
