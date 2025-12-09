import { Resolver, Query, Arg, Int, ObjectType, Field } from 'type-graphql';
import prisma from '../../db';
import { Prisma, Position } from '../../../generated/prisma';

@ObjectType()
class ConditionSummary {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  question?: string | null;

  @Field(() => String, { nullable: true })
  shortName?: string | null;

  @Field(() => Int, { nullable: true })
  endTime?: number | null;
}

@ObjectType()
class PredictedOutcomeType {
  @Field(() => String)
  conditionId!: string;

  @Field(() => Boolean)
  prediction!: boolean;

  @Field(() => ConditionSummary, { nullable: true })
  condition?: ConditionSummary | null;
}

@ObjectType()
class PositionType {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  chainId!: number;

  @Field(() => String)
  marketAddress!: string;

  @Field(() => String)
  maker!: string;

  @Field(() => String)
  taker!: string;

  @Field(() => String)
  makerNftTokenId!: string;

  @Field(() => String)
  takerNftTokenId!: string;

  @Field(() => String)
  totalCollateral!: string;

  @Field(() => String, { nullable: true })
  makerCollateral?: string | null;

  @Field(() => String, { nullable: true })
  takerCollateral?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => String)
  status!: 'active' | 'settled' | 'consolidated';

  @Field(() => Boolean, { nullable: true })
  makerWon?: boolean | null;

  @Field(() => Int)
  mintedAt!: number;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => Int, { nullable: true })
  endsAt?: number | null;

  @Field(() => [PredictedOutcomeType])
  predictedOutcomes!: PredictedOutcomeType[];
}

