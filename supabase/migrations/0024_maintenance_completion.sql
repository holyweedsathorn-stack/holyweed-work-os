-- Maintenance completion: once a maintenance job is approved, the
-- maintenance team (Sithu, Naing Ye — flagged is_maintenance) mark it done
-- with a photo, right from their own clock screen. No new table — the
-- completion just closes out the same approvals row the request already
-- lives in. completed_by_name is denormalized text (like received_items'
-- employee_name), not a second FK to employees, so it never collides with
-- the existing requested_by -> employees embed used on the Approvals page.

alter table approvals add column if not exists completed_at timestamptz;
alter table approvals add column if not exists completed_by_name text;
alter table approvals add column if not exists completion_note text;
alter table approvals add column if not exists completion_photo_path text;

insert into storage.buckets (id, name, public)
values ('maintenance-photos', 'maintenance-photos', false)
on conflict (id) do nothing;
