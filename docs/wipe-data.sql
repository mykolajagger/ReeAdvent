-- УВАГА: НЕЗВОРОТНО видаляє ВСІ замовлення, календарі, анкети, відповіді, листування й сесії клієнтів.
-- Лишаються: промокоди (лічильник використань обнуляється), налаштування, адміністратори й журнал дій.
-- Перед запуском: D1 має Time Travel (відновлення на момент у минулому), але краще зробити експорт.
-- Виконуйте по одному рядку у D1 Console.
DELETE FROM answers;
DELETE FROM progress;
DELETE FROM reminders_sent;
DELETE FROM sessions;
DELETE FROM login_tokens;
DELETE FROM members;
DELETE FROM calendars;
DELETE FROM orders;
DELETE FROM outbox;
DELETE FROM rate_limits;
DELETE FROM messages;
DELETE FROM threads;
UPDATE promo_codes SET used_count = 0;
DELETE FROM audit_log;
