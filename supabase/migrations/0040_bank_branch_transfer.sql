-- A customer who runs a tab (buys now, settles later in one lump sum by
-- bank transfer -- e.g. a regular dispensary customer, like the one
-- discussed for the 8 "Bilal Mohd" transfers) has no check-in record like
-- a hostel guest and no PromptPay record like a QR sale, so neither the
-- pos_sale nor the hostel_transfer comparison has anything to match it
-- against. This tags it as real revenue for the right branch without
-- forcing a match that doesn't exist -- shown as a running total per
-- branch/month instead of a day-by-day comparison.
--
-- Run in the Supabase SQL editor AFTER 0039_hostel_bank_transfer.sql.

alter table bank_transactions drop constraint if exists bank_transactions_category_check;
alter table bank_transactions add constraint bank_transactions_category_check check (
  category in ('uncategorized', 'pos_sale', 'ota_payout', 'other', 'hostel_transfer', 'branch_transfer')
);
