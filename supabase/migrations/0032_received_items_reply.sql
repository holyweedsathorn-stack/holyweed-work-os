-- Let a manager (or any staff) reply to a logged item -- most often a
-- manager answering a low-stock flag ("used the other strain instead"),
-- but the same field works for a received-item note too. One reply per
-- log entry, editable any time, same shape as the hostel stay notes.
alter table received_items add column if not exists reply text;
alter table received_items add column if not exists reply_by_name text;
alter table received_items add column if not exists reply_at timestamptz;
