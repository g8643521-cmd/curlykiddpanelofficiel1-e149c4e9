import { supabase } from '@/lib/supabase';

/**
 * Bot action types — all `/bot` operations that should be visible in admin Cloud audit.
 * These are written to `audit_log` (admin-visible via RLS) with table_name='bot_action',
 * action='<type>', and structured details under new_data.
 */
export type BotActionType =
  // Server lifecycle
  | 'server.create'
  | 'server.create_failed'
  | 'server.delete'
  | 'server.toggle_active'
  | 'server.update'
  // Access keys
  | 'key.generate'
  | 'key.revoke'
  | 'key.validate_failed'
  | 'key.consumed'
  // Members / sharing
  | 'member.invite'
  | 'member.role_change'
  | 'member.remove'
  // Webhooks / scans triggered from /bot
  | 'webhook.test'
  | 'webhook.verify'
  // Advanced settings
  | 'advanced_settings.update';

export interface BotAuditPayload {
  action: BotActionType;
  status?: 'success' | 'failure' | 'info';
  server_id?: string | null;
  guild_id?: string | null;
  guild_name?: string | null;
  target_user_id?: string | null;
  details?: Record<string, unknown>;
  error?: string | null;
}

/**
 * Fire-and-forget audit logger for /bot actions.
 * Writes to public.audit_log so it appears in the admin Cloud audit panel.
 */
export async function logBotAction(payload: BotAuditPayload): Promise<void> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id ?? null;
    if (!userId) return; // RLS requires authenticated user

    const newData = {
      status: payload.status ?? 'success',
      server_id: payload.server_id ?? null,
      guild_id: payload.guild_id ?? null,
      guild_name: payload.guild_name ?? null,
      target_user_id: payload.target_user_id ?? null,
      error: payload.error ?? null,
      ...(payload.details ?? {}),
    };

    await supabase.from('audit_log').insert({
      user_id: userId,
      action: payload.action,
      table_name: 'bot_action',
      record_id: payload.server_id ?? null,
      new_data: newData,
    });
  } catch (e) {
    // Never break a user flow because audit logging failed.
    // eslint-disable-next-line no-console
    console.warn('[botAudit] failed to log', payload.action, e);
  }
}
