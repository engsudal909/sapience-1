import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import prisma from '../db';

/**
 * Tool: list_active_markets
 * Returns all conditions whose endTime is in the future (i.e. active prediction markets).
 */
export const listActiveMarkets = {
  name: 'list_active_markets',
  description:
    'Return all Sapience prediction markets that are currently being traded.',
  parameters: {
    properties: {
      __ignore__: z
        .boolean()
        .default(false)
        .describe(
          'This parameter is ignored – some MCP clients require a non-empty schema'
        )
        .optional(),
    },
  },
  function: async (): Promise<CallToolResult> => {
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);

      const conditions = await prisma.condition.findMany({
        where: {
          endTime: {
            gt: nowSeconds,
          },
          public: true,
        },
        include: {
          category: true,
        },
        orderBy: {
          endTime: 'asc',
        },
      });

      const formatted = conditions.map((c) => ({
        id: c.id,
        question: c.question,
        shortName: c.shortName,
        endTime: c.endTime,
        claimStatement: c.claimStatement,
        description: c.description,
        chainId: c.chainId,
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        category: c.category?.name || null,
      }));

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formatted, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Failed to list active markets: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        ],
      };
    }
  },
};
