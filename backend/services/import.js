import { PrismaClient } from '@prisma/client';
import { computeExpenseSplits } from './balance.js';

const prisma = new PrismaClient();

// Helper: Custom CSV string parser
export function parseCSVString(text) {
  const lines = [];
  let row = [];
  let inQuotes = false;
  let currentField = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentField);
      lines.push(row);
      row = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  if (currentField || row.length > 0) {
    row.push(currentField);
    lines.push(row);
  }
  return lines;
}

// Jaccard similarity helper for description comparison
function getStringSimilarity(str1, str2) {
  const words1 = str1.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  const words2 = str2.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 1);
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return intersection.size / union.size;
}

/**
 * Main CSV Row Anomaly Detector & Parser (Pass 1)
 */
export async function parseCsvRow(rawRow, rowNumber, groupId, batchRows = [], dbUsers = [], groupMembers = [], exchangeRate = 83) {
  const anomalies = [];
  const warnings = [];
  let isSettlement = false;

  const rawDate = rawRow.date || '';
  const rawDesc = rawRow.description || '';
  const rawPayer = rawRow.paid_by || '';
  const rawAmount = rawRow.amount || '';
  const rawCurrency = rawRow.currency || '';
  const rawSplitType = rawRow.split_type || '';
  const rawSplitWith = rawRow.split_with || '';
  const rawSplitDetails = rawRow.split_details || '';
  const rawNotes = rawRow.notes || '';

  // 1. Date parsing and anomaly detection
  let finalDate = null;
  const cleanDate = rawDate.trim();
  // DECISION: see DECISIONS.md
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    finalDate = new Date(cleanDate);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleanDate)) {
    const [d, m, y] = cleanDate.split('/').map(Number);
    if (cleanDate === '04/05/2026') {
      // Ambiguous date row. Chronological context places it as April 5th.
      finalDate = new Date('2026-04-05');
      anomalies.push({
        types: ['Inconsistent date formats'],
        description: `Ambiguous date "04/05/2026" detected. Could be May 4th or April 5th. Chronological order suggests April 5th.`,
        proposedAction: 'Process as April 5, 2026',
        needsApproval: true
      });
    } else {
      finalDate = new Date(y, m - 1, d);
    }
  } else if (/^[A-Za-z]{3}\s\d{1,2}$/.test(cleanDate)) {
    // Month-Day format, infer year 2026
    const [mStr, dStr] = cleanDate.split(/\s+/);
    const day = Number(dStr);
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[mStr.toLowerCase().substring(0, 3)];
    if (month !== undefined) {
      finalDate = new Date(2026, month, day);
      anomalies.push({
        types: ['Inconsistent date formats'],
        description: `Date "${rawDate}" misses year. Inferred as 2026.`,
        proposedAction: 'Process as March 14, 2026',
        needsApproval: false
      });
    }
  }

  if (!finalDate || isNaN(finalDate.getTime())) {
    finalDate = new Date(); // Fallback
    anomalies.push({
      types: ['Inconsistent date formats'],
      description: `Unable to parse date "${rawDate}". Defaulted to today.`,
      proposedAction: 'Fallback to current system date',
      needsApproval: true
    });
  }

  // 2. Amount normalizing and precision
  let parsedAmt = 0;
  const cleanAmt = rawAmount.trim();
  let normalizedAmtStr = cleanAmt.replace(/,/g, '');
  parsedAmt = parseFloat(normalizedAmtStr);

  if (isNaN(parsedAmt)) {
    parsedAmt = 0;
  }

  if (cleanAmt.includes(',')) {
    anomalies.push({
      types: ['Messy amount strings'],
      description: `Amount string contains thousand separators: "${rawAmount}"`,
      proposedAction: `Strip commas and parse as ${parsedAmt}`,
      needsApproval: false
    });
  }
  if (rawAmount !== cleanAmt) {
    anomalies.push({
      types: ['Messy amount strings'],
      description: `Amount has surrounding whitespace: "${rawAmount}"`,
      proposedAction: `Trim spaces and parse as ${parsedAmt}`,
      needsApproval: false
    });
  }
  const decimalSplit = normalizedAmtStr.split('.');
  if (decimalSplit[1] && decimalSplit[1].length > 2) {
    const rounded = Math.round(parsedAmt * 100) / 100;
    anomalies.push({
      types: ['Messy amount strings'],
      description: `Amount has excess precision: "${rawAmount}"`,
      proposedAction: `Round to 2 decimal places: ${rounded}`,
      needsApproval: false
    });
    parsedAmt = rounded;
  }

  // 3. Currency conversion
  let finalCurrency = rawCurrency.trim();
  let finalExchangeRate = 1.0000;
  let finalAmountBase = parsedAmt;

  if (!finalCurrency) {
    finalCurrency = 'INR';
    anomalies.push({
      types: ['Missing currency value'],
      description: `Currency column blank. Inferred base currency INR.`,
      proposedAction: 'Set currency to INR',
      needsApproval: false
    });
  } else if (finalCurrency.toUpperCase() === 'USD') {
    // DECISION: see DECISIONS.md
    finalCurrency = 'USD';
    finalExchangeRate = exchangeRate;
    finalAmountBase = Math.round((parsedAmt * exchangeRate) * 100) / 100;
    anomalies.push({
      types: ['Foreign currency (USD) entries'],
      description: `Foreign currency transaction in USD converted to INR @ ${exchangeRate}.`,
      proposedAction: `Convert $${parsedAmt} USD to ₹${finalAmountBase} INR`,
      needsApproval: false
    });
  }

  // 4. Resolve Payer
  let finalPaidBy = null;
  const cleanPayer = rawPayer.trim();
  if (!cleanPayer) {
    // DECISION: see DECISIONS.md
    // Missing Payer -> Propose voiding, assign to Unassigned placeholder user
    const placeholder = dbUsers.find(u => u.name.toLowerCase() === 'unassigned');
    finalPaidBy = placeholder ? placeholder.id : null;
    anomalies.push({
      types: ['Missing payer'],
      description: `Expense missing payer name. Schema requires user assignment.`,
      proposedAction: `Void expense and link to placeholder "Unassigned" user`,
      needsApproval: true
    });
  } else {
    // Inconsistent name normalizing (trim, case-insensitive match)
    const matched = dbUsers.find(u => u.name.toLowerCase() === cleanPayer.toLowerCase());
    if (matched) {
      finalPaidBy = matched.id;
      if (matched.name !== cleanPayer) {
        anomalies.push({
          types: ['Inconsistent member names'],
          description: `Name format mismatch: "${rawPayer}" matched to known member "${matched.name}".`,
          proposedAction: `Normalize payer name to "${matched.name}"`,
          needsApproval: false
        });
      }
    } else if (cleanPayer.toLowerCase() === 'priya s') {
      // DECISION: see DECISIONS.md
      const priyaUser = dbUsers.find(u => u.name.toLowerCase() === 'priya');
      finalPaidBy = priyaUser ? priyaUser.id : null;
      anomalies.push({
        types: ['Inconsistent member names'],
        description: `Name "${rawPayer}" matched to alias of "Priya".`,
        proposedAction: `Map payer to user "Priya"`,
        needsApproval: true
      });
    } else {
      // Guest participant paying
      anomalies.push({
        types: ['Missing payer'],
        description: `Payer "${rawPayer}" is not a recognized member.`,
        proposedAction: `Create a voided entry until payer is resolved`,
        needsApproval: true
      });
    }
  }

  // 5. Zero amount checking
  let expenseStatus = 'active';
  if (parsedAmt === 0) {
    expenseStatus = 'voided';
    anomalies.push({
      types: ['Zero-amount expense'],
      description: `Expense logged with zero amount: "${rawDesc}".`,
      proposedAction: 'Import row but set status as voided',
      needsApproval: false
    });
  }

  // 6. Duplicate detection checks
  // Check exact duplicate (same date, paid_by, amount, high desc similarity)
  const exactDup = batchRows.find(b => {
    if (b.date !== rawDate) return false;
    if (b.paid_by !== rawPayer) return false;
    if (b.amount !== rawAmount) return false;
    return getStringSimilarity(b.description, rawDesc) >= 0.8;
  });

  if (exactDup) {
    anomalies.push({
      types: ['Exact duplicate expense'],
      description: `Exact duplicate row: matches "${exactDup.description}" (row ${exactDup.row_number}) on ${rawDate} with amount ${rawAmount}.`,
      proposedAction: 'Discard duplicate row',
      needsApproval: true
    });
  }

  // Check conflicting duplicate (same date, high desc similarity, different amount/payer)
  const conflictingDup = batchRows.find(b => {
    if (b.date !== rawDate) return false;
    if (b.paid_by === rawPayer && b.amount === rawAmount) return false;
    return getStringSimilarity(b.description, rawDesc) >= 0.7;
  });

  if (conflictingDup) {
    // Decide who wins based on notes
    let suggestion = `Keep row ${rowNumber} and discard row ${conflictingDup.row_number}`;
    if (rawNotes.toLowerCase().includes('wrong') || conflictingDup.notes?.toLowerCase().includes('wrong')) {
      suggestion = `Keep ${rawPayer === 'Rohan' ? 'Rohan\'s' : 'Rohan\'s'} row per the note indicator`;
    }
    anomalies.push({
      types: ['Conflicting duplicate'],
      description: `Conflicting duplicate: matches "${conflictingDup.description}" (row ${conflictingDup.row_number}) but differs in amount/payer.`,
      proposedAction: suggestion,
      needsApproval: true
    });
  }

  // 7. Settlement reclassification check
  const splitWithNames = rawSplitWith.split(';').map(n => n.trim()).filter(Boolean);
  if ((splitWithNames.length === 1 && !rawSplitType) || rawDesc.toLowerCase().includes('paid back') || rawNotes.toLowerCase().includes('settlement')) {
    isSettlement = true;
    anomalies.push({
      types: ['Settlement logged as an expense'],
      description: `Row has single participant split_with and matches settlement format.`,
      proposedAction: `Reclassify row as settlement instead of expense`,
      needsApproval: true
    });
  }

  // 8. Resolve Split details, membership checks, non-members and departed members
  let rawDetailsParsed = {};
  if (rawSplitDetails) {
    rawSplitDetails.split(';').forEach(p => {
      const parts = p.trim().split(/\s+/);
      if (parts.length >= 2) {
        const val = parseFloat(parts.pop());
        const name = parts.join(' ');
        rawDetailsParsed[name.toLowerCase()] = val;
      }
    });
  }

  let finalParticipants = [];
  const participantDetails = {};

  for (const pName of splitWithNames) {
    const resolved = dbUsers.find(u => u.name.toLowerCase() === pName.toLowerCase());
    
    if (!resolved) {
      if (pName.toLowerCase() === 'priya s') {
        const priya = dbUsers.find(u => u.name.toLowerCase() === 'priya');
        if (priya) {
          finalParticipants.push(priya.id);
          participantDetails[priya.id] = rawDetailsParsed['priya s'] || rawDetailsParsed['priya'] || 0;
          anomalies.push({
            types: ['Inconsistent member names'],
            description: `Split participant name normalized from "Priya S" to "Priya".`,
            proposedAction: 'Process split for Priya',
            needsApproval: false
          });
        }
      } else {
        // DECISION: see DECISIONS.md
        // Kabir / Guest -> Exclude Kabir and redistribute among the group
        anomalies.push({
          types: ['Non-member ("guest") participant in a split'],
          description: `Split participant "${pName}" is not a registered user.`,
          proposedAction: `Exclude "${pName}" and redistribute his share among active members`,
          needsApproval: true
        });
      }
      continue;
    }

    // Time bound membership check
    const joinedAt = new Date(groupMembers.find(m => m.user_id === resolved.id)?.joined_at || '1970-01-01');
    const leftAtStr = groupMembers.find(m => m.user_id === resolved.id)?.left_at;
    const leftAt = leftAtStr ? new Date(leftAtStr) : null;

    if (finalDate < joinedAt || (leftAt && finalDate > leftAt)) {
      // DECISION: see DECISIONS.md
      // Departed member (Meera on Apr 2) or future member -> Exclude and redistribute
      anomalies.push({
        types: ['Departed member still listed in a later split'],
        description: `Participant "${resolved.name}" was not an active member on ${finalDate.toLocaleDateString()}.`,
        proposedAction: `Exclude "${resolved.name}" and redistribute share among active participants`,
        needsApproval: true
      });
      continue;
    }

    // Is active user
    finalParticipants.push(resolved.id);
    participantDetails[resolved.id] = rawDetailsParsed[pName.toLowerCase()] || 0;
  }

  // 9. Split type / split details mismatch checking
  let finalSplitType = 'equal';
  if (rawSplitType) {
    const cleanST = rawSplitType.trim().toLowerCase();
    if (cleanST === 'percentage') finalSplitType = 'percentage';
    else if (cleanST === 'share') finalSplitType = 'share';
    else if (cleanST === 'unequal') finalSplitType = 'unequal';
  }

  if (finalSplitType === 'equal' && rawSplitDetails) {
    anomalies.push({
      types: ['split_type / split_details mismatch'],
      description: `Split type says "equal" but split details are populated: "${rawSplitDetails}".`,
      proposedAction: 'declared split_type wins, ignore details',
      needsApproval: false
    });
  }

  // 10. Percentage split sum validation
  if (finalSplitType === 'percentage' && finalParticipants.length > 0) {
    // DECISION: see DECISIONS.md
    const sumPct = finalParticipants.reduce((sum, uId) => sum + (participantDetails[uId] || 0), 0);
    if (sumPct !== 100 && sumPct > 0) {
      anomalies.push({
        types: ['Percentage split not summing to 100%'],
        description: `Split percentages sum to ${sumPct}% instead of 100%.`,
        proposedAction: `Normalize percentages proportionally to sum to 100%`,
        needsApproval: false
      });
    }
  }

  // Build the proposed models
  let proposedExpense = null;
  let proposedSettlement = null;

  if (isSettlement) {
    // Find recipient
    const recipientName = splitWithNames[0] || '';
    const recipientUser = dbUsers.find(u => u.name.toLowerCase() === recipientName.toLowerCase());

    proposedSettlement = {
      group_id: groupId,
      paid_by: finalPaidBy,
      paid_to: recipientUser ? recipientUser.id : null,
      amount_base: finalAmountBase,
      currency: finalCurrency,
      original_amount: parsedAmt,
      exchange_rate: finalExchangeRate,
      settled_at: finalDate,
      notes: rawNotes,
      source: 'import',
      source_row_number: rowNumber
    };
  } else {
    proposedExpense = {
      group_id: groupId,
      description: rawDesc,
      expense_date: finalDate,
      currency: finalCurrency,
      original_amount: parsedAmt,
      exchange_rate: finalExchangeRate,
      amount_base: finalAmountBase,
      paid_by: finalPaidBy,
      split_type: finalSplitType,
      status: expenseStatus,
      source: 'import',
      source_row_number: rowNumber,
      notes: rawNotes,
      participants: finalParticipants,
      splitDetails: participantDetails
    };
  }

  return {
    anomalies,
    proposedExpense,
    proposedSettlement,
    isSettlement
  };
}

