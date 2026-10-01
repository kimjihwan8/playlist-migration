import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    /**
     * 배포에서는 CloudFront 가 `/api/*` 를 API Gateway 로 넘긴다.
     * 로컬에서도 같은 출처로 보이게 맞춰야 쿠키가 first-party 로 붙고
     * OAuth Redirect URI 도 한 벌만 등록하면 된다.
     */
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
})
