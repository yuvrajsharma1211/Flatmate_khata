import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth.js';
import { computeExpenseSplits, getBalanceBreakdown, getNetBalances, getSimplifiedDebts } from '../services/balance.js';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticateToken);

const ROUNDING_TOLERANCE = 0.01;

function respondBadRequest(res, message, details = []) {
  if (details.length > 0) {
    return res.status(400).json({ error: message, details });
  }

  return res.status(400).json({ error: message });
}

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

function parseDateOnly(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      return null;
    }

    return date;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function pickBodyValue(body, keys) {
  for (const key of keys) {
    if (body[key] !== undefined) {
      return body[key];
    }
  }

  return undefined;
}

function normalizeSplitInput(body) {
  const splitTypeRaw = pickBodyValue(body, ['split_type', 'splitType']);
  const splitType = typeof splitTypeRaw === 'string' ? splitTypeRaw.toLowerCase().trim() : '';

  const splitDetailsRaw = pickBodyValue(body, ['split_details', 'splitDetails']);
  const splitDetails = {};

  if (splitDetailsRaw && typeof splitDetailsRaw === 'object' && !Array.isArray(splitDetailsRaw)) {
    for (const [key, value] of Object.entries(splitDetailsRaw)) {
      const userId = toInteger(key);
      if (userId !== null) {
        splitDetails[userId] = value;
      }
    }
  }

  const participantRaw = pickBodyValue(body, ['participants', 'participantIds', 'userIds', 'user_ids']);
  let participantIds = [];

  if (Array.isArray(participantRaw)) {
    participantIds = participantRaw
      .map(item => {
        if (item && typeof item === 'object') {
          return toInteger(item.userId ?? item.user_id ?? item.id);
        }

        return toInteger(item);
      })
      .filter(value => value !== null);
  } else if (splitDetailsRaw && typeof splitDetailsRaw === 'object' && !Array.isArray(splitDetailsRaw)) {
    participantIds = Object.keys(splitDetailsRaw)
      .map(key => toInteger(key))
      .filter(value => value !== null);
  }

  return { splitType, splitDetails, participantIds };
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
      },
      settings: true,
      expenses: {
        include: {
          payer: { select: { id: true, name: true } },
          splits: { include: { user: { select: { id: true, name: true } } } }
        },
        orderBy: { expense_date: 'desc' }
      },
      settlements: {
        include: {
          payer: { select: { id: true, name: true } },
          recipient: { select: { id: true, name: true } }
        },
        orderBy: { settled_at: 'desc' }
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

async function getActiveMembersAt(groupId, atDate) {
  return prisma.groupMember.findMany({
    where: {
      group_id: groupId,
      joined_at: { lte: atDate },
      OR: [
        { left_at: null },
        { left_at: { gt: atDate } }
      ]
    },
    include: {
      user: { select: { id: true, name: true, email: true } }
    },
    orderBy: [{ joined_at: 'asc' }, { user_id: 'asc' }]
  });
}

async function resolveGroupSettingMap(groupId) {
  const settings = await prisma.setting.findMany({
    where: { group_id: groupId }
  });

  return settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {});
}

async function validateExpenseMembers(groupId, expenseDate, payerId, participantIds) {
  const activeMembers = await getActiveMembersAt(groupId, expenseDate);
  const activeMemberIds = new Set(activeMembers.map(member => member.user_id));

  const errors = [];

  if (!activeMemberIds.has(payerId)) {
    errors.push(`Payer ${payerId} is not a member of this group on ${formatDateOnly(expenseDate)}.`);
  }

  for (const participantId of participantIds) {
    if (!activeMemberIds.has(participantId)) {
      errors.push(`User ${participantId} is not a member of this group on ${formatDateOnly(expenseDate)}.`);
    }
  }

  return { activeMembers, errors };
}

