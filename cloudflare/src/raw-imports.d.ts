/**
 * Ambient type declarations for prompt-file text imports.
 *
 * Prompt `.md` files are bundled as UTF-8 string exports by wrangler via the
 * `[[rules]] type = "Text"` block in `cloudflare/wrangler.toml` (issue #191),
 * and by Vite when running tests. The matching import path uses no query
 * suffix — wrangler doesn't implement Vite's `?raw`. We declare the module
 * shape here so tsc is happy in both environments.
 */
declare module '*.md' {
  const content: string;
  export default content;
}
declare module '*.txt' {
  const content: string;
  export default content;
}
