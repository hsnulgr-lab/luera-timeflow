// Hitap — "Nisa Hanım", "Furkan Bey".
//
// Kullanıcı kararı (2026-11-06): asistan ve bütün şablonlar müşteriye adı ve
// Hanım/Bey ile hitap eder. Müşteri kaydında cinsiyet yok; ad yaygın bir kadın
// ya da erkek adıysa unvan eklenir. Deniz, Umut gibi iki cinste de kullanılan
// ya da listede olmayan adda unvan EKLENMEZ: yanlış unvan, unvansız hitaptan
// kötüdür.
//
// Saf modül: tests/wa-booking.test.mjs doğrudan import eder.

const FEMALE = new Set(`
ayse fatma emine hatice zeynep elif meryem sultan hulya hulya esra merve busra kubra
tugba ozlem ozge ozden dilek derya sevgi sevim sevda gul gulsen gulay gulsum gulten
gulizar nur nuray nurten nurcan nurhan nursel nermin neslihan nesrin nilay nilufer
nisa nisanur nazli naz nazan nalan nihal nil nilgun ebru eda ecem ece ezgi eylul
esma asli aslihan aysel aysegul aynur aylin ayten aysun aysu aycan ayca ayla ayfer
aygul ayben cansu canan cemre cigdem damla defne dilara dilan didem duygu duru
elcin elvan emel emine esin esen feride filiz funda gamze gizem gonul gozde gulcan
hande hacer hale handan havva hilal ilknur ilayda ipek irem kader kevser lale leyla
melek melike melis melisa meltem mine mukaddes muge nazife nebahat necla nevin
nida oya pelin pinar rabia reyhan rukiye sabriye saadet safiye sanem seda sedef
selda selen selin selma semra serap serpil sevil sibel simge sinem songul tulay tulin
tuba tuana yagmur yasemin yesim yeliz yildiz zehra zerrin zuhal zubeyde beyza
berna berfin betul bahar banu basak bengu beril bilge birsen buse canset cennet
dicle dondu dudu esengul fadime fatmanur gulbahar gulnur gulseren hacer
hanife hatun hayriye hediye huriye kadriye kezban latife makbule mediha melahat
munevver nefise nezihe pakize rahime rezzan samiye sevinc sukran semiha songul
sule sukriye tulay umran yeter zekiye zeliha zeynep almila azra asya alya ela
elif ecrin hira lina mira nehir zumra miray sude hazal ebrar sudenaz eslem
`.trim().split(/\s+/));

const MALE = new Set(`
mehmet mustafa ahmet ali huseyin hasan ibrahim ismail osman yusuf murat omer
ramazan halil suleyman abdullah mahmut recep salih kemal fatih emre burak serkan
erkan erdem erhan ercan erkan enes emin eren ersin ertan ertugrul eyup furkan
gokhan gokay hakan halit haluk harun hayati hikmet ilhan ilker irfan kadir kaan
kerem kenan koray levent mert metin mesut muhammed muharrem murat musa necati
nedim nihat nuri okan oguz oguzhan onur orhan ozan ozgur polat rasim rifat riza
sait sami samet sedat selim selcuk semih sefa serdar sinan suat taner tarik tayfun
tolga tuncay turgay ugur umit volkan yasin yavuz yilmaz yunus zafer zeki baris
batuhan berk berkay bora bulent cem cemal cengiz cihan cuneyt doruk efe egemen
ekrem emir emrah engin eray erol ferhat fikret gurkan hamza hasan huseyin kagan
kubilay mehmetcan melih mucahit nazim nevzat oktay omer onder ozkan ridvan sadik
saban sahin sukru tahir talha tamer tugay turan ufuk utku vedat yakup yigit yuksel
zekeriya alparslan arda aras atakan ayaz baran bilal burhan caner cagri caglar
cagatay dogan dogukan durmus eymen fevzi galip hidir ilyas kamil kursat lutfi
mithat muammer nail namik necip nurettin orhan ozer recai sabri sefer selahattin
seyit sezai sinasi soner talat tuncer vahit veli yahya yasar yusuf zihni alper
anil berkan cenk emirhan halil hakki hilmi ihsan ismet kazim mahir
mumin nazmi oner ozcan rahmi refik ruhi sabahattin taha tevfik tuna
yalcin yener yetkin zeyd eymen mirac
`.trim().split(/\s+/));

/** Türkçe harfleri ASCII'ye katlar; liste anahtarları bu biçimde yazıldı. */
function fold(s: string): string {
    return s
        .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
        .replace(/Ş/g, 's').replace(/ş/g, 's')
        .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
        .replace(/Ü/g, 'u').replace(/ü/g, 'u')
        .replace(/Ö/g, 'o').replace(/ö/g, 'o')
        .replace(/Ç/g, 'c').replace(/ç/g, 'c')
        .toLowerCase().trim();
}

export type Title = 'Hanım' | 'Bey' | null;

/** Adın unvanı; bilinmiyor ya da iki cinste kullanılıyorsa null. */
export function titleFor(firstName: string | null | undefined): Title {
    const n = fold(String(firstName ?? ''));
    if (!n) return null;
    const f = FEMALE.has(n);
    const m = MALE.has(n);
    if (f && !m) return 'Hanım';
    if (m && !f) return 'Bey';
    return null;
}

/** "Nisa" → "Nisa Hanım"; unvanı bilinmeyen ad olduğu gibi döner. */
export function withTitle(firstName: string | null | undefined): string | null {
    const first = String(firstName ?? '').trim();
    if (!first) return null;
    const t = titleFor(first);
    return t ? `${first} ${t}` : first;
}
