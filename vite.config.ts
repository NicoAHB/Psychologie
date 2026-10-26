import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (args: string[]) => { try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };

// GitHub Pages ignores public/_headers, so the production page carries its own Content-Security-Policy.
// Only the Supabase host and the public NBU exchange-rate API are allowed outside the origin; dev builds stay unrestricted for Vite's HMR.
const contentSecurityPolicy = (supabase: string): Plugin => {
  const origin = (() => { try { return new URL(supabase).origin; } catch { return ''; } })();
  const policy = ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'", "img-src 'self' blob: data:", "worker-src 'self'", "media-src 'self' blob:",
    `connect-src 'self' https://bank.gov.ua${origin ? ` ${origin} ${origin.replace(/^http/, 'ws')}` : ''}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
  return { name: 'praxisraum-csp', apply: 'build', transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' },
    { tag: 'meta', attrs: { name: 'referrer', content: 'no-referrer' }, injectTo: 'head-prepend' }] };
};
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  // A build without Supabase settings does not ship (or precache) the Supabase client at all.
  const configured = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
  const revision = process.env.GITHUB_SHA || process.env.PRAXISRAUM_SOURCE_REVISION || git(['rev-parse', 'HEAD']);
  const build = { version: JSON.parse(readFileSync('package.json', 'utf8')).version as string,
    revision: /^[0-9a-f]{7,40}$/i.test(revision) ? revision : '',
    sourceDate: process.env.PRAXISRAUM_SOURCE_DATE || git(['log', '-1', '--format=%cI']),
    modified: !/^[0-9a-f]{7,40}$/i.test(revision) || !process.env.GITHUB_SHA && !process.env.PRAXISRAUM_SOURCE_REVISION && !!git(['status', '--porcelain', '--untracked-files=no']) };
  return { base: process.env.VITE_BASE_PATH || '/', plugins: [react(), tailwindcss(), contentSecurityPolicy(env.VITE_SUPABASE_URL ?? '')],
    resolve: { conditions: ['onnxruntime-web-use-extern-wasm', 'module', 'browser', 'development|production'] },
    worker: { format: 'es' }, define: { __CLOUD_CONFIGURED__: JSON.stringify(configured), __APP_BUILD__: JSON.stringify(build) }, server: { host: '0.0.0.0' } };
});
