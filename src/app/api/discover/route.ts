import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    include: { preferences: true },
  });
  if (!me) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const prefs = me.preferences || { minAge: 18, maxAge: 99, genders: 'all', showMe: true };
  if (!prefs.showMe) {
    return NextResponse.json({ users: [] });
  }

  const swipedIds = await prisma.swipe.findMany({
    where: { swiperId: user.id },
    select: { swipeeId: true },
  });
  const swipedSet = new Set(swipedIds.map((s) => s.swipeeId));

  const blockedIds = await prisma.block.findMany({
    where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
    select: { blockerId: true, blockedId: true },
  });
  const blockedSet = new Set(blockedIds.flatMap((b) => [b.blockerId, b.blockedId]));

  const myAge = new Date().getFullYear() - new Date(me.birthdate).getFullYear();

  const genderFilter = prefs.genders === 'all' ? {} : { gender: prefs.genders };
  const interestedFilter =
    me.interestedIn === 'everyone'
      ? {}
      : me.interestedIn === 'male'
      ? { gender: 'male' }
      : { gender: 'female' };

  const candidates = await prisma.user.findMany({
    where: {
      id: { not: user.id, notIn: [...swipedSet, ...blockedSet] },
      birthdate: {
        gte: new Date(new Date().setFullYear(new Date().getFullYear() - prefs.maxAge)),
        lte: new Date(new Date().setFullYear(new Date().getFullYear() - prefs.minAge)),
      },
      ...genderFilter,
      ...interestedFilter,
    },
    include: { photos: { where: { isPrimary: true }, take: 1 } },
    take: 20,
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({
    users: candidates.map((u) => ({
      id: u.id,
      name: u.name,
      age: new Date().getFullYear() - new Date(u.birthdate).getFullYear(),
      bio: u.bio,
      city: u.city,
      photo: u.photos[0]?.url || null,
    })),
  });
}