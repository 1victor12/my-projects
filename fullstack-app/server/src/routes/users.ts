import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { AuthRequest } from '../middleware/auth.js';
import { io } from '../socket.js';

const router = Router();

const updateProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
  bio: z.string().max(500).optional().nullable(),
  avatar: z.string().url().optional().nullable(),
});

router.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = req.query.q as string;
    if (!q || q.length < 2) {
      return res.json({ users: [] });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ],
        NOT: { id: req.user!.id },
      },
      take: 10,
      select: { id: true, username: true, avatar: true, bio: true },
    });

    res.json({ users });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        avatar: true,
        bio: true,
        createdAt: true,
        _count: { select: { posts: true, followers: true, following: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isFollowing = await prisma.user.findFirst({
      where: { id: req.user!.id, following: { some: { id: req.params.id } } },
    });

    res.json({ user: { ...user, isFollowing: !!isFollowing } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.get('/:id/posts', async (req: AuthRequest, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const posts = await prisma.post.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      where: { authorId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: req.user!.id }, select: { id: true } },
      },
    });

    let nextCursor: string | undefined;
    if (posts.length > limit) {
      const nextPost = posts.pop();
      nextCursor = nextPost!.id;
    }

    res.json({
      posts: posts.map(p => ({
        ...p,
        liked: p.likes.length > 0,
        likesCount: p._count.likes,
        commentsCount: p._count.comments,
        likes: undefined,
        _count: undefined,
      })),
      nextCursor,
    });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

router.patch('/profile', async (req: AuthRequest, res) => {
  try {
    const data = updateProfileSchema.parse(req.body);

    if (data.username) {
      const existing = await prisma.user.findUnique({ where: { username: data.username } });
      if (existing && existing.id !== req.user!.id) {
        return res.status(400).json({ error: 'Username taken' });
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, email: true, username: true, avatar: true, bio: true },
    });

    res.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/:id/follow', async (req: AuthRequest, res) => {
  try {
    if (req.params.id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existing = await prisma.user.findFirst({
      where: { id: req.user!.id, following: { some: { id: req.params.id } } },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { following: { disconnect: { id: req.params.id } } },
      });
      io.emit('user:unfollowed', { followerId: req.user!.id, followingId: req.params.id });
      return res.json({ following: false });
    }

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { following: { connect: { id: req.params.id } } },
    });
    io.emit('user:followed', { followerId: req.user!.id, followingId: req.params.id });
    res.json({ following: true });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Failed to follow' });
  }
});

router.get('/:id/followers', async (req: AuthRequest, res) => {
  try {
    const followers = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { followers: { select: { id: true, username: true, avatar: true } } },
    });
    res.json({ users: followers?.followers || [] });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

router.get('/:id/following', async (req: AuthRequest, res) => {
  try {
    const following = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { following: { select: { id: true, username: true, avatar: true } } },
    });
    res.json({ users: following?.following || [] });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Failed to fetch following' });
  }
});

export default router;