-- Counts saves of a page's blocks, so a builder tab left open can tell that the
-- AI editor (or another tab) saved the page since it loaded, and stop instead
-- of saving its old copy over that work. Every existing page starts at 0; the
-- builder reads the number when it opens.
ALTER TABLE "Page" ADD COLUMN "sectionsRevision" INTEGER NOT NULL DEFAULT 0;
