import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { BranchAccessService } from './branch-access.service';

// Fake branch table: b1 belongs to r1, b2 belongs to r2. Mimics Prisma dropping
// `undefined` filters, which is exactly how a missing ?branchId used to slip through.
function service() {
  const branches = [
    { id: 'b1', restaurantId: 'r1' },
    { id: 'b2', restaurantId: 'r2' },
  ];
  const prisma = {
    branch: {
      findFirst: jest.fn(({ where }: { where: { id?: string; restaurantId?: string } }) =>
        Promise.resolve(
          branches.find(
            (b) =>
              (where.id === undefined || b.id === where.id) &&
              (where.restaurantId === undefined || b.restaurantId === where.restaurantId),
          ) ?? null,
        ),
      ),
    },
  };
  return { svc: new BranchAccessService(prisma as unknown as PrismaService), prisma };
}

describe('BranchAccessService.assertAccess', () => {
  it('allows a branch of the caller’s own restaurant', async () => {
    await expect(service().svc.assertAccess('r1', 'b1')).resolves.toBeUndefined();
  });

  it('rejects another restaurant’s branch', async () => {
    await expect(service().svc.assertAccess('r1', 'b2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each([undefined, '', null])('rejects a missing branchId (%p) without querying', async (branchId) => {
    const { svc, prisma } = service();
    await expect(svc.assertAccess('r1', branchId as unknown as string)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.branch.findFirst).not.toHaveBeenCalled();
  });
});
