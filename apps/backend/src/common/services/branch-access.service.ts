import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Phase 1 tenancy check: a branch belongs to exactly one restaurant, and a
// user belongs to exactly one restaurant — this confirms the branchId a
// request references actually belongs to the caller's restaurant. It does
// NOT yet enforce per-branch staff assignment (UserBranch is populated but
// not checked here); that's a deliberate Phase-later tightening once
// multi-branch staff scoping is actually needed, tracked in ROADMAP.md.
@Injectable()
export class BranchAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAccess(restaurantId: string, branchId: string): Promise<void> {
    // Prisma drops `undefined` filters: a missing ?branchId would match any of
    // the caller's branches here, and the caller's own query (`where: { branchId }`)
    // would then return every restaurant's rows. Require a real id.
    if (typeof branchId !== 'string' || branchId.length === 0) {
      throw new BadRequestException('branchId is required');
    }
    if (typeof restaurantId !== 'string' || restaurantId.length === 0) {
      throw new ForbiddenException('Branch not found or not accessible');
    }
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
      select: { id: true },
    });
    if (!branch) {
      throw new ForbiddenException('Branch not found or not accessible');
    }
  }
}
