/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISCORD_APPLICATION_ID?: string;
  readonly VITE_REPO_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
