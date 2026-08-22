import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      photos: { orderBy: { order: 'asc' } },
      preferences: true,
    },
  });
  if (!fullUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { passwordHash, ...safeUser } = fullUser;
  return NextResponse.json({ user: safeUser });
}