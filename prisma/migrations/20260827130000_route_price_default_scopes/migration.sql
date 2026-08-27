-- Backfill explicit default corridor prices for routes that already have scoped
-- mainland/island prices but no default price. Reverse route projections price
-- against the canonical corridor and must not require separate reverse rows.
INSERT INTO "RoutePrice" (
  "id",
  "routeId",
  "vehicleId",
  "pricingScope",
  "amountNGN",
  "notes",
  "managedByCategory",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('routeprice_default_', MD5(scoped."routeId" || ':' || scoped."vehicleId")),
  scoped."routeId",
  scoped."vehicleId",
  'default',
  MIN(scoped."amountNGN"),
  'Default corridor fare derived from existing scoped pickup fares',
  BOOL_OR(scoped."managedByCategory"),
  NOW(),
  NOW()
FROM "RoutePrice" scoped
WHERE scoped."pricingScope" IN ('mainland', 'island')
  AND NOT EXISTS (
    SELECT 1
    FROM "RoutePrice" existing
    WHERE existing."routeId" = scoped."routeId"
      AND existing."vehicleId" = scoped."vehicleId"
      AND existing."pricingScope" = 'default'
  )
GROUP BY scoped."routeId", scoped."vehicleId"
ON CONFLICT ("routeId", "vehicleId", "pricingScope") DO NOTHING;
