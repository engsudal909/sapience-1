import 'reflect-metadata';
import { Resolver, FieldResolver, Root, ObjectType, Field } from 'type-graphql';
import { User } from '@generated/type-graphql/models/User';
import prisma from '../../db';

@ObjectType()
class ReferralStatus {
  @Field()
  requiresCode!: boolean;

  @Field()
  hasCode!: boolean;

  @Field()
  allowed!: boolean;

  @Field({ nullable: true })
  index!: number | null;

  @Field()
  maxReferrals!: number;

  @Field()
  withinCapacity!: boolean;
}

@Resolver(() => User)
export class UserResolver {
  @FieldResolver(() => ReferralStatus)
  async referralStatus(@Root() user: User): Promise<ReferralStatus> {
    // When there is no User record yet, default to requiring a code.
    if (!user || !user.address) {
      return {
        requiresCode: true,
        hasCode: false,
        allowed: false,
        index: null,
        maxReferrals: 0,
        withinCapacity: false,
      };
    }

    // If the user has not been referred by anyone, they still require a code.
    if (user.referredById == null) {
      return {
        requiresCode: true,
        hasCode: false,
        allowed: false,
        index: null,
        maxReferrals: 0,
        withinCapacity: false,
      };
    }

    const referee = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!referee || referee.referredById == null) {
      return {
        requiresCode: true,
        hasCode: false,
        allowed: false,
        index: null,
        maxReferrals: 0,
        withinCapacity: false,
      };
    }

    const referrer = await prisma.user.findUnique({
      where: { id: referee.referredById },
    });

    if (!referrer) {
      return {
        requiresCode: true,
        hasCode: false,
        allowed: false,
        index: null,
        maxReferrals: 0,
        withinCapacity: false,
      };
    }

    const referrals = await prisma.user.findMany({
      where: { referredById: referrer.id },
      orderBy: { createdAt: 'asc' },
    });

    const idx = referrals.findIndex((u) => u.id === referee.id);
    const position = idx === -1 ? null : idx + 1;
    const max = referrer.maxReferrals ?? 0;
    const allowed = position !== null && position <= max;

    return {
      requiresCode: true,
      hasCode: true,
      allowed,
      index: position,
      maxReferrals: max,
      withinCapacity: allowed,
    };
  }
}
