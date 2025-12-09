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
  predictor!: string;

  @Field(() => String)
  counterparty!: string;

  @Field(() => String)
  predictorNftTokenId!: string;

  @Field(() => String)
  counterpartyNftTokenId!: string;

  @Field(() => String)
  totalCollateral!: string;

  @Field(() => String, { nullable: true })
  predictorCollateral?: string | null;

  @Field(() => String, { nullable: true })
  counterpartyCollateral?: string | null;

  @Field(() => String, { nullable: true })
  refCode?: string | null;

  @Field(() => String)
  status!: 'active' | 'settled' | 'consolidated';

  @Field(() => Boolean, { nullable: true })
  predictorWon?: boolean | null;

  @Field(() => Int)
  mintedAt!: number;

  @Field(() => Int, { nullable: true })
  settledAt?: number | null;

  @Field(() => Int, { nullable: true })
  endsAt?: number | null;

  @Field(() => [PredictedOutcomeType])
  predictions!: PredictedOutcomeType[];
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
      OR: [{ predictor: addr }, { counterparty: addr }],
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
        let predictionsParsed = r.predictions;
        if (typeof predictionsParsed === 'string') {
          try {
            predictionsParsed = JSON.parse(predictionsParsed);
          } catch {
            predictionsParsed = [];
          }
        }
        const outcomes =
          (predictionsParsed as unknown as { conditionId: string }[]) ||
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
        let predictionsParsed = r.predictions;
        if (typeof predictionsParsed === 'string') {
          try {
            predictionsParsed = JSON.parse(predictionsParsed);
          } catch {
            predictionsParsed = [];
          }
        }
        const outcomesRaw =
          (predictionsParsed as unknown as {
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
          predictor: r.predictor,
          counterparty: r.counterparty,
          predictorNftTokenId: r.predictorNftTokenId,
          counterpartyNftTokenId: r.counterpartyNftTokenId,
          totalCollateral: r.totalCollateral,
          predictorCollateral: r.predictorCollateral ?? null,
          counterpartyCollateral: r.counterpartyCollateral ?? null,
          refCode: r.refCode,
          status: r.status as unknown as PositionType['status'],
          predictorWon: r.predictorWon,
          mintedAt: r.mintedAt,
          settledAt: r.settledAt ?? null,
          endsAt: r.endsAt ?? null,
          predictions: outcomes,
        };
      });
    };

    if (orderBy === 'wager' || orderBy === 'toWin' || orderBy === 'pnl') {
      const direction = orderDirection === 'asc' ? 'ASC' : 'DESC';

      if (orderBy === 'wager') {
        if (chainId !== undefined && chainId !== null) {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) AND "chainId" = ${chainId}
            ORDER BY CASE 
              WHEN LOWER(predictor) = ${addr} THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
              WHEN LOWER(counterparty) = ${addr} THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
              ELSE 0
            END ${Prisma.raw(direction)}
            LIMIT ${take}
            OFFSET ${skip}
          `;
          return processRows(rows);
        } else {
          const rows = await prisma.$queryRaw<Position[]>`
            SELECT * FROM position
            WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
            ORDER BY CASE 
              WHEN LOWER(predictor) = ${addr} THEN CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
              WHEN LOWER(counterparty) = ${addr} THEN CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
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
            WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) AND "chainId" = ${chainId}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(predictor) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(counterparty) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
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
            WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
            ORDER BY CASE 
              WHEN status = 'active' THEN 0
              WHEN LOWER(predictor) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = true THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("predictorCollateral", '0') AS DECIMAL)
                END
              WHEN LOWER(counterparty) = ${addr} THEN
                CASE 
                  WHEN "predictorWon" = false THEN 
                    CAST(COALESCE("totalCollateral", '0') AS DECIMAL) - CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
                  ELSE 
                    -CAST(COALESCE("counterpartyCollateral", '0') AS DECIMAL)
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
          WHERE (LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}) AND "chainId" = ${chainId}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(predictor) = ${addr} AND "predictorWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(counterparty) = ${addr} AND "predictorWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
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
          WHERE LOWER(predictor) = ${addr} OR LOWER(counterparty) = ${addr}
          ORDER BY CASE 
            WHEN status = 'active' THEN CAST("totalCollateral" AS DECIMAL)
            WHEN status != 'active' THEN
              CASE
                WHEN (LOWER(predictor) = ${addr} AND "predictorWon" = true) THEN CAST("totalCollateral" AS DECIMAL)
                WHEN (LOWER(counterparty) = ${addr} AND "predictorWon" = false) THEN CAST("totalCollateral" AS DECIMAL)
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
      OR: [{ predictor: addr }, { counterparty: addr }],
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
            SELECT 1 FROM jsonb_array_elements("predictions"::jsonb) AS outcome
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
            SELECT 1 FROM jsonb_array_elements("predictions"::jsonb) AS outcome
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
        let predictionsParsed = r.predictions;
        if (typeof predictionsParsed === 'string') {
          try {
            predictionsParsed = JSON.parse(predictionsParsed);
          } catch {
            predictionsParsed = [];
          }
        }
        const outcomes =
          (predictionsParsed as unknown as { conditionId: string }[]) ||
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
        let predictionsParsed = r.predictions;
        if (typeof predictionsParsed === 'string') {
          try {
            predictionsParsed = JSON.parse(predictionsParsed);
          } catch {
            predictionsParsed = [];
          }
        }
        const outcomesRaw =
          (predictionsParsed as unknown as {
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
          predictor: r.predictor,
          counterparty: r.counterparty,
          predictorNftTokenId: r.predictorNftTokenId,
          counterpartyNftTokenId: r.counterpartyNftTokenId,
          totalCollateral: r.totalCollateral,
          predictorCollateral: r.predictorCollateral ?? null,
          counterpartyCollateral: r.counterpartyCollateral ?? null,
          refCode: r.refCode,
          status: r.status as unknown as PositionType['status'],
          predictorWon: r.predictorWon,
          mintedAt: r.mintedAt,
          settledAt: r.settledAt ?? null,
          endsAt: r.endsAt ?? null,
          predictions: outcomes,
        };
      });
    };

    return processRows(rows);
  }
}
