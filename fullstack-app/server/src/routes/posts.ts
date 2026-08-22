import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { AuthRequest } from '../middleware/auth.js';
import { broadcast } from '../socket.js';

const router = Router();

const createPostSchema = z.object({
  content: z.string().min(1).max(2000),
  image: z.string().url().optional(),
});

const updatePostSchema = z.object({
  content: z.string().min(1).max(2000).optional(),
  image: z.string().url().optional().nullable(),
});

router.get('/', async (req: AuthRequest, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const posts = await prisma.post.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
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
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

router.get('/feed', async (req: AuthRequest, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const following = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { following: { select: { id: true } } },
    });

    const followingIds = following?.following.map(f => f.id) || [];
    followingIds.push(req.user!.id);

    const posts = await prisma.post.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      where: { authorId: { in: followingIds } },
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
    console.error('Get feed error:', error);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: req.user!.id }, select: { id: true } },
        comments: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, username: true, avatar: true } } },
        },
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({
      ...post,
      liked: post.likes.length > 0,
      likesCount: post._count.likes,
      commentsCount: post._count.comments,
      likes: undefined,
      _count: undefined,
    });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const data = createPostSchema.parse(req.body);

    const post = await prisma.post.create({
      data: {
        content: data.content,
        image: data.image,
        authorId: req.user!.id,
      },
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
      },
    });

    broadcast('post:created', post);

    res.status(201).json({ ...post, liked: false, likesCount: 0, commentsCount: 0 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  try {
    const data = updatePostSchema.parse(req.body);

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const updated = await prisma.post.update({
      where: { id: req.params.id },
      data,
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        _count: { select: { likes: true, comments: true } },
        likes: { where: { userId: req.user!.id }, select: { id: true } },
      },
    });

    broadcast('post:updated', updated);

    res.json({
      ...updated,
      liked: updated.likes.length > 0,
      likesCount: updated._count.likes,
      commentsCount: updated._count.comments,
      likes: undefined,
      _count: undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update post error:', error);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await prisma.post.delete({ where: { id: req.params.id } });
    broadcast('post:deleted', req.params.id);

    res.json({ message: 'Post deleted' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

router.post('/:id/like', async (req: AuthRequest, res) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const existingLike = await prisma.like.findUnique({
      where: { userId_postId: { userId: req.user!.id, postId: req.params.id } },
    });

    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
      broadcast('post:unliked', { postId: req.params.id, userId: req.user!.id });
      return res.json({ liked: false });
    }

    await prisma.like.create({
      data: { userId: req.user!.id, postId: req.params.id },
    });

    broadcast('post:liked', { postId: req.params.id, userId: req.user!.id });
    res.json({ liked: true });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

router.get('/:id/comments', async (req: AuthRequest, res) => {
  try {
    const cursor = req.query.cursor as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const comments = await prisma.comment.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      where: { postId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    let nextCursor: string | undefined;
    if (comments.length > limit) {
      const nextComment = comments.pop();
      nextCursor = nextComment!.id;
    }

    res.json({ comments, nextCursor });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

router.post('/:id/comments', async (req: AuthRequest, res) => {
  try {
    const schema = z.object({ content: z.string().min(1).max(1000) });
    const data = schema.parse(req.body);

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = await prisma.comment.create({
      data: { content: data.content, authorId: req.user!.id, postId: req.params.id },
      include: { author: { select: { id: true, username: true, avatar: true } } },
    });

    broadcast('comment:created', comment);

    res.status(201).json(comment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

export default router;