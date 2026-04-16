import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Database, Zap, Globe, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Status = 'checking' | 'operational' | 'degraded' | 'down';

interface Check {
  key: string;
  label: string;
  description: string;
  icon: typeof Database;
  status: Status;
  latency: number | null;
  error?: string;
}

const initialChecks: Check[] = [
  { key: 'db', label: 'Database', description: 'Postgres read latency', icon: Database, status: 'checking', latency: null },
  { key: 'edge', label: 'Edge Functions', description: 'cfx-lookup ping', icon: Zap, status: 'checking', latency: null },
  { key: 'auth', label: 'Authentication', description: 'Session service', icon: Globe, status: 'checking', latency: null },
];

const statusMeta: Record<Status, { label: string; dot: string; text: string; bg: string }> = {
  checking:    { label: 'Checking',    dot: 'bg-muted-foreground/40 animate-pulse', text: 'text-muted-foreground/70', bg: 'bg-muted/30' },
  operational: { label: 'Operational', dot: 'bg-[hsl(var(--green))]',                text: 'text-[hsl(var(--green))]',  bg: 'bg-[hsl(var(--green))]/10' },
  degraded:    { label: 'Degraded',    dot: 'bg-[hsl(var(--yellow))]',               text: 'text-[hsl(var(--yellow))]', bg: 'bg-[hsl(var(--yellow))]/10' },
  down:        { label: 'Down',        dot: 'bg-destructive',                        text: 'text-destructive',          bg: 'bg-destructive/10' },
};

const latencyToStatus = (ms: number, ok: boolean, thresholds = { good: 400, warn: 1200 }): Status => {
  if (!ok) return 'down';
  if (ms <= thresholds.good) return 'operational';
  if (ms <= thresholds.warn) return 'degraded';
  return 'degraded';
};

export default function SystemStatusPanel() {
  const [checks, setChecks] = useState<Check[]>(initialChecks);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const runChecks = useCallback(async () => {
    setIsChecking(true);
    setChecks(initialChecks.map(c => ({ ...c, status: 'checking', latency: null, error: undefined })));

    // Run all checks in parallel
    const [dbResult, edgeResult, authResult] = await Promise.all([
      // Database: lightweight count query
      (async () => {
        const start = performance.now();
        try {
          const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
          const latency = Math.round(performance.now() - start);
          return { ok: !error, latency, error: error?.message };
        } catch (e: any) {
          return { ok: false, latency: Math.round(performance.now() - start), error: e?.message ?? 'Network error' };
        }
      })(),
      // Edge function: a reachable function (even with a 4xx validation error) means runtime is healthy
      (async () => {
        const start = performance.now();
        try {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cfx-lookup`;
          const res = await fetch(url, {
            method: 'OPTIONS',
            headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' },
          });
          const latency = Math.round(performance.now() - start);
          // Any HTTP response (including 204/4xx) means the edge runtime is reachable
          return { ok: res.status < 500, latency, error: res.status >= 500 ? `HTTP ${res.status}` : undefined };
        } catch (e: any) {
          return { ok: false, latency: Math.round(performance.now() - start), error: e?.message ?? 'Unreachable' };
        }
      })(),
      // Auth: get current session
      (async () => {
        const start = performance.now();
        try {
          const { error } = await supabase.auth.getSession();
          const latency = Math.round(performance.now() - start);
          return { ok: !error, latency, error: error?.message };
        } catch (e: any) {
          return { ok: false, latency: Math.round(performance.now() - start), error: e?.message ?? 'Unreachable' };
        }
      })(),
    ]);

    setChecks([
      { ...initialChecks[0], status: latencyToStatus(dbResult.latency, dbResult.ok), latency: dbResult.latency, error: dbResult.error },
      { ...initialChecks[1], status: latencyToStatus(edgeResult.latency, edgeResult.ok, { good: 800, warn: 2500 }), latency: edgeResult.latency, error: edgeResult.error },
      { ...initialChecks[2], status: latencyToStatus(authResult.latency, authResult.ok), latency: authResult.latency, error: authResult.error },
    ]);
    setLastChecked(new Date());
    setIsChecking(false);
  }, []);

  useEffect(() => {
    runChecks();
    const id = setInterval(runChecks, 60_000); // refresh every 60s
    return () => clearInterval(id);
  }, [runChecks]);

  const overall: Status = checks.some(c => c.status === 'down')
    ? 'down'
    : checks.some(c => c.status === 'checking')
    ? 'checking'
    : checks.some(c => c.status === 'degraded')
    ? 'degraded'
    : 'operational';

  const overallMeta = statusMeta[overall];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.32 }}
      className="rounded-xl border border-border/15 bg-card/40 overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-border/10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground tracking-tight">System Status</h3>
            <p className="text-[11px] text-muted-foreground/60 mt-0.5">
              {lastChecked ? `Last checked ${lastChecked.toLocaleTimeString()}` : 'Running checks…'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${overallMeta.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${overallMeta.dot}`} />
            <span className={`text-[11px] font-medium ${overallMeta.text}`}>{overallMeta.label}</span>
          </div>
          <button
            onClick={runChecks}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      <div className="p-2">
        {checks.map((check) => {
          const meta = statusMeta[check.status];
          const Icon = check.icon;
          return (
            <div
              key={check.key}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/15 transition-colors"
            >
              <div className="w-7 h-7 rounded-md bg-secondary/30 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground/70" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/90 truncate">{check.label}</p>
                <p className="text-[11px] text-muted-foreground/55 truncate">
                  {check.error ? check.error : check.description}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {check.latency !== null && (
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">
                    {check.latency}ms
                  </span>
                )}
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ${meta.bg}`}>
                  {check.status === 'checking' ? (
                    <Loader2 className={`w-3 h-3 ${meta.text} animate-spin`} />
                  ) : check.status === 'down' ? (
                    <XCircle className={`w-3 h-3 ${meta.text}`} />
                  ) : (
                    <CheckCircle2 className={`w-3 h-3 ${meta.text}`} />
                  )}
                  <span className={`text-[10.5px] font-medium ${meta.text}`}>{meta.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
