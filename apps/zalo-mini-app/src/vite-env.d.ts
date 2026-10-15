/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute Worker origin, e.g. https://api.luotdi.vn */
  readonly VITE_API_BASE?: string;
  /** Zalo OA id for followOA on the served screen. */
  readonly VITE_ZALO_OA_ID?: string;
  /** "1" = use POST /api/auth/dev outside Zalo even in a non-dev build (staging/preview). */
  readonly VITE_SKIP_ZALO_AUTH?: string;
}
