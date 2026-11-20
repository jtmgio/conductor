// Finds a meeting's join link (Google Meet, Teams, Zoom) in the text a calendar
// event carries — its URL field, location, and notes. Only https links on the
// exact meeting hosts pass: the Mac app opens whatever this returns, so a
// look-alike host or a stray doc link must never come back.

const URL_RE = /https?:\/\/[^\s<>"'()\[\]]+/gi;

const MEETING_LINKS: { host: RegExp; path: RegExp }[] = [
  { host: /^meet\.google\.com$/, path: /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}/ },
  { host: /^teams\.microsoft\.com$/, path: /^\/(l\/meetup-join|meet)\// },
  { host: /^teams\.live\.com$/, path: /^\/meet\// },
  { host: /^([a-z0-9-]+\.)?zoom\.us$/, path: /^\/(j|my|w)\// },
];

function asJoinUrl(raw: string): string | null {
  const trimmed = raw.replace(/[.,;:!?>]+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  return MEETING_LINKS.some((m) => m.host.test(host) && m.path.test(url.pathname)) ? trimmed : null;
}

export function findJoinUrl(texts: (string | null | undefined)[]): string | null {
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.match(URL_RE) ?? []) {
      const url = asJoinUrl(match);
      if (url) return url;
    }
  }
  return null;
}
