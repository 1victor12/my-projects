import { NextRequest, NextResponse } from 'next/server';
import { profileSchema } from '@/lib/validation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function PUT(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      birthdate: new Date(parsed.data.birthdate),
      gender: parsed.data.gender,
      interestedIn: parsed.data.interestedIn,
      bio: parsed.data.bio,
      city: parsed.data.city,
    },
    include: { photos: { orderBy: { order: 'asc' } }, preferences: true },
  });

  const { passwordHash, ...safeUser } = updated;
  return NextResponse.json({ user: safeUser });
}