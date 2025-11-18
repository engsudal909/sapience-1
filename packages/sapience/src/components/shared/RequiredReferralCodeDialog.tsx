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

interface RequiredReferralCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string | null;
  onCodeSet?: (code: string) => void;
  onLogout: () => void;
}

const RequiredReferralCodeDialog = ({
  open,
  onOpenChange,
  walletAddress,
  onCodeSet,
  onLogout,
}: RequiredReferralCodeDialogProps) => {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleDialogOpenChange = (nextOpen: boolean) => {
    // When a referral code is required, the dialog should not be dismissible
    // by the user; they must either submit a code or log out.
    if (!nextOpen) return;
    onOpenChange(nextOpen);
  };

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

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        hideCloseButton
        // Trap focus and prevent outside dismiss while a code is required.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Enter a Referral Code</DialogTitle>
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
          </div>
        </form>

        <div>
          <p className="text-base text-foreground">
            If you don&apos;t have a referral code, you can request one in{' '}
            <a
              href="https://discord.gg/sapience"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Discord
            </a>
            . You can{` `}
            <button
              type="button"
              className="underline underline-offset-2"
              disabled={submitting}
              onClick={onLogout}
            >
              log out
            </button>{' '}
            until you receive one.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequiredReferralCodeDialog;


