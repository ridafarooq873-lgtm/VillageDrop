import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Uploaded receipts / delivery proofs are served by the backend
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      // Socket.IO realtime channel (websocket + polling fallback)
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
