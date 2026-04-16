import { FormEvent, useState } from 'react';
import { Mail, UserPlus, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface AddRoleByEmailProps {
  onRoleAssigned?: () => void;
}

const AddRoleByEmail = ({ onRoleAssigned }: AddRoleByEmailProps) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'moderator' | 'user' | 'mod_creator'>('admin');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      toast.error('Enter an email address');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      toast.error('Enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('assign-role', {
        body: { email: trimmedEmail, role },
      });

      if (error) {
        toast.error(error.message || 'Could not assign role');
      } else if (data?.error) {
        toast.error(typeof data.error === 'string' ? data.error : 'Could not assign role');
      } else {
        toast.success(data?.message || `${role} assigned to ${trimmedEmail}`);
        setEmail('');
        onRoleAssigned?.();
      }
    } catch {
      toast.error('Something went wrong');
    }
    setIsLoading(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="self-start rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/20 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Shield className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Assign Role</h3>
          <p className="text-xs text-muted-foreground">Grant access to an existing account</p>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4 p-6">
        <div className="space-y-1.5">
          <label htmlFor="assign-role-email" className="text-xs font-medium text-muted-foreground">
            Email Address
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              id="assign-role-email"
              placeholder="user@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg border-border/30 bg-background/50 pl-10 text-sm"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'moderator' | 'user' | 'mod_creator')}>
              <SelectTrigger className="h-10 rounded-lg border-border/30 bg-background/50 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="moderator">Moderator</SelectItem>
                <SelectItem value="mod_creator">Mod Creator</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={isLoading} className="h-10 rounded-lg px-5 font-medium sm:min-w-[130px]">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1.5" />}
            {isLoading ? 'Assigning...' : 'Assign'}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/60">
          Roles update access immediately for existing accounts.
        </p>
      </div>
    </form>
  );
};

export default AddRoleByEmail;
