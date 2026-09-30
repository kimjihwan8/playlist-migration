import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 백엔드(apps/api)가 생기면 여기로 프록시. 그래야 로컬에서도 same-origin이라
    // 쿠키 세션이 배포 환경과 동일하게 동작한다.
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
})
