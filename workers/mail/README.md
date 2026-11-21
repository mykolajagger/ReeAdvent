# reeadvent-inbox

Email Worker: приймає листи на support@reeadvent.fun (Cloudflare Email Routing), розбирає їх через postal-mime і зберігає в D1 (таблиці `threads`, `messages`) для розділу «Підтримка» в адмінці.

Розгортання: Cloudflare Workers Builds, root directory `workers/mail`, deploy command `npx wrangler deploy`.
Необов'язково: змінна `FORWARD_TO` (підтверджена адреса в Email Routing) пересилає копію кожного листа.
