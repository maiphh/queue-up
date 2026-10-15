interface Env {
  DB: D1Database;
  BRANCH_QUEUE_ROOM: DurableObjectNamespace;
  ENVIRONMENT?: string;
  CORS_EXTRA_ORIGINS?: string;
  ZALO_APP_SECRET?: string;
  JWT_SECRET?: string;
  ZALO_OA_ACCESS_TOKEN?: string;
  ZNS_TEMPLATE_APPROACHING_ID?: string;
  ZNS_DEVELOPMENT_MODE?: string;
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_SCHEMA_SQL: string;
    JWT_SECRET: string;
    ZALO_APP_SECRET: string;
  }
}
