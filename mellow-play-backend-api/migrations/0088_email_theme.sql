-- Appearance of every email the system sends.
--
-- Until now wrapEmailHtml hard-coded one look: a white card on grey, no header
-- and no footer. The body could be written in the CRM's editor but the frame
-- around it could not be touched, so an email never looked like the brand
-- sending it.
--
-- 'plain' keeps exactly that frame — it is the default, so nothing changes for
-- anyone who does not opt in. 'branded' draws the header image, the background
-- colours and the footer configured below.
--
-- Stored as settings rather than a table because there is one of each: this is
-- how the product's mail looks, not a list of themes.
INSERT OR IGNORE INTO System_Settings (key, value) VALUES
  ('email_template_mode',   'plain'),
  ('email_header_image',    ''),
  ('email_header_bg',       '#ffffff'),
  ('email_page_bg',         '#f4f5f7'),
  ('email_card_bg',         '#ffffff'),
  ('email_text_color',      '#1f2937'),
  ('email_footer_html',     ''),
  ('email_footer_bg',       '#f8fafc');
