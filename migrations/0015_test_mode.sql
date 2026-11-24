-- Тестовий режим календаря: усі 24 вікна відкриті одразу, порядок дій у дні звичайний. Код додає колонку й сам (src/schema.js).
ALTER TABLE calendars ADD COLUMN test_mode INTEGER;
