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
}

export type CalendarView = 'month' | 'week' | 'day';

export interface TimeSlot {
    time: string;
    available: boolean;
    reservation?: Reservation;
}
