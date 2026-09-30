-- Optional photo on a staff request -- a receipt for an expense, a
-- screenshot of a schedule clash for a shift swap, whatever backs it up.
-- Separate from completion_photo_path (0017), which is proof a maintenance
-- job got DONE after approval; this one is attached by the requester up
-- front, before anyone has decided anything.

alter table approvals add column if not exists request_photo_path text;

insert into storage.buckets (id, name, public)
values ('approval-photos', 'approval-photos', false)
on conflict (id) do nothing;
