// Tasarım jetonları — kaynak: Claude Design "Luera Mobil - Kumanda.html".
//
// Değerler web'deki `src/index.css` (.dash-theme) ile BİREBİR aynı. İki kopya
// tutuyoruz çünkü RN'de CSS değişkeni yok; ayrışmamaları için tests/ altındaki
// karşılaştırma testi iki tarafı da okuyor.
//
// Cam katmanın kendi jetonları var (glass, glassBorder, tint): tasarımda cam
// YALNIZ kabukta kullanılıyor — üst bar, tab bar, sheet tutamağı, yüzen buton.
// İçerik yüzeyleri opak ve sıcak; bulanık zeminde metin kontrastı düşüyor ve
// hedef kitle 40–55 yaş.

export interface Palette {
    bg: string; surf: string; surf2: string; card: string;
    tx: string; tx2: string; tx3: string;
    bd: string; bd2: string;
    or: string; or2: string;
    gr: string; am: string; rd: string;
    /** Cam katman — yalnız kabukta. */
    glass: string; glassBorder: string; tint: string; sheen: string;
}

export const light: Palette = {
    bg: '#F3ECE0', surf: '#FAF7F3', surf2: '#F0E9DF', card: '#FFFDFB',
    tx: '#0E0E0E', tx2: 'rgba(14,14,14,0.52)', tx3: 'rgba(14,14,14,0.34)',
    bd: 'rgba(14,14,14,0.10)', bd2: 'rgba(14,14,14,0.18)',
    or: '#FF5A1F', or2: '#E8430F',
    gr: '#2D8F32', am: '#B87A00', rd: '#C94040',
    glass: 'rgba(250,247,243,0.72)', glassBorder: 'rgba(14,14,14,0.09)',
    tint: 'rgba(240,233,223,0.55)', sheen: 'rgba(255,255,255,0.55)',
};

export const dark: Palette = {
    bg: '#120E08', surf: '#1C1710', surf2: '#252015', card: '#241E16',
    tx: '#F3EDE3', tx2: 'rgba(243,237,227,0.58)', tx3: 'rgba(243,237,227,0.36)',
    bd: 'rgba(243,237,227,0.11)', bd2: 'rgba(243,237,227,0.20)',
    or: '#FF5A1F', or2: '#FF7A45',
    gr: '#5FBF64', am: '#D9A43B', rd: '#E07272',
    glass: 'rgba(28,23,16,0.66)', glassBorder: 'rgba(243,237,227,0.13)',
    tint: 'rgba(37,32,21,0.50)', sheen: 'rgba(243,237,227,0.09)',
};

/**
 * Dokunma hedefleri — tasarımın ölçü sözleşmesi.
 *
 * Personel ayakta, tek elle, çoğu zaman ıslak ya da eldivenli parmakla
 * dokunuyor. Bu sayılar tahmin değil, tasarım dosyasının sonundaki "React
 * Native notları" bölümünden geliyor ve hiçbiri 44'ün altına inmez.
 */
export const hit = {
    row: 62,        // liste satırı
    action: 66,     // kritik buton (İşleme başla, İşlemi bitir)
    actionSm: 60,
    icon: 44,       // ikon butonu
} as const;

/**
 * Giriş paketinin ölçü sözleşmesi.
 *
 * Bu değerler `Luera Mobil - Giris.html` içindeki gerçek CSS seçicilerinden
 * gelir. Ekranlar kendi yüksekliklerini ve yazı boyutlarını uydurmaz; normal
 * ve 375 x 667 sıkışması burada yan yana tutulur.
 */
export const authMetrics = {
    choiceHeight: 86,
    choiceHeightSmall: 78,
    secondaryActionHeight: 52,
    faceIdRing: 118,
    faceIdIcon: 52,
    biometricHeroX: 34,
    biometricHeroGap: 18,
    biometricActionsX: 18,
    biometricActionsBottom: 44,
    biometricActionsGap: 10,
    biometricNoteTop: 2,
    biometricNoteSize: 12.5,
    resumeMarkTop: 30,
    resumeMarkX: 24,
    resumeMarkSize: 26,
    resumeHeroGap: 16,
    resumeIdentityGap: 4,
    resumeAvatar: 76,
    resumeAvatarText: 26,
    resumeNameSize: 24,
    resumeBusinessSize: 14.5,
    resumeFaceTop: 6,
    resumePromptSize: 15.5,
    inputHeight: 60,
    inputHeightSmall: 56,
    sectorRowHeight: 60,
    keypadKeyHeight: 62,
    keypadKeyHeightSmall: 52,
    selectionRowHeight: 74,
    welcomeBrandSize: 44,
    welcomeBrandSizeSmall: 34,
    welcomeBrandTop: 44,
    welcomeBrandTopSmall: 26,
    welcomeBrandX: 24,
    welcomePageX: 18,
    welcomePageXSmall: 16,
    welcomeChoiceRadius: 22,
    welcomeChoiceRadiusSmall: 20,
    welcomeChoiceGap: 12,
    welcomeChoiceGapSmall: 10,
    welcomeBottom: 30,
    welcomeBottomSmall: 18,
    welcomeChoiceTitle: 19,
    welcomeChoiceTitleSmall: 18,
    welcomeChoiceSubtitle: 13.5,
    welcomeChoiceSubtitleSmall: 13,
    welcomeChoiceInnerGap: 4,
    welcomeChoiceX: 20,
    welcomeChoiceXSmall: 16,
    welcomeHelperTop: 2,
    welcomeHelperSize: 13,
    welcomeHelperSizeSmall: 12.5,
    welcomeLinkX: 12,
    welcomeTaglineWidth: 290,
    brandDotRatio: 0.22,
    brandDotLeftRatio: 0.02,
    brandDotBottomRatio: 0.04,
    topBarHeight: 52,
    topBarHeightSmall: 44,
    topBarX: 18,
    topBarRight: 12,
    topBarGap: 12,
    topBarTitleSize: 16,
    topBarSubtitleSize: 11.5,
    backOffset: -12,
    pageTitleTop: 6,
    pageTitleX: 24,
    pageTitleBottom: 20,
    pageTitleGap: 8,
    pageTitleSize: 28,
    pageTitleTracking: -0.9,
    pageTitleBodyLine: 1.45,
    formX: 18,
    formGap: 14,
    fieldGap: 7,
    fieldRadius: 18,
    fieldX: 16,
    fieldInnerGap: 10,
    fieldTextSize: 16.5,
    fieldIcon: 19,
    fieldActionIcon: 20,
    iconStroke: 1.7,
    cursorWidth: 2,
    cursorHeight: 24,
    buttonTop: 2,
    bannerRadius: 14,
    bannerX: 18,
    bannerY: 13,
    bannerTextSize: 13.5,
    bannerLine: 1.45,
    bannerTop: 14,
    recoverInfoTop: 16,
    infoBottom: 30,
    heroTop: 44,
    heroX: 34,
    heroGap: 15,
    heroRing: 80,
    heroRingSmall: 64,
    heroIcon: 32,
    heroIconSmall: 26,
    heroTitleSmall: 23,
    heroTitle: 27,
    heroBodyLine: 1.55,
    questionRowY: 13,
    questionRowX: 18,
    detailRowGap: 11,
    detailStatusSize: 12,
    noteCardPadding: 18,
    noteCardGap: 12,
    noteCardLabel: 11.5,
    noteCardBody: 14.5,
    statusTopHeroTop: 44,
    statusExtraTop: 22,
    questionTitle: 15,
    questionSubtitle: 12.5,
    actionsX: 18,
    actionsBottom: 44,
    actionsGap: 10,
    businessTitleX: 20,
    businessTitleTop: 18,
    businessTitleBottom: 12,
    businessTitleGap: 3,
    businessTitleSize: 30,
    businessSubtitleSize: 14,
    selectionRowGap: 13,
    selectionRowX: 18,
    selectionAvatar: 52,
    selectionAvatarBorder: 2,
    selectionAvatarText: 18,
    selectionTitle: 17,
    selectionSubtitle: 13,
    selectionChevron: 23,
    businessInfoTop: 18,
    businessBottom: 34,
    searchThreshold: 7,
    smallPageTitleX: 20,
    smallPageTitleBottom: 14,
    smallPageTitleGap: 5,
    smallPageTitleSize: 24,
    smallPageBodySize: 14.5,
    smallPageBodyLine: 1.35,
    smallFormX: 16,
    smallFormGap: 10,
    smallFieldGap: 5,
    smallFieldRadius: 16,
    smallPrimaryHeight: 60,
    smallPrimaryRadius: 16,
    primaryTextSize: 19,
    actionTextSize: 18,
    ghostTextSize: 16,
    noSafeAreaBottom: 24,
    resendSeconds: 60,
    staffHeroTop: 30,
    staffHeroX: 24,
    staffHeroGap: 20,
    staffMarkSize: 30,
    staffMarkDotRatio: 0.2,
    staffMarkDotLeftRatio: 0.03,
    staffMarkDotBottomRatio: 0.04,
    staffTitleSize: 31,
    staffTitleLine: 1.08,
    staffBodyLine: 1.55,
    codeGap: 9,
    codeHeight: 66,
    codeRadius: 16,
    codeTextSize: 28,
    scanHeight: 44,
    scanX: 15,
    scanGap: 7,
    scanIcon: 19,
    scanTextSize: 14.5,
    keypadX: 18,
    keypadBottom: 8,
    keypadGap: 10,
    keypadRadius: 16,
    keypadTextSize: 26,
    keypadTextSizeSmall: 23,
    keypadDeleteIcon: 24,
    pairActionTop: 12,
    pairActionBottom: 12,
    pairHelpBottom: 30,
    helpSheetTop: 22,
    helpSheetX: 20,
    helpSheetBottom: 40,
    helpSheetTravel: 520,
    helpSheetGap: 14,
    helpSheetRadius: 22,
    helpSheetTitle: 21,
    helpStepGap: 12,
    helpStepCircle: 24,
    helpStepNumber: 12.5,
    helpStepText: 14.5,
    helpStepLine: 1.5,
    staffAvatar: 64,
    staffAvatarText: 22,
    staffPinTitle: 26,
    pinDot: 16,
    pinDotGap: 16,
    pinDotBorder: 1.7,
    pinTop: 30,
    pinGap: 24,
    pinErrorBottom: 16,
    pinHelpTop: 10,
    pinHelpBottom: 44,
    staffListBottom: 46,
    hiddenInputSize: 1,
    signupStepsTop: 2,
    signupStepsX: 18,
    signupStepsBottom: 14,
    signupStepsGap: 6,
    signupStepHeight: 3,
    signupHeaderX: 24,
    signupHeaderBottom: 18,
    signupHeaderCompactBottom: 16,
    signupHeaderGap: 8,
    passwordHintGap: 7,
    passwordHintX: 2,
    passwordHintSize: 12.5,
    passwordHintLine: 1.4,
    passwordHintCircle: 14,
    passwordHintCircleTop: 2,
    passwordHintBorder: 1.5,
    passwordHintCheck: 9,
    passwordHintCheckStroke: 3.4,
    termsSize: 13,
    termsLine: 1.5,
    termsX: 2,
    sectorGap: 9,
    sectorX: 16,
    sectorRadius: 18,
    sectorTextSize: 16.5,
    sectorRadio: 22,
    sectorRadioBorder: 1.7,
    sectorCheck: 11,
    sectorNoteSize: 12.5,
    readyStepsTop: 8,
    readyHeaderTop: 14,
    readyHeaderBottom: 20,
    readyHeaderGap: 10,
    readyBodyLine: 1.5,
    readyInfoTop: 18,
    readyRowHeight: 62,
    readyRowY: 12,
    readyRowX: 18,
    readyRowGap: 13,
    readyNumberCircle: 26,
    readyNumberSize: 13,
    desktopIcon: 20,
    actionIconGap: 10,
    accountPageTitleTop: 14,
    accountPageTitleSize: 30,
    accountTopBarGap: 10,
    accountRowGap: 13,
    accountActionTop: 26,
    accountActionGap: 12,
    accountBottom: 34,
    accountDangerHintSize: 12.5,
    accountDangerHintLine: 1.45,
    deleteDialogX: 24,
    deleteDialogPadding: 20,
    deleteDialogGap: 14,
    deleteDialogTitleSize: 21,
    deleteDialogTitleLine: 1.15,
    deleteDialogBodySize: 14.5,
    deleteDialogBodyLine: 1.5,
    deleteDialogListGap: 7,
    deleteDialogItemGap: 9,
    deleteDialogItemSize: 13.5,
    deleteDialogItemLine: 1.4,
    deleteDialogDot: 5,
    deleteDialogDotTop: 7,
    deleteDialogActionsGap: 9,
    accountIconSize: 20,
} as const;

/** Hareket sözleşmesi 02'deki basma değerleri; bu setin dışına çıkılmaz. */
/**
 * Akıştaki müşteri balonu — adın yanındaki basılabilir baş harf yuvarlağı.
 *
 * Akışta müdürün müşteri kartına ulaşacağı tek kapı bu. Yuvarlak hem KİMLİK
 * hem de "burası basılır" işareti; ayrı bir ok ya da etiket çizilmez.
 * Turuncu DEĞİL: turuncu zaman ve eylem içindir, "Geldi" hapı turuncu.
 */
export const customerBubble = {
    /** Sade akış satırında — ad tek satır, yuvarlak onu ezmemeli. */
    size: 34,
    sizeSmall: 31,
    border: 1.5,
    text: 12.5,
    textSmall: 11.5,
    gap: 11,
    /** Dokunma hedefi 44'e hitSlop ile tamamlanır. */
    hitSlop: 8,
} as const;

/**
 * Müdür 22 — boş gün. Ölçüler tasarımın CSS'iyle birebir.
 *
 * Boş hâlin bloğu ekranın ALT ÜÇTE BİRİNE (852'de 568+) hiç girmez: orası
 * başparmağın yeri, orada yalnız eylemler durur.
 */
