-- "Done" on a low-stock flag: marks that the shortage was actually handled
-- (the replacement strain went out, the reorder landed), separate from the
-- reply text -- a reply answers the flag, "Done" closes it. Works the same
-- way for a plain received-item log too, in case someone wants to mark one
-- as followed up on, even though the button is only surfaced for low_stock
-- in the UI today.

alter table received_items add column if not exists resolved_at timestamptz;
alter table received_items add column if not exists resolved_by_name text;
