import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.5';
import { z } from 'npm:zod@3.25.76';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BodySchema = z.object({
  backup: z.record(z.unknown()),
});

type TableColumn = {
  column_name: string;
  column_type: string;
};

type UniqueConstraint = {
  columns: string[];
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    const authHeader = req.headers.get('Authorization');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !dbUrl) {
      return jsonResponse({ error: 'Server configuration is incomplete.' }, 500);
    }

    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing authorization header.' }, 401);
    }

    const body = BodySchema.safeParse(await req.json());
    if (!body.success) {
      return jsonResponse({ error: 'Invalid backup payload.' }, 400);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized request.' }, 401);
    }

    const { data: roles, error: roleError } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      console.error('Role lookup failed:', roleError);
      return jsonResponse({ error: 'Unable to verify permissions.' }, 500);
    }

    const userRoles = new Set((roles ?? []).map(({ role }) => role));
    if (!userRoles.has('admin')) {
      return jsonResponse({ error: 'Admin access required.' }, 403);
    }

    const { data: tableList, error: tableListError } = await serviceClient.rpc('get_public_tables');
    if (tableListError) {
      console.error('Table list failed:', tableListError);
      return jsonResponse({ error: 'Unable to load table list.' }, 500);
    }

    const allowedTables = new Set(
      (tableList ?? []).map((row: { table_name?: string } | string) =>
        typeof row === 'string' ? row : row.table_name,
      ).filter(Boolean),
    );

    const tableEntries = Object.entries(body.data.backup).filter(
      ([tableName, rows]) => allowedTables.has(tableName) && Array.isArray(rows),
    ) as Array<[string, unknown[]]>;

    const ignoredKeys = Object.keys(body.data.backup).filter((key) => !allowedTables.has(key));

    const sql = postgres(dbUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 20,
      ssl: 'require',
    });

    let tablesImported = 0;
    let rowsImported = 0;
    const tableResults: Array<{ table: string; rows: number }> = [];

    try {
      await sql.unsafe('BEGIN');
      await sql.unsafe("SET session_replication_role = 'replica'");

      for (const [tableName, rawRows] of tableEntries) {
        const rowObjects = rawRows.filter((row): row is Record<string, unknown> =>
          !!row && typeof row === 'object' && !Array.isArray(row),
        );

        const columns = await getTableColumns(sql, tableName);
        if (columns.length === 0) {
          throw new Error(`No columns found for table ${tableName}`);
        }

        const columnMap = new Map(columns.map((column) => [column.column_name, column]));
        const presentColumns = columns.filter((column) =>
          rowObjects.some((row) => Object.prototype.hasOwnProperty.call(row, column.column_name)),
        );

        if (rowObjects.length === 0 || presentColumns.length === 0) {
          tablesImported += 1;
          tableResults.push({ table: tableName, rows: 0 });
          continue;
        }

        const uniqueConstraints = await getUniqueConstraints(sql, tableName);

        for (const chunk of chunkArray(rowObjects, 500)) {
          const normalizedRows = chunk.map((row) => {
            const normalized: Record<string, unknown> = {};
            for (const column of presentColumns) {
              if (Object.prototype.hasOwnProperty.call(row, column.column_name)) {
                normalized[column.column_name] = normalizeColumnValue(
                  tableName,
                  column.column_name,
                  column.column_type,
                  row[column.column_name],
                );
              }
            }
            return normalized;
          });

          for (const constraint of uniqueConstraints) {
            const relevantColumns = constraint.columns
              .map((columnName) => columnMap.get(columnName))
              .filter((column): column is TableColumn => !!column)
              .filter((column) => normalizedRows.some((row) => row[column.column_name] !== undefined && row[column.column_name] !== null));

            if (relevantColumns.length !== constraint.columns.length) {
              continue;
            }

            const deleteQuery = buildDeleteConflictsQuery(tableName, relevantColumns);
            await sql.unsafe(deleteQuery, [JSON.stringify(normalizedRows)]);
          }

          const insertQuery = buildInsertQuery(tableName, presentColumns);
          await sql.unsafe(insertQuery, [JSON.stringify(normalizedRows)]);
          rowsImported += normalizedRows.length;
        }

        tablesImported += 1;
        tableResults.push({ table: tableName, rows: rowObjects.length });
      }

      await sql.unsafe("SET session_replication_role = 'origin'");
      await sql.unsafe('COMMIT');
    } catch (error) {
      try {
        await sql.unsafe('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      try {
        await sql.unsafe("SET session_replication_role = 'origin'");
      } catch {
        // ignore reset errors
      }
      throw error;
    } finally {
      await sql.end({ timeout: 5 });
    }

    return jsonResponse({
      success: true,
      tablesImported,
      rowsImported,
      tableResults,
      ignoredKeys,
    });
  } catch (error) {
    console.error('import-database error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Internal server error.' },
      500,
    );
  }
});

