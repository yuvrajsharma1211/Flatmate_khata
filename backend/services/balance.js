import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Calculates raw value and rounded owed amounts for each participant based on split rules.
 * 
 * @param {Object} expense - { amount_base, paid_by }
 * @param {number[]} participants - Array of participant user IDs
 * @param {string} splitType - 'equal' | 'unequal' | 'percentage' | 'share'
 * @param {Object} splitDetails - Map of { [userId]: number }
 * @param {string} rule - 'remainder_to_payer' | 'remainder_to_first_alphabetically'
 * @returns {Array<{user_id: number, raw_value: number|null, owed_amount: number}>}
 */
export function computeExpenseSplits(expense, participants, splitType, splitDetails = {}, rule = 'remainder_to_payer') {
  const amountBase = Number(expense.amount_base);
  const paidById = expense.paid_by;

  if (isNaN(amountBase) || amountBase <= 0) {
    throw new Error('Invalid expense amount');
  }
  if (!participants || participants.length === 0) {
    throw new Error('Participants list cannot be empty');
  }

  let shares = [];

  if (splitType === 'equal') {
    const count = participants.length;
    const shareAmount = Math.round((amountBase / count) * 100) / 100;
    shares = participants.map(userId => ({
      user_id: userId,
      raw_value: null,
      owed_amount: shareAmount
    }));
  } else if (splitType === 'unequal') {
    shares = participants.map(userId => {
      const val = Number(splitDetails[userId] || 0);
      return {
        user_id: userId,
        raw_value: null,
        owed_amount: Math.round(val * 100) / 100
      };
    });
  } else if (splitType === 'percentage') {
    const totalPercentage = participants.reduce((sum, userId) => sum + Number(splitDetails[userId] || 0), 0);
    if (totalPercentage <= 0) {
      throw new Error('Total percentage must be greater than zero');
    }

    shares = participants.map(userId => {
      const rawPct = Number(splitDetails[userId] || 0);
      // Normalize if percentages don't sum to exactly 100%
      const pct = totalPercentage === 100 ? rawPct : (rawPct / totalPercentage) * 100;
      const shareAmount = Math.round((amountBase * (pct / 100)) * 100) / 100;
      return {
        user_id: userId,
        raw_value: rawPct,
        owed_amount: shareAmount
      };
    });
  } else if (splitType === 'share') {
    const totalShares = participants.reduce((sum, userId) => sum + Number(splitDetails[userId] || 0), 0);
    if (totalShares <= 0) {
      throw new Error('Total shares must be greater than zero');
    }

    shares = participants.map(userId => {
      const userShares = Number(splitDetails[userId] || 0);
      const shareAmount = Math.round((amountBase * (userShares / totalShares)) * 100) / 100;
      return {
        user_id: userId,
        raw_value: userShares,
        owed_amount: shareAmount
      };
    });
  } else {
    throw new Error(`Unsupported split type: ${splitType}`);
  }

  // Rounding adjust
  shares = applyRounding(shares, amountBase, paidById, rule);

  return shares;
}

/**
 * Adjusts computed shares to match the total base amount exactly.
 */
export function applyRounding(shares, totalAmount, paidById, rule) {
  const sumOfOwed = shares.reduce((sum, s) => sum + s.owed_amount, 0);
  const remainder = Math.round((totalAmount - sumOfOwed) * 100) / 100;

  if (remainder === 0) {
    return shares;
  }

  if (rule === 'remainder_to_payer') {
    const payerIndex = shares.findIndex(s => s.user_id === paidById);
    if (payerIndex !== -1) {
      shares[payerIndex].owed_amount = Math.round((shares[payerIndex].owed_amount + remainder) * 100) / 100;
    } else {
      // If payer is not a participant, adjust the first participant
      shares[0].owed_amount = Math.round((shares[0].owed_amount + remainder) * 100) / 100;
    }
  } else if (rule === 'remainder_to_first_alphabetically') {
    // Sort shares deterministically by user ID ascending
    const sorted = [...shares].sort((a, b) => a.user_id - b.user_id);
    const targetUserId = sorted[0].user_id;
    const targetIndex = shares.findIndex(s => s.user_id === targetUserId);
    shares[targetIndex].owed_amount = Math.round((shares[targetIndex].owed_amount + remainder) * 100) / 100;
  } else {
    // Default fallback
    shares[0].owed_amount = Math.round((shares[0].owed_amount + remainder) * 100) / 100;
  }

  return shares;
}

