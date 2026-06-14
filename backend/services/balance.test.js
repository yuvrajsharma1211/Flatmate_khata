import test from 'node:test';
import assert from 'node:assert';
import { computeExpenseSplits } from './balance.js';

test('computeExpenseSplits - Equal Split (without remainder)', () => {
  const expense = { amount_base: 90, paid_by: 1 };
  const participants = [1, 2, 3];
  
  const result = computeExpenseSplits(expense, participants, 'equal', {}, 'remainder_to_payer');
  
  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].user_id, 1);
  assert.strictEqual(result[0].owed_amount, 30);
  assert.strictEqual(result[1].owed_amount, 30);
  assert.strictEqual(result[2].owed_amount, 30);
});

test('computeExpenseSplits - Equal Split (with remainder, remainder_to_payer)', () => {
  const expense = { amount_base: 100, paid_by: 1 };
  const participants = [1, 2, 3];
  
  const result = computeExpenseSplits(expense, participants, 'equal', {}, 'remainder_to_payer');
  
  // 100 / 3 = 33.33 each. Sum is 99.99. Remainder is 0.01.
  // Payer (user_id: 1) should get the extra 0.01.
  assert.strictEqual(result.length, 3);
  
  const payerShare = result.find(s => s.user_id === 1);
  const otherShare1 = result.find(s => s.user_id === 2);
  const otherShare2 = result.find(s => s.user_id === 3);

  assert.strictEqual(payerShare.owed_amount, 33.34);
  assert.strictEqual(otherShare1.owed_amount, 33.33);
  assert.strictEqual(otherShare2.owed_amount, 33.33);

  const totalOwed = result.reduce((sum, s) => sum + s.owed_amount, 0);
  assert.strictEqual(totalOwed, 100);
});

test('computeExpenseSplits - Unequal Split', () => {
  const expense = { amount_base: 150.50, paid_by: 1 };
  const participants = [1, 2];
  const splitDetails = { 1: 50.50, 2: 100 };

  const result = computeExpenseSplits(expense, participants, 'unequal', splitDetails);

  assert.strictEqual(result.length, 2);
  assert.strictEqual(result.find(s => s.user_id === 1).owed_amount, 50.50);
  assert.strictEqual(result.find(s => s.user_id === 2).owed_amount, 100);
});

test('computeExpenseSplits - Percentage Split (exactly 100%)', () => {
  const expense = { amount_base: 200, paid_by: 2 };
  const participants = [1, 2];
  const splitDetails = { 1: 60, 2: 40 };

  const result = computeExpenseSplits(expense, participants, 'percentage', splitDetails);

  assert.strictEqual(result.length, 2);
  assert.strictEqual(result.find(s => s.user_id === 1).owed_amount, 120);
  assert.strictEqual(result.find(s => s.user_id === 2).owed_amount, 80);
});

test('computeExpenseSplits - Percentage Split (not 100%, sums to 90%, scaling applied)', () => {
  const expense = { amount_base: 100, paid_by: 1 };
  const participants = [1, 2];
  // 60% and 30% -> total 90%. They should scale to 66.67% and 33.33% respectively.
  const splitDetails = { 1: 60, 2: 30 };

  const result = computeExpenseSplits(expense, participants, 'percentage', splitDetails, 'remainder_to_payer');

  assert.strictEqual(result.length, 2);
  assert.strictEqual(result.find(s => s.user_id === 1).owed_amount, 66.67);
  assert.strictEqual(result.find(s => s.user_id === 2).owed_amount, 33.33);
});

test('computeExpenseSplits - Share Split', () => {
  const expense = { amount_base: 150, paid_by: 1 };
  const participants = [1, 2, 3];
  // Share count: 2 shares, 2 shares, 1 share -> total 5 shares.
  // User 1 gets: 2/5 * 150 = 60
  // User 2 gets: 2/5 * 150 = 60
  // User 3 gets: 1/5 * 150 = 30
  const splitDetails = { 1: 2, 2: 2, 3: 1 };

  const result = computeExpenseSplits(expense, participants, 'share', splitDetails);

  assert.strictEqual(result.length, 3);
  assert.strictEqual(result.find(s => s.user_id === 1).owed_amount, 60);
  assert.strictEqual(result.find(s => s.user_id === 2).owed_amount, 60);
  assert.strictEqual(result.find(s => s.user_id === 3).owed_amount, 30);
});