export const emptyDayMetrics = {
    /** Boş hâl bloğu levhanın altından bu kadar aşağıda başlar. */
    topFromPlate: 46,
    topFromStrip: 30,

    /** Etiket — "İLERİDEKİ GÜN · 5 GÜN SONRA". */
    label: 11.5,
    labelTrack: 0.06,
    labelGap: 7,
    /** Yalnız bugünde ve turuncu: bugün bir zaman bilgisidir. */
    dot: 7,

    /** Başlık — kahraman rakam YOK, ölçülecek bir şey yok. */
    title: 22,
    titleTrack: -0.025,
    titleLine: 1.22,
    titleTop: 12,

    /** Cümle — kırpılmaz, sarar. */
    hint: 14.5,
    hintLine: 1.4,
    hintWidth: 290,
    hintTop: 8,

    /** Saat rayı — cetvelin dikey kardeşi. */
    railTop: 30,
    railWidth: 257,
    railWidthSmall: 239,
    railRow: 30,
    railRowSmall: 28,
    railNumber: 12,
    railNumberWidth: 22,
    railLine: 1,
    railGap: 10,

    /** Gün pedalı — üç bölme, hepsi 44'ün üstünde. */
    pedalHeight: 44,
    pedalSide: 123,
    pedalSideSmall: 117,
    pedalMid: 141,
    pedalMidSmall: 133,
    pedalText: 14,
    pedalDividerInset: 11,
    pedalPressFill: 'rgba(243,237,227,0.07)',

    /** Birincil eylem — pedalın ÜSTÜNDE: karar veren eylem daha yukarı. */
    actionHeight: 40,
    actionText: 15.5,
    actionGap: 12,

    /** Jest okları — jesti öğretir, dokunulamaz. */
    arrowTop: 436,
    arrowSize: 20,
    arrowOpacity: 0.36,
    arrowInset: 14,

    /** Boş günde gradyan sönmez; yüksekliği sabitlenir. */
    glowHeight: 340,
    glowHeightToday: 300,

    padX: 18,
} as const;

/**
 * Dört an. Hepsi yalnız `opacity` ve `translateX/Y` — yükseklik, renk,
 * yarıçap ve gölge animasyonu YOK, çünkü hiçbiri native sürücüde çalışmaz.
 */
/**
 * Yükleme iskeleti.
 *
 * Yükleniyor hâli boş hâl DEĞİLDİR: veri gelmeden "bugün henüz bir şey
 * olmadı" ya da "randevu yok" yazmak yanlış cümledir ve saniyeler sonra
 * kendini yalanlar. İskelet cümle kurmaz, yalnız yer tutar.
 */
export const skeletonMetrics = {
    rows: 3,
    height: 28,
    gap: 12,
    radius: 8,
    opacity: 0.06,
    padX: 18,
    top: 24,
} as const;

export const emptyDayMotion = {
    /** Dolu → boş: liste tek blok çıkar, boş hâl ve levha tek karede girer. */
    fill: { out: 160, in: 220, delay: 60, rise: 8, plate: 240, plateRise: -8 },
    /** Boş → boş: cümle yatay takas edilir, çapraz soldurma YOK. */
    slide: { out: 160, in: 220, delay: 60, shift: 12, pill: 180, date: 220, dateRise: 4 },
    /** Boş → dolu: ilk üç satır 40 ms arayla, gecikme tavanı 120 ms. */
    rows: { out: 160, outRise: -6, in: 220, rise: 10, step: 40, cap: 120 },
    /** Bugüne dön: mesafe hiçbir hâlde animasyona çevrilmez. */
    home: { numbers: 220, pill: 200 },
    /** Bırakışta yerine oturma. */
    settle: 220,
} as const;

/**
 * Müdür 27 — profil. Ölçüler tasarımın CSS'iyle birebir.
 *
 * Üç ağırlık, üç niyet: bir kart (bugünün saatleri), iki büyük satır (cepte
 * ilk kez açılan iki kapı), dört küçük satır (bir kez ayarlanan işler).
 */
export const profileMetrics = {
    padX: 16,
    navHeight: 52,
    /** Yüzen sekme çubuğu (66) + alt boşluk (46). İçerik camın ARKASINA girer. */
    bottomInset: 112,
    gap: 12,

    // Başlık bloğu — toplam 74 pt, ekranın %9'u.
    kicker: 10.5,
    kickerTrack: 0.22,
    headName: 25,
    headNameTrack: -0.03,
    headSub: 13,

    // Bugün kartı — Müdür 18'in kart malzemesi.
    cardPadTop: 14,
    cardPadX: 15,
    cardPadBottom: 13,
    cardRadius: 22,
    cardGap: 9,
    cardKicker: 10.5,
    cardKickerTrack: 0.16,
    cardStatus: 12.5,
    cardDot: 7,
    cardHour: 34,
    cardHourSmall: 30,
    cardHourTrack: -0.03,
    cardFoot: 12.5,

    // Satır grupları.
    groupRadius: 18,
    rowHeight: 56,
    rowBigHeight: 68,
    rowPadX: 14,
    rowGap: 12,
    rowTitle: 16,
    rowTitleBig: 17.5,
    rowSub: 12.5,
    rowValue: 13.5,
    groupHead: 10.5,
    groupHeadTrack: 0.18,

    // Gün satırı.
    dayHeight: 60,
    dayName: 17,
    dayTime: 17,
    dayClosed: 15,
    dayBadge: 10,
    dayBadgeTrack: 0.14,
    daySpine: 3,

    // Basamak — hitSlop YOK, yanlışlıkla 15 dk kaymasın.
    stepperHeight: 60,
    stepperButton: 60,
    stepperRadius: 16,
    stepperNumber: 30,

    // Hizmet satırı.
    serviceHeight: 62,
    serviceName: 16.5,
    serviceMeta: 12.5,
    servicePrice: 17,
    servicePriceNone: 12.5,
    serviceBar: 4,
    serviceBarHeight: 30,

    // Alanlar ve seçiciler.
    fieldHeight: 54,
    fieldRadius: 16,
    fieldText: 18,
    chipHeight: 44,
    chipRadius: 12,
    chipText: 15,
    swatch: 44,
    swatchRadius: 13,

    // Anahtar — rengi bilgi taşımaz, knob'un yeri ve yanındaki kelime taşır.
    switchWidth: 47,
    switchHeight: 29,
    switchKnob: 23,
    switchTravel: 18,

    // Onay kutusu — bir uyarı değil, bir beyan. Kırmızı DEĞİL.
    checkbox: 26,
    checkboxRadius: 8,
    checkRowHeight: 52,

    // Silme. Dolu kırmızı zemin YOK: dolu zemin bu üründe birincil eylem
    // demek ve o turuncudur.
    dangerHeight: 56,
    dangerRadius: 16,
    dangerText: 17,
    holdBarHeight: 4,

    amberPadY: 12,
    amberPadX: 13,
    amberRadius: 14,
    amberLabel: 12,
    amberLabelTrack: 0.1,
    amberText: 13,

    footText: 11.5,
    footLine: 1.45,
    buttonHeight: 52,
    buttonRadius: 16,
    buttonText: 17,
    emptyRadius: 18,
} as const;

/**
 * Dört an. Yükseklik, renk, yarıçap ve gölge ANİMASYONLANMAZ — hiçbiri
 * native sürücüde çalışmaz, o yüzden hiç yok.
 */
export const profileMotion = {
    sheetIn: 300,
    sheetOut: 240,
    /** Rakam sayılmaz, TAKAS edilir: iki Text üst üste. */
    digitOut: 110,
    digitIn: 130,
    digitDelay: 20,
    digitRise: 7,
    /** Basılı tutma tekrarında kuyruk birikmesin diye kısalır. */
    digitFast: 60,
    switchMs: 180,
    /** Basılı tutma bir güvenlik ölçüsü; süresi hareketi azaltmada da değişmez. */
    holdMs: 2000,
    holdRelease: 180,
    /** Onay kutusu işaretsizken silmeye basılırsa. */
    shakeMs: 160,
    shakeCycles: 2,
    shakeShift: 4,
    /** Basamak: 500 ms sonra saniyede 4 tekrar. */
    repeatDelay: 500,
    repeatEvery: 250,
} as const;

export const pressMotion = {
    in: 90,
    out: 120,
    reduced: 60,
    primaryOpacity: 0.9,
    primaryScale: 0.97,
    reducedOpacity: 0.85,
    ghostOpacity: 0.6,
    rowIn: 60,
    rowOut: 140,
    iconOpacity: 0.7,
    iconScale: 0.92,
} as const;

/** Giriş durumlarının hareket sözleşmesi 05 ve açık hata istisnası. */
/**
 * Müdür ana ekranı — "Bugünün akışı".
 *
 * Dört katman: dev başlık · personel şeridi · özet şeridi · olay akışı.
 * Değerler `Luera Mobil - Mudur Modu.html` içindeki gerçek CSS'ten geliyor.
 */
export const flowMetrics = {
    // Personel şeridi
    stripY: 14,
    stripBottom: 12,
    stripX: 18,
    stripGap: 10,
    itemWidth: 58,
    itemGap: 7,
    ring: 52,
    ringSmall: 48,
    ringBorder: 2,
    ringBorderBusy: 2.5,
    ringText: 15,
    badgeHeight: 18,
    badgeX: 6,
    badgeText: 10.5,
    badgeOffset: -7,
    nameSize: 12,
    stateSize: 10.5,
    dimOpacity: 0.5,

    // Özet şeridi — üç rakam, kart ızgarası DEĞİL
    statY: 14,
    statX: 14,
    statGap: 3,
    statValue: 24,
    statLabel: 11.5,

    // Olay akışı
    rowY: 16,
    rowX: 18,
    rowGap: 10,
    timeWidth: 42,
    timeSize: 13.5,
    timeTop: 2,
    bodyGap: 7,
    kindSize: 11.5,
    kindGap: 7,
    dot: 7,
    nameFirst: 19,
    nameLast: 19,
    detailSize: 13.5,
    detailLine: 1.35,
    actionsGap: 12,
    actionsTop: 1,
    pillHeight: 40,
    pillX: 18,
    pillText: 15.5,
    dotsButton: 34,
    dotsIcon: 20,
    settledOpacity: 0.62,

    // Toplanmış cam çubuk (.minibar) — Müdür 04
    miniBar: 52,
    miniX: 18,
    miniTop: 16,
    miniGap: 7,
    miniTitle: 17,
    miniSubtitle: 13.5,
    // Kaydırılmış hâlde şerit daralır; ekranın üstünü boğmasın.
    stripYCompact: 10,
    /**
     * Toplanmış çubuğun cam zeminine eklenen örtü.
     *
     * Tek başına `--glass` (koyuda %66) altından kayan rakamları kesmiyordu.
     * Kullanıcı kararı: örtü %95 — çubuk pratikte opak, okunurluk her koşulda
     * garanti. Cam katmanı üstte duruyor ama karakteri neredeyse tamamen
     * kapanıyor; bu bilinçli bir takas. Tek sayı, tek yerde — kolay ayarlanır.
     */
    miniBarScrim: 0.95,

    // Müdür 05 — bir personelin günü
    heroCardPadding: 16,
    heroCardGap: 12,
    heroRingBig: 64,
    heroRingBigText: 19,
    heroNameSize: 21,
    statChipHeight: 28,
    statChipX: 10,
    statChipRadius: 10,
    statChipText: 12,
    statChipDot: 8,
    miniHeight: 44,
    miniButtonX: 15,
    miniGapInner: 7,
    miniRadius: 14,
    miniText: 14.5,
    miniIcon: 19,
    evActsY: 12,

    // Gömülü canlı işlem şeridi (.embl) — krem yüzey.
    //
    // DİKKAT: Akış ekranı bunları ARTIK KULLANMIYOR. Orada canlı şerit
    // `panelInk`e bağlandı (2026-08-21): aydınlık temada krem sayfa üstünde
    // krem panel düzlem değiştirmiyor, yıkanıp kayboluyordu. Aşağıdaki renk
    // jetonları yalnız `AppointmentDetail` ve `MoveParts` ekranlarında kaldı;
    // onlar da aydınlık temada aynı sorunu taşıyor, henüz dokunulmadı.
    // Ölçü jetonları (liveRadius, livePadding, liveCounter…) her yerde geçerli.
    // Takvim'in gömülü kartı sayfanın tersidir (açıkta koyu, koyuda açık);
    // buradaki farklı: tasarımda tema varyantı YOK, her iki temada aynı krem
    // yüzey. Bu yüzden `embed` paletiyle karıştırılmamalı.
    liveBg: '#FAF3E9',
    liveTx: '#0E0E0E',
    liveTx2: 'rgba(14,14,14,0.55)',
    liveTx3: 'rgba(14,14,14,0.50)',
    liveRadius: 18,
    livePadding: 14,
    liveGap: 12,
    liveInnerGap: 2,
    liveLabel: 11.5,
    liveDot: 6,
    liveCounter: 34,
    liveSub: 11.5,
    whoHeight: 36,
    whoX: 14,
    whoGap: 8,
    whoText: 14.5,
    whoAvatar: 26,
    whoAvatarText: 10.5,
    whoBg: '#1C1710',
    whoTx: '#F3EDE3',
    whoAvatarBg: 'rgba(243,237,227,0.13)',
    amountSize: 26,
    endSize: 12.5,
    endY: 22,
} as const;

/**
 * Müdür 17 — "sıradaki randevu" kartı (A1 · geri sayım / A2 · müşteri dosyası).
 *
 * Değerler `Luera Mobil - Mudur 17 Siradaki Randevu.html` içindeki gerçek CSS
 * seçicilerinden gelir; ekran kendi ölçüsünü uydurmaz.
 *
 * Kart seçimi VERİDEN türer, elle seçilmez:
 *   bağlam yok (borç · not · paket)  → A1, krem/koyu ters panel + geri sayım
 *   bağlamdan en az biri var          → A2, müşteri dosyası kartı
 * Gecikme her ikisinin de bir HÂLİ; ayrı kart değil.
 */
