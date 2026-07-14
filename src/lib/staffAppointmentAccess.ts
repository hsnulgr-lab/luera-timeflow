import type { StaffPermission, StaffRole } from './staffPermissions';
import type { Reservation } from '@/types';

export interface StaffAppointmentActor {
    staffId?: string | null;
    role?: StaffRole | null;
    can: (permission: StaffPermission) => boolean;
}

type StaffAppointment = Pick<Reservation, 'staffId' | 'status' | 'arrivedAt'>;

export function canViewStaffAppointment(
    appointment: StaffAppointment | null | undefined,
    actor: StaffAppointmentActor,
): boolean {
    if (!appointment) return false;
    return actor.can('appointments:view-all')
        || Boolean(
            actor.staffId
            && appointment.staffId === actor.staffId
            && actor.can('appointments:view-own'),
        );
}

export function canConfirmStaffAppointment(
    appointment: StaffAppointment | null | undefined,
    actor: StaffAppointmentActor,
): boolean {
    if (!appointment || appointment.status !== 'pending' || appointment.arrivedAt) return false;
    return actor.can('appointments:update-all')
        || Boolean(
            actor.staffId
            && appointment.staffId === actor.staffId
            && actor.can('appointments:update-own'),
        );
}

export function canTreatStaffAppointment(
    appointment: StaffAppointment | null | undefined,
    actor: StaffAppointmentActor,
): boolean {
    if (!appointment || appointment.status === 'cancelled') return false;
    return Boolean(
        actor.staffId
        && appointment.staffId === actor.staffId
        && actor.can('appointments:update-own'),
    );
}
