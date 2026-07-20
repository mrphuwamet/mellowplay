-- A course's Cover (thumbnail_url/banner views) and its class-detail-page
-- Poster are different images with different aspect ratios — Cover is a
-- wide banner, this is portrait, shown separately on CourseDetail (desktop:
-- above the Register button; mobile: before the full description). Not to
-- be confused with the existing Course_Image_Focals "poster gallery"
-- (multiple images with per-image focal points, used as a Cover substitute).
ALTER TABLE Courses ADD COLUMN detail_poster_url TEXT;
