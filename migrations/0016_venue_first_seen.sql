-- Коли заклад уперше з'явився в базі: позначка «нещодавно відкрились». Код додає колонку й сам (src/schema.js).
ALTER TABLE venues ADD COLUMN first_seen INTEGER;
