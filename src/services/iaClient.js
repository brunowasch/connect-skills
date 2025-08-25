const axios = require('axios');

async function sugerirCompatibilidade({ questions, items, timeoutMs = 45000 }) {
  const resp = await axios.post(
    'http://159.203.185.226:4000/suggest',
    { questions, items },
    {
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (s) => s >= 200 && s < 300
    }
  );

  let raw = resp.data;

  // pode vir string -> tenta parsear
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch (_) {}
  }

  // aceita results/result/items ou array direto
  let results =
    (raw && raw.results) ||
    (raw && raw.result)  ||
    (raw && raw.items)   ||
    (raw && raw.data && (raw.data.results || raw.data.items)) ||
    (Array.isArray(raw) ? raw : null);

  if (typeof results === 'string') {
    try { results = JSON.parse(results); } catch (_) {}
  }

  if (!Array.isArray(results)) {
    const preview = typeof raw === 'object' ? JSON.stringify(raw).slice(0, 400) : String(raw).slice(0, 400);
    const err = new Error(`Formato inesperado da IA. Preview: ${preview}`);
    err.code = 'BAD_IA_FORMAT';
    throw err;
  }

  return results
    .map((r) => {
      const Item = r?.Item ?? r?.item ?? r?.titulo ?? '';
      let rating = r?.rating ?? r?.score ?? r?.nota;

      if (typeof rating === 'string') {
        const m = rating.match(/-?\d+(\.\d+)?/);
        rating = m ? Number(m[0]) : null;
      }
      if (typeof rating === 'number') {
        if (!Number.isFinite(rating)) rating = null;
        else rating = Math.round(rating);
      }

      return { Item: String(Item), rating };
    })
    .filter(x => x.Item);
}

module.exports = { sugerirCompatibilidade };