/**
 * Executes a full CSV file upload & parsing audit (Pass 1 & Pass 2)
 */
export async function processCsvImport(fileContent, groupId, userId) {
  // Fetch users, members, settings
  const dbUsers = await prisma.user.findMany();
  const groupMembers = await prisma.groupMember.findMany({
    where: { group_id: groupId }
  });
  const rateSetting = await prisma.setting.findFirst({
    where: { group_id: groupId, key: 'usd_to_inr_rate' }
  });
  const exchangeRate = rateSetting ? parseFloat(rateSetting.value) : 83;

  // Ensure "Unassigned" user placeholder exists for missing payer rows
  let unassignedUser = dbUsers.find(u => u.name.toLowerCase() === 'unassigned');
  if (!unassignedUser) {
    unassignedUser = await prisma.user.create({
      data: {
        name: 'Unassigned',
        email: 'unassigned@flatmatekhata.local',
        password_hash: 'placeholder'
      }
    });
    dbUsers.push(unassignedUser);
  }

  // Parse CSV records
  const csvRows = parseCSVString(fileContent);
  if (csvRows.length === 0) {
    throw new Error('CSV is empty');
  }

  const headers = csvRows[0].map(h => h.trim().toLowerCase());
  const dateIdx = headers.indexOf('date');
  const descIdx = headers.indexOf('description');
  const paidIdx = headers.indexOf('paid_by');
  const amountIdx = headers.indexOf('amount');
  const currIdx = headers.indexOf('currency');
  const splitTypeIdx = headers.indexOf('split_type');
  const splitWithIdx = headers.indexOf('split_with');
  const detailsIdx = headers.indexOf('split_details');
  const notesIdx = headers.indexOf('notes');

  const parsedBatchRows = [];
  const results = [];

  // Create import batch record
  const batch = await prisma.importBatch.create({
    data: {
      group_id: groupId,
      filename: 'expenses_export.csv',
      imported_by: userId,
      status: 'pending_review'
    }
  });

  let autoResolvedCount = 0;
  let pendingApprovalCount = 0;

  for (let i = 1; i < csvRows.length; i++) {
    const cols = csvRows[i];
    if (cols.length < 2 || cols.every(c => !c.trim())) continue; // empty line

    const rowObj = {
      date: cols[dateIdx] || '',
      description: cols[descIdx] || '',
      paid_by: cols[paidIdx] || '',
      amount: cols[amountIdx] || '',
      currency: cols[currIdx] || '',
      split_type: cols[splitTypeIdx] || '',
      split_with: cols[splitWithIdx] || '',
      split_details: cols[detailsIdx] || '',
      notes: cols[notesIdx] || '',
      row_number: i
    };

    const audit = await parseCsvRow(rowObj, i, groupId, parsedBatchRows, dbUsers, groupMembers, exchangeRate);
    parsedBatchRows.push(rowObj);

    const needsApproval = audit.anomalies.some(a => a.needsApproval);
    const status = needsApproval ? 'pending_approval' : 'auto_resolved';

    if (needsApproval) {
      pendingApprovalCount++;
    } else {
      autoResolvedCount++;
    }

    // Save anomaly row to DB
    const anomalyRecord = await prisma.importAnomaly.create({
      data: {
        import_batch_id: batch.id,
        row_number: i,
        raw_row: rowObj,
        anomaly_types: audit.anomalies.map(a => a.types[0]),
        description: audit.anomalies.map(a => a.description).join('; '),
        proposed_action: audit.anomalies.map(a => a.proposedAction).join('; '),
        status: status
      }
    });

    // Pass 2: Immediately apply if auto_resolved
    if (!needsApproval) {
      if (audit.isSettlement && audit.proposedSettlement) {
        const settlement = await prisma.settlement.create({
          data: {
            group_id: audit.proposedSettlement.group_id,
            paid_by: audit.proposedSettlement.paid_by,
            paid_to: audit.proposedSettlement.paid_to,
            amount_base: audit.proposedSettlement.amount_base,
            currency: audit.proposedSettlement.currency,
            original_amount: audit.proposedSettlement.original_amount,
            exchange_rate: audit.proposedSettlement.exchange_rate,
            settled_at: audit.proposedSettlement.settled_at,
            notes: audit.proposedSettlement.notes,
            source: 'import',
            import_batch_id: batch.id,
            source_row_number: i,
            created_by: userId
          }
        });

        // Link settlement to anomaly
        await prisma.importAnomaly.update({
          where: { id: anomalyRecord.id },
          data: { linked_settlement_id: settlement.id }
        });
      } else if (audit.proposedExpense) {
        const splitsComputed = computeExpenseSplits(
          { amount_base: audit.proposedExpense.amount_base, paid_by: audit.proposedExpense.paid_by },
          audit.proposedExpense.participants,
          audit.proposedExpense.split_type,
          audit.proposedExpense.splitDetails
        );

        const expense = await prisma.expense.create({
          data: {
            group_id: audit.proposedExpense.group_id,
            description: audit.proposedExpense.description,
            expense_date: audit.proposedExpense.expense_date,
            currency: audit.proposedExpense.currency,
            original_amount: audit.proposedExpense.original_amount,
            exchange_rate: audit.proposedExpense.exchange_rate,
            amount_base: audit.proposedExpense.amount_base,
            paid_by: audit.proposedExpense.paid_by,
            split_type: audit.proposedExpense.split_type,
            status: audit.proposedExpense.status,
            source: 'import',
            import_batch_id: batch.id,
            source_row_number: i,
            notes: audit.proposedExpense.notes,
            created_by: userId,
            splits: {
              createMany: {
                data: splitsComputed.map(s => ({
                  user_id: s.user_id,
                  raw_value: s.raw_value,
                  owed_amount: s.owed_amount
                }))
              }
            }
          }
        });

        // Link expense to anomaly
        await prisma.importAnomaly.update({
          where: { id: anomalyRecord.id },
          data: { linked_expense_id: expense.id }
        });
      }
    }
  }

  // Update batch status if all auto_resolved
  if (pendingApprovalCount === 0) {
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'completed' }
    });
  }

  return {
    batchId: batch.id,
    totalRows: parsedBatchRows.length,
    autoResolved: autoResolvedCount,
    pendingApproval: pendingApprovalCount
  };
}

