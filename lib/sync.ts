import { getCatalog, getPackages, savePackages } from './storage';
import { reconcileConsumption } from './consumption';
import { scheduleStockNotifications } from './notifications';
import { Medication, MedicationPackage, InventoryRow } from '@/types/medication';

export function buildInventoryRows(
  packages: MedicationPackage[],
  catalog: Medication[]
): InventoryRow[] {
  return packages
    .map((packageItem) => {
      const medication = catalog.find((item) => item.id === packageItem.medicationId);
      return medication ? { packageItem, medication } : null;
    })
    .filter((row): row is InventoryRow => row !== null);
}

export interface SyncResult {
  packages: MedicationPackage[];
  catalog: Medication[];
  rows: InventoryRow[];
  log: string;
}

// Call this after ANY change (new box, created or edited medication, manual
// quantity correction, deletion, ...): it reconciles consumption up to now with
// the current schedule, saves the result, and reschedules every notification
// from scratch. This is the only place in the app that touches notifications,
// so the displayed data and the alert data can never drift apart.
export async function syncAndScheduleNotifications(): Promise<SyncResult> {
  const catalog = await getCatalog();
  let packages = await getPackages();
  packages = reconcileConsumption(packages, catalog);
  await savePackages(packages);
  const log = await scheduleStockNotifications(packages, catalog);
  const rows = buildInventoryRows(packages, catalog);
  return { packages, catalog, rows, log };
}
