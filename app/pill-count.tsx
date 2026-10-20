import { setRemaining } from '@/lib/consumption';
import { getPackages, savePackages } from '@/lib/storage';
import { syncAndScheduleNotifications } from '@/lib/sync';
import { InventoryRow, medicationDenominator, formatDose, formatFraction, formatMixedNumber } from '@/types/medication';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type CountResult = { type: 'ok' | 'below' | 'above'; difference: number; commonDose: number | null; denominator: number };

export default function PillCountScreen() {
  const [rows, setRows] = useState<InventoryRow[]>([]);

  const [activeRow, setActiveRow] = useState<InventoryRow | null>(null);
  const [denominator, setDenominator] = useState(1);
  const [totalUnits, setTotalUnits] = useState(0); // number of units of size 1/denominator
  const [isInputVisible, setInputVisible] = useState(false);

  const [countResult, setCountResult] = useState<CountResult | null>(null);
  const [isResultVisible, setResultVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      syncAndScheduleNotifications().then((syncResult) => setRows(syncResult.rows));
    }, [])
  );

  const openInput = (row: InventoryRow) => {
    setActiveRow(row);
    setDenominator(medicationDenominator(row.medication));
    setTotalUnits(0);
    setInputVisible(true);
  };

  const wholePills = Math.floor(totalUnits / denominator);
  const remainder = totalUnits % denominator;
  const totalPills = totalUnits / denominator;

  const changeWholePills = (wholeDelta: number) => {
    setTotalUnits((prev) => Math.max(0, prev + wholeDelta * denominator));
  };

  const setWholePillsFromText = (text: string) => {
    const parsed = parseInt(text.replace(/[^0-9]/g, ''), 10);
    const nextWholePills = Number.isNaN(parsed) ? 0 : parsed;
    setTotalUnits(nextWholePills * denominator + remainder);
  };

  const changeFraction = (fractionDelta: number) => {
    setTotalUnits((prev) => Math.max(0, prev + fractionDelta));
  };

  const verifyCount = () => {
    if (!activeRow) return;
    const expected = activeRow.packageItem.remaining;
    const difference = Math.round((totalPills - expected) * 10000) / 10000;

    const uniqueDoses = new Set(activeRow.medication.slots.map((slot) => slot.dose));
    const commonDose = uniqueDoses.size === 1 ? activeRow.medication.slots[0].dose : null;

    let resultType: CountResult['type'] = 'ok';
    if (Math.abs(difference) > 0.01) {
      resultType = difference > 0 ? 'below' : 'above';
    }

    setCountResult({ type: resultType, difference: Math.abs(difference), commonDose, denominator });
    setInputVisible(false);
    setResultVisible(true);
  };

  const updateStock = async () => {
    if (!activeRow) return;
    const packages = await getPackages();
    const updatedPackages = packages.map((packageItem) =>
      packageItem.id === activeRow.packageItem.id ? setRemaining(packageItem, totalPills) : packageItem
    );
    await savePackages(updatedPackages);
    const syncResult = await syncAndScheduleNotifications();
    setRows(syncResult.rows);
    setResultVisible(false);
  };

  const getResultMessage = (): { title: string; subtitle: string; color: string; icon: string } => {
    if (!countResult) return { title: '', subtitle: '', color: '#2c3e50', icon: '' };

    if (countResult.type === 'ok') {
      return { title: 'Presa sempre correttamente', subtitle: 'Tutto ok, hai seguito la terapia esattamente!', color: '#2ecc71', icon: '✅' };
    }

    const pills = formatMixedNumber(countResult.difference, countResult.denominator);
    const doseHint =
      countResult.commonDose && countResult.commonDose > 0
        ? ` (circa ${Math.round(countResult.difference / countResult.commonDose)} assunzion${Math.round(countResult.difference / countResult.commonDose) === 1 ? 'e' : 'i'})`
        : '';

    if (countResult.type === 'below') {
      return {
        title: `Ne hai prese ${pills} in meno`,
        subtitle: `Hai ${pills} compresse in più di quelle previste dallo schema${doseHint}: probabilmente hai saltato qualche assunzione.`,
        color: '#e67e22',
        icon: '⚠️',
      };
    }

    return {
      title: `Ne hai prese ${pills} in più`,
      subtitle: `Hai ${pills} compresse in meno di quelle previste dallo schema${doseHint}: potresti aver preso una dose doppia, o perso/rotto qualche compressa.`,
      color: '#e74c3c',
      icon: '❗',
    };
  };

  const resultMessage = getResultMessage();

  return (
    <View style={styles.container}>
      <Text style={styles.explanation}>
        Scegli un farmaco e conta quante compresse hai davvero nella scatola in questo momento: ti dirò se
        corrisponde a quello che dovresti avere seguendo la terapia.
      </Text>

      <FlatList
        contentContainerStyle={{ paddingBottom: 100 }}
        data={rows}
        keyExtractor={(item) => item.packageItem.id}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessuna pillola in inventario da verificare.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openInput(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.medication.name}</Text>
              <Text style={styles.details}>
                Il sistema prevede: {formatMixedNumber(item.packageItem.remaining, medicationDenominator(item.medication))} compresse
              </Text>
            </View>
            <Text style={styles.chevron}>🔍</Text>
          </TouchableOpacity>
        )}
      />

      <Modal animationType="fade" transparent visible={isInputVisible} onRequestClose={() => setInputVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            {activeRow && (
              <>
                <Text style={styles.modalTitle}>Quante compresse conti ora di {activeRow.medication.name}?</Text>

                <Text style={styles.rowLabel}>Compresse intere</Text>
                <View style={styles.quantityControl}>
                  <TouchableOpacity style={styles.stepperButton} onPress={() => changeWholePills(-1)}>
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.quantityInput}
                    value={String(wholePills)}
                    onChangeText={setWholePillsFromText}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity style={styles.stepperButton} onPress={() => changeWholePills(1)}>
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>

                {denominator > 1 && (
                  <>
                    <Text style={styles.rowLabel}>
                      Più un pezzo da {formatDose(1 / denominator)} di compressa (passo esatto del tuo dosaggio)
                    </Text>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity style={styles.fractionButton} onPress={() => changeFraction(-1)}>
                        <Text style={styles.fractionButtonText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.fractionValue}>{formatFraction(remainder, denominator)}</Text>
                      <TouchableOpacity style={styles.fractionButton} onPress={() => changeFraction(1)}>
                        <Text style={styles.fractionButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Totale contato</Text>
                  <Text style={styles.totalValue}>{formatMixedNumber(totalPills, denominator)} compresse</Text>
                </View>

                <TouchableOpacity style={[styles.confirmButton, { marginTop: 15 }]} onPress={verifyCount}>
                  <Text style={styles.confirmButtonText}>🔍 Verifica</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setInputVisible(false)}>
                  <Text style={styles.cancelButtonText}>Annulla</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" transparent visible={isResultVisible} onRequestClose={() => setResultVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.resultIcon}>{resultMessage.icon}</Text>
            <Text style={[styles.modalTitle, { color: resultMessage.color }]}>{resultMessage.title}</Text>
            <Text style={styles.resultSubtitle}>{resultMessage.subtitle}</Text>

            {countResult && countResult.type !== 'ok' && (
              <TouchableOpacity style={styles.confirmButton} onPress={updateStock}>
                <Text style={styles.confirmButtonText}>✅ Aggiorna la scorta a questo valore</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.cancelButton} onPress={() => setResultVisible(false)}>
              <Text style={styles.cancelButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 15, paddingHorizontal: 20 },
  explanation: { fontSize: 13, color: '#7f8c8d', marginBottom: 15, lineHeight: 18 },
  emptyText: { textAlign: 'center', color: '#95a5a6', fontSize: 16, marginTop: 40 },
  card: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  name: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 4 },
  details: { color: '#7f8c8d', fontSize: 14, fontWeight: '500' },
  chevron: { fontSize: 20, marginLeft: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25, alignItems: 'center' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2c3e50', marginBottom: 15, textAlign: 'center' },
  rowLabel: { fontSize: 13, color: '#7f8c8d', fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  resultIcon: { fontSize: 40, marginBottom: 5 },
  resultSubtitle: { fontSize: 14, color: '#7f8c8d', textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  stepperButton: { backgroundColor: '#f1f2f6', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  stepperButtonText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  quantityInput: { fontSize: 36, fontWeight: 'bold', color: '#3498db', marginHorizontal: 20, minWidth: 70, textAlign: 'center' },
  fractionButton: { backgroundColor: '#f1f2f6', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  fractionButtonText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  fractionValue: { fontSize: 22, fontWeight: 'bold', color: '#3498db', marginHorizontal: 20, minWidth: 60, textAlign: 'center' },
  totalContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eaf4fc', borderRadius: 10, padding: 12, width: '100%' },
  totalLabel: { fontSize: 14, color: '#2c3e50', fontWeight: 'bold' },
  totalValue: { fontSize: 16, color: '#3498db', fontWeight: 'bold' },
  confirmButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 5, borderColor: '#2ecc71', borderWidth: 1 },
  confirmButtonText: { color: '#2ecc71', fontWeight: 'bold', fontSize: 16, textAlign: 'center' },
  cancelButton: { padding: 15, width: '100%', alignItems: 'center' },
  cancelButtonText: { color: '#7f8c8d', fontSize: 16, fontWeight: 'bold' },
});
