// Kuaför sayfalarının paylaştığı saf biçimlendirme yardımcıları.
// Bileşen dosyasından ayrı tutulur: aynı dosyadan hem bileşen hem yardımcı
// export edilince fast refresh çalışmıyor (react-refresh/only-export-components).

export function initialsOf(name: string) {
    return name.trim().split(/\s+/).map((word) => word[0]).filter(Boolean).slice(0, 2).join('').toLocaleUpperCase('tr') || '?';
}

export function minutesOf(time: string) {
    const [hour, minute = 0] = time.split(':').map(Number);
    return hour * 60 + minute;
}

export function timeOf(total: number) {
    const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number) {
    return timeOf(minutesOf(time) + minutes);
}

export function moneyOf(value: number) {
    return `₺${Math.round(value).toLocaleString('tr-TR')}`;
}

export function dateLabel(iso: string, options?: Intl.DateTimeFormatOptions) {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', options || {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    });
}
