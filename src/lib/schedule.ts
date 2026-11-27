/** Standard working-day rows of the day grid; hours with appointments are added. */
export const BASE_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 - 20:00

interface Timed {
  appointment_date: string;
  status: string;
}

function localHour(a: Timed): number | null {
  const d = new Date(a.appointment_date);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}

export function scheduleHours(appointments: Timed[]): number[] {
  const hours = new Set(BASE_HOURS);
  for (const a of appointments) {
    const h = localHour(a);
    if (h !== null) hours.add(h);
  }
  return [...hours].sort((a, b) => a - b);
}

export function appointmentsForHour<T extends Timed>(appointments: T[], hour: number): T[] {
  return appointments
    .filter((a) => localHour(a) === hour)
    .sort((a, b) => {
      const cancelled = Number(a.status === "cancelled") - Number(b.status === "cancelled");
      if (cancelled !== 0) return cancelled;
      return new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime();
    });
}
