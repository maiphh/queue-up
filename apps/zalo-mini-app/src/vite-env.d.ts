/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute Worker origin, e.g. https://api.luotdi.vn */
  readonly VITE_API_BASE?: string;
  /** Zalo OA id for followOA on the served screen. */
  readonly VITE_ZALO_OA_ID?: string;
}
