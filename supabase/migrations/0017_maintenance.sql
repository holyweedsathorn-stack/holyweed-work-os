-- Maintenance requests: a new approval kind staff raise ("AC not cooling",
-- "leak in the kitchen"), and a way to flag which app_users are the
-- maintenance team so notify() can reach them once the request is approved.
--
-- Flow: staff raises a 'maintenance' request -> owners/managers are notified
-- immediately (existing approval_raised path, no change needed) -> once a
-- manager approves it, the maintenance team is pushed a 'maintenance_assigned'
-- notification with the request's own title as the body.

alter table approvals drop constraint approvals_kind_check;
alter table approvals add constraint approvals_kind_check check (kind in (
  'shift_swap', 'leave', 'expense', 'discount', 'write_off', 'other', 'maintenance'
));

alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_reminder', 'clock_out_reminder', 'task_assigned', 'approval_raised',
  'approval_decided', 'announcement', 'maintenance_assigned'
));

alter table app_users add column if not exists is_maintenance boolean not null default false;

-- Flag Sithu and Naing Ye as the maintenance team, matched by name. After
-- running this, check it caught exactly the right two rows:
--   select id, full_name, role, is_maintenance from app_users where is_maintenance;
-- If it missed someone or caught an extra, fix it by hand with:
--   update app_users set is_maintenance = true  where full_name = '<exact name>';
--   update app_users set is_maintenance = false where full_name = '<exact name>';
update app_users set is_maintenance = true
where full_name ilike '%sithu%' or full_name ilike '%naing ye%';
