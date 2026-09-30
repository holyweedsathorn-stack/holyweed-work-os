-- Fold "low stock" photos into the same received_items log as delivery
-- photos, rather than building a second table/page for it. A `type` column
-- is all that distinguishes them — same private bucket, same admin-client +
-- requireEmployee() write path, same manager gallery.

alter table received_items add column if not exists type text not null default 'received';

alter table received_items drop constraint if exists received_items_type_check;
alter table received_items add constraint received_items_type_check
  check (type in ('received', 'low_stock'));

create index if not exists received_items_type_idx
  on received_items (org_id, type, created_at desc);
