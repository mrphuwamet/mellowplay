-- Per-form score-range results for graded surveys/tests — e.g. 0-5 points
-- "ควรฝึกฝนเพิ่ม", 6-10 "ดีเยี่ยม", each with its own result text and
-- optional image, shown to the respondent on the result screen based on
-- which band their total_score falls into.
ALTER TABLE Survey_Forms ADD COLUMN score_ranges_json TEXT;
