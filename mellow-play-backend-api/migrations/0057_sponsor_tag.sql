-- Sponsor/marketing link attribution: any consumer-app URL can carry a
-- ?tag=xxx param (sponsors append their own tag to whatever link they
-- share). The consumer app captures it client-side and, if a booking is
-- made within the attribution window, sends it along so the CRM can report
-- registration counts per tag. NULL means no tag was ever captured, or the
-- captured tag had already expired by booking time (treated as organic).
ALTER TABLE Bookings ADD COLUMN sponsor_tag TEXT;
