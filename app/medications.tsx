import { getCatalog } from '@/lib/storage';
import { Medication, formatWeekdays, formatDose } from '@/types/medication';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function MedicationsScreen() {
  const [catalog, setCatalog] = useState<Medication[]>([]);

  useFocusEffect(
    useCallback(() => {
      getCatalog().then(setCatalog);
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>
        Qui puoi creare nuovi farmaci o modificare dose/orari/giorni di quelli esistenti.
      </Text>
      <FlatList
        data={catalog}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.emptyText}>Nessun farmaco nel catalogo.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push({ pathname: '/medication-form', params: { id: item.id } })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              {item.slots.map((slot) => (
                <Text key={slot.id} style={styles.details}>
                  {slot.time} · {formatDose(slot.dose)} compressa · {formatWeekdays(slot.weekdays)}
                </Text>
              ))}
              <Text style={styles.box}>Scatola da {item.defaultBoxSize} compresse</Text>
            </View>
            <Text style={styles.chevron}>✏️</Text>
          </TouchableOpacity>
        )}
      />
      <TouchableOpacity style={styles.addButton} onPress={() => router.push('/medication-form')}>
        <Text style={styles.buttonText}>+ Nuovo Farmaco</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  subtitle: { fontSize: 14, color: '#7f8c8d', marginBottom: 20 },
  card: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 15,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  name: { fontSize: 17, fontWeight: 'bold', color: '#2c3e50', marginBottom: 4 },
  details: { fontSize: 13, color: '#7f8c8d' },
  box: { fontSize: 12, color: '#95a5a6', marginTop: 4, fontStyle: 'italic' },
  chevron: { fontSize: 18, marginLeft: 10 },
  emptyText: { textAlign: 'center', color: '#95a5a6', fontSize: 16, marginTop: 40 },
  addButton: {
    position: 'absolute',
    bottom: 25,
    left: 20,
    right: 20,
    backgroundColor: '#3498db',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