function resolveExpenseAmount(body, groupSettings) {
  const currencyRaw = pickBodyValue(body, ['currency']);
  const currency = typeof currencyRaw === 'string' && currencyRaw.trim() ? currencyRaw.trim().toUpperCase() : null;

  const originalAmountRaw = pickBodyValue(body, ['original_amount', 'originalAmount']);
  const amountBaseRaw = pickBodyValue(body, ['amount_base', 'amountBase']);
  const exchangeRateRaw = pickBodyValue(body, ['exchange_rate', 'exchangeRate']);

  const originalAmount = originalAmountRaw !== undefined && originalAmountRaw !== null ? Number(originalAmountRaw) : null;
  const amountBase = amountBaseRaw !== undefined && amountBaseRaw !== null ? Number(amountBaseRaw) : null;

  let exchangeRate = exchangeRateRaw !== undefined && exchangeRateRaw !== null ? Number(exchangeRateRaw) : null;
  if (!Number.isFinite(exchangeRate)) {
    if (currency === 'USD') {
      exchangeRate = Number(groupSettings.usd_to_inr_rate || 83);
    } else {
      exchangeRate = 1;
    }
  }

  const normalizedCurrency = currency || 'INR';
  const resolvedOriginalAmount = Number.isFinite(originalAmount) ? originalAmount : null;
  let resolvedAmountBase = Number.isFinite(amountBase) ? amountBase : null;

  if (resolvedAmountBase === null) {
    if (resolvedOriginalAmount === null) {
      return { error: 'Either amount_base or original_amount must be provided.' };
    }

    resolvedAmountBase = Math.round((resolvedOriginalAmount * exchangeRate) * 100) / 100;
  }

  const finalOriginalAmount = resolvedOriginalAmount ?? resolvedAmountBase;

  return {
    currency: normalizedCurrency,
    originalAmount: finalOriginalAmount,
    amountBase: resolvedAmountBase,
    exchangeRate
  };
}

