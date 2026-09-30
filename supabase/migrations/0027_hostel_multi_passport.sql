-- A room can have more than one guest checking in together (or a passport
-- worth photographing on more than one page), so passport photos are now a
-- list rather than exactly one. Keep the old single-path column around
-- (nullable, unused going forward) rather than dropping it, so this stays
-- a safe re-run on a database that already has rows in it.

alter table hostel_stays add column if not exists passport_photo_paths text[];

update hostel_stays
set passport_photo_paths = array[passport_photo_path]
where passport_photo_paths is null and passport_photo_path is not null;

alter table hostel_stays alter column passport_photo_path drop not null;
