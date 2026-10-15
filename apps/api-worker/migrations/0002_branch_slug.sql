-- Round 4 · TV: per-branch slug so /tv/:branchSlug is unambiguous for brands with
-- several branches (the old fallback resolved by merchant slug → first branch).
ALTER TABLE branches ADD COLUMN slug TEXT;

-- Backfill: <merchant-slug>-<branch-id> keeps existing rows unique; staff can rename later.
UPDATE branches
SET slug = (SELECT m.slug FROM merchants m WHERE m.id = branches.merchant_id) || '-' || lower(id)
WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_slug ON branches(slug);
