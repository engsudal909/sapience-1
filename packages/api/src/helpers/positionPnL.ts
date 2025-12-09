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
    makerWon: { not: null };
    chainId?: number;
    marketAddress?: string;
  } = {
    status: { in: [PositionStatus.settled, PositionStatus.consolidated] },
    makerWon: { not: null },
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
    const mintKey = `${position.makerNftTokenId}-${position.takerNftTokenId}`;
    const mintData = mintEventMap.get(mintKey);
    if (!mintData) continue;

    const maker = position.maker.toLowerCase();
    const taker = position.taker.toLowerCase();
    const makerCollateral = BigInt(mintData.makerCollateral || '0');
    const takerCollateral = BigInt(mintData.takerCollateral || '0');
    const totalCollateral = BigInt(mintData.totalCollateral || '0');

    if (owners?.length) {
      const ownerSet = new Set(owners.map((o) => o.toLowerCase()));
      if (!ownerSet.has(maker) && !ownerSet.has(taker)) continue;
    }

    if (!ownerStats.has(maker)) {
      ownerStats.set(maker, { totalPnL: 0n, positionCount: 0 });
    }
    if (!ownerStats.has(taker)) {
      ownerStats.set(taker, { totalPnL: 0n, positionCount: 0 });
    }

    const makerStats = ownerStats.get(maker)!;
    const takerStats = ownerStats.get(taker)!;

    if (position.makerWon) {
      makerStats.totalPnL += totalCollateral - makerCollateral;
      makerStats.positionCount++;
      takerStats.totalPnL -= takerCollateral;
      takerStats.positionCount++;
    } else {
      takerStats.totalPnL += totalCollateral - takerCollateral;
      takerStats.positionCount++;
      makerStats.totalPnL -= makerCollateral;
      makerStats.positionCount++;
    }
  }

  return Array.from(ownerStats.entries()).map(([owner, stats]) => ({
    owner,
    totalPnL: stats.totalPnL.toString(),
    positionCount: stats.positionCount,
  }));
}
