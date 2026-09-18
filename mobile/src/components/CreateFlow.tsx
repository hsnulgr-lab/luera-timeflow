import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Keyboard, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions,
} from 'react-native';

import { ConfirmScreen } from './ConfirmScreen';
import { Glass } from './Glass';
import {
    ApptCta, ApptDayHero, ApptHero, ApptPageTitle, ApptPlate, ApptTopBar, ArrowIcon,
    CloseIcon, CustomerRow, DayChip, EmptyResult, HeroDot, HeroSubText, Hint,
    KeyValueGrid, NoteRow, PhoneField, RailBlock, SearchIcon, SectionHead,
    ClosedServiceRow, ServiceRow, SolidButton, type KeyValue,
} from './ApptParts';
import { DurumBlock, DurumUnread } from './Durum';
import { feedback } from '../lib/feedback';
import { apptMetrics, font, useTheme } from '../theme';
import {
    FLOW_TITLE, actionLabel, backPhase, customerName, dayOptions, emptyDraft,
    filterCustomers, formatPrice, formatRange, isValidNewCustomer, maskPhone,
    formatPhoneInput, nextPhase,
    pageName, phoneNote, railSections, slotRows, stepLabel,
    type CustomerOption, type Draft, type Phase,
} from '../lib/createFlow';
import {
    confirmationText, dayWindowOf, localClock, recentOf, refusalCopy, staffOptionsOf, staffWorksAt,
    type CreateOutcome, type NewAppointment, type WaFailReason,
} from '../lib/createLive';
import { closedBy, closedReason } from '../lib/eligibility';
import type { CreateContext } from '../lib/managerCreate';
import { useCreateDay } from '../lib/managerCreate';
import type { CreatedAppointment } from '../lib/managerWrite';

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
 * VERİ CANLI (müdür planı 7. adım). Hizmetler, kadro, müşteri defteri ve
 * salonun saatleri `useCreateContext`ten (üst ekran okuyor ve bu bileşen
 * YALNIZ okuma bitince çiziliyor — ön dolgu kaybolmasın diye). Seçilen günün
 * dolu saatleri burada, `useCreateDay` ile okunuyor ve yoklanıyor.
 *
 * "Randevuyu oluştur" GERÇEKTEN yazıyor (`onCreate`). Ray hızlı geri bildirim;
 * son söz sunucunun — reddederse randevu oluşmaz ve blok ne yapılacağını
 * söyler. Onay ekranı ancak satır yazıldıktan sonra açılıyor.
 */

const M = apptMetrics;

