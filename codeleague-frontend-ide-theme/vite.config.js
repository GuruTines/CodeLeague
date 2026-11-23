import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Бэкенд (Go) слушает :9091. Фронтенд ходит к нему через префикс /api,
// чтобы адреса страниц (/rooms/:id, /tasks) не пересекались с адресами API.
// Префикс /api отрезается, поэтому /api/rooms/ID/ws -> http://127.0.0.1:9091/rooms/ID/ws
const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:9091';

export default defineConfig({
    plugins: [react()],
    server: {
        host: '0.0.0.0',
        port: 5173,
        strictPort: true,
        proxy: {
            '/api': {
                target: BACKEND,
                changeOrigin: false,
                ws: true,
                rewrite: (path) => path.replace(/^\/api/, '')
            }
        }
    }
});
