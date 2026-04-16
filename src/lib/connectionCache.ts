// Shared connection status cache — avoids redundant RPC calls across pages
import { supabase } from '@/lib/supabase';

interface CachedResult {
  connected: boolean;
  latency: number | null;
  timestamp: number;
}

const cache: Record<string, CachedResult> = {};
const CACHE_TTL = 60_000; // 60 seconds

export async function pingRpc(
  rpcName: string,
  args?: Record<string, unknown>
): Promise<{ connected: boolean; latency: number }> {
  const now = Date.now();
  const cached = cache[rpcName];

  if (cached && cached.connected && now - cached.timestamp < CACHE_TTL) {
    return { connected: true, latency: cached.latency! };
  }

  const start = Date.now();
  const { error } = args
    ? await supabase.rpc(rpcName, args)
    : await supabase.rpc(rpcName);
  const latency = Date.now() - start;

  const result = { connected: !error, latency: error ? 0 : latency };
  cache[rpcName] = { ...result, latency: result.latency, timestamp: Date.now() };

  return result;
}

export function invalidateCache(rpcName?: string) {
  if (rpcName) {
    delete cache[rpcName];
  } else {
    Object.keys(cache).forEach(k => delete cache[k]);
  }
}
