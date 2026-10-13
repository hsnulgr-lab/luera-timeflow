import { Pressable, Text, View } from 'react-native';

import { SheetGrab, SheetHeader } from './Sheet';
import { Chevron, Money } from './CashParts';
import { formatAmount, pendingTitle, SUMMARY_LABEL, type Pending } from '../lib/cash';
import { pendingHint, pendingTicketLine, type FlowEvent } from '../lib/managerFlow';
import { apptCardMetrics, cashMetrics, font, useTheme } from '../theme';

/**
 * Tahsil edilmeyen adisyonlar — Kasa'nın turuncu şeridinden (v4 · C1).
 *
 * Tek kişilik kipte şerit kumandanın tahsilat adımını açıyor (K3). Tek
 * adisyon varsa doğrudan oraya gidiliyor; birden çoksa tasarımın kuralı
 * "önce liste" ve liste bu. Tasarım listeyi çizmedi: başlık şeridin kendi
 * cümlesi, satırlar Kasa'nın satır ölçüsünde, Kasa'nın alt sayfasında.
 *
 * Kişi adı YOK (v4 karar 3): parayı alan da işi yapan da kullanıcının kendisi.
 *
 * Kabuk randevu kartınınki, boy içerik kadar (`kasa/bekleyen.tsx` ·
 * formSheet · 2026-10-13): kaç adisyon varsa o kadar uzun.
 */
export function PendingTicketsSheet({ pending, tickets, opensIn, onPick, onClose }: {
    pending: Pending;
    tickets: readonly FlowEvent[];
    /** Tek kişilikte tahsilat adımı, ekipte Akış (`cashSheet`). */
    opensIn: 'collect' | 'flow';
    onPick: (ticket: FlowEvent) => void;
    onClose: () => void;
}) {
    const { c } = useTheme();

    return (
        <View style={{ backgroundColor: c.bg }}>
            <SheetGrab />
            <SheetHeader label={SUMMARY_LABEL} onClose={onClose} />
            <View style={{ paddingHorizontal: apptCardMetrics.sheetPadX, paddingBottom: 30 }}>
                <Text style={{ fontFamily: font.extraBold, fontSize: 19, letterSpacing: -0.4, color: c.tx }}>
                    {pendingTitle(pending)}
                </Text>
                <Text style={{ fontFamily: font.medium, fontSize: 13, color: c.tx2, marginTop: 2, marginBottom: 6 }}>
                    {pendingHint(opensIn)}
                </Text>

                {tickets.map((ticket) => {
                    const name = `${ticket.firstName} ${ticket.lastName}`.trim();
                    const line = pendingTicketLine(ticket);
                    const amount = ticket.amountValue;
                    return (
                        <Pressable
                            key={ticket.ticketKey ?? ticket.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${name}, ${line}${
                                typeof amount === 'number' ? `, ${formatAmount(amount)} lira` : ''
                            }. ${opensIn === 'flow' ? "Akış'ta aç." : 'Tahsilatı aç.'}`}
                            onPress={() => onPick(ticket)}
                            style={({ pressed }) => ({
                                flexDirection: 'row', alignItems: 'center', gap: 12,
                                minHeight: cashMetrics.sheetRowHeight + 16,
                                borderTopWidth: 1, borderTopColor: c.bd,
                                opacity: pressed ? 0.6 : 1,
                            })}
                        >
                            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                                <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 16, color: c.tx }}>
                                    {name}
                                </Text>
                                <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 13, color: c.tx2 }}>
                                    {line}
                                </Text>
                            </View>
                            {/* Tutar bilinmiyorsa yazılmıyor — "₺0" uydurulmaz. */}
                            {typeof amount === 'number' ? (
                                <Money style={{ fontFamily: font.extraBold, fontSize: 17, fontWeight: '800', color: c.tx }}>
                                    ₺{formatAmount(amount)}
                                </Money>
                            ) : null}
                            <Chevron size={18} color={c.tx3} />
                        </Pressable>
                    );
                })}
            </View>
        </View>
    );
}
