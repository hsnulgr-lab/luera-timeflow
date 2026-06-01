-- Migration 005: Add Partial Index for n8n cron polling performance
-- n8n her 5-10 dakikada bir "yaklaşan randevu var mı?" diye sorduğunda
-- veritabanı tüm tabloyu taramasın diye sadece "henüz mesaj gitmemiş" ve "iptal edilmemiş"
-- randevuları önbellekleyen performans dizini.

CREATE INDEX IF NOT EXISTS idx_reservations_pending_reminders 
ON public.reservations (date, start_time) 
WHERE (reminder_24h_sent = false OR reminder_2h_sent = false) AND status != 'cancelled';
