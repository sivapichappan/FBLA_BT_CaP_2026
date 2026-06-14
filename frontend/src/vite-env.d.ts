/// <reference types="vite/client" />

// Types for the environment variables we read via import.meta.env.
interface ImportMetaEnv {
  /** Base URL of the FastAPI backend, e.g. http://localhost:8000 */
  readonly VITE_API_BASE_URL: string;
  /** Google Maps JS API key (client-side; restrict by HTTP referrer). */
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
