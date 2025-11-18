'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sapience/sdk/ui/components/ui/dialog';
import { Button } from '@sapience/sdk/ui/components/ui/button';
import { Input } from '@sapience/sdk/ui/components/ui/input';
import { AddressDisplay } from '~/components/shared/AddressDisplay';
import EnsAvatar from '~/components/shared/EnsAvatar';

interface ReferralsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress?: string | null;
  onCodeSet?: (code: string) => void;
}

type ReferralRow = {
  address: string;
  volume: number;
};

// TODO: Replace with real referred-account data from the backend.
const referredAccounts: ReferralRow[] = [];

const ReferralsDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
}: ReferralsDialogProps) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || submitting) return;

    try {
      setSubmitting(true);
      // TODO: wire to real API once available
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Best-effort local persistence by wallet address so we can
      // avoid re-prompting users who have already provided a code.
      try {
        if (walletAddress && typeof window !== 'undefined') {
          const key = `sapience:referralCode:${walletAddress.toLowerCase()}`;
          window.localStorage.setItem(key, code.trim());
        }
      } catch {
        // If this fails (e.g. privacy mode), the dialog may reappear on next connect.
      }

      onCodeSet?.(code.trim());
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveTitle = 'Referrals';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{effectiveTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex gap-3">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={submitting}
                className="flex-1"
              />
              <Button
                type="submit"
                className="shrink-0"
                disabled={submitting || !code.trim()}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Only an encrypted version of your code is stored, so you&apos;ll
              need to reset it if you forget it.
            </p>
          </div>
        </form>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Referrals</h3>
          <div className="rounded-md border border-border bg-muted/40">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/70 text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Trading Volume
                  </th>
                </tr>
              </thead>
              <tbody>
                {referredAccounts.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-3 text-muted-foreground"
                      colSpan={2}
                    >
                      You haven&apos;t referred any accounts yet.
                    </td>
                  </tr>
                ) : (
                  referredAccounts.map((row) => (
                    <tr
                      key={row.address}
                      className="border-t border-border/40 last:border-b-0"
                    >
                      <td className="px-3 py-2 align-middle">
                        <div className="flex items-center gap-2">
                          <EnsAvatar
                            address={row.address}
                            className="w-5 h-5 rounded-full ring-1 ring-border/50"
                            width={20}
                            height={20}
                          />
                          <AddressDisplay address={row.address} compact />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums align-middle">
                        {row.volume.toLocaleString()} USDe
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReferralsDialog;