async function getTableColumns(sql: postgres.Sql, tableName: string): Promise<TableColumn[]> {
  return await sql<TableColumn[]>`
    SELECT
      a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS column_type
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = ${tableName}
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `;
}

async function getUniqueConstraints(sql: postgres.Sql, tableName: string): Promise<UniqueConstraint[]> {
  const rows = await sql<{ columns: string[] }[]>`
    SELECT array_agg(a.attname ORDER BY keys.ordinality) AS columns
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(i.indkey) WITH ORDINALITY AS keys(attnum, ordinality) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = keys.attnum
    WHERE n.nspname = 'public'
      AND c.relname = ${tableName}
      AND i.indisunique = true
      AND i.indpred IS NULL
      AND a.attnum > 0
    GROUP BY i.indexrelid
  `;

  return rows.map((row) => ({ columns: row.columns }));
}

function buildDeleteConflictsQuery(tableName: string, columns: TableColumn[]) {
  const quotedTable = `${quoteIdentifier('public')}.${quoteIdentifier(tableName)}`;
  const columnDefs = columns
    .map((column) => `${quoteIdentifier(column.column_name)} ${column.column_type}`)
    .join(', ');
  const distinctColumns = columns.map((column) => quoteIdentifier(column.column_name)).join(', ');
  const joinConditions = columns
    .map((column) => {
      const quoted = quoteIdentifier(column.column_name);
      return `existing.${quoted} IS NOT DISTINCT FROM incoming.${quoted}`;
    })
    .join(' AND ');

  return `
    DELETE FROM ${quotedTable} AS existing
    USING (
      SELECT DISTINCT ${distinctColumns}
      FROM jsonb_to_recordset($1::text::jsonb) AS incoming(${columnDefs})
    ) AS incoming
    WHERE ${joinConditions}
  `;
}

function buildInsertQuery(tableName: string, columns: TableColumn[]) {
  const quotedTable = `${quoteIdentifier('public')}.${quoteIdentifier(tableName)}`;
  const columnList = columns.map((column) => quoteIdentifier(column.column_name)).join(', ');
  const columnDefs = columns
    .map((column) => `${quoteIdentifier(column.column_name)} ${column.column_type}`)
    .join(', ');

  return `
    INSERT INTO ${quotedTable} (${columnList})
    SELECT ${columnList}
    FROM jsonb_to_recordset($1::text::jsonb) AS incoming(${columnDefs})
  `;
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

const NUMERIC_TYPES = new Set(['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision']);
const INTEGER_TYPES = new Set(['smallint', 'integer', 'bigint']);
const APP_ROLE_VALUES = new Set(['admin', 'moderator', 'user']);

function normalizeColumnValue(
  tableName: string,
  columnName: string,
  columnType: string,
  value: unknown,
): unknown {
  if (value == null) return value;

  if (tableName === 'user_roles' && columnName === 'role') {
    return normalizeAppRole(value);
  }

  if (tableName === 'profiles' && columnName === 'role') {
    return normalizeProfileRole(value);
  }

  if (isNumericType(columnType) && typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
    return isNaN(parsed) ? null : (isIntegerType(columnType) ? Math.round(parsed) : parsed);
  }

  return value;
}

function normalizeAppRole(value: unknown): 'admin' | 'moderator' | 'user' {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'owner') return 'admin';
  return APP_ROLE_VALUES.has(normalized) ? (normalized as 'admin' | 'moderator' | 'user') : 'user';
}

function normalizeProfileRole(value: unknown): string {
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'owner') return 'admin';
  if (APP_ROLE_VALUES.has(normalized)) return normalized;
  return 'user';
}

function isNumericType(colType: string): boolean {
  return NUMERIC_TYPES.has(colType.toLowerCase());
}

function isIntegerType(colType: string): boolean {
  return INTEGER_TYPES.has(colType.toLowerCase());
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
