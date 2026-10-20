// Shared types for the Pilly app.
// The app is fully parameterized: every medication is defined by the user
// (name, dose per intake, times, and weekdays when it must be taken).

// Dose taken at each scheduled time, expressed as a fraction of a pill.
export const DOSE_OPTIONS = [
  { label: '1/4', value: 0.25 },
  { label: '1/3', value: 1 / 3 },
  { label: '1/2', value: 0.5 },
  { label: '1', value: 1 },
] as const;

export type DoseValue = (typeof DOSE_OPTIONS)[number]['value'];

// 0 = Sunday ... 6 = Saturday, matching Date.getDay().
export const WEEKDAYS = [
  { index: 1, label: 'L' },
  { index: 2, label: 'M' },
  { index: 3, label: 'M' },
  { index: 4, label: 'G' },
  { index: 5, label: 'V' },
  { index: 6, label: 'S' },
  { index: 0, label: 'D' },
] as const;

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

// A scheduled intake: what time, how much, and on which weekdays.
export interface DoseSlot {
  id: string;
  time: string; // 'HH:MM'
  dose: DoseValue;
  weekdays: number[]; // weekdays when this slot is active
}

// Medication: the user-configurable therapy card stored in the catalog.
export interface Medication {
  id: string;
  name: string;
  defaultBoxSize: number; // default number of pills in one box
  slots: DoseSlot[];
}

// Medication package: one box in the inventory, linked to a catalog medication.
export interface MedicationPackage {
  id: string; // = medicationId (one active package per medication)
  medicationId: string;
  totalPills: number;
  remaining: number;
  lastUpdatedAt: string; // ISO date string
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

export function formatDose(dose: number): string {
  const match = DOSE_OPTIONS.find((option) => Math.abs(option.value - dose) < 0.001);
  return match ? match.label : dose.toFixed(2);
}

export function formatWeekdays(weekdays: number[]): string {
  if (weekdays.length === 7) return 'Tutti i giorni';
  if (weekdays.length === 0) return 'Mai';
  const businessDays = [1, 2, 3, 4, 5];
  const weekend = [0, 6];
  const isBusinessWeek = businessDays.every((day) => weekdays.includes(day)) && weekdays.length === 5;
  const isWeekend = weekend.every((day) => weekdays.includes(day)) && weekdays.length === 2;
  if (isBusinessWeek) return 'Lun-Ven';
  if (isWeekend) return 'Sab-Dom';
  return WEEKDAYS.filter((day) => weekdays.includes(day.index))
    .map((day) => day.label)
    .join(' ');
}


function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

// Dose denominator: 1 -> 1, 1/2 -> 2, 1/3 -> 3, 1/4 -> 4.
// It makes the steppers move by the exact dose step instead of a whole pill,
// so the UI never has to display decimal quantities.
export function doseDenominator(dose: number): number {
  return Math.max(1, Math.round(1 / dose));
}

// Formats a fraction in a readable way (never as a decimal), reducing it when
// possible: e.g. numerator=2, denominator=4 -> "1/2".
export function formatFraction(numerator: number, denominator: number): string {
  if (numerator === 0) return '0';
  if (denominator <= 1) return String(numerator);
  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  return reducedDenominator === 1
    ? String(reducedNumerator)
    : `${reducedNumerator}/${reducedDenominator}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDaysRemaining(days: number): string {
  if (days === 0) return 'oggi';
  if (days === 1) return 'domani';
  return `tra ${days} giorni`;
}

// Enriched row: an inventory package joined with its catalog medication.
export interface InventoryRow {
  packageItem: MedicationPackage;
  medication: Medication;
}

// Splits a quantity (possibly decimal, e.g. 14.333...) into "whole pills +
// fractional remainder", based on the medication dose denominator. This is the
// shared basis for both rendering and the steppers.
export function splitIntoFractions(
  quantity: number,
  denominator: number
): { wholePills: number; remainder: number; totalUnits: number } {
  const normalizedDenominator = Math.max(1, Math.round(denominator));
  const totalUnits = Math.max(0, Math.round(quantity * normalizedDenominator));
  return {
    wholePills: Math.floor(totalUnits / normalizedDenominator),
    remainder: totalUnits % normalizedDenominator,
    totalUnits,
  };
}

// Formats a quantity as "14+1/3", "14+2/3", or "15" -- never as a decimal.
export function formatMixedNumber(quantity: number, denominator: number): string {
  const { wholePills, remainder } = splitIntoFractions(quantity, denominator);
  if (remainder === 0) return String(wholePills);
  if (wholePills === 0) return formatFraction(remainder, denominator);
  return `${wholePills}+${formatFraction(remainder, denominator)}`;
}

// The finest denominator across all slots of a medication: if it has both
// 1/2 and 1/4 doses, use quarters (4), so every physically possible
// combination can be represented exactly.
export function medicationDenominator(medication: Medication): number {
  if (!medication.slots || medication.slots.length === 0) return 1;
  return Math.max(1, ...medication.slots.map((slot) => doseDenominator(slot.dose)));
}
