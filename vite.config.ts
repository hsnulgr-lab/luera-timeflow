import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',           // yeni deploy'da otomatik güncelle (cache bayatlamaz)
      strategies: 'injectManifest',         // özel SW (src/sw.ts) — Web Push handler için
      srcDir: 'src',
      filename: 'sw.ts',
      includeAssets: ['favicon-dark.svg', 'favicon-light.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Luera TimeFlow',
        short_name: 'TimeFlow',
        description: 'Randevu ve işletme yönetimi',
        lang: 'tr',
        theme_color: '#FF5A1F',
        background_color: '#120E08',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Tek parça uygulama paketi 2 MiB'ı geçti (varsayılan sınır). Sınırın
        // altında kalan dosya precache DIŞINDA kalıyor ve çevrimdışı açılış
        // bozuluyordu; kod bölme yapılana kadar sınır yükseltildi.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Edge fonksiyonlarıyla PAYLAŞILAN saf mantık. Kopyalanmıyor çünkü
      // abonelik kararının istemcide ve sunucuda farklı çıkması, kullanıcının
      // ekranı görüp kaydedememesi demek.
      '@shared': path.resolve(__dirname, './supabase/functions/_shared'),
    },
  },
  server: {
    proxy: {
      '/api/supabase': {
        target: 'https://supabase.timeflow.lueratech.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/supabase/, ''),
        secure: true,
      },
    },
  },
})
