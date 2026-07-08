import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '@/constants/Colors';

function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function displayToDate(display: string): Date | null {
  const parts = display.split('/');
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return null;
  const date = new Date(+y, +m - 1, +d);
  if (isNaN(date.getTime())) return null;
  return date;
}

function dateToDisplay(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

interface DateFieldProps {
  label: string;
  value: string; // format JJ/MM/AAAA (affiché) — cohérent avec le reste de l'app
  onChangeText: (v: string) => void;
  required?: boolean;
  maximumDate?: Date; // par défaut aujourd'hui (dates passées, ex: naissance)
  minimumDate?: Date;
}

// Sélecteur de date natif (calendrier iOS/Android) — remplace la saisie
// libre au clavier qui n'affichait aucun calendrier sur iOS.
export default function DateField({ label, value, onChangeText, required, maximumDate, minimumDate }: DateFieldProps) {
  const [showPicker, setShowPicker] = useState(false);
  const currentDate = displayToDate(value) ?? new Date();

  const handleChange = (event: { type: string }, date?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed' || !date) return;
    onChangeText(dateToDisplay(date));
  };

  return (
    <View>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)} activeOpacity={0.75}>
        <Text style={value ? styles.value : styles.placeholder}>{value || 'jj/mm/aaaa'}</Text>
      </TouchableOpacity>

      {showPicker && Platform.OS === 'android' && (
        <DateTimePicker value={currentDate} mode="date" display="default" onChange={handleChange} maximumDate={maximumDate} minimumDate={minimumDate} />
      )}

      {showPicker && Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible={showPicker} onRequestClose={() => setShowPicker(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.modalDone}>Terminé</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={currentDate}
                mode="date"
                display="spinner"
                onChange={handleChange}
                maximumDate={maximumDate}
                minimumDate={minimumDate}
                locale="fr-FR"
                themeVariant="light"
                textColor={Colors.text}
                style={styles.picker}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  required: { fontSize: 11, color: '#EF4444' },
  input: { backgroundColor: Colors.background, borderWidth: 0.5, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center' },
  value: { fontSize: 14, color: Colors.text },
  placeholder: { fontSize: 14, color: Colors.textLight },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E0DDD8' },
  modalDone: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  picker: { height: 216, backgroundColor: '#fff' },
});
