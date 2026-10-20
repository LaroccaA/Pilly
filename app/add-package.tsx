import { getCatalog, getPackages, savePackages } from '@/lib/storage';
import { syncAndScheduleNotifications } from '@/lib/sync';
import { Medication, MedicationPackage, formatDose, formatWeekdays } from '@/types/medication';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function AddPackageScreen() {
  const [catalog, setCatalog] = useState<Medication[]>([]);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [quantityText, setQuantityText] = useState('');
  const [isDialogVisible, setDialogVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getCatalog().then(setCatalog);
    }, [])
  );

  const openQuantityDialog = (medication: Medication) => {
    setSelectedMedication(medication);
    setQuantityText(String(medication.defaultBoxSize));
    setDialogVisible(true);
  };

  const changeQuantity = (delta: number) => {
    const current = parseInt(quantityText, 10) || 0;
    setQuantityText(String(Math.max(1, current + delta)));
  };

  const confirmAdd = async () => {
    if (!selectedMedication) return;
    const quantity = parseInt(quantityText, 10);
    if (!quantity || quantity <= 0) return;

    const packages = await getPackages();
    const existingIndex = packages.findIndex((packageItem) => packageItem.medicationId === selectedMedication.id);

    if (existingIndex >= 0) {
      // The medication is already in the inventory: add the new box to the
      // remaining pills without touching "lastUpdatedAt" (to avoid double counting).
      packages[existingIndex].remaining += quantity;
      packages[existingIndex].totalPills += quantity;
    } else {
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const newPackage: MedicationPackage = {
        id: selectedMedication.id,
        medicationId: selectedMedication.id,
        totalPills: quantity,
        remaining: quantity,
        lastUpdatedAt: todayMidnight.toISOString(),
      };
      packages.push(newPackage);
    }

    await savePackages(packages);
    await syncAndScheduleNotifications();
    setDialogVisible(false);
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quale Medicinale hai comprato?</Text>
      <Text style={styles.subtitle}>Tocca la medicina per aggiungerla all&apos;inventario.</Text>

      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessun farmaco nel catalogo. Creane uno nuovo.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.medicationButton} onPress={() => openQuantityDialog(item)}>
            <View>
              <Text style={styles.medicationName}>{item.name}</Text>
              <Text style={styles.medicationDetails}>
                Scatola da {item.defaultBoxSize} compresse ·{' '}
                {item.slots.map((slot) => `${formatDose(slot.dose)} compressa alle ${slot.time}`).join(', ')}
              </Text>
              {item.slots[0] && (
                <Text style={styles.medicationDetails}>{formatWeekdays(item.slots[0].weekdays)}</Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.newButton} onPress={() => router.push('/medication-form')}>
        <Text style={styles.newButtonText}>+ Crea nuovo farmaco</Text>
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={isDialogVisible} onRequestClose={() => setDialogVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            {selectedMedication && (
              <>
                <Text style={styles.modalTitle}>Quante compresse in questa scatola di {selectedMedication.name}?</Text>
                <View style={styles.quantityControl}>
                  <TouchableOpacity style={styles.stepperButton} onPress={() => changeQuantity(-1)}>
                    <Text style={styles.stepperButtonText}>-</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.quantityInput}
                    value={quantityText}
                    onChangeText={setQuantityText}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity style={styles.stepperButton} onPress={() => changeQuantity(1)}>
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.confirmButton} onPress={confirmAdd}>
                  <Text style={styles.confirmButtonText}>✅ Aggiungi all&apos;inventario</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setDialogVisible(false)}>
                  <Text style={styles.cancelButtonText}>Annulla</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  title: { fontSize: 24, fontWeight: '900', color: '#2c3e50', marginBottom: 5 },
  subtitle: { fontSize: 15, color: '#7f8c8d', marginBottom: 25 },
  medicationButton: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 18,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  medicationName: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50' },
  medicationDetails: { fontSize: 13, color: '#95a5a6', marginTop: 2 },
  emptyText: { textAlign: 'center', color: '#95a5a6', fontSize: 16, marginTop: 40 },
  newButton: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3498db',
    borderStyle: 'dashed',
    marginTop: 10,
    marginBottom: 20,
  },
  newButtonText: { color: '#3498db', fontWeight: 'bold', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20, textAlign: 'center' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  stepperButton: { backgroundColor: '#f1f2f6', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  stepperButtonText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  quantityInput: { fontSize: 36, fontWeight: 'bold', color: '#3498db', marginHorizontal: 20, minWidth: 80, textAlign: 'center' },
  confirmButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 5, borderColor: '#2ecc71', borderWidth: 1 },
  confirmButtonText: { color: '#2ecc71', fontWeight: 'bold', fontSize: 16 },
  cancelButton: { padding: 15, width: '100%', alignItems: 'center' },
  cancelButtonText: { color: '#7f8c8d', fontSize: 16, fontWeight: 'bold' },
});