/**
 * Computes the net balances of all participants in a group.
 */
export async function getNetBalances(groupId) {
  // 1. Get all members of the group
  const members = await prisma.groupMember.findMany({
    where: { group_id: groupId },
    select: { user_id: true }
  });

  // 2. Get active expenses and splits
  const expenses = await prisma.expense.findMany({
    where: { group_id: groupId, status: 'active' },
    select: {
      id: true,
      amount_base: true,
      paid_by: true,
      splits: {
        select: {
          user_id: true,
          owed_amount: true
        }
      }
    }
  });

  // 3. Get all settlements
  const settlements = await prisma.settlement.findMany({
    where: { group_id: groupId },
    select: {
      id: true,
      amount_base: true,
      paid_by: true,
      paid_to: true
    }
  });

  // Collect all unique user IDs involved
  const userIds = new Set();
  members.forEach(m => userIds.add(m.user_id));
  expenses.forEach(e => {
    userIds.add(e.paid_by);
    e.splits.forEach(s => userIds.add(s.user_id));
  });
  settlements.forEach(s => {
    userIds.add(s.paid_by);
    userIds.add(s.paid_to);
  });

  // Load user profiles
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(userIds) } },
    select: { id: true, name: true, email: true }
  });

  // Initialize balance dictionary
  const balances = {};
  users.forEach(u => {
    balances[u.id] = {
      userId: u.id,
      name: u.name,
      email: u.email,
      net_balance: 0
    };
  });

  // Apply Expense Payments and Splits
  expenses.forEach(e => {
    const amount = Number(e.amount_base);
    const payerId = e.paid_by;
    
    if (balances[payerId]) {
      balances[payerId].net_balance += amount;
    }

    e.splits.forEach(s => {
      const owed = Number(s.owed_amount);
      const participantId = s.user_id;
      if (balances[participantId]) {
        balances[participantId].net_balance -= owed;
      }
    });
  });

  // Apply Settlement Payments
  settlements.forEach(s => {
    const amount = Number(s.amount_base);
    const payerId = s.paid_by;
    const recipientId = s.paid_to;

    if (balances[payerId]) {
      balances[payerId].net_balance += amount;
    }
    if (balances[recipientId]) {
      balances[recipientId].net_balance -= amount;
    }
  });

  // Round results
  Object.keys(balances).forEach(id => {
    balances[id].net_balance = Math.round(balances[id].net_balance * 100) / 100;
  });

  return Object.values(balances);
}

/**
 * Runs greedy debt-simplification to reduce transactions.
 */
export async function getSimplifiedDebts(groupId) {
  const netBalances = await getNetBalances(groupId);

  let creditors = [];
  let debtors = [];

  netBalances.forEach(user => {
    const bal = user.net_balance;
    if (bal > 0.01) {
      creditors.push({ userId: user.userId, name: user.name, balance: bal });
    } else if (bal < -0.01) {
      debtors.push({ userId: user.userId, name: user.name, balance: Math.abs(bal) });
    }
  });

  const transactions = [];
  const sortDesc = (a, b) => b.balance - a.balance;

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort(sortDesc);
    debtors.sort(sortDesc);

    const creditor = creditors[0];
    const debtor = debtors[0];

    const amountToSettle = Math.min(creditor.balance, debtor.balance);
    const amountRounded = Math.round(amountToSettle * 100) / 100;

    if (amountRounded > 0) {
      transactions.push({
        from: { userId: debtor.userId, name: debtor.name },
        to: { userId: creditor.userId, name: creditor.name },
        amount: amountRounded
      });
    }

    creditor.balance = Math.round((creditor.balance - amountToSettle) * 100) / 100;
    debtor.balance = Math.round((debtor.balance - amountToSettle) * 100) / 100;

    if (creditor.balance <= 0.01) {
      creditors.shift();
    }
    if (debtor.balance <= 0.01) {
      debtors.shift();
    }
  }

  return transactions;
}

