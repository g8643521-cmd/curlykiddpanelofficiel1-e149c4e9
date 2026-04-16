import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Upload, Trash2, Image, Loader2 } from 'lucide-react';

const SETTINGS_KEY = 'hero_showcase_image';
const BUCKET = 'hero-images';

export default function HeroImagePanel() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  const fetchImage = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    if (data?.value) setImageUrl(data.value.replace(/^"|"$/g, ''));
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchImage(); }, [fetchImage]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5MB or smaller');
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `hero-showcase.${ext}`;

      await supabase.storage.from(BUCKET).remove([path]);

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, cacheControl: '3600' });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();

      await supabase.from('admin_settings').upsert(
        { key: SETTINGS_KEY, value: publicUrl, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

      setImageUrl(publicUrl);
      toast.success('Hero image updated!');
    } catch (err: any) {
      toast.error('Upload failed: ' + (err.message || 'Unknown error'));
    }
    setIsUploading(false);
    e.target.value = '';
  };

  const handleRemove = async () => {
    setIsUploading(true);
    try {
      await supabase.from('admin_settings').delete().eq('key', SETTINGS_KEY);
      await supabase.storage.from(BUCKET).remove(['hero-showcase.png', 'hero-showcase.jpg', 'hero-showcase.webp', 'hero-showcase.jpeg']);
      setImageUrl(null);
      toast.success('Hero image removed — default image will be used');
    } catch {
      toast.error('Could not remove the image');
    }
    setIsUploading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Image className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Hero Showcase Image</h3>
          <p className="text-xs text-muted-foreground">The image displayed in the browser mockup on the landing page and dashboard</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 rounded-lg bg-muted/20 animate-pulse" />
      ) : (
        <>
          {imageUrl && (
            <div className="relative rounded-lg overflow-hidden border border-border/20 bg-card/30">
              <img src={imageUrl} alt="Hero showcase" className="w-full max-h-64 object-contain" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Label htmlFor="hero-upload" className="cursor-pointer">
              <Button asChild variant={imageUrl ? 'outline' : 'default'} size="sm" disabled={isUploading}>
                <span className="flex items-center gap-2">
                  {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {imageUrl ? 'Change image' : 'Upload image'}
                </span>
              </Button>
            </Label>
            <Input
              id="hero-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUpload}
              disabled={isUploading}
            />
            {imageUrl && (
              <Button variant="ghost" size="sm" onClick={handleRemove} disabled={isUploading} className="text-destructive hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
              </Button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground/50">
            Recommended: PNG or JPG, at least 800px wide. Max 5MB.
          </p>
        </>
      )}
    </div>
  );
}
