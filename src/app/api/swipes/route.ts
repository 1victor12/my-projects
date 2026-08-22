import { NextRequest, NextResponse } from 'next/server';
import { swipeSchema } from '@/lib/validation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = swipeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { targetUserId, type } = parsed.data;
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'Cannot swipe yourself' }, { status: 400 });
  }

  const existing = await prisma.swipe.findUnique({
    where: { swiperId_swipeeId: { swiperId: user.id, swipeeId: targetUserId } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Already swiped' }, { status: 409 });
  }

  await prisma.swipe.create({
    data: { swiperId: user.id, swipeeId: targetUserId, type },
  });

  let isMatch = false;
  if (type === 'LIKE' || type === 'SUPER') {
    const mutual = await prisma.swipe.findUnique({
      where: { swiperId_swipeeId: { swiperId: targetUserId, swipeeId: user.id } },
    });
    if (mutual && (mutual.type === 'LIKE' || mutual.type === 'SUPER')) {
      const [userAId, userBId] = [user.id, targetUserId].sort();
      await prisma.match.create({
        data: { userAId, userBId },
      });
      isMatch = true;
    }
  }

  return NextResponse.json({ isMatch });
}