export const nextCardMetrics = {
    // ── A1 · ters panel ──────────────────────────────────────────────
    // `.a1panel{padding:14px;border-radius:18px;gap:12px}`
    panelPad: 14,
    panelRadius: 18,
    panelGap: 12,
    // `.a1.late .a1panel{border-left:4px solid;padding-left:10px}`
    // Çizgi + dolgu TOPLAMI sabit 14 kalır: gecikince metin kaymaz.
    lateBar: 4,
    panelPadLate: 10,
    label: 11.5,        // .a1lbl
    eta: 40,            // .a1eta
    etaSmall: 34,       // .phone.sm .a1eta
    etaBig: 52,         // .big .a1eta
    sub: 11.5,          // .a1sub
    subBig: 15,
    goHeight: 44,       // .a1go
    goX: 20,
    goText: 16,
    goHeightBig: 56,
    goTextBig: 20,
    noHeight: 44,       // .a1no
    noText: 15,
    noHeightBig: 52,
    noTextBig: 19,
    actsGap: 2,         // .a1acts
    actsGapBig: 4,

    // ── A2 · müşteri dosyası ─────────────────────────────────────────
    // `.a2card{padding:12px;border-radius:22px;gap:12px}`
    // Eşmerkezli: 22 − 12 = 10 → `.a2note{border-radius:10px}`.
    cardPad: 12,
    cardRadius: 22,
    cardGap: 12,
    headGap: 11,        // .a2hd
    avatar: 44,         // .av
    avatarBorder: 2,
    avatarText: 14.5,
    nameSize: 19,       // .a2t b
    nameLine: 1.15,
    detailSize: 12.5,   // .a2t span
    etaRight: 22,       // .a2r b
    etaRightSub: 12,    // .a2r span
    notePad: 10,        // .a2note
    noteRadius: 10,
    noteGap: 9,
    liGap: 9,           // .a2li
    liText: 14,
    liLine: 1.4,
    liLabel: 11.5,      // .a2li s
    liLabelWidth: 74,
    liLabelTop: 3,
    confText: 12.5,     // .conf
    confDot: 7,
    confGap: 7,
    actGap: 14,         // .a2act
    ghostHeight: 44,    // .a2ghost
    ghostText: 15,
    pillHeight: 40,     // .gopill
    pillX: 18,
    pillText: 15.5,

    // ── Bağlam rozetleri (`.ctx`) ────────────────────────────────────
    // Boşsa HİÇ ÇİZİLMEZ: `.ctx:empty{display:none}`.
    chipHeight: 30,
    chipX: 10,
    chipRadius: 10,
    chipText: 12.5,
    chipGap: 7,
} as const;

/**
 * Müdür 20 · bekleme kartı — "Geldi" ile "Sürüyor" arası.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 20 Bekleme Kartlari.html`.
 * Çerçeve BİLEREK A1 paneli ve canlı şeritle aynı (`padding 14 · radius 18 ·
 * gap 12`): üç hâl aynı karttır, aralarındaki geçiş takas değil dönüşümdür.
 *
 * Tasarımın sert sınırı: kart 100 pt'yi geçmez. Ölçülen yükseklikler
 * C1 = 92, geri kalanı = 96 — ikincisini sağ sütun belirliyor (40 + 6 + 22).
 */
/**
 * Müdür 33 · eylem hapı.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 33 Eylem Hapi.html`.
 * Hap bir menü değil bir ALET: tek yüzey, ayraçlarla bölünmüş gözler.
 *
 * ÇAPA TETİKLEYİCİDİR. Hap kartın tepesine değil, `Yönet` düğmesinin kenarına
 * yapışır ve ok ucu ona DEĞER. Önceki turda hap kartın üstündeydi ve ok
 * hiçbir şeyi göstermiyordu — 62 pt uzağındaki bir düğmeyi işaret ediyordu.
 */
export const actionPillMetrics = {
    // `.bal{border-radius:18px}` · `.acell{width:60px;height:56px}`
    radius: 18,
    cell: 60,
    height: 56,
    /**
     * Halka — `.aeye{width:44px;height:44px}` · `.aring{border:1.5px}`.
     *
     * AYRAÇ ÇİZGİSİ KALKTI: halkalar zaten ayırıyor, çizgi ikinci bir sınır
     * çiziyordu. Halkalar arası 16 pt (60 − 44).
     */
    eye: 44,
    ring: 1.5,
    icon: 22,
    /** Baş harf gözü — çan yerine PERSONELİN kendisi. */
    initials: 14.5,
    /**
     * Dolgu diski — `.adisc{left:2.25;width:39.5}`. Halkanın içine 0,75 pt
     * kalana kadar büyür; okunan şey halkaya kalan boşluk.
     */
    disc: 39.5,
    discInset: 2.25,
    /**
     * Halka opaklığı. Dinlenirken %55 — ÇERÇEVE. Basılınca %100 — eylem
     * başladı. Turuncu dolu hâline yalnız dolguyla geçiyor; dört halkanın
     * hepsi turuncu olsaydı "hangisi acil" sorusunu soran renk susardı.
     */
    ringRest: 0.55,
    ringPress: 1,
    /** WhatsApp bağlı değil: dolgusuz halka = göndermez. */
    ringOff: 0.4,

    /** Ok ucu — `.arw{width:14px;height:6px}`. */
    arrow: 14,
    arrowHeight: 6,
    /**
     * Okun yatay yeri SABİT DEĞİL, tetikleyiciden türer:
     * `tetikleyici genişliği / 2 - arrow / 2`. Böylece ok her genişlikte
     * düğmenin tam ortasına bakar (ölçüldü: sapma 0,06 pt).
     */
    arrowInset: (triggerWidth: number) => Math.max(12, triggerWidth / 2 - 7),
    /** Hap ile tetikleyici arasındaki boşluk — ok ucu bu boşluğu kapatır. */
    gap: 6,

    // Kelime bloğunun ölçüleri (`.ach`) 2026-08-30'da SİLİNDİ: balon
    // kaldırıldı, ölçüleri de kalmadı. Ölü belirteç, olmayan bir şeyin
    // hâlâ var olduğunu düşündürür.

    // Perde — kartı okunmaz yapmayacak kadar hafif.
    scrimDark: 'rgba(0,0,0,0.22)',
    scrimLight: 'rgba(14,14,14,0.14)',
    /** Sönük göz (`.acell.off`). */
    offOpacity: 0.4,
} as const;

export const waitCardMetrics = {
    // `.pnl{border-radius:18px}` · `.pnl .in{gap:12px;padding:14px}`
    pad: 14,
    radius: 18,
    gap: 12,
    // `.pnl.warn .in{padding-left:10px}` + `.stripe{width:4px}` → toplam 14.
    // Uyarı hâline geçerken metin YERİNDEN OYNAMAZ; A1'de bu telafi yazılmıştı
    // ama uygulanmamıştı (nextCardMetrics.panelPadLate ölü kaldı), burada var.
    stripe: 4,
    padWarn: 10,

    // `.plbl{font-size:11.5px;font-weight:700;letter-spacing:.06em;line-height:1.22}`
    label: 11.5,
    labelLine: 1.22,
    labelGap: 7,
    dot: 7,

    // `.hero{font-size:34px;font-weight:800;letter-spacing:-.03em;height:36px}`
    // 34 — canlı sayaçla AYNI, A1'in 40'ından küçük. Gerekçe tasarımdan:
    // 40 yalnız HENÜZ BURADA OLMAYAN müşterinin rakamı; müşteri içeri girince
    // rakam tahminden ölçüme döner ve ölçen iki hâl aynı boyda durur.
    hero: 34,
    heroBox: 36,
    heroGap: 5,
    // `.hero .u` — "dk" ayrı düğüm: rakam tabular, birim Hanken.
    unit: 17,

    // `.psub` ve `.conf`
    sub: 11.5,
    subLine: 1.22,
    conf: 11.5,
    confGap: 7,

    // `.pact{gap:6px}` · `.hap` · `.ghost`
    actGap: 6,
    hapHeight: 40,
    hapX: 18,
    hapText: 15.5,
    hapBorder: 1.5,
    ghostHeight: 22,
    ghostX: 4,
    ghostText: 13.5,
    // Görünen 40/22, dokunulan 44: aradaki fark hitSlop'la kapanır.
    hapSlop: 2,
    ghostSlop: 11,
    // Damga — tüketilmiş düğmenin yerinde duran, BASILAMAYAN rozet.
    // Sözlük tasarımın kendi bekleme rozetinden: `.stat{h28·padX10·r10·12/700}`.
    // Hapın 40 pt'lik yuvasında ORTALANIR; kart yüksekliği değişmez, yoksa
    // damga basıldığı an kart kısalır ve yükseklik animasyonu yasak.
    stampHeight: 28,
    stampX: 10,
    stampRadius: 10,
    stampText: 12,
    // `.stamp{background:transparent;border:1px solid var(--pbd)}` — DOLU DEĞİL.
    // Damga bir eylem değil bir kayıt; dolu zemin onu düğmeye benzetirdi.
    stampBorder: 1,
    stampGap: 6,
    stampDot: 7,

    // `.hand` — C4 devir satırı. Kart DEĞİL: krem yüzey "bak ve karar ver"
    // demek, devirde karar yok. Sayaç da yok; 5-20 saniyelik bir aralık.
    handHeight: 38,
    handGap: 9,
    handText: 13.5,
    handLabel: 11,
    handAvatar: 24,
    handAvatarBorder: 1.5,
    handAvatarText: 10,

    // ── Hareket (ms) ────────────────────────────────────────────────────
    // Hepsi opaklık + dönüşüm; native sürücüyle çalışır. Renk, yükseklik,
    // yarıçap ve gölge animasyonu YOK — renk geçişi iki yüzeyin çapraz
    // soldurulmasıyla yapılır.
    undoHold: 5000,
    undoFade: 700,
    undoNext: 400,
    undoNextDelay: 200,
    pulse: 2600,
    pulseLow: 0.45,
    rollDuration: 220,
    rollShift: 4,
    // Eşik geçişi: nötr yüzey sönerken amber/kırmızı yüzey açılır. Üstünden
    // bir kez ışık geçer — müdür ekrana bakmıyorken de kenar görüşüyle fark
    // eder. Süpürme TEK SEFERLİK; döngüye alınırsa dikkat çekmez, rahatsız eder.
    crossFade: 900,
    sweep: 1200,
    sweepPeak: 0.5,

    // BEKLİYOR → SÜRÜYOR: kart aynı kart, içerik dönüşür. Personel hapı
    // sağdan girer — "kim çalışıyor" bilgisi beklemede yoktu, şimdi var.
    morphPill: 260,
    morphPillShift: 10,

    reducedOpacity: 0.7,
} as const;

/**
 * Kart türü değiştiğinde çalışan ÇAPRAZ SOLDURMA — tasarımın hareket
 * tablosundan birebir.
 *
 * İlk uygulamada yalnız GİREN yarı yazılmıştı; çıkan kart bir karede yok
 * oluyordu. Cihazda bu "kaba kesme" olarak görünüyor: tasarımın altı
 * hareketinin hepsi iki şeyin ÜST ÜSTE binmesine dayanıyor, biri sönerken
 * öteki açılıyor. Eksik olan yarı buydu.
 *
 * `lift` çıkan kartın yukarı kayması, `rise` girenin aşağıdan gelmesi.
 */
export const cardSwap = {
    /** M1 · "Geldi"ye basış — geri sayım kartı bekleme kartına dönüşür. */
    press: { out: 160, in: 220, delay: 60, lift: 6, rise: 8 },
    /** M5 · devir — biten satırın kartı sönerken devir çizgisi açılır. */
    handoff: { out: 260, in: 300, delay: 80, lift: 4, rise: 6 },
    /**
     * D1 → D3 · tahsilat alındı. Kart YALNIZ opacity ile kaybolur (300 ms),
     * satır 240 ms'de belirir. Aradaki 60 ms'de kart görünmez: satır
     * yüksekliği 92'den 34'e o boşlukta düşer, görünen hiçbir öğe boyut
     * değiştirmez.
     */
    settle: { out: 300, in: 240, delay: 60, lift: 0, rise: 4 },
    /**
     * M6 · BEKLİYOR → SÜRÜYOR. Tasarım "toplam 380 ms" diyor: giren 240 ms,
     * 140. ms'de başlar (140 + 240 = 380). Çıkan 180 ms onun altında biter.
     */
    start: { out: 180, in: 240, delay: 140, lift: 5, rise: 6 },
} as const;

/**
 * Müdür 21 · tahsilat ve gelmedi kartları.
 *
 * Kaynak: `docs/design-reference/Luera Mobil - Mudur 21 Tahsilat ve Gelmedi
 * Kartlari.html`. Çerçeve, etiket, alt satır ve eylemler Müdür 20 ile ORTAK
 * (`waitCardMetrics`); burada yalnız o ikisinde olmayan parçalar var.
 */
export const dueCardMetrics = {
    // `.hero.mny{gap:0}` · `.hero.mny .cur{font-size:24px;font-weight:800}`
    //
    // ₺ AYRI düğüm ama ikincil mürekkep DEĞİL: bekleme kartında birim ("dk")
    // soluktur çünkü bilgi rakamdadır. Parada tersi — ₺ rakamın kimliğinin
    // parçası, soldurulursa tutar bir süreye benzemeye başlar. Boyu küçük
    // çünkü 34 pt'de ₺ glifi rakamlardan optik taşar ve alt alta duran iki
    // adisyonda (₺900, ₺2.650) hizayı bozar.
    currency: 24,
    currencyGap: 2,
    currencyLift: 1,

    // `.paid` — D3, kart DEĞİL. Kart "bak ve karar ver" demek; alınmış
    // tahsilatta karar yok. C4 devir satırıyla aynı aile.
    /**
     * Onay kartı bu kadar durur, sonra ince satıra iner. Müdürün bastığı
     * düğmenin sonucunu görmesi için gereken süre — daha kısası "bir şey oldu
     * mu?" sorusu bırakır, daha uzunu akışı tıkar.
     */
    settleHold: 1600,

    paidHeight: 34,
    paidGap: 10,
    paidText: 13.5,
    paidLabel: 11,
    paidDot: 7,
    /**
     * Bitmiş iş soluklaşır. Akıştaki genel soluklaşma 0.62 (Müdür Modu
     * `.frow.dim`); tasarım bu satır için 0.5 diyor ve daha sönük olması
     * bilinçli — bekleyen adisyonlar sıradanlaşmasın.
     */
    paidOpacity: 0.5,
} as const;

/** Çıkan eğrisi — hızlanarak gider. `cubic-bezier(.4, 0, 1, 1)` */
export const swapOutCurve = [0.4, 0, 1, 1] as const;
/** Giren eğrisi — yavaşlayarak yerine oturur. `cubic-bezier(.2, .8, .25, 1)` */
export const swapInCurve = [0.2, 0.8, 0.25, 1] as const;

