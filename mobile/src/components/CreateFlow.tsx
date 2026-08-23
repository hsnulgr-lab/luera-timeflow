import { useEffect, useMemo, useState } from 'react';
import {
    Keyboard, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions,
} from 'react-native';

import { ConfirmScreen } from './ConfirmScreen';
import { Glass } from './Glass';
import {
    ApptCta, ApptDayHero, ApptHero, ApptPageTitle, ApptPlate, ApptTopBar, ArrowIcon,
    CloseIcon, CustomerRow, DayChip, EmptyResult, HeroDot, HeroSubText, Hint,
    KeyValueGrid, NoteRow, PhoneField, RailBlock, SearchIcon, SectionHead,
    ServiceRow, SolidButton, type KeyValue,
} from './ApptParts';
import { feedback } from '../lib/feedback';
import { addLocalAppointment, source } from '../lib/calendarSource';
import { mockDay } from '../lib/managerFlow';
import { apptMetrics, font, useTheme } from '../theme';
import {
    FLOW_TITLE, actionLabel, backPhase, customerName, dayOptions, emptyDraft,
    filterCustomers, formatPrice, formatRange, isValidNewCustomer, maskPhone,
    draftToAppointment, formatPhoneInput, mockCustomers, mockServices, nextPhase,
    pageName, phoneNote, railSections, recentCustomers, slotRows, stepLabel,
    type CustomerOption, type Draft, type Phase, type StaffOption,
} from '../lib/createFlow';
import { SALON_NAME } from '../lib/apptConfirm';
import type { Appt } from '../lib/calendar';

/**
 * Müdür 15 — randevu oluştur.
 *
 * İKİ TAM SAYFA. Kabuk ikisinde de aynı: koyu sıcak kahraman levha üstte,
 * krem içerik levhası onun altından yükseliyor, altta İÇERİĞİN ÜSTÜNDE YÜZEN
 * cam çubuk. Değişen tek şey levhaların içi.
 *
 * CAM YALNIZ İKİ YÜZEYDE: alt özet çubuğu ve kaydırılmış arama çubuğu. Saat
 * satırları, müşteri satırları ve hizmet kartları opak — arkasından içerik
 * kayan camın üstünde 11–17 pt metin okunmaz ve müdür yanlış saate randevu
 * yazar. Cam kullanılamadığında (iOS 26 altı, Expo Go, "saydamlığı azalt")
 * `Glass` opak yüzeye düşer; yerleşim ve ölçüler değişmez.
 *
 * SUNUCUDA RANDEVU OLUŞTURMA UCU YOK. "Randevuyu oluştur" yerel duruma yazıp
 * akışı kapatır; sahte bir onay yüzeyi eklenmedi.
 */

const M = apptMetrics;

