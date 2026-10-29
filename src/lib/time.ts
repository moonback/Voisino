/** Conversions de fuseau horaire sans dépendance (Intl). Testées dans tests/unit/time.test.ts. */

function offsetMs(ts: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** « 2026-11-14T20:30 » à Europe/Paris → instant UTC correspondant (gère l'heure d'été). */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const [date, time] = local.split("T") as [string, string];
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, h, min);
  const first = offsetMs(guess - offsetMs(guess, timeZone), timeZone);
  return new Date(guess - first);
}

/** Instant UTC → « AAAA-MM-JJTHH:mm » dans le fuseau donné (pour les champs datetime-local). */
export function utcToZonedLocal(date: Date | string, timeZone: string) {
  const ts = new Date(date).getTime();
  return new Date(ts + offsetMs(ts, timeZone)).toISOString().slice(0, 16);
}
