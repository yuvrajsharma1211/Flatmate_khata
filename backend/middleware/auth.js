import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extract token from "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretflatmatekhatatoken12345');
    
    // Find the user to ensure they still exist
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    // Attach user information to request object
    req.user = user;
    next();
  } catch (error) {
    console.error('JWT Verification error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};
