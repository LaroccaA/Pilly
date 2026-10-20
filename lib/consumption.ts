import { Medication, DoseSlot, MedicationPackage } from '@/types/medication';

// Scans from the "lastUpdatedAt" checkpoint to now, minute by minute across the
// configured times, and subtracts the correct dose whenever a time has passed.
export function reconcileConsumption(
  packages: MedicationPackage[],
  catalog: Medication[]
): MedicationPackage[] {
  const now = new Date();
  now.setSeconds(0, 0);

  return packages.map((packageItem) => {
    const medication = catalog.find((item) => item.id === packageItem.medicationId);
    if (!medication || !medication.slots || medication.slots.length === 0) return packageItem;

    const lastUpdate = new Date(packageItem.lastUpdatedAt);
    lastUpdate.setSeconds(0, 0);

    let amountToSubtract = 0;
    const scannedDay = new Date(lastUpdate);
    scannedDay.setHours(0, 0, 0, 0);

    while (scannedDay <= now) {
      const weekday = scannedDay.getDay();

      medication.slots.forEach((slot) => {
        if (!slot.weekdays.includes(weekday)) return;
        const [hours, minutes] = slot.time.split(':').map((value) => parseInt(value, 10));
        const doseDateTime = new Date(scannedDay);
        doseDateTime.setHours(hours, minutes, 0, 0);

        if (doseDateTime > lastUpdate && doseDateTime <= now) {
          amountToSubtract += slot.dose;
        }
      });

      scannedDay.setDate(scannedDay.getDate() + 1);
    }

    if (amountToSubtract > 0) {
      const nextRemaining = Math.max(0, packageItem.remaining - amountToSubtract);
      packageItem.remaining = Math.round(nextRemaining * 10000) / 10000;
      packageItem.lastUpdatedAt = now.toISOString();
    }
    return packageItem;
  });
}

// Sets "remaining" to a known value (e.g. after a physical count or a user
// correction) and moves the checkpoint to now.
// Moving the checkpoint is essential: otherwise the next reconciliation would
// apply the already-counted doses again and double-count them.
export function setRemaining(
  packageItem: MedicationPackage,
  newValue: number,
  now: Date = new Date()
): MedicationPackage {
  const checkpoint = new Date(now);
  checkpoint.setSeconds(0, 0);
  return {
    ...packageItem,
    remaining: Math.max(0, Math.round(newValue * 10000) / 10000),
    lastUpdatedAt: checkpoint.toISOString(),
  };
}

export interface StockEndResult {
  isDepleted: boolean;
  lastDoseDate: Date | null; // exact date/time of the last possible dose with current stock
  daysRemaining: number | null; // calendar days from now to that date (0 = today)
}

const EPSILON = 0.0005;

// Calculates the exact day and time when the current stock will run out by
// simulating the therapy forward (dose/time/weekdays) from now. The calculation
// is purely arithmetic: it can be performed once in advance and remain correct
// even if the app stays closed for weeks.
export function calculateStockEnd(
  medication: Medication,
  remaining: number,
  now: Date = new Date()
): StockEndResult {
  if (remaining <= EPSILON) {
    return { isDepleted: true, lastDoseDate: null, daysRemaining: null };
  }
  if (!medication.slots || medication.slots.length === 0) {
    return { isDepleted: false, lastDoseDate: null, daysRemaining: null };
  }

  const referenceTime = new Date(now);
  referenceTime.setSeconds(0, 0);

  const sortedSlots = [...medication.slots].sort((a, b) => a.time.localeCompare(b.time));

  let virtualRemaining = remaining;
  const day = new Date(referenceTime);
  day.setHours(0, 0, 0, 0);

  for (let index = 0; index < 3660; index++) {
    // ~10 years, as a safety limit against infinite loops.
    const weekday = day.getDay();
    for (const slot of sortedSlots) {
      if (!slot.weekdays.includes(weekday)) continue;
      const [hours, minutes] = slot.time.split(':').map((value) => parseInt(value, 10));
      const doseDate = new Date(day);
      doseDate.setHours(hours, minutes, 0, 0);

      // Doses already in the past relative to now are already included in
      // "remaining" (the reconciled value), so skip them.
      if (doseDate <= referenceTime) continue;

      virtualRemaining -= slot.dose;
      if (virtualRemaining <= EPSILON) {
        const todayMidnight = new Date(referenceTime);
        todayMidnight.setHours(0, 0, 0, 0);
        const doseDay = new Date(doseDate);
        doseDay.setHours(0, 0, 0, 0);
        const daysRemaining = Math.round(
          (doseDay.getTime() - todayMidnight.getTime()) / 86400000
        );
        return { isDepleted: false, lastDoseDate: doseDate, daysRemaining };
      }
    }
    day.setDate(day.getDate() + 1);
  }

  // This should never happen when the schedule has at least one active day.
  return { isDepleted: false, lastDoseDate: null, daysRemaining: null };
}

export interface AlertDay {
  date: Date; // exact date/time when the notification should be sent
  daysUntilEnd: number; // 0 = last day of stock, 1 = runs out tomorrow, etc.
}

// Returns the last N calendar days (with a scheduled intake) before stock runs
// out, with the exact date/time to send the notification that day (the time of
// the first active slot).
export function getAlertDays(
  medication: Medication,
  remaining: number,
  advanceDays: number,
  now: Date = new Date()
): AlertDay[] {
  const stockEnd = calculateStockEnd(medication, remaining, now);
  if (stockEnd.isDepleted || !stockEnd.lastDoseDate) return [];

  const endDay = new Date(stockEnd.lastDoseDate);
  endDay.setHours(0, 0, 0, 0);

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const sortedSlots = [...medication.slots].sort((a, b) => a.time.localeCompare(b.time));
  const daysWithDoses: Date[] = [];

  const cursor = new Date(today);
  let guard = 0;
  while (cursor <= endDay && guard < 3660) {
    guard++;
    const weekday = cursor.getDay();
    if (sortedSlots.some((slot: DoseSlot) => slot.weekdays.includes(weekday))) {
      daysWithDoses.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const lastDays = daysWithDoses.slice(-advanceDays);

  return lastDays.map((day) => {
    const weekday = day.getDay();
    const firstSlot = sortedSlots.find((slot: DoseSlot) => slot.weekdays.includes(weekday))!;
    const [hours, minutes] = firstSlot.time.split(':').map((value) => parseInt(value, 10));
    const notificationDate = new Date(day);
    notificationDate.setHours(hours, minutes, 0, 0);
    const daysUntilEnd = Math.round((endDay.getTime() - day.getTime()) / 86400000);
    return { date: notificationDate, daysUntilEnd };
  });
}