/**
 * Ters panelin mürekkebi.
 *
 * HTML'de `--panel` ve arkadaşları TEMAYLA TERS tanımlı: koyu temada panel
 * krem (#FAF3E9), aydınlık temada panel koyu (#1C1710). Sebep tasarımın kendi
 * notu: "krem zemin üstünde krem panel düzlem değiştirmez, ters düzlem
 * değiştirir." Bu yüzden anahtarlar uygulamanın tema adıyla eşleşir, rengin
 * adıyla değil.
 */
export interface PanelInk {
    panel: string;
    ink: string;
    ink2: string;
    ink3: string;
    /** Gecikme çizgisi ve rakamı — panel zemininde AA geçen kırmızı. */
    red: string;
    /**
     * Bekleme uyarısının YAZI amberi. Grafik amberden (aşağıdaki `amDot`) ayrı:
     * krem zeminde #D9A43B metin olarak AA geçmiyor, o yüzden yazı koyulaşıyor.
     * Nokta ve çizgi grafiktir, kontrast eşiği farklıdır — o parlak kalıyor.
     */
    am: string;
    /** Bekleme noktası ve uyarı çizgisi — iki temada da aynı amber. */
    amDot: string;
    /** Panel üstündeki ince çizgi — damga kenarlığı (`--pbd`). */
    line: string;
    /** Bitmiş işin yeşili — damga ve tahsilat noktası. */
    green: string;
    /** Panelin İÇİNDEKİ hap (canlı şeritteki personel rozeti) — panelin tersi. */
    pill: string;
    pillInk: string;
    pillAvatarBg: string;
}

/**
 * A2 kartının yüzeyi — İKİ TEMADA DA KOYU.
 *
 * Önce tasarımın CSS'i birebir uygulanmıştı (`--surf2` + `--surf`). Aydınlık
 * temada bu iki sorun üretti: (1) jetonlar tersine çalışıyor — `surf2` koyu
 * palette en açık, aydınlık palette en koyu basamak, yani kart sayfanın
 * ALTINA çöküyordu; (2) düzeltilip beyaza alındığında da krem sayfa üstünde
 * beyaz kart düzlem değiştirmiyor, yıkanıp kayboluyordu.
 *
 * Kullanıcı kararı (2026-08-21): kart aydınlıkta da koyu olsun. Böylece
 * gömülü yüzeylerin tamamı — A1 paneli, canlı işlem şeridi ve bu kart —
 * aydınlık temada aynı düzlemde buluşuyor. Tasarım A2'yi aydınlık temada
 * hiç çizmediği için bu durum belgede yok; karar burada kayıtlı.
 *
 * Kart iki temada da koyu olduğu için mürekkebi de sabit: `c.tx` gibi temaya
 * bakan jetonlar KULLANILMAZ, yoksa aydınlıkta koyu zeminde koyu yazı çıkar.
 */
export interface CardSkin {
    bg: string;
    note: string;
    border: string;
    border2: string;
    avatarBg: string;
    tx: string;
    tx2: string;
    or: string;
    rd: string;
    am: string;
    amBg: string;
    amBorder: string;
}

export const cardSkin: CardSkin = {
    bg: '#252015',
    note: '#1C1710',
    border: 'rgba(243,237,227,0.11)',
    border2: 'rgba(243,237,227,0.20)',
    avatarBg: '#1C1710',
    tx: '#F3EDE3',
    tx2: 'rgba(243,237,227,0.58)',
    or: '#FF5A1F',
    rd: '#E07272',
    am: '#D9A43B',
    amBg: 'rgba(217,164,59,0.14)',
    amBorder: 'rgba(217,164,59,0.30)',
};

export const panelInk: { dark: PanelInk; light: PanelInk } = {
    // Uygulama koyu temada → krem panel, koyu mürekkep.
    dark: {
        panel: '#FAF3E9',
        ink: '#0E0E0E',
        ink2: 'rgba(14,14,14,0.52)',
        ink3: 'rgba(14,14,14,0.72)',
        red: '#A82F2F',
        am: '#8A5C00',
        amDot: '#D9A43B',
        line: 'rgba(14,14,14,0.12)',
        green: '#2E7D46',
        pill: '#1C1710',
        pillInk: '#F3EDE3',
        pillAvatarBg: 'rgba(243,237,227,0.13)',
    },
    // Uygulama aydınlık temada → koyu panel, krem mürekkep.
    light: {
        panel: '#1C1710',
        ink: '#F3EDE3',
        ink2: 'rgba(243,237,227,0.58)',
        ink3: 'rgba(243,237,227,0.72)',
        red: '#E07272',
        // Koyu panelde amber zaten AA geçiyor; yazı ve nokta ayrışmıyor.
        am: '#D9A43B',
        amDot: '#D9A43B',
        line: 'rgba(243,237,227,0.14)',
        green: '#2E7D46',
        pill: '#FAF3E9',
        pillInk: '#0E0E0E',
        pillAvatarBg: 'rgba(14,14,14,0.10)',
    },
};

/**
 * Müdür 06 — personel sütunlu takvim.
 * Değerler `Luera Mobil - Mudur Modu.html` içindeki gerçek CSS'ten.
 */
export const columnMetrics = {
    hoursX: 18,
    hourText: 13.5,
    hourTop: 2,
    headerHeight: 44,
    headerBottom: 10,
    headerGap: 7,
    headAvatar: 30,
    headAvatarBorder: 2,
    headAvatarText: 11.5,
    headName: 13.5,
    gridPadRight: 18,
    blockY: 8,
    blockX: 10,
    /** Canlı blokta sol şerit için fazladan boşluk. */
    blockLiveX: 14,
    liveBar: 3,
    blockTime: 12,
    blockName: 15.5,
    blockService: 11.5,
    doneOpacity: 0.56,
} as const;

/**
 * Müdür 09 — randevu oluştur.
 * Değerler `Luera Mobil - Mudur Modu.html` içindeki gerçek CSS'ten.
 */
export const createMetrics = {
    // Sheet kabuğu (.sheet.full · .grabber · .sheet-head · .sheet-foot)
    /** Tam yükseklik sheet üstte bu kadar boşluk bırakır; arka ekran görünür kalır. */
    topGap: 34,
    sheetRadius: 22,
    grabberHeight: 38,
    grabberWidth: 44,
    grabberBar: 5,
    grabberOpacity: 0.24,
    headTop: 6,
    headBottom: 12,
    headLeft: 20,
    headRight: 14,
    headGap: 10,
    headTitle: 21,
    footY: 14,
    footX: 18,
    footBottom: 40,
    footGap: 10,
    footNote: 12,

    // Adım göstergesi (.steps)
    stepsX: 18,
    stepsTop: 2,
    stepsBottom: 14,
    stepsGap: 6,
    stepBar: 3,

    // Arama kutusu (.searchbox)
    searchHeight: 48,
    searchX: 14,
    searchMargin: 18,
    searchBottom: 12,
    searchGap: 10,
    searchText: 15.5,
    searchIcon: 19,

    // Liste satırı — .rowline ile aynı ölçüler, ayrı jeton tutmuyoruz.
    slotTimeWidth: 52,
    slotTimeSize: 15.5,
    disabledOpacity: 0.42,

    // Özet kartı (Müdür 09c)
    cardPadding: 18,
    cardGap: 14,
    summaryName: 28,
    summaryRowGap: 12,
    summaryLabelWidth: 74,
    summaryLabel: 11.5,
    summaryValue: 16.5,
    summaryAmount: 26,
} as const;

/**
 * Müdür 08 · 10 · 10b — randevu detayı, silme onayı, iptal/silme menüsü.
 * Değerler `Luera Mobil - Mudur Modu.html` içindeki gerçek CSS'ten.
 *
 * Gömülü krem kartın renkleri BURADA YOK: o kart akış ekranındaki canlı
 * şeritle aynı `.emb` sınıfı, dolayısıyla `flowMetrics.live*` jetonlarını
 * kullanıyor. İki kopya tutmak, ikisinin zamanla ayrışması demekti.
 */
export const detailMetrics = {
    padX: 18,
    stackGap: 14,
    headGap: 8,

    // Başlık ve rozetler
    name: 28,
    chipHeight: 32,
    chipX: 12,
    chipRadius: 10,
    chipText: 13,
    chipGap: 6,
    chipRowGap: 8,
    chipIcon: 15,
    chipAvatar: 20,
    chipAvatarText: 9,
    chipAvatarBorder: 1.5,

    // Gömülü kartın parçaları
    numChip: 42,
    numChipText: 21,
    numChipSmall: 13.5,
    numChipSmallOpacity: 0.42,
    embGo: 36,
    embGoIcon: 16,
    dchipHeight: 36,
    dchipX: 13,
    dchipRadius: 14,
    dchipText: 13,
    dchipGap: 7,

    // Geldi / Gelmedi — günde onlarca kez basılır, o yüzden 66 pt.
    attendanceHeight: 66,
    attendanceGap: 10,

    // Değiştir satırları
    rowIcon: 23,
    chevron: 19,

    // Silme bölgesi — en altta, kırmızı METİN. Kırmızı dolu buton YOK.
    dangerTop: 22,
    dangerBottom: 30,
    dangerGap: 10,
    dangerIcon: 20,
    dangerText: 16,
    hintText: 12,

    // Müdür 10 — onay diyaloğu
    alertInset: 24,
    alertPadding: 20,
    alertGap: 14,
    alertTitle: 21,
    alertBody: 14.5,
    alertBodyLine: 1.5,
    alertSumPadding: 14,
    alertSumRadius: 18,
    alertSumName: 15.5,
    alertSumLine: 13,
    alertActsGap: 9,
    scrimLight: 'rgba(14,14,14,0.34)',
    scrimDark: 'rgba(0,0,0,0.5)',

    // Müdür 10b — iptal mi silme mi
    menuRowHeight: 74,
} as const;

/**
 * Müdür 07 — randevuyu taşıma.
 * Değerler `Luera Mobil - Mudur Modu.html` içindeki gerçek CSS'ten.
 */
export const moveMetrics = {
    // Hedef slot (.cslot.tgt) — turuncu vurgu ve yeni saati söyleyen etiket.
    targetBg: 'rgba(255,90,31,0.14)',
    targetRadius: 18,
    targetBorder: 1,
    targetLabel: 12,

    // Alt bant (.banner)
    bannerX: 18,
    bannerY: 13,
    bannerPadX: 15,
    bannerRadius: 14,
    bannerText: 13.5,
    bannerLine: 1.45,
    bannerGap: 10,
    bannerIcon: 19,
    /** Turuncu hâl: hedef geçerli. */
    bannerOkBg: 'rgba(255,90,31,0.10)',
    bannerOkBorder: 'rgba(255,90,31,0.30)',
    /** Kırmızı hâl: hedef dolu, blok oraya yerleşmeyecek. */
    bannerBadBg: 'rgba(201,64,64,0.11)',
    bannerBadBorder: 'rgba(201,64,64,0.26)',

    // Durum rozeti (.stat.ok) — Müdür 07d
    statHeight: 28,
    statX: 10,
    statRadius: 10,
    statText: 12,
    statDot: 8,
    statOkBg: 'rgba(45,143,50,0.13)',

    // Menü ve sonuç sheet'leri (.sheet.low)
    menuRadius: 22,
    resultGap: 14,
    resultTitle: 21,
    resultSubtitle: 13.5,
    /** İki buton yan yana, ikisi de 60 pt ve alt üçte birde. */
    resultActionGap: 10,
} as const;

/**
 * Müdür 13 — toplanmış çubuk · gün cetveli.
 * Değerler `Luera Mobil - Mudur 13 Toplanmis Cubuk.html` içindeki gerçek
 * CSS'ten. Parantezli sayılar 375 × 667 karşılıkları.
 *
 * Levha KAPALI BİR HAP DEĞİL: ekranın tepesinden başlar, üst kenarı ve üst
 * köşeleri yoktur, durum çubuğu onun içinde kalır. Bu yüzden güvenli alanı
 * yeniden örtüyor — okunabilirlik geometriden değil malzemeden geliyor ve
 * içeriğin altından geçmesi sorun olmuyor.
 */
