import { useEffect, useState } from 'react';

// easeOutCubic ile 0 → target sayaç animasyonu — mobil genelinde paylaşılan tek kopya
// (MobileHome/MobileMasaHome/hizmetDesign'daki kopyalar buraya taşındı).
export function useTicker(target: number, dur = 900, delay = 200) {
    const [v, setV] = useState(0);
    useEffect(() => {
        let raf = 0;
        const t = setTimeout(() => {
            let start = 0;
            const tick = (now: number) => {
                if (!start) start = now;
                const p = Math.min((now - start) / dur, 1);
                setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
                if (p < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        }, delay);
        return () => { clearTimeout(t); cancelAnimationFrame(raf); };
    }, [target, dur, delay]);
    return v;
}

// Dakikada bir artan sayaç — "şimdi"ye bağlı türetilmiş değerleri (bugünün
// tarihi, ⏱ geçen süre, bekleme dakikası) canlı tutmak için render'ı tetikler.
export function useMinuteTick() {
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);
}
