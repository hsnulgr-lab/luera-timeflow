import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ReservationsProvider } from '@/contexts/ReservationsProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Layout } from '@/components/layout/Layout';
import { MobileShell } from '@/mobile/MobileShell';
import { MobileHome } from '@/mobile/pages/MobileHome';
import { MobileCalendar } from '@/mobile/pages/MobileCalendar';
import { MobileNewReservation } from '@/mobile/pages/MobileNewReservation';
import { MobileCustomers } from '@/mobile/pages/MobileCustomers';
import { MobileKasa } from '@/mobile/pages/MobileKasa';
import { useIsMobile } from '@/hooks/useIsMobile';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { ReservationsPage } from '@/pages/ReservationsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { KasaPage } from '@/pages/KasaPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StaffPage } from '@/pages/StaffPage';
import { BookingPage } from '@/pages/public/BookingPage';
import { BookingManagePage } from '@/pages/public/BookingManagePage';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#CCFF00]/30 border-t-[#CCFF00] animate-spin" />
          <p className="text-sm text-gray-400">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// Kabuk seçici: mobilde alt sekme çubuklu MobileShell, masaüstünde Sidebar'lı Layout.
// Veri katmanı (ReservationsProvider) ortak — entegrasyonlar değişmez.
const RootLayout = () => (useIsMobile() ? <MobileShell /> : <Layout />);

// Sayfa seçici: aynı route'ta mobil/masaüstü varyantı arasında geçiş yapar.
const Adaptive = ({ mobile, desktop }: { mobile: React.ReactNode; desktop: React.ReactNode }) =>
  useIsMobile() ? <>{mobile}</> : <>{desktop}</>;

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/book/:slug" element={<BookingPage />} />
          <Route path="/booking/:token" element={<BookingManagePage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <ReservationsProvider>
                <RootLayout />
              </ReservationsProvider>
            </ProtectedRoute>
          }>
            <Route index element={<Adaptive mobile={<MobileHome />} desktop={<DashboardPage />} />} />
            <Route path="calendar" element={<Adaptive mobile={<MobileCalendar />} desktop={<CalendarPage />} />} />
            <Route path="new" element={<Adaptive mobile={<MobileNewReservation />} desktop={<Navigate to="/reservations" replace />} />} />
            <Route path="reservations" element={<ReservationsPage />} />
            <Route path="customers" element={<Adaptive mobile={<MobileCustomers />} desktop={<CustomersPage />} />} />
            <Route path="kasa" element={<Adaptive mobile={<MobileKasa />} desktop={<KasaPage />} />} />
            <Route path="staff" element={<StaffPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#111',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
    </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
