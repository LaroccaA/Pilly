import AsyncStorage from '@react-native-async-storage/async-storage';
import { Medication, MedicationPackage, createId } from '@/types/medication';

// Persisted AsyncStorage keys. The Italian values are kept for backward
// compatibility with existing local installs.
const CATALOG_STORAGE_KEY = 'catalogo_farmaci';
const PACKAGES_STORAGE_KEY = 'pacchi_pillole';

// Initial catalog used only on the very first launch, when no catalog has been
// saved yet. Users can edit, delete, or extend it freely afterwards.
function createInitialCatalog(): Medication[] {
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  const weekdays = [1, 2, 3, 4, 5];

  const createMedication = (
    name: string,
    time: string,
    defaultBoxSize: number,
    days: number[] = allDays
  ): Medication => ({
    id: createId('med'),
    name,
    defaultBoxSize,
    slots: [{ id: createId('slot'), time, dose: 1, weekdays: days }],
  });

  // Generic demo data: no real medication names or personal health data.
  return [
    createMedication('Farmaco Demo A', '08:00', 28),
    createMedication('Farmaco Demo B', '20:00', 14),
    createMedication('Farmaco Demo C', '12:00', 28, weekdays),
    createMedication('Farmaco Demo D', '13:30', 28),
    createMedication('Farmaco Demo E', '18:00', 40, weekdays),
    createMedication('Farmaco Demo F', '10:00', 14),
  ];
}

export async function getCatalog(): Promise<Medication[]> {
  const storedValue = await AsyncStorage.getItem(CATALOG_STORAGE_KEY);
  if (storedValue === null) {
    const initialCatalog = createInitialCatalog();
    await AsyncStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(initialCatalog));
    return initialCatalog;
  }
  return JSON.parse(storedValue);
}

export async function saveCatalog(catalog: Medication[]): Promise<void> {
  await AsyncStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
}

export async function getPackages(): Promise<MedicationPackage[]> {
  const storedValue = await AsyncStorage.getItem(PACKAGES_STORAGE_KEY);
  return storedValue ? JSON.parse(storedValue) : [];
}

export async function savePackages(packages: MedicationPackage[]): Promise<void> {
  await AsyncStorage.setItem(PACKAGES_STORAGE_KEY, JSON.stringify(packages));
}

export async function deleteMedicationFromCatalog(medicationId: string): Promise<void> {
  const catalog = await getCatalog();
  await saveCatalog(catalog.filter((medication) => medication.id !== medicationId));

  // Also remove the inventory package linked to that medication, if any.
  const packages = await getPackages();
  await savePackages(packages.filter((packageItem) => packageItem.medicationId !== medicationId));
}
