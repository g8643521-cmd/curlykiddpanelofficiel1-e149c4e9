import { FormEvent, useState } from 'react';
import { Mail, Crown, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface TransferOwnershipProps {
  onTransferred?: () => void;
}

const TransferOwnership = ({ onTransferred }: TransferOwnershipProps) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^\S+@\S+\.\S+$/.test(trimmed)) {
      toast.error('Enter a valid email address');
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('transfer-ownership', {
        body: { email: email.trim().toLowerCase() },
      });

      if (error) {
        toast.error(error.message || 'Transfer failed');
      } else if (data?.error) {
        toast.error(typeof data.error === 'string' ? data.error : 'Transfer failed');
      } else {
        toast.success(data?.message || 'Ownership transferred');
        setEmail('');
        onTransferred?.();
      }
    } catch {
      toast.error('Something went wrong');
    }
    setIsLoading(false);
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="self-start rounded-xl border border-destructive/30 bg-card/50 backdrop-blur-sm overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-destructive/20 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
            <Crown className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Transfer Ownership</h3>
            <p className="text-xs text-muted-foreground">Transfer owner role to another user</p>
          </div>
        </div>

        <div className="space-y-4 p-6">
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 p-3">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <p className="text-xs text-destructive/80">
              This will remove owner from the current owner and assign it to the specified user. The previous owner will be downgraded to admin.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="transfer-email" className="text-xs font-medium text-muted-foreground">
              New Owner Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                id="transfer-email"
                placeholder="newowner@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 rounded-lg border-border/30 bg-background/50 pl-10 text-sm"
              />
            </div>
          </div>

          <Button
            type="submit"
            variant="destructive"
            disabled={isLoading}
            className="h-10 rounded-lg px-5 font-medium w-full"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Crown className="h-4 w-4 mr-1.5" />}
            {isLoading ? 'Transferring...' : 'Transfer Ownership'}
          </Button>
        </div>
      </form>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Ownership Transfer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to transfer ownership to <strong>{email.trim().toLowerCase()}</strong>? The current owner will be downgraded to admin. This action cannot be easily undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TransferOwnership;
