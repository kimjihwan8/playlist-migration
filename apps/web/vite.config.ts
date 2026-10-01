import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    /**
     * 반드시 IPv4 로 열어야 한다.
     * Vite 기본값('localhost')은 환경에 따라 IPv6 `[::1]` 에만 바인딩되는데,
     * Spotify 는 루프백 Redirect URI 로 `localhost` 를 더 이상 받지 않고 `127.0.0.1` 만 받는다.
     * 그러면 Dashboard 에 등록한 주소로는 접속조차 안 되는 상태가 된다.
     */
    host: '127.0.0.1',
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
