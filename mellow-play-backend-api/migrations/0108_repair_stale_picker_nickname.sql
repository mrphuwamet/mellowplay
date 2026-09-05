-- The person-picker's __nickname companion had gone stale on corrected
-- registrations.
--
-- The consumer app writes a family_member_picker's answer three ways: the
-- display value, a __realname companion and a __nickname companion. The CRM's
-- edit path updated the display value and __realname and left __nickname
-- alone, so a booking corrected to a different person kept the PREVIOUS
-- person's nickname. The check-in roster reads the nickname first, so it went
-- on calling out the wrong person after the correction had been made — one
-- round was announcing a mother's name for a child who was somebody else.
--
-- Both sides are fixed in code (the CRM now writes the companion, and
-- attendeeNames reads the display value rather than trusting the copy), which
-- makes this repair cosmetic for the app. It is worth doing anyway: leaving a
-- field holding a name that contradicts its own answer is a trap for whoever
-- reads the data next, including a report nobody has written yet.
--
-- Only rows that contradict THEMSELVES are touched — the companion is set to
-- the answer sitting beside it in the same submission, never to anything
-- inferred. Rows without the companion are left without it: absent is not the
-- same as wrong, and the readers already handle absent.
UPDATE Form_Submissions
   SET answers_json = json_set(
         answers_json,
         '$.a3e082cc-06fe-496c-bdfa-89fd010ffe15__nickname',
         json_extract(answers_json, '$.a3e082cc-06fe-496c-bdfa-89fd010ffe15')
       )
 WHERE json_extract(answers_json, '$.a3e082cc-06fe-496c-bdfa-89fd010ffe15') IS NOT NULL
   AND json_extract(answers_json, '$.a3e082cc-06fe-496c-bdfa-89fd010ffe15__nickname') IS NOT NULL
   AND json_extract(answers_json, '$.a3e082cc-06fe-496c-bdfa-89fd010ffe15__nickname')
       != json_extract(answers_json, '$.a3e082cc-06fe-496c-bdfa-89fd010ffe15');
