-- Disposable PostgreSQL only. Load after the previous migrations, BEFORE
-- 20260917120000_tour_commercial_model. Coordinates are synthetic test values.
INSERT INTO "User" (id, name, "updatedAt") VALUES
  ('migration-history-user', 'Synthetic history customer', CURRENT_TIMESTAMP);
INSERT INTO "Tour" (id, title, country, "durationDays", "startingFromNGN", description, "updatedAt") VALUES
  ('migration-history-tour', 'Historical package', 'Test', 1, 123000, 'Historical fixture', CURRENT_TIMESTAMP),
  ('benin-history-lake', 'Legacy source fixture', 'Test', 3, 123000, 'Synthetic migration fixture', CURRENT_TIMESTAMP);
INSERT INTO "TourBooking" (id, "userId", "tourId", reference, status, "paymentStatus", "priceNGN", "amountPaidNGN", "tourTitle", "tourCountry", "startDate", "endDate", travellers, "updatedAt") VALUES
  ('migration-history-booking', 'migration-history-user', 'migration-history-tour', 'TOUR-HISTORY-FIXTURE', 'completed', 'paid', 123000, 123000, 'Historical package', 'Test', '2099-01-01', '2099-01-01', 2, CURRENT_TIMESTAMP);
INSERT INTO "TourBookingDay" (id, "tourBookingId", "dayNumber", "scheduledDate", status, title, "updatedAt") VALUES
  ('migration-history-day', 'migration-history-booking', 1, '2099-01-01', 'completed', 'Historical day', CURRENT_TIMESTAMP);
INSERT INTO "TourStopExecution" (id, "tourBookingDayId", "sortOrder", title, address, latitude, longitude, "updatedAt") VALUES
  ('migration-history-stop', 'migration-history-day', 1, 'Historical stop', 'Synthetic historical address', 1, 2, CURRENT_TIMESTAMP);
INSERT INTO "TourItineraryDay" (id, "tourId", "dayNumber", title, "updatedAt") VALUES
  ('migration-template-cotonou', 'benin-history-lake', 1, 'Cotonou City Tour', CURRENT_TIMESTAMP),
  ('migration-template-ouidah', 'benin-history-lake', 2, 'Ouidah Tour', CURRENT_TIMESTAMP),
  ('migration-template-ganvie', 'benin-history-lake', 3, 'Ganvie Tour', CURRENT_TIMESTAMP);
INSERT INTO "TourItineraryStop" (id, "itineraryDayId", "sortOrder", title, address, latitude, longitude, "updatedAt") VALUES
  ('migration-template-stop', 'migration-template-cotonou', 1, 'Synthetic historical stop', 'Synthetic address', 1, 2, CURRENT_TIMESTAMP);
