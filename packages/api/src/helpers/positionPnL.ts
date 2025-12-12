import prisma from '../db';
import { PositionStatus } from '../../generated/prisma';

export interface PositionPnLEntry {
  owner: string;
  totalPnL: string; // in wei
  positionCount: number;
}

export async function calculatePositionPnL(
  chainId?: number,
  marketAddress?: string,
  owners?: string[]
): Promise<PositionPnLEntry[]> {
  const whereClause: {
    status: { in: PositionStatus[] };
    predictorWon: { not: null };
    chainId?: number;
    marketAddress?: string;
  } = {
    status: { in: [PositionStatus.settled, PositionStatus.consolidated] },
    predictorWon: { not: null },
  };

  if (chainId) whereClause.chainId = chainId;
  if (marketAddress) whereClause.marketAddress = marketAddress.toLowerCase();

  const positions = await prisma.position.findMany({ where: whereClause });

  const mintTimestamps = Array.from(
    new Set(positions.map((p) => BigInt(p.mintedAt)))
  );
  const mintEvents = await prisma.event.findMany({
    where: {
      timestamp: { in: mintTimestamps },
    },
  });

  const mintEventMap = new Map();
  for (const event of mintEvents) {
    try {
      const data = event.logData as {
        eventType?: string;
        makerNftTokenId?: string;
        takerNftTokenId?: string;
        makerCollateral?: string;
        takerCollateral?: string;
        totalCollateral?: string;
      };
      if (data.eventType === 'PredictionMinted') {
        const key = `${data.makerNftTokenId}-${data.takerNftTokenId}`;
        mintEventMap.set(key, data);
      }
    } catch {
      continue;
    }
  }

  const ownerStats = new Map<
    string,
    { totalPnL: bigint; positionCount: number }
  >();

  for (const position of positions) {
    const mintKey = `${position.predictorNftTokenId}-${position.counterpartyNftTokenId}`;
    const mintData = mintEventMap.get(mintKey);
    if (!mintData) continue;

    const predictor = position.predictor.toLowerCase();
    const counterparty = position.counterparty.toLowerCase();
    const predictorCollateral = BigInt(mintData.makerCollateral || '0');
    const counterpartyCollateral = BigInt(mintData.takerCollateral || '0');
    const totalCollateral = BigInt(mintData.totalCollateral || '0');

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(predictor) && !ownerSet.has(counterparty)) continue;
    }

    if (!ownerStats.has(predictor)) {
      ownerStats.set(predictor, { totalPnL: 0n, positionCount: 0 });
    }
    if (!ownerStats.has(counterparty)) {
      ownerStats.set(counterparty, { totalPnL: 0n, positionCount: 0 });
    }

    const predictorStats = ownerStats.get(predictor)!;
    const counterpartyStats = ownerStats.get(counterparty)!;

    if (position.predictorWon) {
      predictorStats.totalPnL += totalCollateral - predictorCollateral;
      predictorStats.positionCount++;
      counterpartyStats.totalPnL -= counterpartyCollateral;
      counterpartyStats.positionCount++;
    } else {
      counterpartyStats.totalPnL += totalCollateral - counterpartyCollateral;
      counterpartyStats.positionCount++;
      predictorStats.totalPnL -= predictorCollateral;
      predictorStats.positionCount++;
    }
  }

  return Array.from(ownerStats.entries()).map(([owner, stats]) => ({
    owner,
    totalPnL: stats.totalPnL.toString(),
    positionCount: stats.positionCount,
  }));
}
