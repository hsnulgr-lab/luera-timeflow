import {
    Briefcase, Dumbbell, Gem, Heart, MessageSquare, Scale, Scissors,
    Sparkles, Stethoscope, UtensilsCrossed, Wand2, Waves, Zap,
    type LucideIcon,
} from 'lucide-react';

// Sektör → ikon eşlemesi.
//
// Ayrı bir registry çünkü kod tabanının kuralı bu: sektör davranışı saf
// registry dosyalarında yaşar, bileşenin içinde `if (sector === ...)` yazılmaz.
// İkon da bir sektör davranışıdır — bugün yalnız kurulum sihirbazının kart
// ızgarası okuyor ama sektör seçtiren her yüzey (Ayarlar, org değiştirici)
// aynı yerden okumalı ki ikonlar ekrandan ekrana değişmesin.
//
// sectorProfiles.ts'e KONMADI: o dosya saf veri ve node testlerinden doğrudan
// import ediliyor; JSX/lucide bağımlılığı oraya girerse testler kırılır.

export const SECTOR_ICON: Record<string, LucideIcon> = {
    guzellik: Sparkles,
    kuafor: Scissors,
    berber: Zap,
    estetik: Wand2,
    dis: Gem,
    saglik: Stethoscope,
    fizyoterapi: Waves,
    tattoo: Heart,
    avukat: Scale,
    danismanlik: MessageSquare,
    gym: Dumbbell,
    gelinlikci: Sparkles,
    restoran: UtensilsCrossed,
    genel: Briefcase,
};

export const iconForSector = (sector?: string | null): LucideIcon =>
    SECTOR_ICON[sector || 'genel'] ?? Briefcase;
