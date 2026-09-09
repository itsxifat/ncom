-- What the merchant's site said it held when the two sides diverged.
--
-- Split from the sync migration because that one had already been applied when
-- the resolution path was designed, and editing an applied migration breaks its
-- checksum for everyone who has run it.
ALTER TABLE "OrderForward" ADD COLUMN "remoteRevision" INTEGER;
