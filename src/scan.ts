/**
 * Price Scanner: identify an item from photos with Claude, then build the price-research links and a draft listing.
 */
import type { Env } from './config';

export interface ScanResult {
  title: string;
  brand: string | null;
  model: string | null;
  itemType: string;
  category: string;
  condition: 'NEW' | 'NEW_OTHER' | 'USED_EXCELLENT' | 'USED_GOOD' | 'USED_ACCEPTABLE' | 'FOR_PARTS_OR_NOT_WORKING';
  conditionNotes: string;
  specifics: { name: string; value: string }[];
  description: string;
  searchQuery: string;
  confidence: 'high' | 'medium' | 'low';
  checkFirst: string[];
}

export const CONDITION_LABELS: Record<ScanResult['condition'], string> = {
  NEW: 'New',
  NEW_OTHER: 'New (open box / other)',
  USED_EXCELLENT: 'Used – excellent',
  USED_GOOD: 'Used – good',
  USED_ACCEPTABLE: 'Used – acceptable',
  FOR_PARTS_OR_NOT_WORKING: 'For parts or not working',
};

const SYSTEM = `You identify second-hand items from photos for Second Chance Goods Ltd, a UK eBay business seller of house-clearance finds, and draft the eBay listing in their house style.

House style:
- Title (max 80 characters): Brand, model number, what it is, key features, using "w/" for included extras. Example: "Hitachi AX-M67 Micro Hi-Fi Stereo System CD/FM/AUX w/ Speakers". No hype words, no "look", no exclamation marks.
- Description: two or three plain sentences in British English about what it is and its condition, naming any faults you can see. Example: "Used but in good working condition. Would benefit from a clean. Fabric on the speakers is torn." Never invent features, working status or contents you cannot see; say "untested" for electrical items unless the photos show it working.
- Specifics: eBay item specifics that apply (Brand, Model, MPN, Type, Material, Colour, Era, Size, Pattern, Features, Country/Region of Manufacture…), only what you can read or see.

Read labels, model numbers, maker's marks and backstamps carefully; they matter more than guesses. If several photos show different items, describe the main one. Be honest about uncertainty.

Respond with JSON only, no markdown, matching:
{"title":"","brand":"" or null,"model":"" or null,"itemType":"","category":"eBay UK category path, e.g. Sound & Vision > Home Audio & HiFi Separates > Compact/Shelf Stereos","condition":"NEW|NEW_OTHER|USED_EXCELLENT|USED_GOOD|USED_ACCEPTABLE|FOR_PARTS_OR_NOT_WORKING","conditionNotes":"","specifics":[{"name":"","value":""}],"description":"","searchQuery":"short eBay search for the exact item, e.g. Hitachi AX-M67","confidence":"high|medium|low","checkFirst":["things the team should verify before listing"]}`;

export async function identifyItem(env: Env, images: { data: ArrayBuffer; type: string }[], notes: string): Promise<ScanResult> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set on the website project');
  const content: unknown[] = images.slice(0, 8).map((im) => ({
    type: 'image',
    source: { type: 'base64', media_type: im.type || 'image/jpeg', data: toBase64(im.data) },
  }));
  content.push({ type: 'text', text: `Identify this item and draft the listing.${notes ? ` Notes from the team: ${notes}` : ''}` });
  const res = await fetch(`${(env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) throw new Error(`Identifier error: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = json.content.filter((c) => c.type === 'text').map((c) => c.text || '').join('');
  return parseResult(text);
}

export function parseResult(text: string): ScanResult {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const raw = JSON.parse(cleaned.slice(start, end + 1)) as Partial<ScanResult>;
  const conds = Object.keys(CONDITION_LABELS) as ScanResult['condition'][];
  const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    title: str(raw.title, 80),
    brand: str(raw.brand, 80) || null,
    model: str(raw.model, 80) || null,
    itemType: str(raw.itemType, 120),
    category: str(raw.category, 200),
    condition: conds.includes(raw.condition as ScanResult['condition']) ? (raw.condition as ScanResult['condition']) : 'USED_GOOD',
    conditionNotes: str(raw.conditionNotes, 500),
    specifics: Array.isArray(raw.specifics) ? raw.specifics.filter((s) => s && typeof s.name === 'string' && typeof s.value === 'string').slice(0, 20).map((s) => ({ name: s.name.trim().slice(0, 60), value: s.value.trim().slice(0, 120) })) : [],
    description: str(raw.description, 2000),
    searchQuery: str(raw.searchQuery, 100) || str(raw.title, 60),
    confidence: raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium',
    checkFirst: Array.isArray(raw.checkFirst) ? raw.checkFirst.filter((s) => typeof s === 'string').slice(0, 6).map((s) => s.slice(0, 200)) : [],
  };
}

/** Research links for the team: eBay sold & completed, Terapeak, and active listings. */
export function researchLinks(query: string) {
  const q = encodeURIComponent(query);
  return {
    sold: `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1&_sop=13`,
    terapeak: `https://www.ebay.co.uk/sh/research?marketplace=EBAY-GB&keywords=${q}&dayRange=90&tabName=SOLD`,
    active: `https://www.ebay.co.uk/sch/i.html?_nkw=${q}&_sop=15`,
  };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
