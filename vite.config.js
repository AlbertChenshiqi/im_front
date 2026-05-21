import { defineConfig } from 'vite';

/** 本地开发时代理 REST，避免浏览器 CORS；WebSocket 直连 gateway */
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/proxy/user': {
        target: 'http://localhost:10100',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/user/, ''),
      },
      '/proxy/conversation': {
        target: 'http://localhost:10400',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/conversation/, ''),
      },
      '/proxy/message': {
        target: 'http://localhost:10500',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/message/, ''),
      },
      '/proxy/group': {
        target: 'http://localhost:10300',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/proxy\/group/, ''),
      },
    },
  },
});
