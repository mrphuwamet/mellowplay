-- A survey or test that charges for itself, paid by bank transfer and a slip.
--
-- Nothing here touches courses or bookings. This is the standalone public
-- form — it already has a slug, already takes a name and a phone without a
-- login, and already computes a number from the answers (total_score). What
-- it has never had is money.
--
-- The shape follows Package_Purchases, which is this codebase's existing way
-- to take payment for something that is not a class: an amount, a status, and
-- the reference the webhook matches. The difference is that a gateway tells
-- you when it has been paid, and a slip does not — so there is a review state
-- in the middle that a Beam booking never needs.

-- ── the form decides whether it charges, and what for ──
ALTER TABLE Survey_Forms ADD COLUMN collects_payment TINYINT(1) DEFAULT 0;
-- Charged on every submission before anything the answers add. A registration
-- fee, where the questions are the form rather than the price list.
ALTER TABLE Survey_Forms ADD COLUMN base_price REAL DEFAULT 0;
-- Where to transfer, shown to the payer: {bankName, accountName, accountNo,
-- promptPay, note}. Held per form rather than in one global setting because
-- different events really do collect into different accounts, and a wrong
-- account number is not a mistake you want shared across every form at once.
ALTER TABLE Survey_Forms ADD COLUMN payment_account_json TEXT;

-- ── what one submission owes, and what happened about it ──
ALTER TABLE Survey_Submissions ADD COLUMN amount REAL DEFAULT 0;
-- NULL on every submission to a form that does not charge, which is all 668
-- of the existing ones. Otherwise: awaiting_payment -> submitted -> verified
-- | rejected. 'submitted' means a slip is attached and nobody has looked yet.
ALTER TABLE Survey_Submissions ADD COLUMN payment_status TEXT;
ALTER TABLE Survey_Submissions ADD COLUMN payment_method TEXT;
ALTER TABLE Survey_Submissions ADD COLUMN slip_url TEXT;
-- The transaction reference read off the slip. Kept whatever the verification
-- provider promises about duplicates: their documentation does not say how
-- reuse is handled across merchants, and one person paying while ninety-nine
-- upload the same picture is the failure that matters most here. The unique
-- index below is the actual defence.
ALTER TABLE Survey_Submissions ADD COLUMN slip_ref TEXT;
ALTER TABLE Survey_Submissions ADD COLUMN slip_uploaded_at DATETIME;
ALTER TABLE Survey_Submissions ADD COLUMN payment_verified_at DATETIME;
-- Who said it was good: a staff name, or 'auto' when a verification API did.
ALTER TABLE Survey_Submissions ADD COLUMN payment_verified_by TEXT;
-- Why it was refused, in words the respondent can be told.
ALTER TABLE Survey_Submissions ADD COLUMN payment_note TEXT;
-- Handed to whoever submitted the form so they, and only they, can attach a
-- slip to it afterwards. A submission id alone is guessable, and attaching a
-- slip to a stranger's registration is not something a counter should have to
-- untangle.
ALTER TABLE Survey_Submissions ADD COLUMN payment_token TEXT;

-- One submission per slip. Partial, so the hundreds of unpaid submissions
-- that have no reference at all do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_submissions_slip_ref
    ON Survey_Submissions (slip_ref) WHERE slip_ref IS NOT NULL;

-- The CRM's review queue reads "what is waiting", which is the one query that
-- will run constantly while an event is open.
CREATE INDEX IF NOT EXISTS idx_survey_submissions_payment_status
    ON Survey_Submissions (payment_status, created_at);
