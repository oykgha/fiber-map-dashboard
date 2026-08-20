import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl']
  },
  build: {
    // The remaining main chunk is dominated by maplibre-gl/react-map-gl,
    // which is deliberately NOT vendor-split here — that's the exact
    // package that needed special handling for its worker file (see
    // HANDOFF.md), and splitting its bundling further risks reintroducing
    // that bug for a cosmetic warning. ~410KB gzipped is reasonable for a
    // WebGL mapping app; the modals (App.tsx/FiberMap.tsx) are already
    // lazy-loaded separately, which was the real, safe win.
    chunkSizeWarningLimit: 1700
  }
})
