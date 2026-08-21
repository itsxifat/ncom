-- Per-workspace colour coding for the order list.
--
-- Nullable with no default: null means "this workspace has never chosen", which
-- is distinct from an empty object meaning "chose to override nothing", and the
-- reader falls back to DEFAULT_STATUS_COLORS for both. Storing the defaults
-- into every row instead would freeze today's palette into workspaces that
-- never asked for it.
ALTER TABLE "OrganizationSettings" ADD COLUMN "orderStatusColors" JSONB;
