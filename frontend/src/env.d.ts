// Types for the variables in .env — without this, import.meta.env.VITE_* is `any`.
interface ImportMetaEnv {
  readonly VITE_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
