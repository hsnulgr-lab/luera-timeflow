-- Migration 004: Add reminder tracking flags to reservations
-- Bu sütunlar n8n'in aynı müşteriye 2 kez mesaj atmasını engeller.

ALTER TABLE public.reservations 
ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN DEFAULT false;
