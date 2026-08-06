-- Parent/user record had no nickname at all (only HD_Profiles/children did)
-- — CRM staff had nowhere to record or see one for the account holder.
ALTER TABLE Users ADD COLUMN nickname TEXT;

-- "Delete a family member" never actually existed — CRM's remove-child
-- button and the consumer signup wizard's remove button both only spliced
-- the in-memory list before save, so the row reappeared on next load. A
-- real hard DELETE risks FK breakage for a child with booking/journey/
-- coupon history, so this is a soft delete instead: is_deleted=1 hides the
-- row from every family-roster/picker listing while leaving their past
-- bookings, reports, and redemptions fully intact.
ALTER TABLE HD_Profiles ADD COLUMN is_deleted BOOLEAN DEFAULT 0;
