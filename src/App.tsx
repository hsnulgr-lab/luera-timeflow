import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import { MobileNewReservation } from '@/mobile/pages/MobileNewReservation';
import { MobileCustomers } from '@/mobile/pages/MobileCustomers';
import { MobileKasa } from '@/mobile/pages/MobileKasa';
import { MobileStaff } from '@/mobile/pages/MobileStaff';
import { MobileSettings } from '@/mobile/pages/MobileSettings';
import { MobileQueue } from '@/mobile/pages/MobileQueue';
import { QueuePage } from '@/pages/QueuePage';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useModules } from '@/hooks/useModules';
import { useEntitlement } from '@/hooks/useEntitlement';
import type { ModuleKey } from '@/types';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReservationsPage } from '@/pages/ReservationsPage';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { KasaPage } from '@/pages/KasaPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { StaffPage } from '@/pages/StaffPage';
import { StaffDetailPage } from '@/pages/StaffDetailPage';
import { MasaPage } from '@/pages/MasaPage';
import { MobileMasa } from '@/mobile/pages/MobileMasa';
import { MenuPage } from '@/pages/MenuPage';
import { DentalChartPage } from '@/pages/DentalChartPage';
import { DentalVisitPage } from '@/pages/DentalVisitPage';
import { PatientFilePage } from '@/pages/PatientFilePage';
import { BeautyCustomerPage } from '@/pages/BeautyCustomerPage';
import { PackagesPage } from '@/pages/PackagesPage';
import { StockPage } from '@/pages/StockPage';
import { SetupWizardPage } from '@/pages/SetupWizardPage';
import { StaffModeRoot } from '@/mobile/staff/StaffModeRoot';
import { BookingPage } from '@/pages/public/BookingPage';
import { PricingPage } from '@/pages/public/PricingPage';
import { PaywallPage } from '@/pages/PaywallPage';
import { BookingManagePage } from '@/pages/public/BookingManagePage';
import { Toaster } from 'sonner';
import { ConfirmDialogHost } from '@/components/ConfirmDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DesktopCalendarFace, DesktopReservationsFace, DesktopCustomersFace, MobileCalendarFace } from '@/pages/sectorFaces';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--lt-bg, #120E08)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-[#FF5A1F]/30 border-t-[#FF5A1F] animate-spin" />
          <p className="text-sm" style={{ color: 'var(--lt-muted, rgba(243,237,227,0.5))' }}>Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <SubscriptionGate>{children}</SubscriptionGate>;
};

// Abonelik kapısı — ödeme yapılmadan sistem açılmaz.
//
// Bu bir GÜVENLİK katmanı değil, bir yönlendirme: gerçek kapı RLS'te
// (has_timeflow_access) ve edge fonksiyonlarında. Buradaki iş, parası bitmiş
// kullanıcıyı çalışmayan bir uygulamanın içinde dolaştırmamak.
//
// Duvarın KENDİSİ ve faturalandırma sekmesi muaf: ödeme yolunu kapatmak,
// kilitlenmenin en aptalca hâli olurdu.
const SubscriptionGate = ({ children }: { children: React.ReactNode }) => {
  const { locked, loading } = useEntitlement();
  const { pathname } = useLocation();
  const exempt = pathname.startsWith('/abonelik') || pathname.startsWith('/settings');
  // Yüklenirken engelleme: yanıp sönen bir yönlendirme, yavaş bağlantıda
  // ödemesini yapmış kullanıcıyı da duvara atardı.
  if (loading || exempt || !locked) return <>{children}</>;
  return <Navigate to="/abonelik" replace />;
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
          <Route path="/fiyatlar" element={<PricingPage />} />
          <Route path="/abonelik" element={
            <ProtectedRoute>
              <PaywallPage />
            </ProtectedRoute>
          } />
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
            <Route path="calendar" element={<ModuleRoute module="randevu"><Adaptive mobile={<MobileCalendarFace />} desktop={<DesktopCalendarFace />} /></ModuleRoute>} />
            <Route path="new" element={<ModuleRoute module="randevu"><Adaptive mobile={<MobileNewReservation />} desktop={<Navigate to="/reservations" replace />} /></ModuleRoute>} />
            <Route path="reservations" element={<ModuleRoute module="randevu"><Adaptive mobile={<ReservationsPage />} desktop={<DesktopReservationsFace />} /></ModuleRoute>} />
            <Route path="customers" element={<Adaptive mobile={<MobileCustomers />} desktop={<DesktopCustomersFace />} />} />
            <Route path="dental-chart" element={<DentalChartPage />} />
            <Route path="dental-visit/:reservationId" element={<ModuleRoute module="randevu"><DentalVisitPage /></ModuleRoute>} />
            <Route path="patient-file/:customerId" element={<PatientFilePage />} />
            <Route path="beauty-customer/:customerId" element={<BeautyCustomerPage />} />
            <Route path="packages" element={<PackagesPage />} />
            <Route path="kasa" element={<ModuleRoute module="kasa"><Adaptive mobile={<MobileKasa />} desktop={<KasaPage />} /></ModuleRoute>} />
            <Route path="stock" element={<ModuleRoute module="kasa"><StockPage /></ModuleRoute>} />
            <Route path="masa" element={<ModuleRoute module="masa"><Adaptive mobile={<MobileMasa />} desktop={<MasaPage />} /></ModuleRoute>} />
            <Route path="menu" element={<ModuleRoute module="masa"><MenuPage /></ModuleRoute>} />
            <Route path="queue" element={<ModuleRoute module="sira"><Adaptive mobile={<MobileQueue />} desktop={<QueuePage />} /></ModuleRoute>} />
            <Route path="staff" element={<ModuleRoute module="personel"><Adaptive mobile={<MobileStaff />} desktop={<StaffPage />} /></ModuleRoute>} />
            <Route path="staff/:id" element={<ModuleRoute module="personel"><StaffDetailPage /></ModuleRoute>} />
            <Route path="analytics" element={<ModuleRoute module="analiz"><AnalyticsPage /></ModuleRoute>} />
            <Route path="settings" element={<Adaptive mobile={<MobileSettings />} desktop={<SettingsPage />} />} />
            <Route path="kurulum" element={<SetupWizardPage />} />
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
      <ConfirmDialogHost />
    </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
