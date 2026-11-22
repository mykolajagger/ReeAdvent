// Виклик Claude (Anthropic Messages API) із примусовим структурованим виходом: модель повертає аргументи інструмента `tool`.
// Секрет ANTHROPIC_API_KEY лежить у Cloudflare; модель — AGENT_MODEL (типово claude-sonnet-5-5). До моделі не передаємо персональних даних.
export const hasClaude = env => !!(env && env.ANTHROPIC_API_KEY);
export async function callClaude(env, { system, tool, user, fetchImpl = fetch, maxTokens = 2500, timeout = 60000 }) {
  const r = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model: env.AGENT_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: typeof user === 'string' || Array.isArray(user) ? user : JSON.stringify(user) }] }) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(String((j.error && j.error.message) || 'HTTP ' + r.status).slice(0, 160));
  const tu = (j.content || []).find(c => c.type === 'tool_use' && c.name === tool.name); if (!tu || !tu.input) throw new Error('модель не повернула результат');
  return tu.input;
}
