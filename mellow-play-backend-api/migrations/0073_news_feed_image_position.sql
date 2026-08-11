-- Thumbnails are rendered into a fixed 16:9 frame with object-fit:cover in
-- both the news list and NewsDetail, so a portrait photo or one with the
-- subject off-centre gets cropped through the middle with no way to say which
-- part matters. This stores the CSS object-position the CRM's drag-to-adjust
-- control produces, same shape and default as Course_Categories.image_position.
ALTER TABLE News_Feed ADD COLUMN image_position TEXT DEFAULT '50% 50%';
