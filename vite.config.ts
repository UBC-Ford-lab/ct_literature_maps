import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // For GitHub Pages deployment at https://username.github.io/repo-name/
  base: '/ct_literature_maps/',
  build: {
    chunkSizeWarningLimit: 10000,
  },
})