/**
 * Returns exact audit history of calculations summing up to net balance.
 */
export async function getBalanceBreakdown(groupId, userId) {
  // 1. Expenses paid
  const expensesPaid = await prisma.expense.findMany({
    where: { group_id: groupId, paid_by: userId, status: 'active' },
    select: {
      id: true,
      description: true,
      expense_date: true,
      currency: true,
      original_amount: true,
      exchange_rate: true,
      amount_base: true,
      split_type: true
    }
  });

  // 2. Shares in splits
  const userSplits = await prisma.expenseSplit.findMany({
    where: {
      user_id: userId,
      expense: {
        group_id: groupId,
        status: 'active'
      }
    },
    include: {
      expense: {
        select: {
          id: true,
          description: true,
          expense_date: true,
          currency: true,
          original_amount: true,
          exchange_rate: true,
          amount_base: true,
          paid_by: true,
          split_type: true
        }
      }
    }
  });

  // 3. Settlements paid out
  const settlementsPaid = await prisma.settlement.findMany({
    where: { group_id: groupId, paid_by: userId },
    select: {
      id: true,
      settled_at: true,
      currency: true,
      original_amount: true,
      exchange_rate: true,
      amount_base: true,
      notes: true
    }
  });

  // 4. Settlements received
  const settlementsReceived = await prisma.settlement.findMany({
    where: { group_id: groupId, paid_to: userId },
    select: {
      id: true,
      settled_at: true,
      currency: true,
      original_amount: true,
      exchange_rate: true,
      amount_base: true,
      notes: true
    }
  });

  const breakdown = [];

  // Map expenses fronted
  expensesPaid.forEach(e => {
    breakdown.push({
      type: 'expense_paid',
      id: e.id,
      date: e.expense_date,
      description: `Paid for: ${e.description}`,
      currency: e.currency,
      original_amount: Number(e.original_amount),
      exchange_rate: Number(e.exchange_rate),
      amount_base: Number(e.amount_base),
      split_type: e.split_type,
      change: Number(e.amount_base)
    });
  });

  // Map splits user owes
  userSplits.forEach(s => {
    const e = s.expense;
    breakdown.push({
      type: 'expense_split',
      id: e.id,
      date: e.expense_date,
      description: `Share of: ${e.description}`,
      currency: e.currency,
      original_amount: Number(e.original_amount),
      exchange_rate: Number(e.exchange_rate),
      amount_base: Number(e.amount_base),
      split_type: e.split_type,
      change: -Number(s.owed_amount)
    });
  });

  // Map settlements user sent
  settlementsPaid.forEach(s => {
    breakdown.push({
      type: 'settlement_paid',
      id: s.id,
      date: s.settled_at,
      description: s.notes || 'Settlement payment paid out',
      currency: s.currency,
      original_amount: s.original_amount ? Number(s.original_amount) : Number(s.amount_base),
      exchange_rate: Number(s.exchange_rate || 1),
      amount_base: Number(s.amount_base),
      split_type: null,
      change: Number(s.amount_base)
    });
  });

  // Map settlements user received
  settlementsReceived.forEach(s => {
    breakdown.push({
      type: 'settlement_received',
      id: s.id,
      date: s.settled_at,
      description: s.notes || 'Settlement payment received',
      currency: s.currency,
      original_amount: s.original_amount ? Number(s.original_amount) : Number(s.amount_base),
      exchange_rate: Number(s.exchange_rate || 1),
      amount_base: Number(s.amount_base),
      split_type: null,
      change: -Number(s.amount_base)
    });
  });

  // Sort ascending by date
  breakdown.sort((a, b) => new Date(a.date) - new Date(b.date));

  return breakdown;
}
