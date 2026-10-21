-- Official share image (og:image) of the product, served through /media proxy with attribution.
ALTER TABLE tool ADD COLUMN image_url TEXT;
ALTER TABLE submission ADD COLUMN image_url TEXT;