async function createOrUpdateExpenseRecord({
  expenseId,
  groupId,
  userId,
  body,
  existingExpense = null
}) {
  const group = await getGroupAccess(groupId, userId);
  if (!group) {
    return { error: 'Group not found', status: 404 };
  }
  if (group === 'forbidden') {
    return { error: 'You are not a member of this group', status: 403 };
  }

  const expenseDate = parseDateOnly(pickBodyValue(body, ['expense_date', 'expenseDate']) ?? existingExpense?.expense_date);
  if (!expenseDate) {
    return { error: 'expense_date must be a valid date in YYYY-MM-DD format.', status: 400 };
  }

  const description = String(pickBodyValue(body, ['description']) ?? existingExpense?.description ?? '').trim();
  if (!description) {
    return { error: 'description is required.', status: 400 };
  }

  const payerId = toInteger(pickBodyValue(body, ['paid_by', 'paidBy']) ?? existingExpense?.paid_by);
  if (payerId === null) {
    return { error: 'paid_by must be a valid user ID.', status: 400 };
  }

  const splitInput = normalizeSplitInput(body);
  const splitType = splitInput.splitType || String(existingExpense?.split_type || '').toLowerCase();
  if (!['equal', 'unequal', 'percentage', 'share'].includes(splitType)) {
    return { error: 'split_type must be one of equal, unequal, percentage, or share.', status: 400 };
  }

  let participantIds = splitInput.participantIds;
  const splitDetails = splitInput.splitDetails;

  if (splitType === 'equal' && participantIds.length === 0) {
    const activeMembers = await getActiveMembersAt(groupId, expenseDate);
    participantIds = activeMembers.map(member => member.user_id);
  }

  participantIds = [...new Set(participantIds.filter(value => value !== null))];
  if (participantIds.length === 0) {
    return { error: 'At least one split participant is required.', status: 400 };
  }

  const groupSettings = await resolveGroupSettingMap(groupId);
  const amountInfo = resolveExpenseAmount(body, groupSettings);
  if (amountInfo.error) {
    return { error: amountInfo.error, status: 400 };
  }

  const membershipCheck = await validateExpenseMembers(groupId, expenseDate, payerId, participantIds);
  if (membershipCheck.errors.length > 0) {
    return { error: membershipCheck.errors[0], details: membershipCheck.errors, status: 400 };
  }

  const splitDetailsNormalized = {};
  for (const participantId of participantIds) {
    const rawValue = splitDetails[participantId] ?? splitDetails[String(participantId)];
    if (rawValue !== undefined) {
      splitDetailsNormalized[participantId] = Number(rawValue);
    }
  }

  const originalAmount = amountInfo.originalAmount;
  const splitDetailsErrors = [];

  if (splitType === 'unequal') {
    const totalProvided = participantIds.reduce((sum, participantId) => sum + Number(splitDetailsNormalized[participantId] ?? 0), 0);
    if (Math.abs(totalProvided - originalAmount) > ROUNDING_TOLERANCE) {
      splitDetailsErrors.push(
        `Unequal split amounts must sum to ${originalAmount.toFixed(2)}. Actual sum is ${totalProvided.toFixed(2)}.`
      );
    }
  }

  if (splitType === 'percentage') {
    const totalPercentage = participantIds.reduce((sum, participantId) => sum + Number(splitDetailsNormalized[participantId] ?? 0), 0);
    if (Math.abs(totalPercentage - 100) > ROUNDING_TOLERANCE) {
      splitDetailsErrors.push(`Percentage splits must total 100. Actual total is ${totalPercentage.toFixed(2)}.`);
    }
  }

  if (splitType === 'share') {
    const invalidShares = participantIds.filter(participantId => {
      const value = splitDetailsNormalized[participantId];
      return !Number.isInteger(value) || value <= 0;
    });

    if (invalidShares.length > 0) {
      splitDetailsErrors.push('Share splits must use positive integers for every participant.');
    }
  }

  if (splitDetailsErrors.length > 0) {
    return { error: splitDetailsErrors[0], details: splitDetailsErrors, status: 400 };
  }

  const roundingRule = groupSettings.rounding_rule || 'remainder_to_payer';
  const splitsComputed = computeExpenseSplits(
    {
      amount_base: amountInfo.amountBase,
      paid_by: payerId
    },
    participantIds,
    splitType,
    splitDetailsNormalized,
    roundingRule
  );

  const expense = await prisma.$transaction(async transaction => {
    let savedExpense;

    if (existingExpense) {
      await transaction.expense.update({
        where: { id: expenseId },
        data: {
          description,
          expense_date: expenseDate,
          currency: amountInfo.currency,
          original_amount: amountInfo.originalAmount,
          exchange_rate: amountInfo.exchangeRate,
          amount_base: amountInfo.amountBase,
          paid_by: payerId,
          split_type: splitType,
          notes: pickBodyValue(body, ['notes']) ?? existingExpense.notes ?? null
        }
      });

      await transaction.expenseSplit.deleteMany({ where: { expense_id: expenseId } });

      await transaction.expenseSplit.createMany({
        data: splitsComputed.map(split => ({
          expense_id: expenseId,
          user_id: split.user_id,
          raw_value: split.raw_value,
          owed_amount: split.owed_amount
        }))
      });

      savedExpense = await transaction.expense.findUnique({
        where: { id: expenseId },
        include: {
          payer: { select: { id: true, name: true } },
          splits: { include: { user: { select: { id: true, name: true } } } }
        }
      });
    } else {
      savedExpense = await transaction.expense.create({
        data: {
          group_id: groupId,
          description,
          expense_date: expenseDate,
          currency: amountInfo.currency,
          original_amount: amountInfo.originalAmount,
          exchange_rate: amountInfo.exchangeRate,
          amount_base: amountInfo.amountBase,
          paid_by: payerId,
          split_type: splitType,
          status: 'active',
          source: 'manual',
          notes: pickBodyValue(body, ['notes']) ?? null,
          created_by: userId,
          splits: {
            createMany: {
              data: splitsComputed.map(split => ({
                user_id: split.user_id,
                raw_value: split.raw_value,
                owed_amount: split.owed_amount
              }))
            }
          }
        },
        include: {
          payer: { select: { id: true, name: true } },
          splits: { include: { user: { select: { id: true, name: true } } } }
        }
      });
    }

    return savedExpense;
  });

  return { expense };
}

