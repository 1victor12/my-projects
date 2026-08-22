import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const matches = await prisma.match.findMany({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
      isActive: true,
    },
    include: {
      userA: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
      userB: { include: { photos: { where: { isPrimary: true }, take: 1 } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: {
      messages: { _count: 'desc' },
    },
  });

  return NextResponse.json({
    matches: matches.map((m) => {
      const other = m.userAId === user.id ? m.userB : m.userA;
      const lastMessage = m.messages[0];
      return {
        id: m.id,
        user: {
          id: other.id,
          name: other.name,
          age: new Date().getFullYear() - new Date(other.birthdate).getFullYear(),
          photo: other.photos[0]?.url || null,
        },
        lastMessage: lastMessage ? { content: lastMessage.content, createdAt: lastMessage.createdAt } : null,
        unreadCount: 0, // TODO: compute
      };
    }),
  });
}