import { reconcileConsumption } from '@/lib/consumption';
import { deleteMedicationFromCatalog, getCatalog, saveCatalog, getPackages, savePackages } from '@/lib/storage';
import { syncAndScheduleNotifications } from '@/lib/sync';
import {
  Medication,
  DoseSlot,
  DoseValue,
  WEEKDAYS,
  DOSE_OPTIONS,
  ALL_WEEKDAYS,
  createId,
} from '@/types/medication';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

function createSlot(): DoseSlot {
  return { id: createId('slot'), time: '08:00', dose: 1, weekdays: [...ALL_WEEKDAYS] };
}

export default function MedicationFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [isLoaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [boxSize, setBoxSize] = useState('28');
  const [slots, setSlots] = useState<DoseSlot[]>([createSlot()]);

  useEffect(() => {
    (async () => {
      if (isEditing) {
        const catalog = await getCatalog();
        const medication = catalog.find((item) => item.id === id);
        if (medication) {
          setName(medication.name);
          setBoxSize(String(medication.defaultBoxSize));
          setSlots(medication.slots.length > 0 ? medication.slots : [createSlot()]);
        }
      }
      setLoaded(true);
    })();
  }, [id, isEditing]);

  const changeHour = (slotId: string, hourDelta: number) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const [hours, minutes] = slot.time.split(':').map((value) => parseInt(value, 10));
        const nextHour = (hours + hourDelta + 24) % 24;
        return { ...slot, time: `${String(nextHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` };
      })
    );
  };

  const changeMinutes = (slotId: string, minuteDelta: number) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const [hours, minutes] = slot.time.split(':').map((value) => parseInt(value, 10));
        const nextMinute = (minutes + minuteDelta + 60) % 60;
        return { ...slot, time: `${String(hours).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}` };
      })
    );
  };

  const changeDose = (slotId: string, dose: DoseValue) => {
    setSlots((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, dose } : slot)));
  };

  const toggleWeekday = (slotId: string, weekday: number) => {
    setSlots((prev) =>
      prev.map((slot) => {
        if (slot.id !== slotId) return slot;
        const isActive = slot.weekdays.includes(weekday);
        const nextWeekdays = isActive
          ? slot.weekdays.filter((day) => day !== weekday)
          : [...slot.weekdays, weekday];
        return { ...slot, weekdays: nextWeekdays };
      })
    );
  };

  const addSlot = () => setSlots((prev) => [...prev, createSlot()]);
  const removeSlot = (slotId: string) => {
    if (slots.length <= 1) {
      Alert.alert('Attenzione', 'Deve rimanere almeno un orario.');
      return;
    }
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Attenzione', 'Inserisci il nome del farmaco.');
      return;
    }
    const parsedBoxSize = parseInt(boxSize, 10);
    if (!parsedBoxSize || parsedBoxSize <= 0) {
      Alert.alert('Attenzione', 'Inserisci una quantità valida per la scatola.');
      return;
    }
    const activeSlots = slots.filter((slot) => slot.weekdays.length > 0);
    if (activeSlots.length === 0) {
      Alert.alert('Attenzione', 'Ogni orario deve avere almeno un giorno selezionato.');
      return;
    }

    // Current catalog AS IT IS NOW (old schema), used only to settle
    // consumption before applying the changes.
    const previousCatalog = await getCatalog();

    const nameAlreadyExists =
      !isEditing && previousCatalog.some(
        (medication) => medication.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
    if (nameAlreadyExists) {
      const shouldContinue = await new Promise<boolean>((resolve) => {
        Alert.alert(
          'Farmaco già presente',
          `Esiste già un farmaco chiamato "${trimmedName}" nel catalogo. Vuoi crearne comunque uno nuovo separato?`,
          [
            { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Crea comunque', onPress: () => resolve(true) },
          ]
        );
      });
      if (!shouldContinue) return;
    }

    // 1) If I am editing a medication that already has an active package in
    //    the inventory, settle consumption first: compute usage from the OLD
    //    schema up to NOW and save it. Only then apply the new schema. This
    //    keeps already-taken doses correct even if dose/time/days are being
    //    changed right now.
    if (isEditing) {
      const packages = await getPackages();
      const reconciledPackages = reconcileConsumption(packages, previousCatalog);
      await savePackages(reconciledPackages);
    }

    // 2) Apply the new schema to the catalog.
    const updatedMedication: Medication = {
      id: isEditing ? (id as string) : createId('med'),
      name: trimmedName,
      defaultBoxSize: parsedBoxSize,
      slots: activeSlots,
    };

    const updatedCatalog = isEditing
      ? previousCatalog.map((medication) => (medication.id === id ? updatedMedication : medication))
      : [...previousCatalog, updatedMedication];

    await saveCatalog(updatedCatalog);

    // 3) Reschedule all notifications immediately with the updated data.
    await syncAndScheduleNotifications();

    router.back();
  };

  const remove = () => {
    Alert.alert('Elimina farmaco', `Vuoi davvero eliminare "${name}" dal catalogo? Verrà rimossa anche l'eventuale scatola in inventario.`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          await deleteMedicationFromCatalog(id as string);
          await syncAndScheduleNotifications();
          router.back();
        },
      },
    ]);
  };

  if (!isLoaded) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      {isEditing && (
        <Text style={styles.editInfo}>
          ℹ️ Le modifiche si applicano da adesso in poi: le dosi già prese con lo schema precedente restano
          conteggiate correttamente, la data di fine scorta e le notifiche vengono ricalcolate subito.
        </Text>
      )}
      <Text style={styles.label}>Nome farmaco</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Es. Farmaco Demo A"
        placeholderTextColor="#95a5a6"
      />

      <Text style={styles.label}>Compresse per scatola (di default)</Text>
      <TextInput
        style={styles.input}
        value={boxSize}
        onChangeText={setBoxSize}
        keyboardType="number-pad"
        placeholder="28"
        placeholderTextColor="#95a5a6"
      />

      <Text style={styles.sectionTitle}>Orari di assunzione</Text>
      <Text style={styles.sectionSubtitle}>
        Per ogni orario scegli quanta compressa prendere e in quali giorni della settimana.
      </Text>

      {slots.map((slot) => (
        <View key={slot.id} style={styles.slotCard}>
          <View style={styles.timeRow}>
            <View style={styles.timeStepper}>
              <TouchableOpacity style={styles.timeStepperButton} onPress={() => changeHour(slot.id, -1)}>
                <Text style={styles.timeStepperButtonText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.timeValue}>{slot.time}</Text>
              <TouchableOpacity style={styles.timeStepperButton} onPress={() => changeHour(slot.id, 1)}>
                <Text style={styles.timeStepperButtonText}>+</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.timeStepper}>
              <TouchableOpacity style={styles.minuteStepperButton} onPress={() => changeMinutes(slot.id, -5)}>
                <Text style={styles.minuteStepperButtonText}>−5m</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.minuteStepperButton} onPress={() => changeMinutes(slot.id, 5)}>
                <Text style={styles.minuteStepperButtonText}>+5m</Text>
              </TouchableOpacity>
            </View>
            {slots.length > 1 && (
              <TouchableOpacity style={styles.removeSlotButton} onPress={() => removeSlot(slot.id)}>
                <Text style={styles.removeSlotButtonText}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.smallLabel}>Quantità per assunzione</Text>
          <View style={styles.chipRow}>
            {DOSE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.label}
                style={[styles.chip, Math.abs(slot.dose - option.value) < 0.001 && styles.activeChip]}
                onPress={() => changeDose(slot.id, option.value)}
              >
                <Text style={[styles.chipText, Math.abs(slot.dose - option.value) < 0.001 && styles.activeChipText]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.smallLabel}>Giorni della settimana</Text>
          <View style={styles.chipRow}>
            {WEEKDAYS.map((weekday) => {
              const isActive = slot.weekdays.includes(weekday.index);
              return (
                <TouchableOpacity
                  key={weekday.index}
                  style={[styles.weekdayChip, isActive && styles.activeWeekdayChip]}
                  onPress={() => toggleWeekday(slot.id, weekday.index)}
                >
                  <Text style={[styles.weekdayChipText, isActive && styles.activeWeekdayChipText]}>{weekday.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.addSlotButton} onPress={addSlot}>
        <Text style={styles.addSlotButtonText}>+ Aggiungi un altro orario</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.saveButton} onPress={save}>
        <Text style={styles.saveButtonText}>✅ Salva farmaco</Text>
      </TouchableOpacity>

      {isEditing && (
        <TouchableOpacity style={styles.deleteButton} onPress={remove}>
          <Text style={styles.deleteButtonText}>🗑️ Elimina farmaco dal catalogo</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  editInfo: { fontSize: 12, color: '#2980b9', backgroundColor: '#eaf4fc', padding: 12, borderRadius: 10, marginBottom: 10, lineHeight: 17 },
  label: { fontSize: 14, fontWeight: 'bold', color: '#2c3e50', marginTop: 15, marginBottom: 6 },
  smallLabel: { fontSize: 12, fontWeight: 'bold', color: '#7f8c8d', marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#e1e5ea', color: '#2c3e50' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginTop: 25 },
  sectionSubtitle: { fontSize: 13, color: '#7f8c8d', marginTop: 4, marginBottom: 15 },
  slotCard: { backgroundColor: '#fff', borderRadius: 15, padding: 16, marginBottom: 15, borderWidth: 1, borderColor: '#eee' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeStepper: { flexDirection: 'row', alignItems: 'center' },
  timeStepperButton: { backgroundColor: '#f1f2f6', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  timeStepperButtonText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  timeValue: { fontSize: 20, fontWeight: 'bold', color: '#3498db', marginHorizontal: 12, minWidth: 60, textAlign: 'center' },
  minuteStepperButton: { backgroundColor: '#f1f2f6', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, marginLeft: 6 },
  minuteStepperButtonText: { fontSize: 12, fontWeight: 'bold', color: '#333' },
  removeSlotButton: { marginLeft: 10, padding: 6 },
  removeSlotButtonText: { fontSize: 18 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f2f6', borderWidth: 1, borderColor: '#e1e5ea' },
  activeChip: { backgroundColor: '#3498db', borderColor: '#3498db' },
  chipText: { color: '#2c3e50', fontWeight: 'bold', fontSize: 14 },
  activeChipText: { color: '#fff' },
  weekdayChip: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f1f2f6', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e1e5ea' },
  activeWeekdayChip: { backgroundColor: '#2ecc71', borderColor: '#2ecc71' },
  weekdayChipText: { color: '#2c3e50', fontWeight: 'bold' },
  activeWeekdayChipText: { color: '#fff' },
  addSlotButton: { padding: 15, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#3498db', borderStyle: 'dashed', marginBottom: 25 },
  addSlotButtonText: { color: '#3498db', fontWeight: 'bold', fontSize: 15 },
  saveButton: { backgroundColor: '#2ecc71', padding: 18, borderRadius: 10, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  deleteButton: { padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 15, borderWidth: 1, borderColor: '#e74c3c' },
  deleteButtonText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 15 },
});
