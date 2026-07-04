-- ============================================
-- LUERA TimeFlow — Supabase Migration
-- ============================================

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Services Table
CREATE TABLE IF NOT EXISTS services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 30,
    color TEXT NOT NULL DEFAULT '#CCFF00',
    price NUMERIC(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Reservations Table
CREATE TABLE IF NOT EXISTS reservations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    service TEXT NOT NULL,
    service_color TEXT DEFAULT '#CCFF00',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Settings Table (one row per user)
CREATE TABLE IF NOT EXISTS settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL DEFAULT 'Luera TimeFlow',
    slot_duration INTEGER NOT NULL DEFAULT 30,
    working_hours JSONB NOT NULL DEFAULT '[
        {"day":0,"dayName":"Pazar","start":"09:00","end":"18:00","isOff":true},
        {"day":1,"dayName":"Pazartesi","start":"09:00","end":"18:00","isOff":false},
        {"day":2,"dayName":"Salı","start":"09:00","end":"18:00","isOff":false},
        {"day":3,"dayName":"Çarşamba","start":"09:00","end":"18:00","isOff":false},
        {"day":4,"dayName":"Perşembe","start":"09:00","end":"18:00","isOff":false},
        {"day":5,"dayName":"Cuma","start":"09:00","end":"18:00","isOff":false},
        {"day":6,"dayName":"Cumartesi","start":"10:00","end":"15:00","isOff":false}
    ]'::jsonb,
    webhook_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_reservations_user_date ON reservations(user_id, date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_services_user ON services(user_id);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Customers: users can only manage their own customers
CREATE POLICY "Users can view own customers" ON customers
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own customers" ON customers
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own customers" ON customers
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own customers" ON customers
    FOR DELETE USING (auth.uid() = user_id);

-- Reservations: users can only manage their own reservations
CREATE POLICY "Users can view own reservations" ON reservations
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reservations" ON reservations
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reservations" ON reservations
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reservations" ON reservations
    FOR DELETE USING (auth.uid() = user_id);

-- Services: users can only manage their own services
CREATE POLICY "Users can view own services" ON services
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own services" ON services
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own services" ON services
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own services" ON services
    FOR DELETE USING (auth.uid() = user_id);

-- Settings: users can only manage their own settings
CREATE POLICY "Users can view own settings" ON settings
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON settings
    FOR UPDATE USING (auth.uid() = user_id);
