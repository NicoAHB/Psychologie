import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages ignores public/_headers, so the production page carries its own Content-Security-Policy.
// Only the Supabase host is allowed outside the origin; dev builds stay unrestricted for Vite's HMR.
const contentSecurityPolicy = (supabase: string): Plugin => {
  const origin = (() => { try { return new URL(supabase).origin; } catch { return ''; } })();
  const policy = ["default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:",
    `connect-src 'self'${origin ? ` ${origin}` : ''}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  return { name: 'praxisraum-csp', apply: 'build', transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' }] };
};
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // A build without Supabase settings does not ship (or precache) the Supabase client at all.
  const configured = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  return { base: process.env.VITE_BASE_PATH || '/', plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? '')],
    define: { __CLOUD_CONFIGURED__: JSON.stringify(configured) }, server: { host: '0.0.0.0' } };
});
