// Cloudflare Turnstile: перевірка токена капчі на сервері.
export async function verifyTurnstile(env, token, ip) {
  if (!token || typeof token !== 'string' || token.length > 2048) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  if (ip) body.set('remoteip', ip);
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    if (!r.ok) return false;
    return (await r.json()).success === true;
  } catch { return false; }
}
