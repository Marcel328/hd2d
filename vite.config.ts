import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    // three.js alone is ~700 kB minified; it is split into its own long-cached chunk.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/, priority: 3 },
            { name: 'postfx', test: /node_modules[\\/](@react-three[\\/])?postprocessing[\\/]/, priority: 2 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|@react-three[\\/]fiber|zustand|its-fine|suspend-react)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
})
