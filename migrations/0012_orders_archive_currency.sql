-- Архів замовлень і валюта ціни (гривня для України, євро для інших країн). На робочій базі ці колонки додаються автоматично (src/schema.js).
ALTER TABLE orders ADD COLUMN archived_at INTEGER;
ALTER TABLE orders ADD COLUMN currency TEXT;
ALTER TABLE orders ADD COLUMN uah_rate REAL;
ALTER TABLE orders ADD COLUMN inv_ccy INTEGER;
ALTER TABLE orders ADD COLUMN inv_amount INTEGER;