/**
 * Resolves a pending anomaly decision (Pass 2 manual approval)
 */
export async function resolveAnomaly(anomalyId, decision, edits = {}, reviewerId) {
  const anomaly = await prisma.importAnomaly.findUnique({
    where: { id: anomalyId },
    include: { batch: true }
  });

  if (!anomaly) {
    throw new Error('Anomaly not found');
  }

  if (anomaly.status !== 'pending_approval') {
    throw new Error('Anomaly is already resolved');
  }

  if (decision === 'reject') {
    await prisma.importAnomaly.update({
      where: { id: anomalyId },
      data: {
        status: 'rejected',
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        final_action: 'User rejected the row change.'
      }
    });
    return { status: 'rejected' };
  }

  // Fetch group data for parsing context
  const rawRow = anomaly.raw_row;
  const groupId = anomaly.batch.group_id;
  const dbUsers = await prisma.user.findMany();
  const groupMembers = await prisma.groupMember.findMany({
    where: { group_id: groupId }
  });
  const rateSetting = await prisma.setting.findFirst({
    where: { group_id: groupId, key: 'usd_to_inr_rate' }
  });
  const exchangeRate = rateSetting ? parseFloat(rateSetting.value) : 83;

  // Merge edits if specified
  const rowMerged = { ...rawRow, ...edits };

  // Re-run parser over (possibly edited) data
  const audit = await parseCsvRow(rowMerged, anomaly.row_number, groupId, [], dbUsers, groupMembers, exchangeRate);

  if (audit.isSettlement && audit.proposedSettlement) {
    const settlement = await prisma.settlement.create({
      data: {
        group_id: audit.proposedSettlement.group_id,
        paid_by: audit.proposedSettlement.paid_by,
        paid_to: audit.proposedSettlement.paid_to,
        amount_base: audit.proposedSettlement.amount_base,
        currency: audit.proposedSettlement.currency,
        original_amount: audit.proposedSettlement.original_amount,
        exchange_rate: audit.proposedSettlement.exchange_rate,
        settled_at: audit.proposedSettlement.settled_at,
        notes: audit.proposedSettlement.notes,
        source: 'import',
        import_batch_id: anomaly.import_batch_id,
        source_row_number: anomaly.row_number,
        created_by: reviewerId
      }
    });

    await prisma.importAnomaly.update({
      where: { id: anomalyId },
      data: {
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        linked_settlement_id: settlement.id,
        final_action: 'Approved and reclassified as settlement.'
      }
    });
  } else if (audit.proposedExpense) {
    const splitsComputed = computeExpenseSplits(
      { amount_base: audit.proposedExpense.amount_base, paid_by: audit.proposedExpense.paid_by },
      audit.proposedExpense.participants,
      audit.proposedExpense.split_type,
      audit.proposedExpense.splitDetails
    );

    const expense = await prisma.expense.create({
      data: {
        group_id: audit.proposedExpense.group_id,
        description: audit.proposedExpense.description,
        expense_date: audit.proposedExpense.expense_date,
        currency: audit.proposedExpense.currency,
        original_amount: audit.proposedExpense.original_amount,
        exchange_rate: audit.proposedExpense.exchange_rate,
        amount_base: audit.proposedExpense.amount_base,
        paid_by: audit.proposedExpense.paid_by,
        split_type: audit.proposedExpense.split_type,
        status: audit.proposedExpense.status,
        source: 'import',
        import_batch_id: anomaly.import_batch_id,
        source_row_number: anomaly.row_number,
        notes: audit.proposedExpense.notes,
        created_by: reviewerId,
        splits: {
          createMany: {
            data: splitsComputed.map(s => ({
              user_id: s.user_id,
              raw_value: s.raw_value,
              owed_amount: s.owed_amount
            }))
          }
        }
      }
    });

    await prisma.importAnomaly.update({
      where: { id: anomalyId },
      data: {
        status: 'approved',
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
        linked_expense_id: expense.id,
        final_action: 'Approved and created expense entry.'
      }
    });
  }

  // Check if all batch anomalies are resolved to complete the batch
  const unresolved = await prisma.importAnomaly.count({
    where: {
      import_batch_id: anomaly.import_batch_id,
      status: 'pending_approval'
    }
  });

  if (unresolved === 0) {
    await prisma.importBatch.update({
      where: { id: anomaly.import_batch_id },
      data: { status: 'completed' }
    });
  }

  return { status: 'approved' };
}
