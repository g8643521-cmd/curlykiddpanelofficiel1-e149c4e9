import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setStatus(session ? 'authenticated' : 'unauthenticated');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Only redirect on explicit sign-out, not on token refresh failures
      if (event === 'SIGNED_OUT') {
        setStatus('unauthenticated');
      } else if (session) {
        setStatus('authenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" style={{ willChange: 'transform' }} />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
