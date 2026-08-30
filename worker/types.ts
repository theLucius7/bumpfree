// Minimal binding types keep browser TypeScript independent of Workers' globals.
export interface SqlResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes: number; rows_read: number; rows_written: number };
}
export interface Statement {
  bind(...args: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
  run<T = Record<string, unknown>>(): Promise<SqlResult<T>>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<SqlResult<T>[]>;
}
export interface Env {
  DB: Database;
  AUTH_PEPPER: string;
  SITE_URL: string;
  DEV_ORIGIN?: string;
}
export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: "user" | "superadmin";
  room_quota: number;
  schedule_quota: number;
  created_at: string;
  password_salt: string;
  password_verifier: string | null;
  recovery_hash: string | null;
  auth_version: number;
}