export function CreateFlow({ prefill, onClose, onCreated, topInset, bottomInset }: {
    prefill?: { dateISO?: string; startMinutes?: number; staffId?: string };
    /** Onay ekranı bitince ya da vazgeçilince çağrılır. */
    onClose: () => void;
    /** Randevu kuruldu — akışa da düşsün diye çağıran haberdar edilir. */
    onCreated?: (appointment: Appt, staffName: string | null) => void;
    /** Kahraman levha üst güvenli alanı KENDİ örtüyor. */
    topInset: number;
    /** Sekme çubuğu da bunun içinde: yüzen çubuk buradan 12 pt yukarıda. */
    bottomInset: number;
}) {
    const { c, small } = useTheme();
    const { fontScale } = useWindowDimensions();
    const ax = fontScale > M.axFontScale;

    const [draft, setDraft] = useState<Draft>(() => emptyDraft(prefill));
    const [phase, setPhase] = useState<Phase>(() => nextPhase(emptyDraft(prefill)));
    const [query, setQuery] = useState('');
    const [noteOpen, setNoteOpen] = useState(false);
    const [keyboardUp, setKeyboardUp] = useState(false);
    /** Randevu kuruldu: akışın son karesi (Müdür 16) devralıyor. */
    const [created, setCreated] = useState<Appt | null>(null);
    /** Yeni müşteri az önce eklendiyse telefon alanı klavyeyle açılır. */
    const [justAdded, setJustAdded] = useState(false);

    /**
     * Klavye açıkken yüzen çubuk GİZLENİR.
     *
     * Önce `KeyboardAvoidingView` vardı: levhayı kısaltıyor, mutlak konumlu
     * çubuk da onunla ekranın ortasına çıkıp içeriğin üstüne biniyordu —
     * "yeni müşteri ekle" butonunu, saat rayını ve not alanını kapatıyordu.
     * Müşteri adı ya da not yazarken "Devam" butonuna zaten ihtiyaç yok;
     * yazma bitince çubuk geri gelir. Kaydırma payını iOS'un kendi
     * `automaticallyAdjustKeyboardInsets`'i veriyor.
     */
    useEffect(() => {
        const show = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            () => setKeyboardUp(true),
        );
        const hide = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => setKeyboardUp(false),
        );
        return () => { show.remove(); hide.remove(); };
    }, []);
    const [dayAppointments, setDayAppointments] = useState<Appt[]>([]);

    // Demo verisinin günü. Sunucu ucu geldiğinde burası cihazın günü olacak;
    // şimdi sahte takvimin günü, yoksa şerit boş bir güne bakar.
    const today = mockDay.dateISO;
    const days = useMemo(() => dayOptions(today, 14), [today]);

    // Personel havuzu akış ekranıyla AYNI kaynaktan; izinli ve çalışmayanlar
    // listede kalır ama seçilemez — "neden Merve yok" sorusu doğmasın.
    const staff: StaffOption[] = useMemo(() => mockDay.presence.map((person) => ({
        id: person.id,
        initials: person.initials,
        name: person.name,
        available: person.state === 'busy' || person.state === 'free',
        reason: person.state === 'leave' ? 'izinli' : person.state === 'off' ? 'çalışmıyor' : undefined,
    })), []);

    // Sayfa 2'nin saatleri o günün GERÇEK randevularından çıkar.
    useEffect(() => {
        if (!draft.dateISO) return;
        let alive = true;
        source.day(draft.dateISO)
            .then((list) => { if (alive) setDayAppointments(list); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [draft.dateISO]);

    const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

    const action = actionLabel(phase, draft);

    const goBack = () => {
        const target = backPhase(phase);
        feedback.selection();
        if (target === null) { onClose(); return; }
        setPhase(target);
    };

    const advance = () => {
        if (phase === 1) {
            // Gün seçilmemişse bugüne düş: sayfa 2 boş bir kahramanla açılmaz.
            if (!draft.dateISO) patch({ dateISO: today });
            setPhase(2);
            return;
        }
        /**
         * Sunucuda oluşturma ucu YOK. Sahte bir "kaydedildi" mesajı vermek
         * yerine randevuyu yerel takvim kaynağına yazıyoruz: müdür akıştan
         * çıkınca randevuyu TAKVİMDE, kendi gününde ve saatinde görüyor.
         * Onay bir cümle değil, randevunun kendisi.
         */
        const appointment = draftToAppointment(draft, staff, `local-${Date.now()}`);
        if (!appointment) return;
        addLocalAppointment(appointment);
        // Randevu Takvim'e düşüyordu ama AKIŞA düşmüyordu: müdür onayı görüp
        // Akış'a dönüyor ve randevu orada yoktu. Uygulama yaptığını söylediği
        // şeyi göstermiyordu.
        onCreated?.(appointment, staff.find((p) => p.id === appointment.staff_id)?.name ?? null);
        feedback.success();
        setCreated(appointment);
    };

    const selectedDay = days.find((day) => day.iso === draft.dateISO) ?? days[0];
    const duration = draft.service?.minutes ?? 30;

    const rows = useMemo(() => (draft.dateISO ? slotRows({
        appointments: dayAppointments,
        staff,
        durationMinutes: duration,
        onlyStaffId: draft.locked.includes('slot') ? draft.staffId : null,
    }) : []), [dayAppointments, staff, duration, draft.dateISO, draft.locked, draft.staffId]);

    const sections = useMemo(() => railSections({
        rows,
        selectedMinutes: draft.startMinutes,
        durationMinutes: duration,
        selectedStaff: staff.find((person) => person.id === draft.staffId) ?? null,
    }), [rows, draft.startMinutes, duration, staff, draft.staffId]);

    /** Boş saate dokununca o saatin İLK UYGUN personeli kendiliğinden atanır. */
    const pickSlot = (minutes: number) => {
        const row = rows.find((candidate) => candidate.minutes === minutes);
        if (!row || row.kind !== 'free') return;
        patch({ startMinutes: minutes, staffId: row.staff.id });
    };

    /** Kim yapacak bir sonuç; sıradaki uygun kişiye çevirmek tek dokunuş. */
    const rotateStaff = () => {
        if (draft.startMinutes === null) return;
        const free = staff.filter((person) => person.available);
        if (free.length < 2) return;
        const at = free.findIndex((person) => person.id === draft.staffId);
        patch({ staffId: free[(at + 1) % free.length].id });
    };

    const picked = draft.customer
        ? { name: draft.customer.name, phone: maskPhone(draft.customer.phone) }
        : draft.newCustomerName
            ? { name: draft.newCustomerName, phone: null }
            : null;

    const results = query.trim() ? filterCustomers(mockCustomers, query) : [];
    const recents = recentCustomers(mockCustomers, 6);

    // ── Sayfa 1 · kim ve ne ────────────────────────────────────────────────
    //
    // TASARIMDAN BİLİNÇLİ EKSİK — gerekçesi teknik, biçimsel değil.
    // Belgenin 04 numaralı ekranı, sayfa kaydırılınca arama alanının koyu
    // levhadan koparak üstte YÜZEN CAM ÇUBUĞA (.sfloat) dönüşmesini istiyor.
    // React Native'de bir `TextInput` ebeveyn değiştiremez: taşındığı anda
    // sökülüp yeniden kurulur, odak ve klavye düşer — müdür yazarken klavye
    // kapanır. Arama alanı bu yüzden kahraman levhanın içinde kalıyor
    // (belgenin 01 numaralı ekranı). Geçiş, alanı taşımadan kopyalayan bir
    // çözümle geri gelebilir; şimdilik yazılmadı, taklit de edilmedi.
    const page1 = (
        <>
            <ApptPageTitle
                name={picked?.name ?? null}
                phone={picked?.phone ?? null}
                onClear={() => {
                    setQuery('');
                    setJustAdded(false);
                    patch({ customer: null, newCustomerName: null, newCustomerPhone: null });
                }}
                size={ax ? M.titleAx : small ? M.titleSmall : M.title}
                x={small ? M.heroTitleXSmall : M.heroTitleX}
                top={small ? M.heroTitleTopSmall : M.heroTitleTop}
            />
            {picked ? null : (
                <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: M.searchGap,
                    height: M.searchHeight,
                    marginTop: M.searchTop,
                    marginHorizontal: small ? M.heroTitleXSmall : M.heroTitleX,
                    paddingHorizontal: M.searchPadX,
                    borderRadius: M.searchRadius,
                    backgroundColor: '#252015',
                    borderWidth: 1, borderColor: 'rgba(243,237,227,0.11)',
                }}>
                    <SearchIcon color="rgba(243,237,227,0.58)" />
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder="Müşteri ara"
                        placeholderTextColor="rgba(243,237,227,0.36)"
                        accessibilityLabel="Müşteri ara"
                        returnKeyType="search"
                        style={{
                            flex: 1, color: '#F3EDE3',
                            fontSize: M.searchSize, fontFamily: font.semiBold, fontWeight: '600',
                        }}
                    />
                    {query ? (
                        <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Aramayı temizle">
                            <CloseIcon color="rgba(243,237,227,0.58)" size={18} />
                        </Pressable>
                    ) : null}
                </View>
            )}
        </>
    );

    const page1Body = (
        <>
            {picked ? null : query.trim() ? (
                results.length > 0 ? (
                    <>
                        <SectionHead title="Sonuçlar" count={String(results.length)} size={ax ? M.secTitleAx : M.secTitle} />
                        {results.map((customer) => (
                            <CustomerRow
                                key={customer.id}
                                name={customer.name}
                                hint={customer.hint}
                                phone={maskPhone(customer.phone)}
                                query={query}
                                onPress={() => selectCustomer(customer)}
                            />
                        ))}
                        <SectionHead title="Listede yok mu" size={ax ? M.secTitleAx : M.secTitle} />
                        <SolidButton
                            label={`"${query.trim()}" adıyla ekle`}
                            onPress={addNewCustomer}
                        />
                        <Hint>Yalnız ad yeter. Telefonu sonra ekleyebilirsin.</Hint>
                    </>
                ) : (
                    <>
                        <EmptyResult
                            title={`"${query.trim()}" kayıtlı değil`}
                            body={`Kayıtlı ${mockCustomers.length} müşteride bu ad geçmiyor. Aynı ekrandan ekleyebilirsin.`}
                        />
                        <SolidButton label={`"${query.trim()}" adıyla ekle`} onPress={addNewCustomer} />
                        <Hint>Yalnız ad yeter. Telefon, randevu kurulduktan sonra müşteri kartından eklenir.</Hint>
                    </>
                )
            ) : (
                <>
                    <SectionHead
                        title="Son gelenler"
                        count={String(recents.length)}
                        size={ax ? M.secTitleAx : M.secTitle}
                    />
                    {recents.map((customer) => (
                        <CustomerRow
                            key={customer.id}
                            name={customer.name}
                            hint={customer.hint}
                            phone={maskPhone(customer.phone)}
                            onPress={() => selectCustomer(customer)}
                        />
                    ))}
                </>
            )}

            {/* Yeni müşteri: numarası sorulur, zorunlu değil. */}
            {draft.newCustomerName && !draft.customer ? (
                <>
                    <SectionHead title="Telefon" size={ax ? M.secTitleAx : M.secTitle} />
                    <PhoneField
                        value={draft.newCustomerPhone ?? ''}
                        autoFocus={justAdded}
                        onChange={(text) => {
                            const next = formatPhoneInput(text);
                            patch({ newCustomerPhone: next || null });
                        }}
                    />
                    <Hint>{phoneNote(draft.newCustomerPhone)}</Hint>
                </>
            ) : null}

            <SectionHead title="Hizmet" count={String(mockServices.length)} size={ax ? M.secTitleAx : M.secTitle} />
            {mockServices.map((service) => (
                <ServiceRow
                    key={service.id}
                    service={service}
                    selected={draft.service?.id === service.id}
                    onPress={() => patch({ service: draft.service?.id === service.id ? null : service })}
                />
            ))}
        </>
    );

    function selectCustomer(customer: CustomerOption) {
        setQuery('');
        patch({ customer, newCustomerName: null });
    }

    function addNewCustomer() {
        const name = query.trim();
        if (!isValidNewCustomer(name)) return;
        setQuery('');
        setJustAdded(true);
        patch({ newCustomerName: name, customer: null, newCustomerPhone: null });
    }

    // ── Sayfa 2 · ne zaman ─────────────────────────────────────────────────
    const heroSize = ax ? M.dayAx : small ? M.daySmall : M.day;
    const subSize = ax ? M.subSizeAx : small ? M.subSizeSmall : M.subSize;

    const page2 = (
        <>
            <ApptDayHero
                short={selectedDay?.short ?? ''}
                num={selectedDay?.num ?? 0}
                size={heroSize}
                subSize={subSize}
                x={small ? M.heroTitleXSmall : M.heroTitleX}
                top={small ? M.heroTitleTopSmall : M.heroTitleTop}
                subTop={small ? M.subTopSmall : M.subTop}
                sub={
                    <>
                        <HeroSubText strong size={subSize}>{customerName(draft) || 'Müşteri yok'}</HeroSubText>
                        <HeroDot />
                        <HeroSubText size={subSize}>{draft.service?.name ?? 'Hizmet yok'}</HeroSubText>
                        <HeroDot />
                        <HeroSubText size={subSize}>{`${duration} dk`}</HeroSubText>
                    </>
                }
            />
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityRole="adjustable"
                contentContainerStyle={{
                    gap: small ? M.stripGapSmall : M.stripGap,
                    paddingTop: small ? M.stripTopSmall : M.stripTop,
                    paddingHorizontal: small ? M.heroTitleXSmall : M.heroTitleX,
                }}
            >
                {days.map((day) => (
                    <DayChip
                        key={day.iso}
                        day={day}
                        selected={day.iso === selectedDay?.iso}
                        today={day.iso === today}
                        width={ax ? M.dayBoxAx : M.dayBox}
                        height={ax ? M.dayBoxHeightAx : small ? M.dayBoxHeightSmall : M.dayBoxHeight}
                        numberSize={ax ? M.dayNumberAx : small ? M.dayNumberSmall : M.dayNumber}
                        labelSize={ax ? M.dayLabelAx : M.dayLabel}
                        onPress={() => {
                            if (draft.locked.includes('date')) return;
                            // Gün değişince saat düşer: başka günün boşluğu bu güne taşınmaz.
                            patch({ dateISO: day.iso, startMinutes: null, staffId: null });
                        }}
                    />
                ))}
            </ScrollView>
        </>
    );

    const page2Body = (
        <>
            {sections.map((section) => (
                <RailBlock
                    key={section.section.key}
                    data={section}
                    serviceName={draft.service?.name ?? ''}
                    x={small ? M.railXSmall : M.railX}
                    ax={ax}
                    onPick={pickSlot}
                    onChangeStaff={rotateStaff}
                />
            ))}
            <NoteRow
                value={draft.note}
                editing={noteOpen}
                onPress={() => setNoteOpen(true)}
                onChange={(text) => patch({ note: text.trim() ? text : null })}
                onDone={() => setNoteOpen(false)}
            />
        </>
    );

    // ── Yüzen özet çubuğu ──────────────────────────────────────────────────
    // Sayfa 1'de hiçbir şey seçilmemişken çubuk MİNİ: dört kere "seçilmedi"
    // yazmak yerine yalnız pasif buton durur ve eksiği o söyler.
    const summary: KeyValue[] = phase === 1
        ? (picked || draft.service ? [
            { label: 'Müşteri', value: customerName(draft) || 'seçilmedi', muted: !customerName(draft) },
            { label: 'Hizmet', value: draft.service?.name ?? 'seçilmedi', muted: !draft.service },
        ] : [])
        : [
            { label: 'Gün', value: selectedDay?.label.replace(/^\S+,\s*/, '') ?? '—' },
            {
                label: 'Saat',
                value: draft.startMinutes === null ? 'seçilmedi' : formatRange(draft.startMinutes, duration),
                muted: draft.startMinutes === null,
                numeric: draft.startMinutes !== null,
            },
            { label: 'Hizmet', value: draft.service?.name ?? '—' },
            { label: 'Tutar', value: draft.service ? formatPrice(draft.service.price) : '—', numeric: true },
        ];

    const barRadius = small ? M.barRadiusSmall : M.barRadius;
    const barLift = (small ? M.barLiftSmall : M.barLift) + bottomInset;
    // Pay çubuğun GERÇEK yüksekliğinden türer: son saat satırı (20:00) camın
    // altında kalmamalı.
    const inset = (summary.length > 2 ? M.barHeight : M.barHeightMini) + barLift;

    // Akışın son karesi: onay ekranı kabuğu devralır — üst çubuk, kahraman
    // levha ve iki sayfa yok; tek yüzey.
    if (created) {
        const person = staff.find((candidate) => candidate.id === created.staff_id);
        return (
            <ConfirmScreen
                appointment={created}
                staffName={person?.name ?? '—'}
                staffInitials={person?.initials ?? '—'}
                price={draft.service?.price ?? null}
                salon={SALON_NAME}
                topInset={topInset}
                bottomInset={bottomInset}
                onDone={onClose}
            />
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: c.bg }}>
            <ApptHero topInset={topInset} padBottom={M.heroPadBottom}>
                <ApptTopBar
                    mode={phase === 1 ? 'close' : 'back'}
                    onPress={goBack}
                    title={FLOW_TITLE}
                    step={stepLabel(phase)}
                    small={small}
                />
                {phase === 1 ? page1 : page2}
            </ApptHero>

            <ApptPlate bg={c.bg}>
                <ScrollView
                    accessibilityLabel={pageName(phase)}
                    contentContainerStyle={{ paddingBottom: keyboardUp ? M.barLift : inset }}
                    scrollIndicatorInsets={{ bottom: keyboardUp ? 0 : inset }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    automaticallyAdjustKeyboardInsets
                    showsVerticalScrollIndicator={false}
                >
                    {phase === 1 ? page1Body : page2Body}
                </ScrollView>

                {/* İÇERİĞİN ÜSTÜNDE YÜZEN CAM. Altından saat satırları kayarken
                    cam onları kırar; çubuk sayfanın son satırı değil.

                    GÖLGE VE KIRPMA AYRI KATMANLARDA: iOS'ta `overflow:'hidden'`
                    gölgeyi de kırpıyor. Gölge burada süs değil — camın
                    kullanılamadığı yerde (Expo Go, iOS 26 altı, "saydamlığı
                    azalt") çubuğun YÜZDÜĞÜNÜ anlatan tek şey o. */}
                {keyboardUp ? null : (
                <View
                    pointerEvents="box-none"
                    style={{
                        position: 'absolute',
                        left: M.barX, right: M.barX,
                        bottom: barLift,
                        borderRadius: barRadius,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 10 },
                        shadowRadius: 26,
                        shadowOpacity: 0.2,
                        elevation: 8,
                    }}
                >
                    <Glass
                        interactive
                        effect="regular"
                        style={{
                            borderRadius: barRadius,
                            paddingTop: summary.length > 0 ? M.barPadTop : M.barPadMini,
                            paddingHorizontal: M.barPadX,
                            paddingBottom: summary.length > 0 ? M.barPadBottom : M.barPadMini,
                            gap: M.barGap,
                            overflow: 'hidden',
                        }}
                    >
                        {summary.length > 0 ? <KeyValueGrid rows={summary} ax={ax} /> : null}
                        <ApptCta
                            label={action.label}
                            enabled={action.enabled}
                            ax={ax}
                            onPress={advance}
                            right={phase === 1 ? <ArrowIcon color="#FFF9F5" size={20} /> : null}
                        />
                    </Glass>
                </View>
                )}
            </ApptPlate>
        </View>
    );
}
