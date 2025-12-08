'use client';

import { Copy } from 'lucide-react';
import {
  predictionMarket,
  umaResolver,
  lzPMResolver,
  lzUmaResolver,
} from '@sapience/sdk/contracts/addresses';

interface TechSpecTableProps {
  conditionId: string;
  chainId: number;
}

export function TechSpecTable({ conditionId, chainId }: TechSpecTableProps) {
  const marketAddress = predictionMarket[chainId]?.address;
  const resolverAddress =
    lzPMResolver[chainId]?.address ??
    lzUmaResolver[chainId]?.address ??
    umaResolver[chainId]?.address;

  const formatAddress = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <table className="w-full text-xs">
      <tbody className="divide-y divide-border/60">
        <tr>
          <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">
            Market
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all">
            {marketAddress ? (
              <span className="inline-flex items-center gap-1.5">
                {formatAddress(marketAddress)}
                <button
                  type="button"
                  onClick={() => copyToClipboard(marketAddress)}
                  className="text-muted-foreground hover:text-brand-white transition-colors"
                  title="Copy full market address"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </span>
            ) : (
              '—'
            )}
          </td>
        </tr>
        <tr>
          <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">
            Resolver
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all">
            {resolverAddress ? (
              <span className="inline-flex items-center gap-1.5">
                {formatAddress(resolverAddress)}
                <button
                  type="button"
                  onClick={() => copyToClipboard(resolverAddress)}
                  className="text-muted-foreground hover:text-brand-white transition-colors"
                  title="Copy full resolver address"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </span>
            ) : (
              '—'
            )}
          </td>
        </tr>
        <tr>
          <td className="px-4 py-3 text-xs text-muted-foreground font-mono uppercase tracking-wider whitespace-nowrap">
            Condition
          </td>
          <td className="px-4 py-3 text-brand-white font-mono text-sm break-all">
            <span className="inline-flex items-center gap-1.5">
              {formatAddress(conditionId)}
              <button
                type="button"
                onClick={() => copyToClipboard(conditionId)}
                className="text-muted-foreground hover:text-brand-white transition-colors"
                title="Copy full condition"
              >
                <Copy className="h-3 w-3" />
              </button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
