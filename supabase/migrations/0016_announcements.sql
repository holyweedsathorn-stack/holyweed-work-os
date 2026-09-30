-- Adds the 'announcement' kind to notifications (migration 0015), so an
-- owner/manager can push a message to every app_user in the org — staff,
-- managers and owners alike — not just the one recipient the other four
-- kinds target.

alter table notifications drop constraint notifications_kind_check;

alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_reminder', 'clock_out_reminder', 'task_assigned', 'approval_raised',
  'approval_decided', 'announcement'
));
