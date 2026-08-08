-- The CRM's "family member" edit form (UserManagement.tsx) has always had
-- a "คุณคือ..." (relation) picker per member, and the update payload has
-- always sent it — but this column never actually existed on
-- User_CRM_Children, so every save silently dropped it (no error; the
-- INSERT just never referenced a column that wasn't there), and the value
-- reset to blank on reload. This just catches the table up to what the UI
-- already assumed.
ALTER TABLE User_CRM_Children ADD COLUMN relation TEXT;
