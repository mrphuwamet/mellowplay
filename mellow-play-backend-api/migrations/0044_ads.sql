-- Feed ads: CRM-authored promo cards for our own content (a class, a news
-- article, or a promotion) mixed into the consumer app's community feed —
-- not third-party advertiser ads. target_type/target_id point at whichever
-- table the staff picked when creating the ad; the consumer app resolves
-- the actual title/image from that target at render time unless overridden
-- below, so the ad always reflects the target's current info.
CREATE TABLE Ads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  target_type TEXT NOT NULL, -- 'course' | 'news' | 'promotion'
  target_id INTEGER NOT NULL,
  custom_image_url TEXT,
  custom_caption TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  click_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ads_is_active ON Ads(is_active);
