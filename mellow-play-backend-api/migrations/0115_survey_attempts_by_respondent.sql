-- Round numbers on Survey_Submissions, recomputed by who the respondent is.
--
-- Migration 0075 numbered rounds by user_id, else by phone. On the media-
-- literacy pre/post test that left most people unpaired: the typical guest
-- typed a name and no phone, so the same name answered twice was two
-- "different" people both on round 1 — and the before/after view drew no
-- delta for them. The phone key also fused siblings who typed the same
-- parent phone into one person, and a parent account answering for two
-- children into one.
--
-- Identity is now the typed name (normalised the way the session unique-name
-- rule already does), with account or phone used only to forgive a near-
-- identical misspelling — see backend-api/src/services/respondentIdentity.ts,
-- which the server numbers new rounds with from this migration on. That rule
-- is not expressible in SQLite (edit distance), so the rows it changes on the
-- 2026-09-16 production data are written out here explicitly (by row id only,
-- no names); every row not
-- listed keeps the number it already has. Test rows (is_test = 1) untouched.

-- session 1 · 2026-09-03 09:27:03 · 2 -> 1
UPDATE Survey_Submissions SET attempt_no = 1 WHERE id = 38 AND is_test = 0;
-- session 2 · 2026-09-03 10:53:28 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 49 AND is_test = 0;
-- session 2 · 2026-09-03 10:59:23 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 55 AND is_test = 0;
-- session 2 · 2026-09-03 11:06:01 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 59 AND is_test = 0;
-- session 2 · 2026-09-03 11:06:06 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 60 AND is_test = 0;
-- session 2 · 2026-09-03 11:23:07 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 65 AND is_test = 0;
-- session 2 · 2026-09-04 09:14:41 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 113 AND is_test = 0;
-- session 2 · 2026-09-04 09:15:13 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 116 AND is_test = 0;
-- session 2 · 2026-09-04 09:17:33 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 120 AND is_test = 0;
-- session 2 · 2026-09-04 09:19:08 · 2 -> 1
UPDATE Survey_Submissions SET attempt_no = 1 WHERE id = 123 AND is_test = 0;
-- session 2 · 2026-09-04 09:19:54 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 125 AND is_test = 0;
-- session 2 · 2026-09-04 09:26:32 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 132 AND is_test = 0;
-- session 2 · 2026-09-05 07:11:48 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 155 AND is_test = 0;
-- session 2 · 2026-09-05 07:14:57 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 157 AND is_test = 0;
-- session 2 · 2026-09-05 07:18:44 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 159 AND is_test = 0;
-- session 2 · 2026-09-06 06:56:25 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 189 AND is_test = 0;
-- session 2 · 2026-09-06 07:08:23 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 193 AND is_test = 0;
-- session 2 · 2026-09-06 09:32:45 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 202 AND is_test = 0;
-- session 2 · 2026-09-06 09:35:17 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 203 AND is_test = 0;
-- session 2 · 2026-09-06 09:42:45 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 208 AND is_test = 0;
-- session 2 · 2026-09-11 05:40:21 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 228 AND is_test = 0;
-- session 2 · 2026-09-11 05:40:52 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 229 AND is_test = 0;
-- session 2 · 2026-09-11 05:44:05 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 237 AND is_test = 0;
-- session 2 · 2026-09-11 05:46:28 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 244 AND is_test = 0;
-- session 2 · 2026-09-11 09:34:49 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 272 AND is_test = 0;
-- session 2 · 2026-09-11 10:35:23 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 288 AND is_test = 0;
-- session 2 · 2026-09-11 11:44:47 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 299 AND is_test = 0;
-- session 2 · 2026-09-12 07:08:36 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 323 AND is_test = 0;
-- session 2 · 2026-09-12 09:35:48 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 336 AND is_test = 0;
-- session 2 · 2026-09-13 11:00:20 · 1 -> 2
UPDATE Survey_Submissions SET attempt_no = 2 WHERE id = 375 AND is_test = 0;
