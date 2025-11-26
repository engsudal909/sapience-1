import type React from 'react';
import { Pencil } from 'lucide-react';

export type AutoBidHeaderProps = {
  allowanceDisplay: string;
  balanceDisplay: string;
  collateralSymbol: string;
  onOpenApproval: () => void;
};

const AutoBidHeader: React.FC<AutoBidHeaderProps> = ({
  allowanceDisplay,
  balanceDisplay,
  collateralSymbol,
  onOpenApproval,
}) => {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {/* Left: Approved Spend */}
        <div className="px-1">
          <div className="text-xs font-medium text-muted-foreground">
            Approved Spend
          </div>
          <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
            {allowanceDisplay} {collateralSymbol}
            <button
              type="button"
              className="inline-flex items-center justify-center"
              aria-label="Edit approved spend"
              onClick={onOpenApproval}
            >
              <Pencil className="h-3 w-3 text-accent-gold" />
            </button>
          </div>
        </div>

        {/* Right: Account Balance */}
        <div className="px-1">
          <div className="text-xs font-medium text-muted-foreground">
            Account Balance
          </div>
          <div className="font-mono text-[13px] text-brand-white inline-flex items-center gap-1">
            {balanceDisplay} {collateralSymbol}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoBidHeader;