@Resolver()
export class PositionResolver {
  @Query(() => Int)
  async positionsCount(
    @Arg('address', () => String) address: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<number> {
    const addr = address.toLowerCase();
    const where: Prisma.PositionWhereInput = {
      OR: [{ maker: addr }, { taker: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }
    return prisma.position.count({ where });
  }

  @Query(() => [PositionType])
  async positions(
    @Arg('address', () => String) address: string,
    @Arg('take', () => Int, { defaultValue: 50 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('orderBy', () => String, { nullable: true }) orderBy?: string,
    @Arg('orderDirection', () => String, { nullable: true })
    orderDirection?: string,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<PositionType[]> {
    const addr = address.toLowerCase();

    const processRows = async (rows: Position[]): Promise<PositionType[]> => {
      const conditionSet = new Set<string>();
      for (const r of rows) {
        let predictedOutcomesParsed = r.predictedOutcomes;
        if (typeof predictedOutcomesParsed === 'string') {
          try {
            predictedOutcomesParsed = JSON.parse(predictedOutcomesParsed);
          } catch {
            predictedOutcomesParsed = [];
          }
        }
        const outcomes =
          (predictedOutcomesParsed as unknown as { conditionId: string }[]) ||
          [];
        for (const o of outcomes) conditionSet.add(o.conditionId);
      }
      const conditionIds = Array.from(conditionSet);
      const conditions = conditionIds.length
        ? await prisma.condition.findMany({
            where: { id: { in: conditionIds } },
            select: {
              id: true,
              question: true,
              shortName: true,
              endTime: true,
            },
          })
        : [];
      const condMap = new Map(conditions.map((c) => [c.id, c]));

      return rows.map((r) => {
        let predictedOutcomesParsed = r.predictedOutcomes;
        if (typeof predictedOutcomesParsed === 'string') {
          try {
            predictedOutcomesParsed = JSON.parse(predictedOutcomesParsed);
          } catch {
            predictedOutcomesParsed = [];
          }
        }
        const outcomesRaw =
          (predictedOutcomesParsed as unknown as {
            conditionId: string;
            prediction: boolean;
          }[]) || [];
        const outcomes: PredictedOutcomeType[] = outcomesRaw.map((o) => ({
          conditionId: o.conditionId,
          prediction: o.prediction,
          condition: condMap.get(o.conditionId) || null,
        }));
        return {
          id: r.id,
          chainId: r.chainId,
          marketAddress: r.marketAddress,
          maker: r.maker,
          taker: r.taker,
          makerNftTokenId: r.makerNftTokenId,
          takerNftTokenId: r.takerNftTokenId,
          totalCollateral: r.totalCollateral,
          makerCollateral: r.makerCollateral ?? null,
          takerCollateral: r.takerCollateral ?? null,
          refCode: r.refCode,
          status: r.status as unknown as PositionType['status'],
          makerWon: r.makerWon,
          mintedAt: r.mintedAt,
          settledAt: r.settledAt ?? null,
          endsAt: r.endsAt ?? null,
          predictedOutcomes: outcomes,
        };
      });
    };

    if (orderBy === 'wager' || orderBy === 'toWin' || orderBy === 'pnl') {
      const direction = orderDirection === 'asc' ? 'ASC' : 'DESC';

      if (orderBy === 'wager') {
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}) AND "chainId" = ${chainId}
            ORDER BY CASE 
              WHEN LOWER(maker) = ${addr} THEN CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
              WHEN LOWER(taker) = ${addr} THEN CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}
            ORDER BY CASE 
              WHEN LOWER(maker) = ${addr} THEN CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
              WHEN LOWER(taker) = ${addr} THEN CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        }
      }

      if (orderBy === 'pnl') {
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}) AND "chainId" = ${chainId}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(maker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(taker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                END
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(maker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("makerCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(taker) = ${addr} THEN
                CASE 
                  WHEN "makerWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("takerCollateral", '0') AS DECIMAL)
                END
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        }
      }

      // For toWin, sort by totalCollateral but treat lost positions as 0
      if (chainId !== undefined && chainId !== null) {
        const rows = await prisma.$queryRaw<Position[]>`
          SELECT * FROM position
          WHERE (LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}) AND "chainId" = ${chainId}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(maker) = ${addr} AND "makerWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(taker) = ${addr} AND "makerWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
                ELSE 0
              END
            ELSE 0
          END ${Prisma.raw(direction)}
          LIMIT ${take}
          OFFSET ${skip}
        `;
        return processRows(rows);
      } else {
        const rows = await prisma.$queryRaw<Position[]>`
          SELECT * FROM position
          WHERE LOWER(maker) = ${addr} OR LOWER(taker) = ${addr}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(maker) = ${addr} AND "makerWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(taker) = ${addr} AND "makerWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
                ELSE 0
              END
            ELSE 0
          END ${Prisma.raw(direction)}
          LIMIT ${take}
          OFFSET ${skip}
        `;
        return processRows(rows);
      }
    }

    let orderByClause: Prisma.PositionOrderByWithRelationInput = {
      mintedAt: 'desc',
    };

    if (orderBy === 'created') {
      orderByClause = { mintedAt: orderDirection === 'asc' ? 'asc' : 'desc' };
    }

    const where: Prisma.PositionWhereInput = {
      OR: [{ maker: addr }, { taker: addr }],
    };
    if (chainId !== undefined && chainId !== null) {
      where.chainId = chainId;
    }

    const rows = await prisma.position.findMany({
      where,
      orderBy: orderByClause,
      take,
      skip,
    });

    return processRows(rows);
  }

  @Query(() => [PositionType])
  async positionsByConditionId(
    @Arg('conditionId', () => String) conditionId: string,
    @Arg('take', () => Int, { defaultValue: 100 }) take: number,
    @Arg('skip', () => Int, { defaultValue: 0 }) skip: number,
    @Arg('chainId', () => Int, { nullable: true }) chainId?: number
  ): Promise<PositionType[]> {
    const conditionIdLower = conditionId.toLowerCase();

    let rows: Position[];
    if (chainId !== undefined && chainId !== null) {
      rows = await prisma.$queryRaw<Position[]>`
        SELECT * FROM position
        WHERE "chainId" = ${chainId}
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("predictedOutcomes"::jsonb) AS outcome
            WHERE LOWER(outcome->>'conditionId') = ${conditionIdLower}
          )
        ORDER BY "mintedAt" DESC
        LIMIT ${take}
        OFFSET ${skip}
      `;
    } else {
      rows = await prisma.$queryRaw<Position[]>`
        SELECT * FROM position
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements("predictedOutcomes"::jsonb) AS outcome
          WHERE LOWER(outcome->>'conditionId') = ${conditionIdLower}
        )
        ORDER BY "mintedAt" DESC
        LIMIT ${take}
        OFFSET ${skip}
      `;
    }

    const processRows = async (rows: Position[]): Promise<PositionType[]> => {
      const conditionSet = new Set<string>();
      for (const r of rows) {
        let predictedOutcomesParsed = r.predictedOutcomes;
        if (typeof predictedOutcomesParsed === 'string') {
          try {
            predictedOutcomesParsed = JSON.parse(predictedOutcomesParsed);
          } catch {
            predictedOutcomesParsed = [];
          }
        }
        const outcomes =
          (predictedOutcomesParsed as unknown as { conditionId: string }[]) ||
          [];
        for (const o of outcomes) conditionSet.add(o.conditionId);
      }
      const conditionIds = Array.from(conditionSet);
      const conditions = conditionIds.length
        ? await prisma.condition.findMany({
            where: { id: { in: conditionIds } },
            select: {
              id: true,
              question: true,
              shortName: true,
              endTime: true,
            },
          })
        : [];
      const condMap = new Map(conditions.map((c) => [c.id, c]));

      return rows.map((r) => {
        let predictedOutcomesParsed = r.predictedOutcomes;
        if (typeof predictedOutcomesParsed === 'string') {
          try {
            predictedOutcomesParsed = JSON.parse(predictedOutcomesParsed);
          } catch {
            predictedOutcomesParsed = [];
          }
        }
        const outcomesRaw =
          (predictedOutcomesParsed as unknown as {
            conditionId: string;
            prediction: boolean;
          }[]) || [];
        const outcomes: PredictedOutcomeType[] = outcomesRaw.map((o) => ({
          conditionId: o.conditionId,
          prediction: o.prediction,
          condition: condMap.get(o.conditionId) || null,
        }));
        return {
          id: r.id,
          chainId: r.chainId,
          marketAddress: r.marketAddress,
          maker: r.maker,
          taker: r.taker,
          makerNftTokenId: r.makerNftTokenId,
          takerNftTokenId: r.takerNftTokenId,
          totalCollateral: r.totalCollateral,
          makerCollateral: r.makerCollateral ?? null,
          takerCollateral: r.takerCollateral ?? null,
          refCode: r.refCode,
          status: r.status as unknown as PositionType['status'],
          makerWon: r.makerWon,
          mintedAt: r.mintedAt,
          settledAt: r.settledAt ?? null,
          endsAt: r.endsAt ?? null,
          predictedOutcomes: outcomes,
        };
      });
    };

    return processRows(rows);
  }
}
