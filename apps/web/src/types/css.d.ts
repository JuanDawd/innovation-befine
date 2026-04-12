/**
 * CSS module type declarations.
 * Allows TypeScript to accept side-effect CSS imports (e.g. `import './globals.css'`)
 * without errors in editors that run tsc directly instead of the Next.js language plugin.
 */
declare module "*.css" {
  const content: Record<string, string>;
  export default content;
}
