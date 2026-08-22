import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from './index.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const userSockets = new Map<string, Set<string>>();

export const setupSocketHandlers = (io: Server) => {
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.cookie?.split('token=')[1]?.split(';')[0];
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { id: true } });
      if (!user) return next(new Error('User not found'));

      socket.userId = user.id;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User connected: ${userId}`);

    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
      console.log(`User disconnected: ${userId}`);
    });
  });
};

let ioInstance: Server;

export const setSocketInstance = (instance: Server) => {
  ioInstance = instance;
};

export const getSocketInstance = () => ioInstance;

export const emitToUser = (userId: string, event: string, data: any) => {
  ioInstance?.to(`user:${userId}`).emit(event, data);
};

export const broadcast = (event: string, data: any) => {
  ioInstance?.emit(event, data);
};