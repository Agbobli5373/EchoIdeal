/**
 * Every setting the sidebar search can find. Settings register themselves:
 * each page's file declares its rows with `defineSettings`, which adds them
 * here when the file loads and returns the props its SettingsRows use, so a
 * new row is searchable without editing a list somewhere else.
 */

export type SettingEntry = {
  /** The row's anchor on its page. */
  id: string;
  /** The route it lives on, e.g. "/appearance". */
  page: string;
  title: string;
  /** Where on the page it sits, when the title alone is ambiguous (e.g. "AI provider"). */
  group?: string;
  keywords?: string;
};

type Definition = { title: string; group?: string; keywords?: string };

const entries = new Map<string, SettingEntry>();

/**
 * Registers `page`'s rows, keyed by anchor id, and returns what each
 * SettingsRow needs: `<SettingsRow {...SETTINGS.theme} control={…} />`.
 */
export function defineSettings<K extends string>(
  page: string,
  definitions: Record<K, Definition>
): Record<K, { id: K; title: string; keywords?: string }> {
  const rows = {} as Record<K, { id: K; title: string; keywords?: string }>;
  for (const id of Object.keys(definitions) as K[]) {
    const { title, group, keywords } = definitions[id];
    entries.set(`${page}#${id}`, { id, page, title, group, keywords });
    rows[id] = { id, title, keywords };
  }
  return rows;
}

export function allSettings(): SettingEntry[] {
  return [...entries.values()];
}

const normalise = (text: string) =>
  text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

/**
 * Matches every word of `query` against a title, then its group, keywords and
 * any `context` (such as the page's name). Title matches rank first.
 */
export function matchScore(
  query: string,
  item: { title: string; group?: string; keywords?: string },
  context = ""
): number {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const title = normalise(item.title);
  const rest = normalise(
    [item.group, item.keywords, context].filter(Boolean).join(" ")
  );
  let score = 0;
  for (const word of words) {
    if (title.startsWith(word)) score += 3;
    else if (title.split(/\s+/).some((w) => w.startsWith(word))) score += 2;
    else if (title.includes(word)) score += 1.5;
    else if (rest.includes(word)) score += 1;
    else return 0;
  }
  return score;
}
