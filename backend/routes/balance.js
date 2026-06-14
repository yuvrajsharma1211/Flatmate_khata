import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { getNetBalances, getSimplifiedDebts, getBalanceBreakdown } from '../services/balance.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

function toInteger(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

async function getGroupAccess(groupId, userId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        select: {
          user_id: true,
          joined_at: true,
          left_at: true
        }
      }
    }
  });

  if (!group) {
    return null;
  }

  const isMember = group.members.some(member => member.user_id === userId);
  if (!isMember) {
    return 'forbidden';
  }

  return group;
}

// GET /api/groups/:id/balances
router.get('/groups/:id/balances', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const balances = await getNetBalances(groupId);
    return res.json({ balances });
  } catch (error) {
    console.error('Fetch balances error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/groups/:id/balances/:userId
router.get('/groups/:id/balances/:userId', async (req, res) => {
  const groupId = toInteger(req.params.id);
  const userId = toInteger(req.params.userId);

  if (groupId === null) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }
  if (userId === null) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const breakdown = await getBalanceBreakdown(groupId, userId);
    return res.json({ breakdown });
  } catch (error) {
    console.error('Fetch balance breakdown error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/groups/:id/debts
router.get('/groups/:id/debts', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return res.status(400).json({ error: 'Invalid group ID' });
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const debts = await getSimplifiedDebts(groupId);
    return res.json({ debts });
  } catch (error) {
    console.error('Fetch simplified debts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
