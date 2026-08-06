import { Pool } from 'pg';

export interface RuntimeDb {
  query: Pool['query'];
  end?: Pool['end'];
}

export function createRuntimeDb(input: { connectionString?: string; pool?: RuntimeDb }) {
  if (input.pool) return input.pool;
  if (!input.connectionString) {
    throw new Error('createRuntimeDb requires either a connectionString or a pool');
  }
  return new Pool({
    connectionString: input.connectionString
  });
}
