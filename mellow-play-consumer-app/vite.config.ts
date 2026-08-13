import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Vite's default target ('modules') is Safari 14, which is not a safe
    // floor for this audience: parents open links on whatever iPhone they
    // have, and iOS 12/13 devices are still in circulation. A bundle the
    // browser cannot PARSE fails before any of our code runs — no error
    // handler, no ErrorBoundary, just a white page — so the floor is set
    // explicitly rather than inherited. The cost is a slightly larger
    // bundle from lowering syntax; the alternative is a blank app with no
    // way to tell why.
    target: ['es2019', 'safari13', 'ios13', 'chrome87', 'firefox78', 'edge88'],
  },
})
