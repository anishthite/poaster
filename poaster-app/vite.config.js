import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5174 },
  resolve: { alias: { '@': path.resolve(root, './src') } },
});
