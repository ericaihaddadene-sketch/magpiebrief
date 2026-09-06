// Entity recognition over headlines.
//
// Deliberately a curated gazetteer rather than a statistical model: the AI
// vocabulary is small, changes slowly, and a wrong entity is worse than a
// missing one — it corrupts clustering, topic pages and the graph at once.
// Everything here is verifiable by reading it.

/**
 * kind drives display and ranking:
 *   org     - companies and labs
 *   model   - specific models and model families
 *   product - tools, platforms, protocols
 *   topic   - subject areas
 *
 * `aliases` are matched case-insensitively on word boundaries. Keep them
 * unambiguous: a bad alias silently mis-tags every headline containing it.
 */
export const GAZETTEER = [
  // --- organisations -------------------------------------------------------
  { id: 'openai', name: 'OpenAI', kind: 'org', aliases: ['openai', 'open ai'] },
  { id: 'anthropic', name: 'Anthropic', kind: 'org', aliases: ['anthropic'] },
  { id: 'google-deepmind', name: 'Google DeepMind', kind: 'org', aliases: ['deepmind', 'google deepmind'] },
  { id: 'google', name: 'Google', kind: 'org', aliases: ['google', 'alphabet'] },
  { id: 'meta-ai', name: 'Meta AI', kind: 'org', aliases: ['meta ai', 'meta'] },
  { id: 'microsoft', name: 'Microsoft', kind: 'org', aliases: ['microsoft'] },
  { id: 'nvidia', name: 'NVIDIA', kind: 'org', aliases: ['nvidia'] },
  { id: 'xai', name: 'xAI', kind: 'org', aliases: ['xai', 'x.ai'] },
  { id: 'mistral', name: 'Mistral', kind: 'org', aliases: ['mistral'] },
  { id: 'deepseek', name: 'DeepSeek', kind: 'org', aliases: ['deepseek'] },
  { id: 'alibaba', name: 'Alibaba', kind: 'org', aliases: ['alibaba', 'qwen team'] },
  { id: 'hugging-face', name: 'Hugging Face', kind: 'org', aliases: ['hugging face', 'huggingface'] },
  { id: 'apple', name: 'Apple', kind: 'org', aliases: ['apple'] },
  { id: 'amazon', name: 'Amazon', kind: 'org', aliases: ['amazon', 'aws'] },
  { id: 'perplexity', name: 'Perplexity', kind: 'org', aliases: ['perplexity'] },
  { id: 'cohere', name: 'Cohere', kind: 'org', aliases: ['cohere'] },
  { id: 'stability-ai', name: 'Stability AI', kind: 'org', aliases: ['stability ai'] },
  { id: 'eu', name: 'European Union', kind: 'org', aliases: ['european union', 'eu commission', 'brussels'] },
  { id: 'ftc', name: 'FTC', kind: 'org', aliases: ['ftc', 'federal trade commission'] },

  // --- models --------------------------------------------------------------
  { id: 'gpt', name: 'GPT', kind: 'model', aliases: ['gpt-6', 'gpt6', 'gpt-5', 'gpt-4', 'chatgpt', 'gpt'] },
  { id: 'claude', name: 'Claude', kind: 'model', aliases: ['claude'] },
  { id: 'gemini', name: 'Gemini', kind: 'model', aliases: ['gemini'] },
  { id: 'llama', name: 'Llama', kind: 'model', aliases: ['llama'] },
  { id: 'qwen', name: 'Qwen', kind: 'model', aliases: ['qwen'] },
  { id: 'grok', name: 'Grok', kind: 'model', aliases: ['grok'] },
  { id: 'sora', name: 'Sora', kind: 'model', aliases: ['sora'] },
  { id: 'o-series', name: 'o-series', kind: 'model', aliases: ['o1', 'o3', 'o4'] },

  // --- products and protocols ---------------------------------------------
  { id: 'mcp', name: 'Model Context Protocol', kind: 'product', aliases: ['model context protocol', 'mcp'] },
  { id: 'copilot', name: 'Copilot', kind: 'product', aliases: ['copilot'] },
  { id: 'cursor', name: 'Cursor', kind: 'product', aliases: ['cursor'] },
  { id: 'openrouter', name: 'OpenRouter', kind: 'product', aliases: ['openrouter'] },
  { id: 'pytorch', name: 'PyTorch', kind: 'product', aliases: ['pytorch'] },
  { id: 'transformers', name: 'Transformers', kind: 'product', aliases: ['transformers library'] },

  // --- topics --------------------------------------------------------------
  { id: 'agents', name: 'AI Agents', kind: 'topic', aliases: ['ai agent', 'ai agents', 'agentic', 'agent swarm'] },
  { id: 'coding-agents', name: 'Coding Agents', kind: 'topic', aliases: ['coding agent', 'coding agents', 'code assistant'] },
  { id: 'open-source', name: 'Open Models', kind: 'topic', aliases: ['open source model', 'open weights', 'open-weight'] },
  { id: 'regulation', name: 'AI Regulation', kind: 'topic', aliases: ['ai act', 'ai regulation', 'ai policy', 'regulator'] },
  { id: 'safety', name: 'AI Safety', kind: 'topic', aliases: ['ai safety', 'alignment', 'interpretability'] },
  { id: 'copyright', name: 'AI & Copyright', kind: 'topic', aliases: ['copyright', 'lawsuit', 'sued', 'sue'] },
  { id: 'benchmarks', name: 'Benchmarks', kind: 'topic', aliases: ['benchmark', 'benchmarks', 'evaluation harness'] },
  { id: 'infrastructure', name: 'AI Infrastructure', kind: 'topic', aliases: ['data center', 'datacenter', 'gpu cluster', 'inference cost'] },
  { id: 'robotics', name: 'Robotics', kind: 'topic', aliases: ['robot', 'robotics', 'humanoid'] },
  { id: 'video', name: 'AI Video', kind: 'topic', aliases: ['video generation', 'text-to-video'] },
  { id: 'search', name: 'AI Search', kind: 'topic', aliases: ['ai search', 'answer engine'] },
  { id: 'funding', name: 'Funding', kind: 'topic', aliases: ['series a', 'series b', 'series c', 'funding round', 'raises', 'valuation', 'ipo'] },
  { id: 'security', name: 'AI Security', kind: 'topic', aliases: ['prompt injection', 'jailbreak', 'exfiltration', 'vulnerability'] }
];

