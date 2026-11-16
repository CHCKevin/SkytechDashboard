import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const api = 'http://127.0.0.1:4173';

export default defineConfig({
  root,
  plugins: [svelte(), svelteTesting()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 正式 CSP 為 default-src 'self'，不可把字型或圖片內嵌成 data: URI。
    assetsInlineLimit: 0,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // 開發時轉發到 Node；Host 與 Origin 改寫成 Node 位址，伺服器端檢查不需放寬。
      '/api': {
        target: api,
        changeOrigin: true,
        configure: proxy => proxy.on('proxyReq', req => {
          if (req.getHeader('origin')) req.setHeader('origin', api);
        }),
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.js'],
    // 在 UTC+8 下執行，讓 toISOString() 造成的跨日錯誤能被測出來。
    env: { TZ: 'Asia/Taipei' },
  },
});
