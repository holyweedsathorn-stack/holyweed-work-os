-- Guests who pay their hostel stay by direct bank wire (not cash at the
-- desk, not an OTA collecting it) show up in the bank statement as named
-- "Inward (XBSDT)" transfers -- e.g. "Transfer From Andrew Tjoe" -- with no
-- PromptPay QR and no OTA payout signature. There was previously no way to
-- record that at check-in (hostel_stays has payment_method but no amount
-- at all), so this income had nowhere to land except the raw bank ledger,
-- and no way to compare against it either.
--
-- This adds: an amount on hostel_stays, a 'bank_transfer' payment method
-- (mirrored onto hostel_stay_extensions too, so an extension paid by wire
-- can be tagged the same way), and a new bank_transactions category,
-- 'hostel_transfer', so these wires get their own comparison against
-- actual check-in records instead of being forced through the PromptPay
-- comparison pos_sale uses, which they were never part of.
--
-- Run in the Supabase SQL editor AFTER 0038_bank_reconciliation.sql.

alter table hostel_stays
  add column if not exists amount_thb numeric check (amount_thb is null or amount_thb >= 0);

alter table hostel_stays drop constraint if exists hostel_stays_payment_method_check;
alter table hostel_stays add constraint hostel_stays_payment_method_check check (
  payment_method in ('ota_collect', 'cash', 'bank_transfer')
);

alter table hostel_stay_extensions drop constraint if exists hostel_stay_extensions_payment_method_check;
alter table hostel_stay_extensions add constraint hostel_stay_extensions_payment_method_check check (
  payment_method in ('ota_collect', 'cash', 'bank_transfer')
);

alter table bank_transactions drop constraint if exists bank_transactions_category_check;
alter table bank_transactions add constraint bank_transactions_category_check check (
  category in ('uncategorized', 'pos_sale', 'ota_payout', 'other', 'hostel_transfer')
);
