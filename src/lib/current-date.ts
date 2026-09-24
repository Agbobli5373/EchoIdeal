/**
 * Today's date for the AI. Models only know the world up to their training
 * data, so without this "latest", "current" or "this year" silently means
 * whenever that was.
 */
export function currentDateLine(now: Date = new Date()): string {
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const time = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Today is ${date}, ${time} (${zone}). Use this for anything that depends on the date, such as "latest", "current", "this year" or how long ago something was; your own knowledge may be older than this.`;
}
