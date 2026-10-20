import { calculateStockEnd, setRemaining } from '@/lib/consumption';
import { configureNotifications, ADVANCE_NOTICE_DAYS, sendTestNotification, checkNotificationPermissions } from '@/lib/notifications';
import { getPackages, savePackages } from '@/lib/storage';
import { syncAndScheduleNotifications } from '@/lib/sync';
import {
  InventoryRow,
  medicationDenominator,
  formatDose,
  formatFraction,
  formatDate,
  formatWeekdays,
  formatDaysRemaining,
  formatMixedNumber,
  splitIntoFractions,
} from '@/types/medication';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function App() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [isMenuVisible, setMenuVisible] = useState(false);
  const [activeRow, setActiveRow] = useState<InventoryRow | null>(null);
  const [denominator, setDenominator] = useState(1);
  const [totalUnits, setTotalUnits] = useState(0); // number of units of size 1/denominator

  const [isSupportVisible, setSupportVisible] = useState(false);
  const [notificationLog, setNotificationLog] = useState('Caricamento log...');
  const [permissionsGranted, setPermissionsGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      configureNotifications().then(setPermissionsGranted);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAndRefreshData();
    }, [])
  );

  const loadAndRefreshData = async () => {
    try {
      const syncResult = await syncAndScheduleNotifications();
      setRows(syncResult.rows);
      setNotificationLog(syncResult.log);
      if (Platform.OS !== 'web') {
        setPermissionsGranted(await checkNotificationPermissions());
      }
    } catch (error) {
      console.error('Failed to load inventory:', error);
    }
  };

  const openManageMenu = (row: InventoryRow) => {
    setActiveRow(row);
    const nextDenominator = medicationDenominator(row.medication);
    setDenominator(nextDenominator);
    setTotalUnits(splitIntoFractions(row.packageItem.remaining, nextDenominator).totalUnits);
    setMenuVisible(true);
  };

  const changeWholePills = (wholeDelta: number) => {
    setTotalUnits((prev) => Math.max(0, prev + wholeDelta * denominator));
  };

  const setWholePillsFromText = (text: string) => {
    const remainder = totalUnits % denominator;
    const parsed = parseInt(text.replace(/[^0-9]/g, ''), 10);
    const nextWholePills = Number.isNaN(parsed) ? 0 : parsed;
    setTotalUnits(nextWholePills * denominator + remainder);
  };

  const changeFraction = (fractionDelta: number) => {
    setTotalUnits((prev) => Math.max(0, prev + fractionDelta));
  };

  const confirmChanges = async () => {
    if (!activeRow) return;
    const newValue = totalUnits / denominator;
    const packages = await getPackages();
    const updatedPackages = packages.map((packageItem) =>
      packageItem.id === activeRow.packageItem.id ? setRemaining(packageItem, newValue) : packageItem
    );
    await savePackages(updatedPackages);
    setMenuVisible(false);
    loadAndRefreshData();
  };

  const removeMedication = () => {
    if (!activeRow) return;
    Alert.alert('Attenzione', `Vuoi davvero rimuovere ${activeRow.medication.name} dall'inventario?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rimuovi',
        style: 'destructive',
        onPress: async () => {
          const packages = await getPackages();
          const updatedPackages = packages.filter((packageItem) => packageItem.id !== activeRow.packageItem.id);
          await savePackages(updatedPackages);
          setMenuVisible(false);
          loadAndRefreshData();
        },
      },
    ]);
  };

  const editMedication = () => {
    if (!activeRow) return;
    setMenuVisible(false);
    router.push({ pathname: '/medication-form', params: { id: activeRow.medication.id } });
  };

  const testNotification = async () => {
    await sendTestNotification();
    Alert.alert('Test Avviato', "Esci subito dall'app o riducila a icona. La notifica arriverà tra 5 secondi!");
  };

  const notificationStatusLabel =
    Platform.OS === 'web'
      ? 'Non disponibili sul web'
      : permissionsGranted === null
        ? '...'
        : permissionsGranted
          ? '✅ Attive'
          : '❌ Disattivate';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Pilly</Text>
        <Text style={styles.subtitle}>Monitoraggio Farmaci</Text>
      </View>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarButton} onPress={() => router.push('/medications')}>
          <Text style={styles.toolbarIcon}>💊</Text>
          <Text style={styles.toolbarText}>Farmaci</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={() => router.push('/pill-count')}>
          <Text style={styles.toolbarIcon}>🧮</Text>
          <Text style={styles.toolbarText}>Calcolo{'\n'}Pillole</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton} onPress={() => setSupportVisible(true)}>
          <Text style={styles.toolbarIcon}>🛠️</Text>
          <Text style={styles.toolbarText}>Assistenza</Text>
        </TouchableOpacity>
      </View>

      {permissionsGranted === false && Platform.OS !== 'web' && (
        <TouchableOpacity style={styles.warningBanner} onPress={() => Linking.openSettings()}>
          <Text style={styles.warningBannerText}>
            ⚠️ Notifiche disattivate: non riceverai gli avvisi. Tocca qui per attivarle.
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        data={rows}
        keyExtractor={(item) => item.packageItem.id}
        renderItem={({ item }) => {
          const stockEnd = calculateStockEnd(item.medication, item.packageItem.remaining);
          const isRunningLow = stockEnd.isDepleted || (stockEnd.daysRemaining !== null && stockEnd.daysRemaining < ADVANCE_NOTICE_DAYS);

          return (
            <View style={[styles.card, isRunningLow && styles.depletedCard]}>
              <View style={styles.cardHeader}>
                <Text style={styles.medicationName}>{item.medication.name}</Text>
                <View style={styles.remainingBadge}>
                  <Text style={isRunningLow ? styles.remainingRed : styles.remainingGreen}>
                    {formatMixedNumber(item.packageItem.remaining, medicationDenominator(item.medication))}
                  </Text>
                </View>
              </View>
              {item.medication.slots.map((slot) => (
                <Text key={slot.id} style={styles.details}>
                  {formatDose(slot.dose)} compressa alle {slot.time} · {formatWeekdays(slot.weekdays)}
                </Text>
              ))}

              {stockEnd.isDepleted && <Text style={styles.warning}>⚠️ Scorta esaurita!</Text>}
              {!stockEnd.isDepleted && stockEnd.lastDoseDate && stockEnd.daysRemaining !== null && (
                <Text style={isRunningLow ? styles.warning : styles.prediction}>
                  {isRunningLow ? '⚠️ ' : ''}
                  Finisce il {formatDate(stockEnd.lastDoseDate)} ({formatDaysRemaining(stockEnd.daysRemaining)})
                </Text>
              )}

              <TouchableOpacity style={styles.manageButton} onPress={() => openManageMenu(item)}>
                <Text style={styles.manageButtonText}>⚙️ Gestisci</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessuna pillola in inventario.</Text>}
      />

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.addButton} onPress={() => router.push('/add-package')}>
          <Text style={styles.buttonText}>+ Aggiungi Scatola</Text>
        </TouchableOpacity>
      </View>

      <Modal animationType="fade" transparent={true} visible={isMenuVisible} onRequestClose={() => setMenuVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            {activeRow && (
              <>
                <Text style={styles.modalTitle}>Gestisci {activeRow.medication.name}</Text>

                <Text style={styles.rowLabel}>Compresse intere</Text>
                <View style={styles.quantityControl}>
                  <TouchableOpacity style={styles.stepperButton} onPress={() => changeWholePills(-1)}>
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <TextInput
                    style={styles.quantityInput}
                    value={String(Math.floor(totalUnits / denominator))}
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
                      Più un pezzo da {formatDose(1 / denominator)} (passo esatto del dosaggio)
                    </Text>
                    <View style={styles.quantityControl}>
                      <TouchableOpacity style={styles.fractionButton} onPress={() => changeFraction(-1)}>
                        <Text style={styles.fractionButtonText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.fractionValue}>{formatFraction(totalUnits % denominator, denominator)}</Text>
                      <TouchableOpacity style={styles.fractionButton} onPress={() => changeFraction(1)}>
                        <Text style={styles.fractionButtonText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                <View style={styles.totalContainer}>
                  <Text style={styles.totalLabel}>Totale</Text>
                  <Text style={styles.totalValue}>{formatMixedNumber(totalUnits / denominator, denominator)} compresse</Text>
                </View>

                <TouchableOpacity style={[styles.confirmButton, { marginTop: 15 }]} onPress={confirmChanges}>
                  <Text style={styles.confirmButtonText}>✅ Conferma</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editButton} onPress={editMedication}>
                  <Text style={styles.editButtonText}>✏️ Modifica dose/orari</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteButton} onPress={removeMedication}>
                  <Text style={styles.deleteButtonText}>🗑️ Rimuovi dall&apos;inventario</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setMenuVisible(false)}>
                  <Text style={styles.cancelButtonText}>Annulla</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      <Modal animationType="slide" transparent={true} visible={isSupportVisible} onRequestClose={() => setSupportVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Area Assistenza</Text>

            <View style={styles.permissionStatusRow}>
              <Text style={styles.permissionStatusText}>
                Notifiche: {notificationStatusLabel}
              </Text>
              {permissionsGranted === false && Platform.OS !== 'web' && (
                <TouchableOpacity onPress={() => Linking.openSettings()}>
                  <Text style={styles.settingsLink}>Apri impostazioni</Text>
                </TouchableOpacity>
              )}
            </View>

            {Platform.OS === 'web' ? (
              <Text style={styles.webNotice}>Le notifiche locali sono disponibili nell&apos;app mobile.</Text>
            ) : (
              <TouchableOpacity style={styles.testButton} onPress={testNotification}>
                <Text style={styles.testButtonText}>🔔 Prova Notifica (5 sec)</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.logTitle}>Log Sistema:</Text>
            <View style={styles.logBox}>
              <FlatList data={[{ key: notificationLog }]} renderItem={({ item }) => <Text style={styles.logText}>{item.key}</Text>} />
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setSupportVisible(false)}>
              <Text style={styles.cancelButtonText}>Chiudi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', fontWeight: '600', marginTop: 4 },
  container: { flex: 1, backgroundColor: '#f5f5f5', paddingTop: 60, paddingHorizontal: 20 },
  card: { backgroundColor: '#fff', padding: 20, borderRadius: 15, marginBottom: 15, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  depletedCard: { borderColor: '#e74c3c', borderWidth: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  medicationName: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', flex: 1 },
  remainingBadge: { backgroundColor: '#f8f9fa', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#eee' },
  remainingGreen: { fontWeight: 'bold', color: '#2ecc71', fontSize: 22 },
  remainingRed: { fontWeight: 'bold', color: '#e74c3c', fontSize: 22 },
  details: { color: '#7f8c8d', fontSize: 14, fontWeight: '500' },
  prediction: { color: '#3498db', fontWeight: '600', marginTop: 8, fontSize: 13 },
  warning: { color: '#e74c3c', fontWeight: 'bold', marginTop: 10, fontSize: 14 },
  actionsContainer: { marginTop: 10, marginBottom: 40 },
  addButton: { backgroundColor: '#3498db', padding: 18, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  emptyText: { textAlign: 'center', color: '#95a5a6', fontSize: 16, marginTop: 40 },
  manageButton: { marginTop: 15, backgroundColor: '#f1f2f6', padding: 10, borderRadius: 8, alignItems: 'center' },
  manageButtonText: { color: '#2c3e50', fontWeight: 'bold', fontSize: 15 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modalContainer: { width: '85%', backgroundColor: '#fff', borderRadius: 20, padding: 25, alignItems: 'center' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#2c3e50', marginBottom: 20, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#7f8c8d', marginTop: -12, marginBottom: 10 },
  rowLabel: { fontSize: 13, color: '#7f8c8d', fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  stepperButton: { backgroundColor: '#f1f2f6', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  stepperButtonText: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  quantityInput: { fontSize: 36, fontWeight: 'bold', color: '#3498db', marginHorizontal: 20, minWidth: 70, textAlign: 'center' },
  fractionButton: { backgroundColor: '#f1f2f6', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  fractionButtonText: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  fractionValue: { fontSize: 22, fontWeight: 'bold', color: '#3498db', marginHorizontal: 20, minWidth: 60, textAlign: 'center' },
  totalContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#eaf4fc', borderRadius: 10, padding: 12, width: '100%', marginBottom: 10 },
  totalLabel: { fontSize: 14, color: '#2c3e50', fontWeight: 'bold' },
  totalValue: { fontSize: 16, color: '#3498db', fontWeight: 'bold' },
  confirmButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 5, borderColor: '#2ecc71', borderWidth: 1 },
  confirmButtonText: { color: '#2ecc71', fontWeight: 'bold', fontSize: 16 },
  editButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 5, borderColor: '#3498db', borderWidth: 1 },
  editButtonText: { color: '#3498db', fontWeight: 'bold', fontSize: 16 },
  deleteButton: { width: '100%', padding: 15, borderRadius: 10, alignItems: 'center', marginBottom: 5, borderColor: '#e74c3c', borderWidth: 1 },
  deleteButtonText: { color: '#e74c3c', fontWeight: 'bold', fontSize: 16 },
  cancelButton: { padding: 15, width: '100%', alignItems: 'center' },
  cancelButtonText: { color: '#7f8c8d', fontSize: 16, fontWeight: 'bold' },
  testButton: { backgroundColor: '#f39c12', padding: 15, borderRadius: 10, width: '100%', alignItems: 'center', marginBottom: 15 },
  testButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  logTitle: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', alignSelf: 'flex-start', marginBottom: 5 },
  logBox: { width: '100%', height: 150, backgroundColor: '#f1f2f6', borderRadius: 8, padding: 10, marginBottom: 15 },
  logText: { fontSize: 12, color: '#333', fontFamily: 'monospace' },
  permissionStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', backgroundColor: '#f8f9fa', padding: 12, borderRadius: 10, marginBottom: 15 },
  permissionStatusText: { fontSize: 13, color: '#2c3e50', fontWeight: '600' },
  settingsLink: { fontSize: 13, color: '#3498db', fontWeight: 'bold' },
  webNotice: { fontSize: 13, color: '#7f8c8d', textAlign: 'center', marginBottom: 15 },
  header: {
    backgroundColor: '#3498db',
    paddingTop: 25,
    paddingBottom: 25,
    borderRadius: 30,
    marginBottom: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, gap: 10 },
  toolbarButton: { flex: 1, backgroundColor: '#fff', borderRadius: 15, paddingVertical: 12, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  toolbarIcon: { fontSize: 22, marginBottom: 4 },
  toolbarText: { fontSize: 11, fontWeight: 'bold', color: '#2c3e50', textAlign: 'center' },
  warningBanner: { backgroundColor: '#fdecea', borderRadius: 10, padding: 12, marginBottom: 15, borderWidth: 1, borderColor: '#e74c3c' },
  warningBannerText: { color: '#c0392b', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
