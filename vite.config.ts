import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cppPlugin } from './server/cpp';
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};
export default defineConfig({ plugins: [react(), cppPlugin()], server: { headers }, preview: { headers } });
