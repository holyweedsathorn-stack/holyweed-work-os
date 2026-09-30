-- A planned/expected checkout date, picked at check-in time — separate
-- from checked_out_at, which only gets set once staff actually tap
-- "Check out" when the guest leaves. This is just what was booked/expected,
-- so the desk can see who's due out soon without it forcing anything.

alter table hostel_stays add column if not exists expected_checkout_date date;
