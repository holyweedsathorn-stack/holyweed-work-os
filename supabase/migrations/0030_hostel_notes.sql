-- Shared note on a hostel stay: "has a dog", "late arrival ~11pm", any
-- guest request or fact both staff and management need to see. Editable
-- any time by whoever's at the desk (or a manager), not just at check-in.
alter table hostel_stays add column if not exists notes text;
alter table hostel_stays add column if not exists notes_updated_by text;
alter table hostel_stays add column if not exists notes_updated_at timestamptz;