export const scrubberMetrics = {
    sideMargin: 8,
    /** Güvenli alanın altındaki iç boşluk. */
    topGap: 12,
    topGapSmall: 8,
    /**
     * Cetvelin yan boşluğu. Rakam dizisi bu boşluğun içinde durur; çentik
     * bandı DEĞİL — bant kenardan kenara gider ve alt köşe yarıçapı keser.
     */
    padX: 8,
    padXSmall: 8,
    /** Alt iç boşluk YOK: çentikler panelin alt kenarında biter. */
    bottomRadius: 20,

    /**
     * BAŞLIK SATIRI YOK (Müdür 19 · A).
     *
     * Eski levhada ortalanmış "Per. 13" vardı ve hemen altındaki hapta aynı
     * rakam ikinci kez yazıyordu. Referansta levha yalnız iki şey taşır:
     * yedi rakam ve cetvel. "Bugüne dön" işi rakamlara dokunmaya geçti.
     */

    // Cetvel — `.ruler{height:calc(var(--pillh) + 14px)}`
    railHeight: 44,
    railHeightSmall: 44,
    numberRow: 30,
    numberRowSmall: 30,
    /**
     * Rakam 13 değil 16.
     *
     * Referans bir kanal başlığıydı; orada cetvel ikincil bir süstü ve 13 pt
     * yetiyordu. Bizde levhanın TAŞIDIĞI TEK ŞEY bu — birincil kontrol.
     * Rakam satırı hapın yüksekliği kadar (30 pt), 16 pt orada rahat duruyor
     * ve bar hiç büyümüyor. Hedef kitle 40–55 yaş.
     */
    numberSize: 16,
    numberSizeSmall: 16,

    /**
     * Gün adımı TÜRETİLİR: `(levha genişliği − 2×padX) / 7`. Sabit yazılamaz —
     * panel genişliği değişince çentikler rakamlarla hizasını kaybeder.
     */
    visibleDays: 7,
    /** Çentik aralığı da türetilir: `adım / 10`. Her 10. çentik gün merkezi. */
    ticksPerDay: 10,

    /**
     * Üç kademe çentik. Hepsi 1 pt kalınlıkta ve hepsi bandın TABANINDAN
     * yukarı çıkar; renk farkı boy farkına eşlik eder.
     *   kısa  → günün onda biri, en soluk
     *   uzun  → gün merkezi, rakamın TAM altında
     *   ay    → ayın değiştiği gün; levhada ay adı yazmadığımız için sınırı
     *           söyleyen tek işaret
     */
    /**
     * Üç kademe birer pt büyütüldü (5·9·11 → 6·10·12).
     *
     * Daha fazlası bara mal olurdu: hapın alt kenarı ile bandın dibi arası
     * SABİT 14 pt ve uzun çentik ile oynatma çizgisi bunu paylaşıyor.
     * Uzun çentik 11'e çıksaydı çizgiye 3 pt kalır, çizgi noktaya dönerdi.
     */
    tickBand: 12,
    tickSmall: 6,
    tickMajor: 10,
    tickMonth: 12,

    /** Seçili gün — NÖTR ve ÇERÇEVELİ. Dolgu yok; turuncu yalnız bugünde. */
    pillWidth: 40,
    pillHeight: 30,
    pillRadius: 11,
    pillTop: 0,

    /**
     * Oynatma çizgisi hapın altından iner ve UZUN ÇENTİĞİN TEPESİNDE biter:
     * 5 + 9 = 14 pt kesintisiz tek eksen. Bandın dibine kadar inseydi uzun
     * çentiğin üstünden geçer, iki ayrı çizgi gibi görünürdü.
     */
    playheadWidth: 1,
    playheadHeight: 4,

    // Bugün — turuncunun bu ekrandaki TEK yeri.
    todayDot: 6,
    /**
     * Nokta MERKEZİ hapın alt kenarı hizasında.
     * Hap alt kenarı bandın dibinden 14 pt yukarıda (uzun çentik 9 + çizgi 5);
     * nokta 6 pt olduğu için alt kenarı 14 − 3 = 11.
     */
    todayDotBottom: 11,
    todayLine: 4,

    /** Buzlu cam: `expo-blur` yoğunluğu ve üstündeki ton örtüsü. */
    blurIntensity: 50,
    toneDark: 'rgba(10,7,3,0.44)',
    toneLight: 'rgba(250,247,243,0.54)',
    /** Çerçeveli hapın kenarı ve dolgusu — iki temada ayrı. */
    pillBorderDark: 'rgba(255,255,255,0.40)',
    pillBorderLight: 'rgba(14,14,14,0.30)',
    pillFillDark: 'rgba(255,255,255,0.05)',
    pillFillLight: 'rgba(255,255,255,0.40)',
    /** Rakam renkleri levhanın kendi paletinden; sayfa paletinden değil. */
    numDark: 'rgba(243,237,227,0.60)',
    numLight: 'rgba(14,14,14,0.52)',
    numSelDark: '#FFFFFF',
    numSelLight: '#0E0E0E',
    tickDark: 'rgba(243,237,227,0.40)',
    tickLight: 'rgba(14,14,14,0.32)',
    tickMajorDark: 'rgba(243,237,227,0.66)',
    tickMajorLight: 'rgba(14,14,14,0.56)',
    playheadDark: 'rgba(255,255,255,0.88)',
    playheadLight: 'rgba(14,14,14,0.80)',
    edgeDark: 'rgba(243,237,227,0.14)',
    edgeLight: 'rgba(14,14,14,0.11)',
} as const;

export const authMotion = {
    statusIn: 140,
    statusReduced: 100,
    errorShake: 180,
    errorOffset: 6,
    screenForward: 240,
    screenBack: 200,
    screenReduced: 160,
    sheetIn: 260,
    sheetOut: 180,
    digitReduced: 100,
    codeDigitStartScale: 0.85,
    codeDigitDamping: 20,
    codeDigitStiffness: 320,
    codeDigitMass: 0.5,
    pinDigitStartScale: 0.72,
    pinDigitDamping: 20,
    pinDigitStiffness: 340,
    pinDigitMass: 0.5,
} as const;

export const radius = { sm: 10, md: 14, lg: 18, xl: 22, pill: 999 } as const;

export const space = { xs: 6, sm: 10, md: 14, lg: 18, xl: 24, xxl: 32 } as const;

/** HTML referansındaki Hanken Grotesk ağırlıkları; yalnız yüklenen adlar. */
export const font = {
    regular: 'HankenGrotesk_400Regular',
    medium: 'HankenGrotesk_500Medium',
    semiBold: 'HankenGrotesk_600SemiBold',
    bold: 'HankenGrotesk_700Bold',
    extraBold: 'HankenGrotesk_800ExtraBold',
    black: 'HankenGrotesk_900Black',
} as const;

/**
 * Tipografi. Hanken Grotesk yüklenene kadar sistem yazı tipine düşer —
 * font dosyası eklendiğinde yalnız burası değişir.
 */
export const type = {
    h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.9 },
    h2: { fontSize: 21, fontWeight: '800', letterSpacing: -0.6 },
    h3: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
    body: { fontSize: 15.5, fontWeight: '500', letterSpacing: -0.1 },
    small: { fontSize: 13.5, fontWeight: '500' },
    tiny: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6 },
} as const;

/**
 * Takvimin büyük başlığı ve canlı sayaç; genel ekran tipografisinden bilinçli
 * olarak ayrılır. Takvimde ilgili CSS seçicisi esastır; HTML sonundaki RN
 * notları yalnız açıklamadır.
 */
