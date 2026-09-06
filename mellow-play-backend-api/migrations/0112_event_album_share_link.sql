-- A link that opens an album without an account, for people the booking list
-- does not know about.
--
-- Publishing shows an album to the families who booked the course. That is the
-- right default and it cannot cover the ordinary cases around it: a coach, a
-- grandparent, a school that sent a group, a partner who wants the photos. The
-- alternative staff reach for otherwise is to publish it wider than it should
-- be, or to send files by hand.
--
-- So: an unlisted link. It never puts the album in anyone's list — it is not a
-- second kind of publishing — it only lets whoever holds it open that one
-- album. NULL means no link exists, which is every album until someone makes
-- one.
--
-- The token is the credential, so it has to be long and random rather than the
-- album id: a guessable one turns "share with a grandparent" into a directory
-- of every event we have ever photographed. Same reasoning as a certificate's
-- public_code.
ALTER TABLE Event_Albums ADD COLUMN share_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_albums_share_token
  ON Event_Albums(share_token) WHERE share_token IS NOT NULL;
