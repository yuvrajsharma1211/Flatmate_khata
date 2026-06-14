# Design Decisions - CSV Import & Anomaly Handling

This document explains the rationale and engineering trade-offs made for the deliberate CSV anomalies encountered in `expenses_export.csv`.

---

## 1. Anomaly 1: Inconsistent Date Formats (Ambiguous "04/05/2026")
- **Where it appears**: Line 34, "Deep cleaning service", dated `04/05/2026`
- **Decision**: Flagged as `pending_approval`. We display both interpretations (5 April 2026 vs 4 May 2026) to the user.
- **Rationale**: 
  Chronologically, this row sits between a row on March 28 (line 33) and a row on April 1 (line 35). In DD/MM/YYYY formatting, `04/05/2026` is May 4th, which breaks chronological order. However, if the format was a typo for `05/04/2026` (5 April), it aligns perfectly in sequence. We propose 5 April but force a human approval check to avoid blind assumptions.

## 2. Anomaly 3: Inconsistent Member Names ("Priya S")
- **Where it appears**: Line 11, "Groceries DMart" paid by `Priya S`
- **Decision**: Map to user `Priya` and mark as `pending_approval`.
- **Rationale**:
  "Priya S" is likely Priya's full/alternate name. Instead of creating a new "Priya S" user profile (which would pollute the ledger with duplicates), we propose merging it with the existing `Priya`. However, because merging user identifiers alters balance distributions, Meera's safety requirement dictates this must be reviewed and approved by a group admin.

## 3. Anomaly 4: Exact Duplicate Expense (Marina Bites)
- **Where it appears**: Lines 5 and 6, "Dinner at Marina Bites" and "dinner - marina bites" (both ₹3200, paid by Dev, 2026-02-08)
- **Decision**: Propose keeping the first occurrence and voiding the second. Mark as `pending_approval`.
- **Rationale**:
  We flag duplication if two rows share the same date, payer, amount, currency, and have a description similarity above **80%** (via normalized case-insensitive similarity checks). To prevent duplicate charges, we propose discarding the second, but we wait for user approval in case they were indeed two separate identical payments.

## 4. Anomaly 5: Conflicting Duplicate (Thalassa)
- **Where it appears**: Lines 24 and 25, "Dinner at Thalassa" (Aisha, ₹2400) vs "Thalassa dinner" (Rohan, ₹2450) on 2026-03-11.
- **Decision**: Propose keeping Rohan's (₹2450) based on the note *"Aisha also logged this I think hers is wrong"*, and present both side-by-side. Mark as `pending_approval`.
- **Rationale**:
  The system detects description overlaps and matching dates but differing amounts/payers. We parse the note for clues (which points to Aisha's entry being incorrect) and propose Rohan's entry, but require human selection to confirm who actually paid what.

## 5. Anomaly 6: Missing Payer ("House cleaning supplies")
- **Where it appears**: Line 13, "House cleaning supplies" (₹780, paid_by is blank).
- **Decision**: Create as a `voided` expense pointing to an "Unassigned" placeholder user. Mark as `pending_approval`.
- **Rationale**:
  We cannot credit or debit balances without knowing the payer. Instead of guessing a payer (which could distort balances unfairly) or discarding the row (which ruins traceability), we store the row as voided under a dummy placeholder until the correct payer is selected.

## 6. Anomaly 8: Percentage Split Not Summing to 100% (Pizza Friday)
- **Where it appears**: Lines 15 and 32, total percentages sum to 110%.
- **Decision**: Normalize values proportionally to sum to 100% (e.g. `value / 110`), store original in `raw_value`, and mark as `auto_resolved` (but list prominently in report).
- **Rationale**:
  Using raw percentages totaling 110% would overcharge participants (the sum of splits would exceed the actual cost, creating a balance surplus). Proportional scaling preserves the relative weight intended by the flatmates while ensuring the exact expense total is distributed.

## 7. Anomaly 9: Fixed Foreign Currency Exchange Rate (USD)
- **Where it appears**: Lines 20, 21, 23, 26 (USD entries).
- **Decision**: Convert using the group settings exchange rate (`usd_to_inr_rate` = 83). Mark as `auto_resolved`.
- **Rationale**:
  While currency rates fluctuate daily, fetching historical rates via external APIs introduces network dependencies and potential synchronization failures. Using a single, group-tunable setting satisfies the requirement, keeps calculations predictable, and is easily adjustable.

## 8. Anomaly 10: Non-Member Guest Splits (Kabir in Parasailing)
- **Where it appears**: Line 23, "Parasailing" (includes "Dev's friend Kabir").
- **Decision**: Exclude Kabir, split the amount equally among the active members (Aisha, Rohan, Priya, Dev), and mark as `pending_approval`.
- **Rationale**:
  Kabir is not a flatmate and has no balance record. By excluding Kabir, the group collectively absorbs his share (increasing each member's share from 1/5 to 1/4). An alternative would be making Dev (who invited him) absorb Kabir's 1/5 share. We propose the collective absorption but require approval since it increases what other members owe.

## 9. Anomaly 11: Negative Amounts (Refunds)
- **Where it appears**: Line 26, "Parasailing refund" (-₹30 USD).
- **Decision**: Process as a normal expense with a negative `amount_base`. Mark as `auto_resolved`.
- **Rationale**:
  A negative expense flows through the split calculations, generating negative owed shares. This effectively credits the participants' accounts, offsetting the original transaction cost. It is a genuine refund rather than a data entry error.

## 10. Anomaly 14: Departed Member Split (Meera on April 2)
- **Where it appears**: Line 36, "Groceries BigBasket" on April 2 (lists Meera who left March 31).
- **Decision**: Exclude Meera, split her share among the active members on that date (Aisha, Rohan, Priya), and mark as `pending_approval`.
- **Rationale**:
  Since Meera was no longer living in the flat on April 2, she cannot be charged for groceries. The system automatically excludes her and redistributes her share among the active flatmates, but holds it for approval to ensure they verify the date and split adjustment.
