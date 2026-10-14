interface Env {
  DB: D1Database;
  BRANCH_QUEUE_ROOM: DurableObjectNamespace;
}

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {
    TEST_SCHEMA_SQL: string;
  }
}
