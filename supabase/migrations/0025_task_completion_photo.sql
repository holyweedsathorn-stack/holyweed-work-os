-- Photo proof for one-off tasks: when staff mark a task done, they attach a
-- photo (plus an optional note) showing the finished work — same idea as
-- the maintenance completion flow, applied to the existing `tasks` table
-- instead of `approvals`.

alter table tasks add column if not exists completion_photo_path text;
alter table tasks add column if not exists completion_note text;

insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', false)
on conflict (id) do nothing;
