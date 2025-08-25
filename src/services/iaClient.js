// services/iaClient.js
const axios = require('axios');

/** Remove BOM e faz JSON.parse com fallback */
function safeParse(maybeJson) {
  if (maybeJson == null) return maybeJson;
  if (typeof maybeJson !== 'string') return maybeJson;
  const s = maybeJson.replace(/^\uFEFF/, '').trim();
  if (!s) return s;
  try {
    return JSON.parse(s);
  } catch {
    return maybeJson; // mantém string; normalizador ainda tenta lidar
  }
}

/** Normaliza número de rating (aceita "85%", "85", 85) */
function toRatingNumber(val) {
  if (val == null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const s = String(val).trim().replace('%', '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Limpa "Item 1: ..." -> apenas o texto */
function cleanItemText(txt) {
  return String(txt ?? '')
    .replace(/^Item\s*\d+\s*:\s*/i, '')
    .trim();
}

/**
 * Constrói o payload esperado pela API:
 * - questions: "Pergunta? Resposta do candidato"
 * - items: "Item 1: ...\nItem 2: ...\nItem 3: ..."
 */
function buildSuggestPayload(questionsStr, itemsStr) {
  const norm = (s) => String(s || '').trim();
  return { questions: norm(questionsStr), items: norm(itemsStr) };
}

/**
 * Converte saídas prováveis da IA em:
 *   { results: [ { item: string, rating: number }, ... ], raw }
 * Aceita formatos:
 * - { results: [ { Item/item, rating/Rating } ] }
 * - { result:  [ ... ] }
 * - [ { ... } ]
 * - { Item, rating } (objeto único)
 * - { items/data/output: [ ... ] } (inclusive como string JSON)
 * - string pura com JSON dentro
 */
function normalizeSuggestResponse(rawInput) {
  const raw = safeParse(rawInput);

  const toPair = (obj) => {
    if (!obj || typeof obj !== 'object') return null;

    const itemKey =
      ('Item' in obj) ? 'Item' :
      ('item' in obj) ? 'item' : null;

    const ratingKey =
      ('rating' in obj) ? 'rating' :
      ('Rating' in obj) ? 'Rating' : null;

    if (!itemKey || !ratingKey) return null;

    const itemText = cleanItemText(obj[itemKey]);
    const ratingNum = toRatingNumber(obj[ratingKey]);

    return {
      item: itemText || String(obj[itemKey] ?? '').trim(),
      rating: ratingNum
    };
  };

  // { results: [...] } ou { result: [...] }
  if (raw && typeof raw === 'object') {
    for (const key of ['results', 'result']) {
      if (Array.isArray(raw[key])) {
        const list = raw[key].map(toPair).filter(Boolean);
        if (list.length) return { results: list, raw };
      }
    }
  }

  // Array direto
  if (Array.isArray(raw)) {
    const list = raw.map(toPair).filter(Boolean);
    if (list.length) return { results: list, raw };
  }

  // Objeto único { Item, rating }
  const single = toPair(raw);
  if (single) return { results: [single], raw };

  // { items/data/output: [...] } (array) ou string JSON
  if (raw && typeof raw === 'object') {
    for (const key of ['items', 'data', 'output']) {
      const maybe = raw[key];

      if (Array.isArray(maybe)) {
        const list = maybe.map(toPair).filter(Boolean);
        if (list.length) return { results: list, raw };
      }

      if (typeof maybe === 'string') {
        const parsed = safeParse(maybe);
        if (Array.isArray(parsed)) {
          const list = parsed.map(toPair).filter(Boolean);
          if (list.length) return { results: list, raw };
        } else {
          const one = toPair(parsed);
          if (one) return { results: [one], raw };
        }
      }
    }
  }

  // string pura: tenta parsear
  if (typeof raw === 'string') {
    const parsed = safeParse(raw);
    if (Array.isArray(parsed)) {
      const list = parsed.map(toPair).filter(Boolean);
      if (list.length) return { results: list, raw: parsed };
    }
    const s = toPair(parsed);
    if (s) return { results: [s], raw: parsed };
  }

  return { results: [], raw };
}

/** Chama a API e retorna { results, raw } */
async function sugerirCompatibilidade({ apiUrl, questionsStr, itemsStr }) {
  const payload = buildSuggestPayload(questionsStr, itemsStr);

  const resp = await axios.post(apiUrl, payload, {
    headers: { 'Content-Type': 'application/json' },
    // Não parsear aqui; o normalizador já lida com string/objeto
    transformResponse: [(data) => data]
  });

  return normalizeSuggestResponse(resp.data);
}

module.exports = {
  sugerirCompatibilidade,
  buildSuggestPayload,
  normalizeSuggestResponse
};
