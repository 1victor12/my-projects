import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { unlink } from 'fs/promises';
import { join } from 'path';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo || photo.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.photo.delete({ where: { id } });

  try {
    const filepath = join(process.cwd(), 'public', photo.url);
    await unlink(filepath);
  } catch {}

  if (photo.isPrimary) {
    const nextPhoto = await prisma.photo.findFirst({
      where: { userId: user.id },
      orderBy: { order: 'asc' },
    });
    if (nextPhoto) {
      await prisma.photo.update({ where: { id: nextPhoto.id }, data: { isPrimary: true } });
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo || photo.userId !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.photo.updateMany({
    where: { userId: user.id },
    data: { isPrimary: false },
  });
  await prisma.photo.update({ where: { id }, data: { isPrimary: true } });

  return NextResponse.json({ success: true });
}