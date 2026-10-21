-- A maker claim becomes "verified" only after the submitter proves control of the product's site
-- (a meta tag or a /.well-known file carrying their token). Never set from "I made this" alone.
ALTER TABLE tool ADD COLUMN maker_verified_at TEXT;
