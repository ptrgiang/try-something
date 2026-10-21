-- Profile photo choice. NULL = the photo from Google or GitHub ("image"), 'none' = initials only,
-- anything else = key of an uploaded photo in the AVATARS R2 bucket.
ALTER TABLE "user" ADD COLUMN avatar TEXT;