export const display = {
    day: { fontSize: 44, fontWeight: '800', letterSpacing: -1.3 },
    daySmall: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
    dayMini: { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
    counter: { fontSize: 44, fontWeight: '800', letterSpacing: -2.2 },
} as const;

export interface EmbedPalette {
    bg: string;
    tx: string;
    tx2: string;
    tx3: string;
    chipBg: string;
    chipTx: string;
    riskBg: string;
    riskTx: string;
    /** Gömülü kartın kendi iskelet çizgisi; sayfanın iskeletinden ayrı. */
    skeleton: string;
}

/**
 * İskelet ve çevrimdışı bandı.
 *
 * İSKELETTE PARLAMA YOK. Hareket sözleşmesi genel bir shimmer döngüsü
 * tanımlıyor ama Takvim tasarımı bu ekran için açıkça "parlama/shimmer yok —
 * sakin kalır" diyor. Ekranın kendi tasarımı daha özel olduğu için o kazanır:
 * bekleme sırasında dönen bir ışık, iş uygulamasında dikkat çalar.
 */
export const skeleton = {
    radius: 10,
    subtitle: { width: 150, height: 12 },
    time: { width: 38, height: 13 },
    name: { height: 19 },
    service: { height: 14 },
} as const;

export const offlineBar = {
    height: 26,
    fontSize: 12,
    /** Amber zemin üzerinde okunan tek renk; paletteki metin renkleri yetmiyor. */
    tx: '#1A1200',
} as const;

// Gömülü müşteri özeti sayfanın daima tersidir: açık sayfada koyu, koyu
// sayfada açık yüzey. Bu terslik cam değil, opak bir bilgi katmanıdır.
export const embed = {
    light: {
        bg: '#241E16',
        tx: '#F7F2EA',
        tx2: 'rgba(243,237,227,0.58)',
        tx3: 'rgba(243,237,227,0.42)',
        chipBg: '#FAF3E9',
        chipTx: '#0E0E0E',
        riskBg: 'rgba(255,196,84,0.14)',
        riskTx: '#FFC96B',
        skeleton: 'rgba(243,237,227,0.10)',
    },
    dark: {
        bg: '#FAF7F3',
        tx: '#0E0E0E',
        tx2: 'rgba(14,14,14,0.52)',
        tx3: 'rgba(14,14,14,0.34)',
        chipBg: '#1C1710',
        chipTx: '#F3EDE3',
        riskBg: 'rgba(184,122,0,0.16)',
        riskTx: '#8A5C00',
        skeleton: 'rgba(14,14,14,0.07)',
    },
} satisfies Record<'light' | 'dark', EmbedPalette>;

/** Turuncu eylem yüzeylerinin sabit yüksek-kontrast metni. */
export const onAccent = '#FFFFFF';

// Uygulamadaki tek gradyan; kaydırınca sönen sıcak takvim parıltısı.
export const glow = {
    height: 298,
    dark: ['rgba(255,90,31,0.18)', 'rgba(255,90,31,0.07)', 'rgba(18,14,8,0)'],
    light: ['rgba(255,90,31,0.08)', 'rgba(255,90,31,0.03)', 'rgba(243,236,224,0)'],
    locations: [0, 0.45, 1] as [number, number, number],
} as const;

/**
 * Takvim ölçü sözleşmesi. Normal CSS seçicileri varsayılandır; `.week.big`
 * erişilebilirlik ölçüleri aşağıdaki ayrı sette tutulur.
 */
export const calendarMetrics = {
    pageX: 18,
    cardPadding: 18,
    cardPaddingSmall: 14,
    cardGap: 14,
    timeWidth: 44,
    timeGap: 10,
    avatar: 40,
    weekSelected: 38,
    weekTarget: 34,
    monthCell: 52,
    nowHeight: 24,
    statusHeight: 28,
    summaryMinHeight: 60,
    liveActionHeight: 44,
    dueRowHeight: 48,
    dueActionHeight: 40,
    bottomInset: 118,
} as const;

/** CSS `.week.big` erişilebilir büyük yazı varyantı; normal şeride uygulanmaz. */
export const calendarLargeTypeMetrics = {
    weekSelected: 56,
    weekTarget: 52,
    weekNumber: 22,
    weekNumberSelected: 24,
} as const;

/**
 * Sayaç ve tutarlar — rakamlar zıplamasın.
 *
 * `as const` DEĞİL: RN'in TextStyle'ı değiştirilebilir bir dizi bekliyor,
 * dondurulmuş dizi tip hatası veriyor.
 */
export const numeric: { fontVariant: ['tabular-nums'] } = { fontVariant: ['tabular-nums'] };

/** 375 × 667 sıkışması — tasarımın verdiği ölçüler. */
export const SMALL_WIDTH = 380;

// ── Müdür 14 · Kasa ─────────────────────────────────────────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 14 Kasa.html`. Değerler
// oradaki CSS seçicilerinden okundu, ekran görüntüsünden tahmin edilmedi.
//
// Kasa'nın kendi renk seti var çünkü kahraman panel HER İKİ TEMADA DA KOYU.
// Panelin içindeki oran çubuğu bu yüzden temaya değil `cashInk.dark`e bakar;
// panelin dışındaki hareket kartları temaya bakar. Tasarımda da aynı ayrım
// var: `.hero` kendi içinde `--m1/--m2/--m3` jetonlarını koyu değerlere geri
// tanımlıyor.

export type CashMethod = 'cash' | 'card' | 'transfer' | 'other';
export type CashStatus = 'normal' | 'corrected' | 'voided';

export interface MethodInk {
    /** Dairenin dolgusu ve oran çubuğundaki dilim. */
    fill: string;
    /** Dairenin içindeki baş harfler. */
    ink: string;
}

export interface CashInk {
    cash: MethodInk;
    card: MethodInk;
    transfer: MethodInk;
    /** "Diğer" renk almaz — nötr daire, kelimesi DİĞER. */
    other: MethodInk;
    /** Kart tonu: düzeltilmiş (amber) ve iptal (kırmızı) gradyanları. */
    correctedFrom: string; correctedTo: string; correctedBorder: string;
    voidedFrom: string; voidedTo: string; voidedBorder: string;
}

export const cashInk: { dark: CashInk; light: CashInk } = {
    dark: {
        cash: { fill: '#C08457', ink: '#2A1A0E' },
        card: { fill: '#D6A583', ink: '#2A1A0E' },
        transfer: { fill: '#EBCFB6', ink: '#2A1A0E' },
        other: { fill: '#252015', ink: 'rgba(243,237,227,0.58)' },
        correctedFrom: 'rgba(217,164,59,0.20)', correctedTo: 'rgba(217,164,59,0.09)',
        correctedBorder: 'rgba(217,164,59,0.34)',
        voidedFrom: 'rgba(224,114,114,0.19)', voidedTo: 'rgba(224,114,114,0.08)',
        voidedBorder: 'rgba(224,114,114,0.32)',
    },
    light: {
        cash: { fill: '#8A4A2B', ink: '#FFFDFB' },
        card: { fill: '#A5643B', ink: '#FFFDFB' },
        // Havale açık temada en açık basamak; krem mürekkep üstünde kaybolur.
        transfer: { fill: '#C08A5E', ink: '#3A2214' },
        other: { fill: '#F0E9DF', ink: 'rgba(14,14,14,0.52)' },
        correctedFrom: 'rgba(184,122,0,0.16)', correctedTo: 'rgba(184,122,0,0.06)',
        correctedBorder: 'rgba(184,122,0,0.30)',
        voidedFrom: 'rgba(201,64,64,0.13)', voidedTo: 'rgba(201,64,64,0.045)',
        voidedBorder: 'rgba(201,64,64,0.28)',
    },
};

/**
 * Kasa ölçü sözleşmesi.
 *
 * Türetilen ölçü YALNIZ üç tane: oran çubuğu dilim genişlikleri (yüzde), kart
 * metin kolonu (flex) ve dev rakamın küçük ekran puntosu. Geri kalan her sayı
 * burada sabit durur ve `PixelRatio`'ya sokulmaz.
 */
export const cashMetrics = {
    // Kahraman panel — iki temada da koyu.
    heroBg: '#1C1710',
    heroRadius: 34,
    heroPadBottom: 20,
    heroShadowOffset: { width: 0, height: 8 },
    heroShadowRadius: 18,
    heroShadowOpacity: 0.34,
    heroElevation: 6,

    // Etek gradyanı: panelin alt %38'i, en sıcak nokta TAM ALT KENAR.
    skirtRatio: 0.38,
    skirtColors: [
        'rgba(120,52,12,0)',
        'rgba(140,60,14,0.34)',
        'rgba(176,72,16,0.64)',
        'rgba(214,84,18,0.96)',
    ] as const,
    skirtLocations: [0, 0.34, 0.68, 1] as [number, number, number, number],

    // Dönem şeridi — referansta avatar/ikonun durduğu hatta.
    segHeight: 36,
    segRadius: 13,
    segPad: 3,
    segGap: 3,
    segTop: 6,
    segButtonRadius: 10,
    segButtonPadX: 14,
    segButtonMinWidth: 44,
    segFont: 13.5,
    /** Şerit 36 pt; dokunma alanı hitSlop ile 44'e tamamlanır. */
    segHitSlop: 7,

    // Kahraman blok.
    labelTop: 20,
    labelFont: 11.5,
    labelSpacing: 2.3,
    // CSS otorite: .money 68 · .phone.sm .money 58 · .ax .money 72.
    // (Belgenin RN notundaki 96/78 çifti CSS ile çelişiyor, CSS esas alındı.)
    money: 68,
    moneySmall: 58,
    moneyAx: 72,
    moneyWeightIsThin: true,
    moneySpacing: -0.8,
    moneyLineRatio: 1.04,
    /** ₺ ile rakam arası, punto oranı — tasarımda .money s{margin-right:.04em}. */
    currencyGap: 0.04,
    /**
     * TASARIMDAN BİLİNÇLİ SAPMA — gerekçesi teknik, biçimsel değil.
     *
     * CSS'te `.money{line-height:.84}` metni kırpmaz; satır kutusu küçük olsa
     * bile harfler taşar ve görünür. React Native'de `Text` kendi kutusuna
     * KIRPIYOR: lineHeight fontSize'ın altına inince rakamların tepesi
     * kesiliyor.
     *
     * Bu yüzden lineHeight fontSize'ın hemen üstünde tutuluyor ve tasarımın
     * sıkı dikey ritmi ÜST/ALT PAYLARDAN geri alınıyor. Toplam dikey ayak izi
     * tasarımdakiyle aynı kalıyor:
     *   tasarım : 8 + (68 × .84) + 14  = 79,1
     *   burada  : 4 + (68 × 1.04) + 6  = 80,7
     */
    moneyTop: 4,
    moneyBottom: 6,
    deltaHeight: 30,
    deltaRadius: 11,
    deltaPadX: 12,
    deltaGap: 5,
    deltaFont: 13.5,
    sumTop: 10,
    sumFont: 13,

    // Oran çubuğu.
    ratioTop: 18,
    ratioX: 20,
    ratioGap: 9,
    barHeight: 10,
    barRadius: 5,
    barGap: 2,
    legFont: 12.5,
    legDot: 9,
    legGap: 16,

    // Arkadan taşan panel — koyu panelin ALTINA giriyor, üst kenarı görünmez.
    pendOverlap: -26,
    pendSideMargin: 12,
    pendPadTop: 38,
    pendPadBottom: 12,
    pendPadX: 18,
    pendMinHeight: 96,
    pendRadius: 28,
    pendGap: 12,
    pendTitleFont: 17,
    pendSubFont: 13,
    pendGradient: ['#C63C0C', '#E8430F', '#FF5A1F'] as const,
    pendLocations: [0, 0.45, 1] as [number, number, number],
    pendInk: '#FFF9F5',
    pendSubInkDark: 'rgba(255,255,255,0.82)',
    pendSubInkLight: 'rgba(255,255,255,0.86)',
    pendElevation: 1,

    // Hareketler başlığı.
    kickerTop: 18,
    kickerX: 20,
    kickerBottom: 10,
    kickerFont: 11.5,
    kickerSpacing: 2.1,
    counterFont: 12.5,

    // Hareket kartları.
    listGap: 8,
    listX: 20,
    cardMinHeight: 78,
    cardRadius: 20,
    cardPadY: 13,
    cardPadX: 14,
    cardGap: 12,
    avatar: 42,
    avatarFont: 14.5,
    nameFont: 16.5,
    serviceFont: 13,
    whoFont: 11.5,
    amountFont: 20,
    amountFontSmallDigits: 17,
    amountFontBigDigits: 23,
    methodFont: 11,
    methodSpacing: 1.1,
    methodIcon: 15,
    chipHeight: 20,
    chipRadius: 7,
    chipFont: 10.5,
    traceFont: 11,
    strikeWidth: 1.6,

    // Sheet (14b) ve iptal onayı (14c).
    sheetRadius: 26,
    sheetMaxHeight: 704,
    sheetMotion: 320,
    // Aşağı çekip kapatma eşikleri.
    /** Jestin sheet'i devralması için gereken en küçük iniş. */
    dragClaim: 6,
    /** Bu kadar indiyse bırakınca kapanır. */
    dragClose: 96,
    /** Ya da bu hızla atıldıysa — kısa ama hızlı çekiş de kapatır. */
    dragFling: 0.7,

    grabHeight: 26,
    grabBarWidth: 38,
    grabBarHeight: 5,
    sheetAmountFont: 26,
    sheetRowHeight: 26,
    sheetRowFont: 15,
    actionHeight: 66,
    actionRadius: 20,
    actionFont: 16.5,
    alertWidth: 296,
    alertRadius: 24,
    alertActionHeight: 56,

    // Alt.
    dayEndTop: 16,
    dayEndHeight: 44,
    dayEndFont: 14.5,
    padBottom: 112,

    /** Erişilebilirlik eşiği: bunun üstünde kart dikeye yığılır. */
    axFontScale: 1.6,
} as const;

// ── Müdür 15 · Randevu oluştur ──────────────────────────────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 15 Randevu Olustur.html`
// (v2). Her sayı oradaki CSS seçicisinden okundu; ekran görüntüsünden ölçü
// tahmin edilmedi. Belgenin sonundaki şartname tablosu ile CSS iki yerde
// çelişmişti (kahraman rakamı, mercek bandı) — v2'de ikisi de CSS lehine
// düzeltildi, burada CSS değerleri var.
//
// Ekran Kasa ile AYNI İSKELETİ kullanıyor: koyu sıcak kahraman levha + üstüne
// yükselen krem içerik levhası. Yeni bir dil icat edilmedi.

/** Kahraman levha her iki temada da koyu; içindeki renkler temaya bakmaz. */
export interface ApptInk {
    /** Turuncu kutunun üstündeki mürekkep — seçili gün rakamı. */
    ork: string;
    /** Turuncu butonun üstündeki mürekkep. */
    pink: string;
    /** Seçili aralık bloğunun zemini (üstten alta). */
    blockFrom: string;
    blockTo: string;
    blockBorder: string;
    /** Blok içindeki 30 dakikalık tikler. */
    blockTick: string;
}

export const apptInk: { dark: ApptInk; light: ApptInk } = {
    dark: {
        ork: '#231006', pink: '#FFF9F5',
        blockFrom: 'rgba(255,90,31,0.20)', blockTo: 'rgba(255,90,31,0.09)',
        blockBorder: 'rgba(255,90,31,0.40)', blockTick: 'rgba(255,90,31,0.22)',
    },
    light: {
        ork: '#2A1206', pink: '#FFF9F5',
        blockFrom: 'rgba(255,90,31,0.17)', blockTo: 'rgba(255,90,31,0.07)',
        blockBorder: 'rgba(232,67,15,0.38)', blockTick: 'rgba(255,90,31,0.22)',
    },
};

/** Seçili gün kutusundaki kısaltma. v1'de .72 idi ve turuncu üstünde 3.26:1
 *  veriyordu; 11 pt metin için eşik 4.5. v2'de .92 → 5.3:1. */
export const APPT_SELECTED_DAY_LABEL = 'rgba(35,16,6,0.92)';

export const apptMetrics = {
    // ── İstif (.hero · .skirt · .plate) ─────────────────────────────────────
    heroBg: '#1C1710',
    heroRadius: 34,
    heroPadBottom: 22,
    heroPadBottomSmall: 22,
    heroShadowOffset: { width: 0, height: 8 },
    heroShadowRadius: 18,
    heroShadowOpacity: 0.34,
    heroElevation: 6,
    /** .skirt — yüksekliğin %44'ü, alt kenara kadar kesintisiz ısınır. */
    skirtRatio: 0.44,
    skirtColors: [
        'rgba(120,52,12,0)', 'rgba(140,60,14,0.22)',
        'rgba(176,72,16,0.34)', 'rgba(214,84,18,0.44)',
    ] as const,
    skirtLocations: [0, 0.4, 0.74, 1] as [number, number, number, number],
    plateRadius: 28,
    plateOverlap: -16,
    platePadTop: 6,

    // ── Üst çubuk (.top · .gbtn · .step) ────────────────────────────────────
    topHeight: 56,
    topHeightSmall: 50,
    topX: 18,
    topXSmall: 14,
    topGap: 12,
    topTitle: 15.5,
    stepSize: 11,
    stepTracking: 0.2,
    /** Cam DEĞİL: düz tint + hairline. Düğme opak levhanın üstünde duruyor,
     *  kıracak hareketli içerik yok — orada cam sahte cam olur. */
    gbtn: 44,

    // ── Tipografik kahraman (.htitle · .hday · .hsub) ───────────────────────
    heroTitleX: 22,
    heroTitleXSmall: 18,
    heroTitleTop: 6,
    heroTitleTopSmall: 4,
    /** .hday b / .hday em — şartname 58 diyordu, CSS 54. CSS otorite. */
    day: 54,
    daySmall: 44,
    dayAx: 34,
    dayTracking: -0.05,
    dayNumberTracking: -0.03,
    /** Marka noktası — .hday b i, rakam boyutunun oranı. */
    dotRatio: 0.13,
    /**
     * Sayfa 1'in tipografik kahramanı (.hq). Belgenin v1'inde vardı, v2 onu
     * sessizce düşürdü — sayfa 1 bu yüzden sayfa 2'nin yanında zayıf kalmıştı.
     * CSS kuralı v2'de de duruyor: 40 / 800 / -.035em.
     */
    title: 40,
    titleSmall: 32,
    titleAx: 30,
    /** Uzun müşteri adı 40 pt'ye sığmıyor; tek satırda kalsın diye küçülür. */
    titleLong: 30,
    titleLongAt: 14,
    titleTracking: -0.035,
    subTop: 12,
    subTopSmall: 7,
    subSize: 13.5,
    subSizeSmall: 12.5,
    subSizeAx: 16,
    subGap: 7,
    subDot: 3,

    // ── Gün şeridi (.strip · .d) ────────────────────────────────────────────
    stripTop: 14,
    stripTopSmall: 12,
    stripGap: 8,
    stripGapSmall: 7,
    dayBox: 48,
    dayBoxAx: 64,
    dayBoxHeight: 66,
    dayBoxHeightSmall: 58,
    dayBoxHeightAx: 80,
    dayBoxRadius: 17,
    dayBoxGap: 4,
    dayNumber: 20,
    dayNumberSmall: 18,
    dayNumberAx: 26,
    dayLabel: 11,
    dayLabelNamed: 11.5,
    dayLabelAx: 14,
    todayDot: 4,
    todayDotBottom: 6,
    selectedDot: 5,
    selectedDotBelow: -9,

    // ── Bölüm başlığı (.sec) ────────────────────────────────────────────────
    secTop: 16,
    secBottom: 8,
    secX: 20,
    secGap: 8,
    secTitle: 11.5,
    secTitleAx: 15,
    secTracking: 0.16,
    secLink: 12.5,

    // ── Dikey zaman rayı (.rail · .slot · .bcard · .pick · .pblk) ───────────
    railX: 20,
    railXSmall: 18,
    /** Boş satırın yüksekliği VE bir 30 dakikanın ray karşılığı. */
    slotHeight: 44,
    slotHeightAx: 56,
    timeColumn: 54,
    timeTop: 14,
    timeTopBusy: 20,
    timeSize: 13,
    timeSizeAx: 19,
    whySize: 12.5,
    whySizeAx: 17,
    /** Blok ile satır çizgisi arasındaki nefes; türetme formülünde de var. */
    blockGap: 8,
    cardMinHeight: 56,
    cardRadius: 16,
    cardPadY: 10,
    cardPadX: 13,
    cardGap: 11,
    cardMark: 3,
    cardMarkHeight: 34,
    cardTitle: 15,
    cardSub: 12.5,
    cardRange: 12.5,
    blockRadius: 18,
    blockPadTop: 12,
    blockPadX: 14,
    blockPadBottom: 10,
    /**
     * KISA HİZMETLERİN İÇİ — tasarımın çizmediği durum.
     *
     * Belge yalnız 75 dakikalık hizmeti çizdi (110 pt). Listede 30 ve 45
     * dakikalık hizmetler var: 45 dk → 66 pt, ama geniş yerleşim 12 + 21 + 26
     * + 10 = 69 pt istiyor ve personel satırının altı kırpılıyordu.
     * Çözüm bloğu büyütmek DEĞİL — büyütmek blok alt kenarını yalancı yapar.
     * İçerik kademeleniyor:
     *   ≥ 88 (60 dk+)  geniş   · iki satır, tam ölçüler
     *   ≥ 66 (45 dk)   sıkışık · iki satır, dar dolgu ve küçük avatar
     *   <  66 (30 dk)  tek satır · saat ve kişi aynı hizada
     */
    blockWideAt: 88,
    blockTightAt: 66,
    blockPadTopTight: 9,
    blockPadBottomTight: 8,
    blockTitleTight: 16,
    avatarTight: 22,
    avatarTextTight: 10,
    whoNameTight: 12.5,
    blockTitle: 17,
    blockTitleAx: 22,
    blockService: 12.5,
    blockDuration: 11.5,
    avatar: 26,
    avatarText: 11,
    whoName: 13.5,
    whoAction: 12.5,

    // ── Not (.noterow) ──────────────────────────────────────────────────────
    noteHeight: 56,
    noteTop: 10,
    noteRadius: 16,
    notePadX: 14,
    noteGap: 10,
    noteSize: 14.5,

    // ── Arama (.search · .sfloat) ───────────────────────────────────────────
    searchHeight: 52,
    searchRadius: 17,
    searchPadX: 15,
    searchTop: 18,
    searchGap: 10,
    searchSize: 16,
    floatHeight: 56,
    floatRadius: 19,
    floatTop: 12,
    floatX: 12,
    floatPadX: 16,
    floatClear: 26,

    // ── Müşteri ve hizmet satırı (.crow · .picked · .srow) ──────────────────
    rowHeight: 62,
    rowPadY: 6,
    rowGap: 12,
    rowAvatar: 42,
    rowAvatarText: 14.5,
    rowName: 16,
    rowHint: 12.5,
    rowPhone: 12.5,
    pickedTop: 16,
    pickedRadius: 18,
    pickedPadY: 9,
    pickedPadX: 13,
    pickedName: 17,
    serviceRadius: 16,
    servicePadX: 14,
    serviceGap: 7,
    serviceMark: 3,
    serviceMarkHeight: 30,
    serviceMeta: 14,
    serviceCheck: 22,

    // ── Boş sonuç / yeni müşteri (.empty · .solid · .hint) ──────────────────
    emptyTop: 26,
    emptyGap: 8,
    emptyTitle: 19,
    emptyBody: 14,
    solidHeight: 66,
    solidTop: 18,
    solidRadius: 20,
    solidText: 17,
    hintTop: 10,
    hintSize: 12.5,

    // ── Yüzen özet çubuğu + eylem (.bar · .kv · .cta) ───────────────────────
    barX: 12,
    /**
     * Çubuk alt güvenli alandan bu kadar yukarıda durur.
     * Tasarımın 46'sı = 34 (çentikli telefonun alt güvenli alanı) + 12.
     * Sekme çubuğunu sistem çiziyor (NativeTabs) ve UIKit onu çocuk ekranın
     * `safeAreaInsets.bottom` değerine ekliyor — sabit 46 yazsaydık çubuk
     * sekme çubuğunun ARKASINDA kalırdı. Bu yüzden 46 değil, inset + 12.
     */
    barLift: 12,
    barLiftSmall: 12,
    barRadius: 28,
    barRadiusSmall: 26,
    barPadTop: 15,
    barPadX: 16,
    barPadBottom: 16,
    barGap: 13,
    /**
     * Özet ızgarası yokken (sayfa 1'de henüz seçim yapılmamışken) çubuk
     * yalnız pasif butonu taşıyor. Tam dolguyla 97 pt'lik donuk bir blok
     * gibi okunuyordu; dolgu daralıyor ve pasif buton dolgusunu bırakıp
     * ince bir çerçeveye düşüyor — cam tek levha olarak okunsun.
     */
    barPadMini: 10,
    kvGapRow: 12,
    kvGapCol: 14,
    kvLabel: 11,
    kvLabelAx: 14,
    kvTracking: 0.13,
    kvValue: 17,
    kvValueAx: 22,
    ctaHeight: 66,
    ctaHeightAx: 78,
    ctaRadius: 21,
    ctaText: 17.5,
    ctaTextAx: 21,

    /**
     * Çubuğun kendi yüksekliği:
     *   15 (üst dolgu) + 92 (2 × 2 ızgara) + 13 (gap) + 66 (buton)
     *   + 16 (alt dolgu) = 202.
     * Sayfa 1'in iki satırlık ızgarası 92 yerine 40 → 150.
     *
     * Çubuk altı pay = bu yükseklik + alt güvenli alan + 12. Belgenin v1'i
     * toplamı 232 diyordu ve 13'lük gap'i atlamıştı; 20:00 satırı çubuğun
     * altında kalıyordu. v2 248'e çıkardı — o da SABİT bir sayıydı ve sekme
     * çubuğunu hesaba katmıyordu; burada güvenli alandan türetiliyor.
     */
    barHeight: 202,
    barHeightMini: 150,

    /** Erişilebilirlik: bu ölçeğin üstünde yatay düzenler dikeye yığılır. */
    axFontScale: 1.35,
} as const;

// ── Müdür 16 · Randevu oluşturuldu onayı ────────────────────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 16 Randevu Onayi.html`.
// Şartname tablosu ile CSS bu belgede birebir tutuyor; değerler CSS'ten.
//
// İSTİF KULLANILMADI ve bu bilinçli: koyu kahraman levha + krem içerik levhası
// istifi, üstte bağlam altta liste olan ekranlar için. Burada tek bir sonuç
// cümlesi ve onun kanıtı var; ikiye bölmek sonucu ikinci sıraya düşürürdü.
// Ayrıca teknik bir sebep de var — halkayı tüketen kapaklar EKRAN ZEMİNİ
// renginde, yani ekran tek yüzey olmak zorunda.

export const confirmMetrics = {
    bodyX: 20,
    heroTop: 64,
    heroTopSmall: 26,
    heroTopAx: 34,
    heroGap: 20,
    heroGapSmall: 14,

    // Geri sayım halkası (.cf-ring) — iki dönen kapakla tüketilir.
    ring: 116,
    ringSmall: 92,
    ringAx: 84,
    /** D hâlinde küçük halka. */
    ringMini: 72,
    ringStroke: 3,
    /** Tik diski: halkanın içinde 19 boşlukla → 78. */
    tickInset: 19,
    tickInsetSmall: 15,
    tickInsetAx: 14,
    tickInsetMini: 12,
    tickIcon: 34,
    tickIconSmall: 28,
    tickIconAx: 26,
    tickIconMini: 22,
    tickStroke: 2.6,

    title: 34,
    titleSmall: 29,
    titleAx: 30,
    titleMini: 30,
    subtitle: 14.5,

    // Kanıt kartı (.cf-card) — OPAK, cam değil.
    cardTop: 32,
    cardTopSmall: 18,
    cardRadius: 24,
    cardPadX: 16,
    rowHeight: 52,
    rowName: 16,
    rowPhone: 13,
    whenPadTop: 14,
    whenPadBottom: 16,
    whenDay: 14.5,
    whenRange: 32,
    whenRangeSmall: 28,
    whenRangeAx: 30,
    staffAvatar: 36,
    staffName: 13.5,
    svcHeight: 56,
    svcMark: 3,
    svcMarkHeight: 30,
    svcName: 16,
    svcMeta: 13,
    svcPrice: 17,
    memoPadTop: 12,
    memoPadBottom: 14,
    memoLabel: 11.5,
    memoText: 13.5,

    // Mesaj önizlemesi (D) ve "randevu duruyor" şeridi (E)
    msgTop: 22,
    msgRadius: 22,
    msgPadY: 14,
    msgPadX: 16,
    msgLabel: 11.5,
    msgText: 15,
    stripTop: 20,
    stripHeight: 64,
    stripRadius: 20,
    stripPadY: 12,
    stripPadX: 15,
    stripTitle: 15,
    stripSub: 13,

    // Yüzen kontrol bloğu (.cf-dock) — ekranın TEK cam yüzeyi.
    dockX: 12,
    dockLift: 12,
    dockRadius: 28,
    dockPad: 14,
    dockGap: 10,
    primaryHeight: 66,
    primaryHeightAx: 78,
    primaryRadius: 21,
    primaryText: 17.5,
    primaryTextAx: 20,
    secondaryHeight: 52,
    secondaryHeightAx: 60,
    secondaryRadius: 17,
    secondaryText: 16,
    secondaryTextAx: 19,
    whyText: 12.5,
    noteText: 12,
    noteTextAx: 15,
    spinner: 20,
    spinnerStroke: 2,

    /** Bu ölçeğin üstünde yatay satırlar dikeye yığılır. */
    axFontScale: 1.6,
    /** Bu yüksekliğin altında sıkışma ölçüleri devreye girer. */
    shortHeight: 700,

    // Hareket şartnamesi (bölüm 07) — yalnız opaklık ve dönüşüm.
    enterTick: 220,
    enterTitle: 200,
    enterTitleDelay: 70,
    enterCard: 200,
    enterCardDelay: 120,
    enterDock: 220,
    enterDockDelay: 180,
    enterReduced: 160,
    tickScaleFrom: 0.92,
    titleShift: 8,
    cardShift: 12,
    dockShift: 16,
    holdOpacity: 0.34,
    holdFade: 160,
    spinPeriod: 900,
    exitFade: 200,
    exitScale: 0.98,
} as const;

/** Onay ekranının kendi renkleri: sonuç YEŞİL, zaman TURUNCU. */
export interface ConfirmInk {
    /** Tik diskinin zemini ve kenarı. */
    okFill: string; okBorder: string;
    /** Hata diski. */
    badFill: string; badBorder: string;
    /** Turuncu butonun üstündeki mürekkep. */
    pink: string;
}

export const confirmInk: { dark: ConfirmInk; light: ConfirmInk } = {
    dark: {
        okFill: 'rgba(95,191,100,0.13)', okBorder: 'rgba(95,191,100,0.34)',
        badFill: 'rgba(224,114,114,0.13)', badBorder: 'rgba(224,114,114,0.34)',
        pink: '#FFF9F5',
    },
    light: {
        okFill: 'rgba(45,143,50,0.10)', okBorder: 'rgba(45,143,50,0.30)',
        badFill: 'rgba(201,64,64,0.10)', badBorder: 'rgba(201,64,64,0.30)',
        pink: '#FFF9F5',
    },
};

// ── Müdür 25 · Randevu kartı, düzenleme ve taşıma sonucu ────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 25 Randevu Karti.html`.
// Değerler o dosyanın CSS'inden BİREBİR alındı; tablo ile CSS çeliştiğinde
// CSS esastır (depo kuralı) — burada ikisi zaten aynı.
//
// Sayfanın taşıdığı fikir: dört değiştirme satırı EŞİT DEĞİL. Saat ve personel
// günde onlarca kez değişir (jeton, h84), hizmet ve not ayda birkaç kez
// (satır, h62). Aynı ekranda dört chevron yerine iki jeton + iki chevron.

export const apptCardMetrics = {
    // Kimlik bloğu — gün MUTLAKA görünür
    identGap: 8,
    dayText: 11.5,
    dayTrack: 0.14,
    spanText: 26,
    /** 375 × 667: `09:40 – 11:10 · 90 dk` 26'da taşıyor. Saat KIRPILMAZ, punto iner. */
    spanTextSmall: 24,
    spanGap: 7,
    spanDur: 14,

    // Durum şeridi — "Müşteri geldi." artık gri bir cümle değil
    stateHeight: 52,
    statePadX: 14,
    stateRadius: 14,
    stateGap: 10,
    stateDot: 9,
    stateWord: 15.5,
    stateContext: 12.5,
    /** Yalnız `running` hâlinde; bekleme nabzıyla aynı ölçü. */
    statePulse: 2600,

    // Geldi / Gelmedi — günde onlarca kez basılır
    actHeight: 66,
    actRadius: 18,
    actGap: 10,
    actText: 18,
    actBorder: 1.5,

    // Yeni müşteri kartı (A2) — krem kart değil, sayfanın düzlemi
    newRadius: 18,
    newPadding: 14,
    newGap: 12,
    newTokenText: 15,
    newTokenDash: 1,

    // Jeton: saat · personel
    tileHeight: 84,
    tileRadius: 18,
    tilePadY: 12,
    tilePadX: 13,
    tileGap: 10,
    tileKicker: 11,
    tileKickerTrack: 0.13,
    tileKickerGap: 7,
    tileValue: 17,
    tileAvatar: 20,
    tileAvatarBorder: 1.5,
    tileAvatarText: 9,
    tileIcon: 15,

    // Satır: hizmet · not
    rowHeight: 62,
    rowGap: 12,
    rowTitle: 15,
    rowValue: 14,
    /** Değer bu genişliği aşarsa `tail` kırpılır — ücret korunur. */
    rowValueMax: 190,

    // Yıkıcı bölge
    dangerTop: 22,
    dangerBottom: 12,
    dangerGap: 10,
    dangerRowGap: 12,
    dangerIcon: 20,
    dangerText: 16,
    dangerHint: 12,

    // İptal edilmiş randevunun bilgi satırı — kutu değil, kenarlıklı satır
    infoHeight: 52,
    infoText: 13.5,

    // Alt sheet kabuğu (B, C, E)
    sheetRadius: 22,
    sheetPadX: 18,
    sheetPadBottom: 30,
    sheetGap: 14,
    sheetTitle: 21,
    sheetSave: 15,
    sheetSub: 13.5,
    sheetSubLine: 1.5,

    // B — hizmet seçimi
    optPadY: 13,
    optGap: 12,
    optName: 16,
    optMeta: 13,
    optTick: 24,
    optTickBorder: 1.5,
    optClash: 12.5,
    optClashDot: 7,

    // C — not
    fieldRadius: 18,
    fieldPadding: 14,
    fieldMinHeight: 132,
    fieldText: 16,
    fieldLine: 1.45,
    countText: 12,

    // D — onay diyaloğu (iptal ve silme aynı iskelet, farklı ağırlık)
    dlgInset: 24,
    dlgPadding: 20,
    dlgGap: 14,
    dlgRadius: 22,
    dlgTitle: 21,
    dlgBody: 14.5,
    dlgBodyLine: 1.5,
    dlgSumPadding: 14,
    dlgSumRadius: 18,
    dlgSumName: 16,
    dlgSumLine: 13,
    dlgBtnHeight: 52,
    dlgBtnRadius: 16,
    dlgBtnText: 16.5,
    dlgBtnGap: 9,
    /** Basılı tut çubuğu — uygulamanın TEK yerinde, tek geri alınamaz iş. */
    holdHeight: 3,
    holdRadius: 2,
    holdBorder: 'rgba(224,114,114,0.45)',

    // E — taşıma sonucu
    movePillHeight: 28,
    movePillX: 10,
    movePillRadius: 10,
    movePillText: 12,
    movePillDot: 8,
    movePillGap: 7,
    moveCardRadius: 18,
    moveCardPadding: 14,
    moveCardGap: 12,
    moveName: 16,
    moveTime: 22,
    moveTimeGap: 12,
    moveLabel: 11.5,
    moveLabelTrack: 0.1,
    moveArrow: 20,
    moveSub: 13,
    moveBtnHeight: 60,
    moveBtnRadius: 18,
    moveBtnGap: 10,
    moveBtnText: 17,
    moveOkHeight: 44,
    moveOkText: 16,
} as const;

/**
 * Müdür 25'in hareket sözleşmesi.
 *
 * Hepsi `useNativeDriver` ile sürülebilir: yalnız opaklık, translate ve
 * scale. Yükseklik, renk, yarıçap, gölge animasyonu YOK — renk değişimi iki
 * yüzeyin üst üste soldurulmasıyla yapılır.
 */
export const apptMotion = {
    /** Sayfanın içeriği üç kademede gelir: kim → durum → geçmiş ve düzenleme. */
    stage: { duration: 240, steps: [40, 100, 160] as const, rise: 10 },
    /**
     * "Geldi"ye basış: TAKAS, dönüşüm değil. Şeridin yüzeyi (r14, h52) hiç
     * kıpırdamaz; dönüşüm izlenimi ondan çıkar.
     */
    arrive: { out: 160, in: 220, delay: 60, lift: 6, rise: 8, press: 110, pressScale: 0.97 },
    /** Alt sheet. */
    sheet: { in: 300, out: 240 },
    /** Onay diyaloğu — sheet değil, ortada: karar sayfanın akışını keser. */
    dialog: { in: 200, out: 160, from: 0.96 },
    /** Taşıma oku: soldan sağa, taşımanın kendisi gibi. */
    move: {
        fromFade: 180, fromTo: 0.55,
        arrowIn: 220, arrowDelay: 60, arrowShift: 6,
        toIn: 260, toDelay: 80, toShift: 14,
    },
    /** Geri al'ın ömrü. Süre bitince sheet KAPANMAZ, yalnız düğme düşer. */
    undo: { life: 8000, fade: 240, rise: 8 },
    /** Silme düğmesi dokununca değil, basılı tutunca çalışır. */
    hold: 600,
} as const;

export const apptOutCurve = [0.4, 0, 1, 1] as const;
export const apptInCurve = [0.2, 0.8, 0.25, 1] as const;

/** Not alanının sınırları. 240'ı geçince sayaç amberleşir, 280'de giriş durur. */
export const NOTE_MAX = 280;
export const NOTE_WARN = 240;

/** Eğri dörtlüsünü `Easing.bezier`'e geçirilebilir hâle getirir. */
export type Curve = readonly [number, number, number, number];

// ── Müdür 23 · Müşteri kartı ────────────────────────────────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 23 Musteri Karti.html`.
// Değerler o dosyanın CSS'inden BİREBİR alındı.
//
// Ekranın taşıdığı fikir: kimlik BAŞ HARFLERDEN gelir — fotoğraf yok, olmayacak.
// Kahraman alan uygulamanın TEK gradyanını taşır; renk bütçesinin tamamı orada
// harcanır ve altındaki liste tamamen sakin ve koyudur.

/** Kahraman alanın gradyanı — uygulamadaki tek gradyan. 168°. */
export const customerHero = {
    stops: ['#5A3E22', '#43301C', '#2A1E12', '#160F09'] as const,
    locations: [0, 0.34, 0.68, 1] as const,
    /** 168° ≈ soldan sağa hafif eğimli, yukarıdan aşağı. */
    start: { x: 0.19, y: 0 } as const,
    end: { x: 0.81, y: 1 } as const,
    /** Sağ üstte %16 turuncu ışık — ikinci bir katman olarak biner. */
    glow: 'rgba(255,90,31,0.16)',
    glowClear: 'rgba(255,90,31,0)',
    /** Kahraman alanın içindeki mürekkep TEMADAN BAĞIMSIZ. */
    ink: '#F3EDE3',
    ink2: 'rgba(243,237,227,0.72)',
    ink3: 'rgba(243,237,227,0.62)',
    inkLabel: 'rgba(243,237,227,0.66)',
} as const;

/**
 * Cam — YALNIZ üç yüzeyde: kroma satırı, iki levha, toplanmış asılı levha.
 * Üçü de kahraman alanın üstünde yüzer. Kart, liste ve metin bloklarına
 * cam uygulanmaz.
 */
export const customerGlass = {
    fill: 'rgba(243,237,227,0.13)',
    border: 'rgba(243,237,227,0.20)',
    blur: 18,
    hangFill: 'rgba(36,26,16,0.72)',
    hangBorder: 'rgba(243,237,227,0.14)',
    hangBlur: 20,
    /** "Saydamlığı azalt" ya da cam yoksa: bulanıklık gider, ölçü kalır. */
    opaqueChrome: '#2C2114',
    opaquePlate: '#241A10',
} as const;

export const customerMetrics = {
    padX: 18,

    // Kahraman alan — durum çubuğu DAHİL, ekranın %51,5'i
    heroHeight: 439,
    /** Risk/borç satırı varsa alan UZAR: kırpılamayan bilgi kabını büyütür. */
    heroHeightWarn: 466,
    heroHeightSmall: 344,
    heroHeightWarnSmall: 372,
    heroRadius: 28,
    heroPadBottom: 76,

    // Kroma satırı — CAM
    chromeHeight: 44,
    chromeTop: 8,
    chromeGap: 10,
    chromeButton: 40,
    chromePillX: 18,
    chromePillXSmall: 14,
    chromePillText: 15.5,

    // Monogram — akıştaki 44'ün ~2,8 katı
    mono: 124,
    monoSmall: 104,
    monoBorder: 2.5,
    monoText: 42,
    monoTextSmall: 34,
    monoTop: 116,
    monoFill: 'rgba(18,14,8,0.34)',

    // Kimlik
    nameWidth: 228,
    nameWidthSmall: 210,
    nameText: 34,
    nameTextSmall: 29,
    phoneText: 13.5,
    phoneTop: 7,

    // Risk / borç satırı — CAM DEĞİL: bulanık zeminde 15.5 px kontrastı düşer
    // ve bu, kırpılması YASAK olan tek bilgidir.
    warnTop: 12,
    warnRadius: 14,
    warnFill: '#2A1A10',
    warnBorderRisk: 'rgba(224,114,114,0.34)',
    warnBorderDebt: 'rgba(217,164,59,0.34)',
    warnPadY: 11,
    warnPadRight: 13,
    warnPadLeft: 9,
    warnGap: 11,
    warnStripe: 4,
    warnLabel: 11.5,
    warnLabelTrack: 0.06,
    warnDot: 7,
    warnText: 15.5,
    warnTextLine: 1.25,

    // İki levha — CAM · 62 içeride, 44 dışarıda: SINIRIN ÜSTÜNDE durur
    plateHeight: 106,
    plateBottom: -44,
    plateGap: 10,
    plateRadius: 18,
    platePadding: 14,
    plateLabel: 11.5,
    plateValue: 30,
    /** Bilinen ama SAYISAL OLMAYAN değer bir kademe küçük ve ikincil ("Yok"). */
    plateValueSoft: 26,
    plateValueHeight: 32,
    plateValueTop: 10,
    plateUnit: 15,
    plateSub: 11.5,
    plateSubTop: 8,
    plateArrow: 30,
    plateArrowBorder: 'rgba(243,237,227,0.42)',
    plateArrowInset: 12,

    // İçerik — sakin, koyu, camsız
    contentTop: 58,
    sectPadTop: 14,
    sectPadBottom: 8,
    sectText: 11,
    sectTrack: 0.16,
    rowPadY: 16,
    rowGap: 12,
    rowName: 15.5,
    rowMeta: 13,
    rowAmount: 15.5,
    rowCurrency: 12.5,
    noteText: 14,
    noteLine: 1.45,
    emptyTitle: 15,
    emptySub: 13,

    // Gömülü krem kart — kart ailesiyle BİREBİR
    embedRadius: 18,
    embedPadding: 14,
    embedGap: 12,
    embedLabel: 11.5,
    embedHero: 34,
    embedHeroHeight: 36,
    embedUnit: 17,
    embedSub: 11.5,
    embedPillHeight: 40,
    embedPillX: 18,
    embedPillText: 15.5,
    embedPillBorder: 1.5,

    // Alt eylem çubuğu — BAŞPARMAK BÖLGESİ, hiç toplanmaz
    trayPadTop: 12,
    trayPadBottom: 30,
    trayGap: 9,
    trayRemind: 12.5,
    trayGhost: 13.5,
    trayMainHeight: 40,
    trayMainText: 15.5,

    // Toplanmış asılı levha — CAM · üst kenarı YOK, alt köşeler 20
    hangRadius: 20,
    hangPadTop: 8,
    hangPadBottom: 12,
    hangGap: 8,
    hangRowHeight: 44,
    hangName: 17,
    hangRisk: 13,
    hangButton: 36,
    hangButtonFill: 'rgba(243,237,227,0.10)',
    hangButtonBorder: 'rgba(243,237,227,0.16)',
    /** dolgu 8 + durum 59 + boşluk 8 + satır 44 + boşluk 8 + risk 20 + dolgu 12 */
    hangHeightRisk: 158,
    hangHeight: 138,
    /** Levhanın altındaki içerik buradan başlar — 15 pt nefes. */
    hangContentTop: 173,
} as const;

/**
 * Müdür 23'ün hareketi.
 *
 * Toplanma SÜRE değil KAYDIRMA KONUMU sürer: eşikler interpolasyondur.
 * Kahraman alanın yüksekliği animasyonlu DEĞİLDİR; asılı levha ayrı bir
 * mutlak katmandır.
 */
export const customerMotion = {
    /** Akıştan karta: yuvarlak AYNI elementtir, silinip yeniden çizilmez. */
    arrive: {
        out: 160,
        in: 220,
        delay: 60,
        rise: 8,
        /** 44 / 124 — akıştaki baş harf yuvarlağının kahraman monograma oranı. */
        monoFrom: 0.3548,
    },
    /** İki levha BİRLİKTE değil: 60 ms fark ikisinin ayrı yüzey olduğunu söyler. */
    plates: { duration: 220, delay: 60, rise: 10 },
    /** Risk bayrağı BİR KEZ hareket eder, sonra durur. Nabız yok. */
    warn: { duration: 220, delay: 60, rise: 8, shift: 16 },
    /** Toplanma eşikleri — süre değil, kaydırma konumu. */
    collapse: [0, 24, 32, 48, 64] as const,
    /** İsim ve monogram sönerken yukarı kayar; ölçek animasyonu yok. */
    collapseLift: 10,
} as const;

// ── Müdür 24 · Personel günü ────────────────────────────────────────────────
//
// Kaynak: `docs/design-reference/Luera Mobil - Mudur 24 Personel Gunu.html`.
// Değerler o dosyanın CSS'inden BİREBİR alındı.

export const staffDayMetrics = {
    // Üst çubuk (tbar)
    topBarHeight: 52,
    topBarPadX: 14,
    topBarTitle: 17,
    topBarSub: 12.5,
    backButtonSize: 44,
    backChevronSize: 11,

    // İsim şeridi (rail)
    railHeight: 46,
    railPadX: 18,
    railGap: 12,
    railGapSmall: 9,
    railRingSize: 28,
    railRingActiveSize: 30,
    railBorder: 1.7,
    railBorderActive: 2,
    railText: 10.5,
    railTextActive: 11,
    railDimOpacity: 0.42,

    // Kahraman blok (heroHead)
    padTop: 18,
    padX: 18,
    heroGap: 14,
    ringSize: 76,
    ringBorder: 2.5,
    ringText: 22,
    badgeHeight: 20,
    badgePadX: 7,
    badgeRadius: 999,
    badgeText: 11,
    badgeOffset: -9,
    nameSize: 19,
    roleSize: 13.5,

    // Damga (stamp)
    stampHeight: 28,
    stampPadX: 10,
    stampRadius: 10,
    stampText: 12,
    stampDot: 7,
    stampBorder: 1,

    // Gömülü krem kart (panel / pnl)
    panelPad: 14,
    panelRadius: 18,
    panelGap: 12,
    panelHeightMax: 100,
    panelHeight: 92,
    panelMarginTop: 16,
    panelLabel: 11.5,
    panelLabelTrack: 0.06,
    panelDot: 6,
    heroText: 34,
    heroTextTrack: -0.04,
    heroBox: 36,
    heroUnit: 17,
    subText: 11.5,
    subLine: 1.3,
    pulsePeriod: 800,

    // Liste başlığı (lhd)
    lhdPadTop: 22,
    lhdPadX: 18,
    lhdPadBottom: 10,
    lhdText: 11.5,
    lhdTrack: 0.06,

    // Liste satırı (row)
    rowPadY: 16,
    rowPadX: 18,
    rowGap: 14,
    timeWidth: 46,
    timeSize: 13.5,
    nameRowSize: 19,
    serviceSize: 13.5,
    noteSize: 13.5,
    fadeOpacity: 0.52,
    kebabPadY: 11,
    kebabPadX: 6,
    kebabDot: 3,

    // Mini damga (mini)
    miniHeight: 26,
    miniPadX: 9,
    miniRadius: 9,
    miniText: 12,
    miniDot: 6,

    // Vardiya çubuğu (shift)
    shiftMarginX: 18,
    shiftMarginTop: 14,
    shiftPad: 14,
    shiftRadius: 14,
    shiftGap: 11,
    trackHeight: 22,
    trackLine: 3,
    trackRadius: 2,
    trackDash: 1.7,
    nowWidth: 2,
    nowHeight: 14,
    shiftHead: 11.5,
    shiftRight: 12.5,
    shiftFoot: 13.5,

    // Boş hâl gövdesi (emp)
    empPadTop: 20,
    empPadX: 18,
    empGap: 9,
    empText: 15,
    empLine: 1.45,

    // Gün sonu (endday)
    endDayPadY: 20,
    endDayPadX: 18,
    endDayText: 12.5,
    endDayTrack: 0.06,

    // Başparmak bölgesi (foot)
    footPadTop: 14,
    footPadX: 18,
    footPadBottom: 30,
    footPadBottomSmall: 18,
    footGap: 10,
    hapHeight: 40,
    hapPadX: 18,
    hapRadius: 999,
    hapText: 15.5,
    hapBorder: 1.5,
    ghostHeight: 22,
    ghostPadX: 4,
    ghostText: 13.5,
    iconSize: 17,
    iconBorder: 1.7,
} as const;

/**
 * Personel günü üst parıltısı — tasarımdaki `.grad`:
 * 120 pt, turuncu %10 → saydam. Sayfanın üst çubuğu ve şeridi bunun üstünde
 * durur; kaydırmayla sönmez, sabittir.
 */
export const staffDayGlow = {
    height: 120,
    colors: ['rgba(255,90,31,0.10)', 'rgba(255,90,31,0)'] as const,
} as const;

export const staffDayMotion = {
    // 1 · Halkadan sayfaya
    enter: {
        stripOut: 160,
        stripScale: 1.28,
        ringIn: 220,
        ringDelay: 60,
        ringScaleFrom: 0.684,
        panelIn: 220,
        panelDelay: 60,
        panelRise: 10,
        listIn: 220,
        listDelay: 180,
        listRise: 10,
    },
    // 2 · Personeller arası sayfalama
    page: {
        settle: 220,
        railOut: 160,
        railIn: 220,
    },
    // 3 · Durum değişimi (işlemde -> müsait)
    swap: {
        out: 160,
        outShift: -6,
        badgeScale: 0.9,
        in: 220,
        inDelay: 60,
        inShift: 8,
    },
    // 4 · Boş hâl girişi
    empty: {
        duration: 220,
        steps: [60, 120, 180] as const,
        rise: 8,
    },
    outCurve: [0.4, 0, 1, 1] as const,
    inCurve: [0.2, 0.8, 0.25, 1] as const,
} as const;