router.post('/groups', async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  if (!name) {
    return respondBadRequest(res, 'Group name is required.');
  }

  const baseCurrency = String(req.body.base_currency ?? req.body.baseCurrency ?? 'INR').trim().toUpperCase().slice(0, 3) || 'INR';
  const joinedAt = new Date();
  const joinedAtDate = new Date(Date.UTC(joinedAt.getUTCFullYear(), joinedAt.getUTCMonth(), joinedAt.getUTCDate()));

  try {
    const group = await prisma.$transaction(async transaction => {
      const createdGroup = await transaction.group.create({
        data: {
          name,
          base_currency: baseCurrency,
          created_by: req.user.id
        }
      });

      const settingsMap = new Map([
        ['usd_to_inr_rate', String(req.body.usd_to_inr_rate ?? 83)],
        ['rounding_rule', String(req.body.rounding_rule ?? 'remainder_to_payer')]
      ]);

      const extraSettings = req.body.settings && typeof req.body.settings === 'object' ? Object.entries(req.body.settings) : [];
      for (const [key, value] of extraSettings) {
        if (value !== undefined && value !== null) {
          settingsMap.set(key, String(value));
        }
      }

      for (const [key, value] of settingsMap.entries()) {
        await transaction.setting.upsert({
          where: {
            group_id_key: {
              group_id: createdGroup.id,
              key
            }
          },
          update: { value },
          create: {
            group_id: createdGroup.id,
            key,
            value
          }
        });
      }

      await transaction.groupMember.create({
        data: {
          group_id: createdGroup.id,
          user_id: req.user.id,
          role: 'admin',
          joined_at: joinedAtDate,
          left_at: null
        }
      });

      return transaction.group.findUnique({
        where: { id: createdGroup.id },
        include: {
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } }
            }
          },
          settings: true,
          expenses: true,
          settlements: true
        }
      });
    });

    return res.status(201).json({ group });
  } catch (error) {
    console.error('Create group error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups', async (req, res) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { user_id: req.user.id },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, name: true, email: true }
                }
              }
            }
          }
        }
      }
    });

    const groups = memberships.map(membership => membership.group);
    return res.json({ groups });
  } catch (error) {
    console.error('Error fetching groups:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:id', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  try {
    const group = await getGroupAccess(groupId, req.user.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    if (group === 'forbidden') {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    return res.json({ group });
  } catch (error) {
    console.error('Error fetching group details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/groups/:id/members', async (req, res) => {
  const groupId = toInteger(req.params.id);
  const userId = toInteger(req.body.userId ?? req.body.user_id);
  const joinedAt = parseDateOnly(req.body.joinedAt ?? req.body.joined_at);

  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }
  if (userId === null) {
    return respondBadRequest(res, 'userId is required and must be a valid integer');
  }
  if (!joinedAt) {
    return respondBadRequest(res, 'joinedAt is required and must be a valid date in YYYY-MM-DD format');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true }
  });
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const existingMembership = await prisma.groupMember.findFirst({
    where: {
      group_id: groupId,
      user_id: userId,
      joined_at: { lte: joinedAt },
      OR: [
        { left_at: null },
        { left_at: { gt: joinedAt } }
      ]
    }
  });

  if (existingMembership) {
    return res.status(409).json({ error: 'User is already a member of this group on that date' });
  }

  try {
    const membership = await prisma.groupMember.create({
      data: {
        group_id: groupId,
        user_id: userId,
        role: 'member',
        joined_at: joinedAt,
        left_at: null
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    return res.status(201).json({ membership });
  } catch (error) {
    console.error('Add member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/groups/:id/members/:userId', async (req, res) => {
  const groupId = toInteger(req.params.id);
  const userId = toInteger(req.params.userId);
  const leftAt = parseDateOnly(req.body.leftAt ?? req.body.left_at);

  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }
  if (userId === null) {
    return respondBadRequest(res, 'Invalid user ID');
  }
  if (!leftAt) {
    return respondBadRequest(res, 'leftAt is required and must be a valid date in YYYY-MM-DD format');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const membership = await prisma.groupMember.findFirst({
    where: {
      group_id: groupId,
      user_id: userId,
      joined_at: { lte: leftAt },
      OR: [
        { left_at: null },
        { left_at: { gt: leftAt } }
      ]
    },
    orderBy: { joined_at: 'desc' }
  });

  if (!membership) {
    return res.status(404).json({ error: 'Active membership not found for that user on the specified date' });
  }

  if (leftAt < new Date(membership.joined_at)) {
    return res.status(400).json({ error: 'leftAt cannot be earlier than joined_at' });
  }

  try {
    const updated = await prisma.groupMember.update({
      where: { id: membership.id },
      data: { left_at: leftAt },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    return res.json({ membership: updated });
  } catch (error) {
    console.error('Leave member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:id/members', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const atDate = parseDateOnly(req.query.at) || new Date();

  try {
    const members = await getActiveMembersAt(groupId, atDate);
    return res.json({
      members,
      at: formatDateOnly(atDate)
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/groups/:id/expenses', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const result = await createOrUpdateExpenseRecord({
    groupId,
    userId: req.user.id,
    body: req.body
  });

  if (result.error) {
    return res.status(result.status || 400).json(result.details ? { error: result.error, details: result.details } : { error: result.error });
  }

  return res.status(201).json(result);
});

router.get('/groups/:id/expenses', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const where = { group_id: groupId };
  const fromDate = parseDateOnly(req.query.from);
  const toDate = parseDateOnly(req.query.to);

  if (fromDate) {
    where.expense_date = { ...(where.expense_date || {}), gte: fromDate };
  }
  if (toDate) {
    where.expense_date = { ...(where.expense_date || {}), lte: toDate };
  }

  const participant = toInteger(req.query.participant);
  if (req.query.participant !== undefined && req.query.participant !== '' && participant === null) {
    return respondBadRequest(res, 'participant must be a valid user ID');
  }

  if (participant !== null) {
    where.OR = [
      { paid_by: participant },
      { splits: { some: { user_id: participant } } }
    ];
  }

  try {
    const expenses = await prisma.expense.findMany({
      where,
      include: {
        payer: { select: { id: true, name: true } },
        splits: { include: { user: { select: { id: true, name: true } } } }
      },
      orderBy: [{ expense_date: 'desc' }, { id: 'desc' }]
    });

    return res.json({ expenses });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/expenses/:id', async (req, res) => {
  const expenseId = toInteger(req.params.id);
  if (expenseId === null) {
    return respondBadRequest(res, 'Invalid expense ID');
  }

  try {
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        group: {
          include: {
            members: {
              select: {
                user_id: true,
                joined_at: true,
                left_at: true
              }
            }
          }
        },
        payer: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        splits: { include: { user: { select: { id: true, name: true, email: true } } } }
      }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const canAccess = expense.group.members.some(member => member.user_id === req.user.id);
    if (!canAccess) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }

    return res.json({ expense });
  } catch (error) {
    console.error('Error fetching expense:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/expenses/:id', async (req, res) => {
  const expenseId = toInteger(req.params.id);
  if (expenseId === null) {
    return respondBadRequest(res, 'Invalid expense ID');
  }

  const existingExpense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      group: {
        include: {
          members: {
            select: {
              user_id: true,
              joined_at: true,
              left_at: true
            }
          }
        }
      }
    }
  });

  if (!existingExpense) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  const canAccess = existingExpense.group.members.some(member => member.user_id === req.user.id);
  if (!canAccess) {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const result = await createOrUpdateExpenseRecord({
    expenseId,
    groupId: existingExpense.group_id,
    userId: req.user.id,
    body: req.body,
    existingExpense
  });

  if (result.error) {
    return res.status(result.status || 400).json(result.details ? { error: result.error, details: result.details } : { error: result.error });
  }

  return res.json(result);
});

router.delete('/expenses/:id', async (req, res) => {
  const expenseId = toInteger(req.params.id);
  if (expenseId === null) {
    return respondBadRequest(res, 'Invalid expense ID');
  }

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      group: {
        include: {
          members: {
            select: { user_id: true }
          }
        }
      }
    }
  });

  if (!expense) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  const canAccess = expense.group.members.some(member => member.user_id === req.user.id);
  if (!canAccess) {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const voided = await prisma.expense.update({
      where: { id: expenseId },
      data: { status: 'voided' }
    });

    return res.json({ expense: voided });
  } catch (error) {
    console.error('Void expense error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/groups/:id/settlements', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const settledAt = parseDateOnly(pickBodyValue(req.body, ['settled_at', 'settledAt']) ?? new Date());
  if (!settledAt) {
    return respondBadRequest(res, 'settledAt must be a valid date in YYYY-MM-DD format');
  }

  const paidBy = toInteger(pickBodyValue(req.body, ['paid_by', 'paidBy']));
  const paidTo = toInteger(pickBodyValue(req.body, ['paid_to', 'paidTo']));

  if (paidBy === null || paidTo === null) {
    return respondBadRequest(res, 'paid_by and paid_to are required and must be valid user IDs');
  }
  if (paidBy === paidTo) {
    return respondBadRequest(res, 'paid_by and paid_to must be different users');
  }

  const amountInfo = resolveExpenseAmount(req.body, await resolveGroupSettingMap(groupId));
  if (amountInfo.error) {
    return respondBadRequest(res, amountInfo.error);
  }

  const membershipCheck = await validateExpenseMembers(groupId, settledAt, paidBy, [paidTo]);
  if (membershipCheck.errors.length > 0) {
    return res.status(400).json({ error: membershipCheck.errors[0], details: membershipCheck.errors });
  }

  try {
    const settlement = await prisma.settlement.create({
      data: {
        group_id: groupId,
        paid_by: paidBy,
        paid_to: paidTo,
        amount_base: amountInfo.amountBase,
        currency: amountInfo.currency,
        original_amount: amountInfo.originalAmount,
        exchange_rate: amountInfo.exchangeRate,
        settled_at: settledAt,
        notes: pickBodyValue(req.body, ['notes']) ?? null,
        source: 'manual',
        created_by: req.user.id
      },
      include: {
        payer: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } }
      }
    });

    return res.status(201).json({ settlement });
  } catch (error) {
    console.error('Create settlement error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:id/settlements', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const settlements = await prisma.settlement.findMany({
      where: { group_id: groupId },
      include: {
        payer: { select: { id: true, name: true } },
        recipient: { select: { id: true, name: true } }
      },
      orderBy: { settled_at: 'desc' }
    });

    return res.json({ settlements });
  } catch (error) {
    console.error('Fetch settlements error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:id/balances', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const [balances, simplifiedDebts] = await Promise.all([
      getNetBalances(groupId),
      getSimplifiedDebts(groupId)
    ]);

    return res.json({ balances, simplifiedDebts });
  } catch (error) {
    console.error('Fetch balances error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:id/balances/:userId', async (req, res) => {
  const groupId = toInteger(req.params.id);
  const userId = toInteger(req.params.userId);

  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }
  if (userId === null) {
    return respondBadRequest(res, 'Invalid user ID');
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
    const targetBalance = balances.find(balance => balance.userId === userId);
    if (!targetBalance) {
      return res.status(404).json({ error: 'User is not part of this group' });
    }

    const breakdown = await getBalanceBreakdown(groupId, userId);
    return res.json({
      userId,
      net_balance: targetBalance.net_balance,
      breakdown
    });
  } catch (error) {
    console.error('Fetch balance breakdown error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/groups/:id/settings', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  try {
    const settings = await prisma.setting.findMany({
      where: { group_id: groupId },
      orderBy: { key: 'asc' }
    });

    return res.json({ settings });
  } catch (error) {
    console.error('Fetch settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/groups/:id/settings', async (req, res) => {
  const groupId = toInteger(req.params.id);
  if (groupId === null) {
    return respondBadRequest(res, 'Invalid group ID');
  }

  const group = await getGroupAccess(groupId, req.user.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group === 'forbidden') {
    return res.status(403).json({ error: 'You are not a member of this group' });
  }

  const entries = [];
  if (req.body && typeof req.body === 'object') {
    if (req.body.key !== undefined && req.body.value !== undefined) {
      entries.push([String(req.body.key), req.body.value]);
    } else {
      for (const [key, value] of Object.entries(req.body)) {
        if (value !== undefined && value !== null) {
          entries.push([key, value]);
        }
      }
    }
  }

  if (entries.length === 0) {
    return respondBadRequest(res, 'At least one setting value must be provided');
  }

  try {
    await prisma.$transaction(
      entries.map(([key, value]) =>
        prisma.setting.upsert({
          where: {
            group_id_key: {
              group_id: groupId,
              key
            }
          },
          update: {
            value: String(value)
          },
          create: {
            group_id: groupId,
            key,
            value: String(value)
          }
        })
      )
    );

    const settings = await prisma.setting.findMany({
      where: { group_id: groupId },
      orderBy: { key: 'asc' }
    });

    return res.json({ settings });
  } catch (error) {
    console.error('Update settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;