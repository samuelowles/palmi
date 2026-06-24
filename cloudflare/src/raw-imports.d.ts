/**
 * Ambient type declarations for `?raw` text imports.
 *
 * The `?raw` suffix is a bundler convention (esbuild, Vite, Wrangler) that
 * asks the bundler to load the file as a UTF-8 string at build time. The
 * Cloudflare Worker (esbuild via Wrangler) and Vitest (Vite) both honour it
 * natively, so we only need a tiny ambient declaration to satisfy tsc.
 */
declare module '*.md?raw' {
  const content: string;
  export default content;
}
declare module '*.txt?raw' {
  const content: string;
  export default content;
}
