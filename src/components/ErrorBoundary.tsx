import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** İsteğe bağlı özel fallback — verilmezse markalı varsayılan ekran gösterilir */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Uygulama genelinde render hatalarını yakalar; tek bir component patladığında
 * tüm ekranın beyaza düşmesini engeller. Error boundary yalnızca class component
 * olarak yazılabilir (React 19 dahil hook karşılığı yok).
 *
 * Tema: class component olduğu için useTheme() kullanılamaz — localStorage'tan
 * okunan 'luera-theme' ile zemin/yazı rengi marka paletine göre seçilir.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Geliştirme/üretimde teşhis için logla. İleride Sentry vb. buraya bağlanabilir.
    console.error('ErrorBoundary yakaladı:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    let dark = false;
    try { dark = localStorage.getItem('luera-theme') === 'dark'; } catch { /* yoksay */ }

    const bg = dark ? '#0E0E0E' : '#F3ECE0';
    const ink = dark ? '#F3ECE0' : '#0E0E0E';
    const muted = dark ? 'rgba(243,237,227,0.55)' : 'rgba(14,14,14,0.55)';
    const hairline = dark ? 'rgba(243,237,227,0.12)' : 'rgba(14,14,14,0.10)';
    const orange = '#FF5A1F';

    return (
      <div style={{
        minHeight: '100vh', background: bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, fontFamily: 'Hanken Grotesk, Inter, system-ui, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          {/* Marka işareti */}
          <div style={{ display: 'inline-flex', alignItems: 'flex-end', fontWeight: 900, fontSize: 30, letterSpacing: '-0.05em', lineHeight: 0.82, color: ink, marginBottom: 28 }}>
            luera
            <span style={{ width: '0.22em', height: '0.22em', borderRadius: '50%', background: orange, marginLeft: '0.02em', marginBottom: '0.02em', display: 'inline-block', flexShrink: 0 }} />
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: ink, marginBottom: 10 }}>
            Bir şeyler ters gitti
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: muted, marginBottom: 28 }}>
            Beklenmeyen bir hata oluştu. Sayfayı yenileyerek devam edebilirsiniz.
            Sorun sürerse lütfen bizimle iletişime geçin.
          </p>

          {import.meta.env.DEV && this.state.error && (
            <pre style={{
              textAlign: 'left', fontSize: 12, lineHeight: 1.5, color: muted,
              background: dark ? 'rgba(243,237,227,0.04)' : 'rgba(14,14,14,0.04)',
              border: `1px solid ${hairline}`, borderRadius: 10,
              padding: '12px 14px', marginBottom: 24, overflow: 'auto', maxHeight: 180,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}>
              {this.state.error.message}
            </pre>
          )}

          <button
            onClick={this.handleReload}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 48, padding: '0 28px', background: orange, border: 'none',
              color: '#0E0E0E', fontWeight: 700, fontSize: 15, borderRadius: 999,
              cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.005em',
            }}
          >
            Sayfayı Yenile
          </button>
        </div>
      </div>
    );
  }
}
