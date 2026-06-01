export interface Reservation {
    id: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    date: string;
    startTime: string;
    endTime: string;
    service: string;
    serviceColor?: string;
    status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
    notes?: string;
    createdAt: string;
    updatedAt?: string;
    reminder24hSent?: boolean;
    reminder2hSent?: boolean;
    staffId?: string;
    staffName?: string;
    staffColor?: string;
}

export interface Customer {
    id: string;
    name: string;
    phone: string;
    email?: string;
    totalReservations: number;
    lastVisit?: string;
    notes?: string;
    createdAt: string;
}

export interface WorkingHours {
    day: number;
    dayName: string;
    start: string;
    end: string;
    isOff: boolean;
}

export interface Service {
    id: string;
    name: string;
    duration: number;
    color: string;
    price?: number;
}

export interface Settings {
    businessName: string;
    workingHours: WorkingHours[];
    services: Service[];
    webhookUrl?: string;
    slotDuration: number;
    whatsappInstance?: string;
}

export interface Staff {
    id: string;
    organizationId: string;
    name: string;
    specialty?: string;
    phone?: string;
    email?: string;
    color: string;
    workingHours?: WorkingHours[];
    isActive: boolean;
    createdAt: string;
}

export type CalendarView = 'month' | 'week' | 'day';

export interface TimeSlot {
    time: string;
    available: boolean;
    reservation?: Reservation;
}
