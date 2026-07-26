-- AlterTable
ALTER TABLE "products" ADD COLUMN     "minPrice" DECIMAL(12,2);

-- Backfill from the existing variants.
--
-- Without this every product already in the catalogue keeps a null minPrice and
-- sorts last under "price: low to high" — the column would be added and the bug
-- it exists to fix would survive the migration untouched. Products with no
-- active variant are intentionally left null: they cannot be bought, and null
-- sorts last.
UPDATE "products" p
SET "minPrice" = sub.min_price
FROM (
  SELECT "productId", MIN(price) AS min_price
  FROM "product_variants"
  WHERE "isActive" = true
  GROUP BY "productId"
) AS sub
WHERE p.id = sub."productId";

-- CreateIndex
CREATE INDEX "products_status_minPrice_idx" ON "products"("status", "minPrice");
