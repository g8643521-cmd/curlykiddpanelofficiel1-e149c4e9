import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORAGE_BUCKETS = ['avatars', 'fivem-mods', 'mod-screenshots', 'public-assets'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: roles } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const userRoles = new Set((roles ?? []).map(r => r.role));
    if (!userRoles.has('admin') && !userRoles.has('owner')) {
      return json({ error: 'Admin access required' }, 403);
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    const format: string = body.format ?? 'json';

    // ── 0. Dynamically discover ALL public tables ──
    const { data: tableList } = await serviceClient.rpc('get_public_tables');
    const allTables: string[] = (tableList ?? [])
      .map((r: any) => r.table_name || r)
      .filter(Boolean)
      .sort();

    if (allTables.length === 0) {
      return json({ error: 'No tables found' }, 500);
    }

    // ── 1. Export all table data ──
    const tableData: Record<string, any> = {};
    for (const table of allTables) {
      // Fetch ALL rows – paginate in blocks of 10 000 to bypass default limits
      let allRows: any[] = [];
      let offset = 0;
      const PAGE = 10000;
      while (true) {
        const { data: page, error: pageErr } = await serviceClient
          .from(table)
          .select('*')
          .range(offset, offset + PAGE - 1);
        if (pageErr) {
          allRows = [];
          tableData[table] = { error: pageErr.message };
          break;
        }
        if (!page || page.length === 0) break;
        allRows.push(...page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }
      const data = allRows;
      if (!tableData[table]?.error) {
        tableData[table] = data ?? [];
      }
    }

    // ── 2. Export auth users ──
    let authUsers: any[] = [];
    try {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const { data: { users }, error } = await serviceClient.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error || !users || users.length === 0) {
          hasMore = false;
        } else {
          authUsers.push(...users.map(u => ({
            id: u.id,
            email: u.email,
            phone: u.phone,
            created_at: u.created_at,
            updated_at: u.updated_at,
            last_sign_in_at: u.last_sign_in_at,
            email_confirmed_at: u.email_confirmed_at,
            user_metadata: u.user_metadata,
            app_metadata: u.app_metadata,
            identities: u.identities,
          })));
          if (users.length < 1000) hasMore = false;
          page++;
        }
      }
    } catch (e) {
      console.error('Failed to export auth users:', e);
    }

    // ── 3. Export storage file listings with public URLs ──
    const storageData: Record<string, any[]> = {};
    for (const bucket of STORAGE_BUCKETS) {
      try {
        const { data: files, error } = await serviceClient.storage.from(bucket).list('', {
          limit: 10000,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error || !files) {
          storageData[bucket] = [];
          continue;
        }

        const filesWithUrls = files
          .filter(f => f.name && !f.name.endsWith('/'))
          .map(f => {
            const { data: urlData } = serviceClient.storage.from(bucket).getPublicUrl(f.name);
            return {
              name: f.name,
              size: f.metadata?.size ?? null,
              mimetype: f.metadata?.mimetype ?? null,
              created_at: f.created_at,
              updated_at: f.updated_at,
              public_url: urlData?.publicUrl ?? null,
            };
          });

        const folders = files.filter(f => f.id === null);
        for (const folder of folders) {
          try {
            const { data: subFiles } = await serviceClient.storage.from(bucket).list(folder.name, {
              limit: 10000,
            });
            if (subFiles) {
              for (const sf of subFiles) {
                if (!sf.name || sf.id === null) continue;
                const path = `${folder.name}/${sf.name}`;
                const { data: urlData } = serviceClient.storage.from(bucket).getPublicUrl(path);
                filesWithUrls.push({
                  name: path,
                  size: sf.metadata?.size ?? null,
                  mimetype: sf.metadata?.mimetype ?? null,
                  created_at: sf.created_at,
                  updated_at: sf.updated_at,
                  public_url: urlData?.publicUrl ?? null,
                });
              }
            }
          } catch { /* skip folder errors */ }
        }

        storageData[bucket] = filesWithUrls;
      } catch {
        storageData[bucket] = [];
      }
    }

    // ── Build final export ──
    if (format === 'csv') {
      const csvResult: Record<string, string> = {};
      for (const [table, rows] of Object.entries(tableData)) {
        if (Array.isArray(rows) && rows.length > 0) {
          const headers = Object.keys(rows[0]);
          const csvLines = [
            headers.join(','),
            ...rows.map((row: any) =>
              headers.map(h => {
                const val = row[h];
                const str = val === null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
                return `"${str.replace(/"/g, '""')}"`;
              }).join(',')
            ),
          ];
          csvResult[table] = csvLines.join('\n');
        }
      }
      if (authUsers.length > 0) {
        const headers = Object.keys(authUsers[0]);
        const csvLines = [
          headers.join(','),
          ...authUsers.map(u =>
            headers.map(h => {
              const val = u[h];
              const str = val === null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
              return `"${str.replace(/"/g, '""')}"`;
            }).join(',')
          ),
        ];
        csvResult['_auth_users'] = csvLines.join('\n');
      }
      for (const [bucket, files] of Object.entries(storageData)) {
        if (files.length > 0) {
          const headers = Object.keys(files[0]);
          const csvLines = [
            headers.join(','),
            ...files.map(f =>
              headers.map(h => {
                const val = f[h];
                const str = val === null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
                return `"${str.replace(/"/g, '""')}"`;
              }).join(',')
            ),
          ];
          csvResult[`_storage_${bucket}`] = csvLines.join('\n');
        }
      }
      return json(csvResult);
    }

    // JSON format - comprehensive backup
    return json({
      _export_metadata: {
        exported_at: new Date().toISOString(),
        version: '3.0',
        total_tables: allTables.length,
        tables_exported: allTables,
        includes: ['all_tables', 'auth_users', 'storage_listings'],
      },
      _auth_users: authUsers,
      _storage: storageData,
      ...tableData,
    });
  } catch (err) {
    console.error('export-database error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
