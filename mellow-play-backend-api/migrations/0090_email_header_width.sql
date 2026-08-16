-- How wide the header image is drawn.
--
-- wrapEmailHtml hard-coded width="240", which is right for a logo and much too
-- small for a banner artwork — and a banner is exactly what someone uploads
-- once they can style the mail at all. 240 stays the default so nothing that
-- already looks right moves.
--
-- Stored in pixels because that is what an email client understands; the card
-- itself is 600px wide, so 600 means edge to edge.
INSERT OR IGNORE INTO System_Settings (key, value) VALUES
  ('email_header_width', '240');