export function CreateFlow({
    prefill, context, onCreate, onSend, onRefusal, onClose, onCreated, topInset, bottomInset,
}: {
    prefill?: {
        dateISO?: string; startMinutes?: number; staffId?: string;
        /** Müşteri kartından gelindiğinde kim olduğu belli. */
        customerId?: string;
    };
    /** Okunmuş bağlam: hizmetler, kadro, müşteri defteri, ayarlar, saat. */
    context: CreateContext;
    /** Randevuyu yazar. Sonuç gelene kadar düğme kilitli. */
    onCreate: (input: NewAppointment, staffName: string | null) => Promise<{
        outcome: CreateOutcome; row: CreatedAppointment | null;
    }>;
    /** Onay mesajını gönderir. */
    onSend: (input: { phone: string; text: string; customerId: string | null }) => Promise<
        { ok: true } | { ok: false; reason: WaFailReason | null }
    >;
    /** Günün okuması org reddiyle döndü — üst ekranın durum bloğu devralır. */
    onRefusal: (reason: NonNullable<ReturnType<typeof useCreateDay>['refusal']>) => void;
    /** Onay ekranı bitince ya da vazgeçilince çağrılır. */
    onClose: () => void;
    /** Randevu kuruldu — akışa da düşsün diye çağıran haberdar edilir. */
    onCreated?: (appointment: CreatedAppointment, staffName: string | null) => void;
    /** Kahraman levha üst güvenli alanı KENDİ örtüyor. */
    topInset: number;
    /** Sekme çubuğu da bunun içinde: yüzen çubuk buradan 12 pt yukarıda. */
    bottomInset: number;
}) {
    /**
     * Alt pay GÖRÜLEN EN BÜYÜK DEĞERDE DONAR.
     *
     * iOS 26'da sekme çubuğu kaydırınca küçülüyor ve güvenli alan onunla
     * birlikte değişiyor. Payı olduğu gibi kullansaydık yüzen özet çubuğu her
     * kaydırmada aşağı-yukarı zıplardı — çubuk sayfanın bir parçası değil,
     * sabit bir zemin. Küçülmüş barın üstünde biraz daha yüksek durur; bu,
     * zıplamaya tercih edilir.
     */
    const insetFloor = useRef(bottomInset);
    if (bottomInset > insetFloor.current) insetFloor.current = bottomInset;
    const inset0 = insetFloor.current;
    const { c, small } = useTheme();
    const { fontScale } = useWindowDimensions();
    const ax = fontScale > M.axFontScale;

    /**
     * Müşteri kartından gelen kimlik gerçek bir kayda çevrilir. Bulunamazsa
     * ön dolgu YAPILMAZ: olmayan bir müşteriyi adıyla yazmak, aynı kişiden
     * ikinci bir kayıt açardı.
     */
    const seed = useMemo(() => ({
        ...prefill,
        customer: prefill?.customerId
            ? context.customers.find((item) => item.id === prefill.customerId) ?? null
            : null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [prefill?.dateISO, prefill?.startMinutes, prefill?.staffId, prefill?.customerId]);

    const [draft, setDraft] = useState<Draft>(() => emptyDraft(seed));
    const [phase, setPhase] = useState<Phase>(() => nextPhase(emptyDraft(seed)));
    const [query, setQuery] = useState('');
    const [noteOpen, setNoteOpen] = useState(false);
    const [keyboardUp, setKeyboardUp] = useState(false);
    /** Randevu kuruldu: akışın son karesi (Müdür 16) devralıyor. */
    const [created, setCreated] = useState<CreatedAppointment | null>(null);
    /** Yazma sürüyor — ikinci dokunuş ikinci randevu açmasın. */
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    /** Sunucu randevuyu KURMADI; sebebi ve yapılacak iş. */
    const [refused, setRefused] = useState<Exclude<CreateOutcome, { ok: true }> | null>(null);
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
    // Gün SUNUCU saatinden: telefonun takvimi yanlışsa şerit yanlış günden
    // başlamasın.
    const today = context.todayISO;
    const days = useMemo(() => dayOptions(today, 14), [today]);

    /*
     * ŞİMDİ — sunucu saati + geçen cihaz süresi. Otuz saniyede bir ilerliyor:
     * rayın "geçti" kutuları müdür ekrandayken de doğru kalsın.
     */
    const [clock, setClock] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setClock(Date.now()), 30_000);
        return () => clearInterval(id);
    }, []);
    const nowMs = context.serverNow + Math.max(0, clock - context.deviceAt);

    // Sayfa 2'nin saatleri SEÇİLEN günün gerçek randevularından çıkar.
    const day = useCreateDay(draft.dateISO);
    /** Elde duran gün SEÇİLİ gün mü? Başka günün boşlukları bu güne yazılmaz. */
    const dayKnown = draft.dateISO !== null && day.data.dateISO === draft.dateISO;
    useEffect(() => {
        if (day.refusal) onRefusal(day.refusal);
    }, [day.refusal, onRefusal]);

    // Kadro salonun GERÇEK kadrosu; izinli olan listede kalır ama seçilemez.
    const staff = useMemo(
        () => staffOptionsOf(context.crew, dayKnown ? day.data.leave : new Map(), draft.dateISO ?? today),
        [context.crew, dayKnown, day.data.leave, draft.dateISO, today],
    );

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
        if (savingRef.current) return;
        if (!draft.service || !draft.dateISO || draft.startMinutes === null || !draft.staffId) return;
        const staffName = staff.find((person) => person.id === draft.staffId)?.name ?? null;
        const input: NewAppointment = {
            customerId: draft.customer?.id ?? null,
            customerName: customerName(draft),
            customerPhone: draft.customer?.phone ?? draft.newCustomerPhone,
            dateISO: draft.dateISO,
            startMinutes: draft.startMinutes,
            service: draft.service,
            staffId: draft.staffId,
            note: draft.note,
        };
        /*
         * TEK UÇUŞ. Ref, düğmenin kilidini çizimi beklemeden koyuyor: iki hızlı
         * dokunuş iki randevu açardı — ve ikincisi 060'a takılsa bile ilk
         * müşteri kaydını ikinci kez aramaya giderdi.
         */
        savingRef.current = true;
        setSaving(true);
        setRefused(null);
        void onCreate(input, staffName).then(({ outcome, row }) => {
            savingRef.current = false;
            setSaving(false);
            if (outcome.ok && row) {
                // Randevu Takvim'e düşüyordu ama AKIŞA düşmüyordu; akış da
                // haberdar ediliyor.
                onCreated?.(row, staffName);
                feedback.success();
                setCreated(row);
                return;
            }
            feedback.warning();
            setRefused(outcome.ok ? { ok: false, kind: 'failed' } : outcome);
            // Dolu saat ya da kapanmış bir gün: ray güncel hâli göstersin.
            if (!outcome.ok && (outcome.kind === 'conflict' || outcome.kind === 'past')) {
                void day.reload();
            }
        });
    };

    const onRefusedMove = useCallback((move: ReturnType<typeof refusalCopy>['action']['move']) => {
        setRefused(null);
        if (move === 'reslot') {
            setDraft((current) => (current.locked.includes('slot')
                ? current
                : { ...current, startMinutes: null }));
        } else if (move === 'service') {
            setPhase(1);
        } else if (move === 'retry') {
            // Seçimler duruyor; müdür yeniden basacak. Kendiliğinden tekrar
            // YAZMIYORUZ — bağlantı dönmediyse ikinci red, dönse bile müdürün
            // bilgisi dışında bir randevu olurdu.
        }
    }, []);

    const selectedDay = days.find((day) => day.iso === draft.dateISO) ?? days[0];
    const duration = draft.service?.minutes ?? 30;

    const nowClock = localClock(nowMs);
    const rows = useMemo(() => (draft.dateISO && dayKnown ? slotRows({
        appointments: day.data.appointments,
        staff,
        durationMinutes: duration,
        // Personel sabitse saat listesi YALNIZ o kişinin boşluklarını gösterir.
        onlyStaffId: draft.locked.includes('slot') || draft.locked.includes('staff')
            ? draft.staffId
            : null,
        // Salonun o günkü saatleri (personelin kendi saati aşıyorsa
        // genişletilmiş); kapalı gün bütün kutuları kapatır.
        hours: dayWindowOf(context.crew, context.settings.workingHours, draft.dateISO),
        // Personelin KENDİ saati: o gün çalışmayana kutu verilmiyor.
        worksAt: (staffId, from, to) => {
            const member = context.crew.find((person) => person.id === staffId);
            return member
                ? staffWorksAt(member, context.settings.workingHours, draft.dateISO ?? today, from, to)
                : false;
        },
        // Bugünse geçmiş kutular seçilemez.
        nowMinutes: draft.dateISO === nowClock.dateISO ? nowClock.minutes : null,
    }) : []), [
        day.data.appointments, dayKnown, staff, duration, draft.dateISO, draft.locked, draft.staffId,
        context.settings.workingHours, context.crew, today, nowClock.dateISO, nowClock.minutes,
    ]);

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
        // Personel sabitken çevirmek yok: müdür buraya o kişi için geldi.
        if (draft.locked.includes('staff') || draft.locked.includes('slot')) return;
        if (draft.startMinutes === null || !draft.dateISO) return;
        const from = draft.startMinutes;
        const to = from + duration;
        const date = draft.dateISO;
        // Çevrilecek kişi o saatte ÇALIŞIYOR olmalı — kendi haftalık saatiyle.
        const free = staff.filter((person) => {
            if (!person.available) return false;
            const member = context.crew.find((candidate) => candidate.id === person.id);
            return member ? staffWorksAt(member, context.settings.workingHours, date, from, to) : false;
        });
        if (free.length < 2) return;
        const at = free.findIndex((person) => person.id === draft.staffId);
        patch({ staffId: free[(at + 1) % free.length].id });
    };

    const picked = draft.customer
        ? { name: draft.customer.name, phone: maskPhone(draft.customer.phone) }
        : draft.newCustomerName
            ? { name: draft.newCustomerName, phone: null }
            : null;

    const results = query.trim() ? filterCustomers(context.customers, query) : [];
    const recents = useMemo(() => recentOf(context.customers, 6), [context.customers]);

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
                            body={`Kayıtlı ${context.customers.length} müşteride bu ad geçmiyor. Aynı ekrandan ekleyebilirsin.`}
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

            <SectionHead title="Hizmet" count={String(context.services.length)} size={ax ? M.secTitleAx : M.secTitle} />
            {context.services.length === 0 ? (
                <Hint>Salonda tanımlı hizmet yok. Hizmetler masaüstündeki ayarlardan eklenir.</Hint>
            ) : null}
            {context.services.map((service) => {
                // Müdür 23 v2: müşterinin açık bayrağı bu hizmeti kapatıyorsa
                // satır basılamaz ve sebebini söyler. Son söz yine sunucunun
                // (guard_reservation_eligibility).
                const reason = draft.customer
                    ? closedBy(context.settings.riskRules, draft.customer.fields, service)
                    : null;
                return reason ? (
                    <ClosedServiceRow key={service.id} service={service} reason={closedReason(reason)} />
                ) : (
                    <ServiceRow
                        key={service.id}
                        service={service}
                        selected={draft.service?.id === service.id}
                        onPress={() => patch({ service: draft.service?.id === service.id ? null : service })}
                    />
                );
            })}
        </>
    );

    function selectCustomer(customer: CustomerOption) {
        setQuery('');
        // Seçili hizmet bu müşteriye kapalıysa seçim DÜŞER: kapalı bir hizmetle
        // ilerleyip sunucunun reddiyle karşılaşmak, söz verildikten sonra
        // geri almak demek.
        const blocked = draft.service
            ? closedBy(context.settings.riskRules, customer.fields, draft.service)
            : null;
        patch(blocked ? { customer, newCustomerName: null, service: null } : { customer, newCustomerName: null });
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
                            patch({
                                dateISO: day.iso,
                                startMinutes: null,
                                // Sabit personel gün değişince de sabit kalır.
                                staffId: draft.locked.includes('staff') ? draft.staffId : null,
                            });
                        }}
                    />
                ))}
            </ScrollView>
        </>
    );

    const refusal = refused ? refusalCopy(refused) : null;
    const page2Body = (
        <>
            {refusal ? (
                <DurumBlock
                    tone={refusal.tone}
                    title={refusal.title}
                    lines={refusal.lines}
                    actions={[{ label: refusal.action.label, onPress: () => onRefusedMove(refusal.action.move) }]}
                    style={{ marginHorizontal: small ? M.railXSmall : M.railX, marginBottom: 12 }}
                />
            ) : null}
            {/* Gün okunamadıysa ray ÇİZİLMİYOR: boş bir ray "her saat boş"
                demek olurdu. */}
            {!dayKnown && day.state === 'error' && !day.refusal ? (
                <DurumUnread
                    what="Bu günün saatlerini"
                    notMeaning="Her saatin boş olduğu"
                    onRetry={() => { void day.reload(); }}
                    style={{ paddingHorizontal: small ? M.railXSmall : M.railX }}
                />
            ) : null}
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
            {
                label: 'Tutar',
                // Fiyatı yazılmamış hizmette "₺0" DEĞİL: çizgi.
                value: draft.service && draft.service.price !== null ? formatPrice(draft.service.price) : '—',
                numeric: Boolean(draft.service && draft.service.price !== null),
            },
        ];

    const barRadius = small ? M.barRadiusSmall : M.barRadius;
    const barLift = (small ? M.barLiftSmall : M.barLift) + inset0;
    // Pay çubuğun GERÇEK yüksekliğinden türer: son saat satırı (20:00) camın
    // altında kalmamalı.
    const inset = (summary.length > 2 ? M.barHeight : M.barHeightMini) + barLift;

    // Akışın son karesi: onay ekranı kabuğu devralır — üst çubuk, kahraman
    // levha ve iki sayfa yok; tek yüzey.
    if (created) {
        const person = staff.find((candidate) => candidate.id === created.staff_id);
        /*
         * Gidecek metnin KENDİSİ — masaüstünün onay şablonu. Önizleme de bu:
         * müdür neyi gönderdiğini görür.
         */
        const message = confirmationText({
            customerName: created.customer_name,
            dateISO: created.date,
            startTime: created.start_time,
            service: created.service,
            businessName: context.settings.businessName,
            staffName: person?.name ?? null,
            mapsUrl: context.settings.mapsUrl,
            sector: context.settings.sector,
        });
        return (
            <ConfirmScreen
                appointment={created}
                staffName={person?.name ?? '—'}
                staffInitials={person?.initials ?? '—'}
                price={draft.service?.price ?? null}
                message={message}
                onSend={() => onSend({
                    phone: created.customer_phone ?? '',
                    text: message,
                    customerId: created.customer_id ?? null,
                })}
                topInset={topInset}
                bottomInset={inset0}
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
                            label={saving ? 'Oluşturuluyor' : action.label}
                            enabled={action.enabled && !saving}
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
