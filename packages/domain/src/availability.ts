export type Weekday =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export interface AvailabilityWindow {
  start: string;
  end: string;
}

export type WeeklySchedule = Partial<Record<Weekday, AvailabilityWindow[]>>;

export interface ProductAvailability {
  available: boolean;
  availableFrom?: Date | null;
  availableUntil?: Date | null;
  schedule?: WeeklySchedule | null;
}

export function isProductAvailable(
  availability: ProductAvailability | null,
  now: Date,
  timezone: string
): boolean {
  if (!availability) return true;
  if (!availability.available) return false;
  if (availability.availableFrom && now < availability.availableFrom) return false;
  if (availability.availableUntil && now >= availability.availableUntil) return false;
  if (!availability.schedule || Object.keys(availability.schedule).length === 0) return true;

  const local = localDateParts(now, timezone);
  const windows = availability.schedule[local.weekday] ?? [];
  const currentMinutes = local.hour * 60 + local.minute;
  return windows.some((window) => {
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    if (start === null || end === null || start === end) return false;
    return start < end
      ? currentMinutes >= start && currentMinutes < end
      : currentMinutes >= start || currentMinutes < end;
  });
}

function localDateParts(date: Date, timezone: string): { weekday: Weekday; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    weekday: values.get("weekday")?.toLowerCase() as Weekday,
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute"))
  };
}

function parseTime(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d$/.exec(value);
  if (!match) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
