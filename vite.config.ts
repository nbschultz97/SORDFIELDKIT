import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'SORD Field Kit',
        short_name: 'SORD',
        start_url: '/SORDFIELDKIT/',
        display: 'standalone',
        background_color: '#0b0b0b',
        theme_color: '#0b0b0b',
        icons: [
          { src: '/SORDFIELDKIT/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/SORDFIELDKIT/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] }
    })
  ],
  base: '/SORDFIELDKIT/'
})
