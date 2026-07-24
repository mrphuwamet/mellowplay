-- Bookings previously stored no price at all — the amount charged only
-- ever existed as a lump sum split evenly across a multi-child booking
-- group's Transactions rows. Now that price can differ per child in the
-- same request (Premium vs Regular), that even split would misattribute
-- revenue between siblings. Storing the actual computed price per booking
-- at creation time lets the Beam webhook log each Transaction correctly
-- instead of guessing via an even split.
ALTER TABLE Bookings ADD COLUMN price REAL;