const BOUNDARY = (alias) =>
  new RegExp('(^|[^a-z0-9])' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i');

// Compiled once — this runs over every item on every build.
const COMPILED = GAZETTEER.map((e) => ({
  ...e,
  matchers: e.aliases.map(BOUNDARY),
  // Longer aliases are more specific; used to prefer "google deepmind" over "google".
  specificity: Math.max(...e.aliases.map((a) => a.length))
}));

export const byId = new Map(GAZETTEER.map((e) => [e.id, e]));

/**
 * Entities mentioned in a piece of text, most specific first.
 *
 * `text` should normally be the headline. Excerpts are noisier and pull in
 * entities the story is not actually about, which shows up immediately as bad
 * clustering.
 */
export function extractEntities(text) {
  if (!text) return [];
  const found = [];
  for (const e of COMPILED) {
    if (e.matchers.some((re) => re.test(text))) {
      found.push({ id: e.id, name: e.name, kind: e.kind, specificity: e.specificity });
    }
  }

  // "Google DeepMind" also matches "Google"; keep the parent only when it is
  // mentioned independently of the more specific child.
  const suppressed = new Set();
  if (found.some((f) => f.id === 'google-deepmind') && !/\bgoogle\b(?!\s+deepmind)/i.test(text)) {
    suppressed.add('google');
  }
  if (found.some((f) => f.id === 'meta-ai') && !/\bmeta\b(?!\s+ai)/i.test(text)) {
    // 'meta' and 'meta ai' are the same entity here; nothing to suppress.
  }

  return found
    .filter((f) => !suppressed.has(f.id))
    .sort((a, b) => b.specificity - a.specificity)
    .map(({ id, name, kind }) => ({ id, name, kind }));
}

/** The entities that most identify a story, for clustering and titles. */
export function keyEntities(entities) {
  const rank = { org: 0, model: 1, product: 2, topic: 3 };
  return [...entities].sort((a, b) => rank[a.kind] - rank[b.kind]).slice(0, 3);
}
