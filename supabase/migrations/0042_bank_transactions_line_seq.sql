-- Krungthai's statement only prints minute-level timestamps (no seconds),
-- and a single statement upload writes every one of its transactions in
-- one batch -- so when two transactions land in the exact same printed
-- minute (common: a busy day can have hundreds of PromptPay deposits),
-- the database's own created_at is IDENTICAL for every row in that import
-- and gives the reconciliation page nothing reliable to break the tie
-- with. That let two same-minute rows get stored in the opposite order
-- from how they actually posted, which then tripped the ledger's
-- running-balance "Gap: unexplained" check even though every baht was
-- actually accounted for -- a false alarm, confirmed against a real
-- statement on 29 Jul 2026.
--
-- line_seq preserves the exact order transactions appear in the PDF
-- itself (which Krungthai always prints in true chronological order),
-- so same-minute ties sort correctly regardless of database insert
-- timing. Set by the app at import time -- see importStatement() in
-- reconciliation/actions.ts -- starting after the highest line_seq
-- already stored for that bank account, so multiple uploads still stack
-- in upload order.
--
-- Existing rows keep line_seq = null; this only fixes ordering for
-- transactions imported from here on, since already-stored rows can't be
-- safely reordered after the fact. Re-upload your statement after running
-- this to get the corrected ordering.

alter table bank_transactions add column if not exists line_seq integer;

create index if not exists bank_transactions_line_seq_idx
  on bank_transactions (bank_account_id, line_seq);
