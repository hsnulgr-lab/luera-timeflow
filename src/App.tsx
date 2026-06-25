import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ReservationsProvider } from '@/contexts/ReservationsProvider';
import { ModulesProvider } from '@/contexts/ModulesProvider';
import { ManagerModeProvider } from '@/contexts/ManagerModeProvider';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { Layout } from '@/components/layout/Layout';
import { MobileShell } from '@/mobile/MobileShell';
import { MobileHome } from '@/mobile/pages/MobileHome';
import { MobileAdminHome } from '@/mobile/pages/MobileAdminHome';
import { useManagerMode } from '@/contexts/ManagerModeProvider';
import { MobileCalendar } from '@/mobile/pages/MobileCalendar';
import { MobileNewReservation } from '@/mobile/pages/MobileNewReservation';
import { MobileCustomers } from '@/mobile/pages/MobileCustomers';
import { MobileKasa } from '@/mobile/pages/MobileKasa';
import { MobileStaff } from '@/mobile/pages/MobileStaff';
import { MobileSettings } from '@/mobile/pages/MobileSettings';
import { MobileQueue } from '@/mobile/pages/MobileQueue';
import { QueuePage } from '@/pages/QueuePage';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useModules } from '@/hooks/useModules';
import type { ModuleKey } from '@/types';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CalendarPage } from '@/pages/CalendarPage';
import { ReservationsPage } from '@/pages/ReservationsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { KasaPage } from '@/pages/KasaPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StaffPage } from '@/pages/StaffPage';
import { StaffDetailPage } from '@/pages/StaffDetailPage';
import { MasaPage } from '@/pages/MasaPage';
import { StaffModeRoot } from '@/mobile/staff/StaffModeRoot';
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

// Mobil ana ekran: yönetici modunda Yönetici Paneli, değilse operasyonel ana sayfa.
const MobileHomeSwitch = () => {
  const { isManager } = useManagerMode();
  return isManager ? <MobileAdminHome /> : <MobileHome />;
};

// Sayfa seçici: aynı route'ta mobil/masaüstü varyantı arasında geçiş yapar.
const Adaptive = ({ mobile, desktop }: { mobile: React.ReactNode; desktop: React.ReactNode }) =>
  useIsMobile() ? <>{mobile}</> : <>{desktop}</>;

// Modül kapalıysa Dashboard'a yönlendir (doğrudan URL ile erişim de engellenir).
// Modüller yüklenene kadar bekle — yoksa varsayılanla erken redirect olur (örn. masa).
const ModuleRoute = ({ module, children }: { module: ModuleKey; children: React.ReactNode }) => {
  const { isEnabled, isLoading } = useModules();
  if (isLoading) return null;
  return isEnabled(module) ? <>{children}</> : <Navigate to="/" replace />;
};

function App() {
  return (
    <ErrorBoundary>
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <ManagerModeProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/book/:slug" element={<BookingPage />} />
          <Route path="/booking/:token" element={<BookingManagePage />} />
          <Route path="/personel" element={
            <ProtectedRoute>
              <StaffModeRoot />
            </ProtectedRoute>
          } />
          <Route path="/" element={
            <ProtectedRoute>
              <ModulesProvider>
                <ReservationsProvider>
                  <RootLayout />
                </ReservationsProvider>
              </ModulesProvider>
            </ProtectedRoute>
          }>
            <Route index element={<Adaptive mobile={<MobileHomeSwitch />} desktop={<DashboardPage />} />} />
            <Route path="calendar" element={<ModuleRoute module="randevu"><Adaptive mobile={<MobileCalendar />} desktop={<CalendarPage />} /></ModuleRoute>} />
            <Route path="new" element={<ModuleRoute module="randevu"><Adaptive mobile={<MobileNewReservation />} desktop={<Navigate to="/reservations" replace />} /></ModuleRoute>} />
            <Route path="reservations" element={<ModuleRoute module="randevu"><ReservationsPage /></ModuleRoute>} />
            <Route path="customers" element={<Adaptive mobile={<MobileCustomers />} desktop={<CustomersPage />} />} />
            <Route path="kasa" element={<ModuleRoute module="kasa"><Adaptive mobile={<MobileKasa />} desktop={<KasaPage />} /></ModuleRoute>} />
            <Route path="masa" element={<ModuleRoute module="masa"><MasaPage /></ModuleRoute>} />
            <Route path="queue" element={<ModuleRoute module="sira"><Adaptive mobile={<MobileQueue />} desktop={<QueuePage />} /></ModuleRoute>} />
            <Route path="staff" element={<ModuleRoute module="personel"><Adaptive mobile={<MobileStaff />} desktop={<StaffPage />} /></ModuleRoute>} />
            <Route path="staff/:id" element={<ModuleRoute module="personel"><StaffDetailPage /></ModuleRoute>} />
            <Route path="analytics" element={<ModuleRoute module="analiz"><AnalyticsPage /></ModuleRoute>} />
            <Route path="settings" element={<Adaptive mobile={<MobileSettings />} desktop={<SettingsPage />} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ManagerModeProvider>
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
