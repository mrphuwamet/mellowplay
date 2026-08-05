-- Lets CRM staff set a "registration closes at" datetime per class/event/
-- service. Once passed, the course stays visible in browsing lists (so past
-- classes remain discoverable/referenceable) but its booking CTA is hidden —
-- enforced both client-side (hide the button) and server-side in
-- createBooking (reject the request), same defense-in-depth pattern as the
-- other booking guards already there (allow_repeat, extra-class same-day).
ALTER TABLE Courses ADD COLUMN registration_close_at DATETIME;
