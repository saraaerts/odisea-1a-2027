import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const endpoint = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (endpoint || key) {
    let publicKey = key?.startsWith('sb_publishable_') ?? false;
    if (!publicKey && key?.split('.').length === 3) {
      try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role === 'anon'; } catch { /* clave inválida */ }
    }
    if (!endpoint || !/^https:\/\/[a-z0-9.-]+\/?$/i.test(endpoint) || !publicKey) {
      throw new Error('Configurá una URL HTTPS de Supabase y una clave pública anon o publishable. No se compiló ningún valor.');
    }
  }
  return {
    base: './',
    build: { target: 'es2022', chunkSizeWarningLimit: 650 },
    server: { host: '127.0.0.1' },
  };
});
