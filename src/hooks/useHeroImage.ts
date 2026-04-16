import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const SETTINGS_KEY = 'hero_showcase_image';

let cachedUrl: string | null = null;
let fetchPromise: Promise<string | null> | null = null;

export function useHeroImage(fallback: string): string {
  const [url, setUrl] = useState(cachedUrl || fallback);

  useEffect(() => {
    if (cachedUrl) {
      setUrl(cachedUrl);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = supabase
        .from('admin_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle()
        .then(({ data }) => {
          const val = data?.value?.replace(/^"|"$/g, '') || null;
          cachedUrl = val;
          return val;
        });
    }

    fetchPromise.then((val) => {
      if (val) setUrl(val);
    });
  }, [fallback]);

  return url;
}
