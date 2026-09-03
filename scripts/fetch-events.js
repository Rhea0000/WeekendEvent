// Fetches this weekend / next weekend / "coming up, book ahead" events for the
// Randstad area using Google's Gemini API (free tier, with Google Search
// grounding) and writes the result to data/events.json. Runs server-side
// only — the API key never touches the browser. Requires Node 18+ (global fetch).
//
// Get a free key at https://aistudio.google.com/apikey — no credit card needed.

const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY environment variable.');
  process.exit(1);
}

// Flash models are the free-tier-eligible ones; Flash is plenty for this task.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

const TAB_BRIEF = {
  this: { window: 'this coming Saturday and Sunday', count: '4 to 6' },
  next: { window: 'the weekend after this one (i.e. the Saturday/Sunday one week further out)', count: '4 to 6' },
  later: { window: 'roughly 3 to 6 weeks from now', count: '3 to 5' }
};

// Tolerant JSON extractor: walks the "events" array manually so a truncated
// or slightly malformed tail doesn't kill the whole batch.
function extractEvents(raw) {
  const events = [];
  const keyIdx = raw.indexOf('"events"');
  if (keyIdx === -1) return events;
  const arrStart = raw.indexOf('[', keyIdx);
  if (arrStart === -1) return events;

  let i = arrStart + 1;
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i])) i++;
    if (raw[i] !== '{') break;

    let depth = 0, j = i, inStr = false, esc = false, closed = false;
    for (; j < raw.length; j++) {
      const ch = raw[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { j++; closed = true; break; }
        }
      }
    }
    if (!closed) break;
    const objStr = raw.slice(i, j);
    try {
      const obj = JSON.parse(objStr);
      if (obj && obj.title) events.push(obj);
    } catch (e) { /* skip malformed object, keep going */ }
    i = j;
  }
  return events;
}

async function fetchTab(tab) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const brief = TAB_BRIEF[tab];

  const systemPrompt = `Return ONLY raw JSON, no markdown fences, no commentary. Schema:
{"events":[{"title":string,"city":string,"category":"food"|"music"|"culture"|"outdoor"|"family"|"other","when":string,"free":boolean,"price":string,"registration_required":boolean,"registration_deadline":string|null,"url":string,"blurb":string}]}
"blurb" max 10 words. Give exactly ${brief.count} events. Keep every string short and on one line. No trailing commas.`;

  const userPrompt = `Today's date is ${dateStr}. Search the web for real, currently-listed events happening ${brief.window} in the Netherlands Randstad area: Amsterdam, Rotterdam, The Hague, Utrecht, and nearby towns like Leiden, Haarlem, Delft, Gouda.${tab === 'later' ? ' Only include events that require advance registration or ticket booking (festivals, popular exhibitions, tours, limited-spot workshops) — this is the "plan ahead" list.' : ''} Prioritize free or low-cost events, include a couple of good paid ones too. Mix categories: food & drink, music/festivals, culture, outdoor/markets, family-friendly. Give an accurate direct source URL, the exact city, the date, and the cost for each. Output must match the JSON schema exactly, nothing else.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 2000, temperature: 0.4 }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const candidate = (data.candidates || [])[0];
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  let raw = parts.map(p => p.text || '').join('\n').trim();
  raw = raw.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

  let events = extractEvents(raw);
  if (events.length === 0) {
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
      events = Array.isArray(parsed.events) ? parsed.events : [];
    }
  }

  events.forEach(e => { e.weekend = tab; });
  return events;
}

async function main() {
  const outPath = path.join(__dirname, '..', 'data', 'events.json');
  let previous = { this: [], next: [], later: [] };
  try {
    previous = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch (e) { /* no previous file yet, that's fine */ }

  const result = { generatedAt: new Date().toISOString(), this: [], next: [], later: [] };

  for (const tab of ['this', 'next', 'later']) {
    try {
      console.log(`Fetching "${tab}" events...`);
      const events = await fetchTab(tab);
      result[tab] = events.length > 0 ? events : (previous[tab] || []);
      console.log(`  -> ${events.length} events`);
    } catch (err) {
      console.error(`Failed to fetch "${tab}": ${err.message}`);
      result[tab] = previous[tab] || []; // keep last good data rather than wiping it
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Wrote ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
