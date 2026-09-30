-- The real channel list (from the Hoteliers.Guru channel manager) also
-- includes Expedia and Trip.com, which "other" was standing in for.

alter table hostel_stays drop constraint if exists hostel_stays_booking_source_check;
alter table hostel_stays add constraint hostel_stays_booking_source_check check (
  booking_source in (
    'booking_com', 'agoda', 'airbnb', 'hostelworld', 'expedia', 'trip_com', 'direct', 'other'
  )
);
