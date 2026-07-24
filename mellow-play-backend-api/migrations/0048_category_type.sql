-- Class/Event/Service categories must stay separate pools, not one shared
-- list — a category now belongs to exactly one of them. Existing rows
-- default to 'class' since every category so far (ART & CRAFT, the dev
-- seed's "บริการ"/"กิจกรรม") predates this split.
ALTER TABLE Course_Categories ADD COLUMN type TEXT DEFAULT 'class';
