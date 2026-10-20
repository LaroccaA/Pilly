import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Medication, MedicationPackage, formatDaysRemaining } from '@/types/medication';
import { getAlertDays } from './consumption';

// How many days BEFORE stock runs out the alerts start (day 0 is the day the
// stock is actually depleted).
export const ADVANCE_NOTICE_DAYS = 5;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function configureNotifications(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Promemoria Farmaci',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  return finalStatus === 'granted';
}

export async function checkNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// Cancels everything and reschedules, from scratch, the alerts for the last
// ADVANCE_NOTICE_DAYS days before stock runs out. Each notification text
// (e.g. "in 3 days") is computed NOW, arithmetically, so it stays correct even
// if the app is not reopened before the notification fires: no calculation is
// needed at delivery time.
export async function scheduleStockNotifications(
  packages: MedicationPackage[],
  catalog: Medication[]
): Promise<string> {
  if (Platform.OS === 'web') {
    return 'Le notifiche locali sono disponibili solo nell\'app mobile.';
  }

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();

    // Track scheduled items ourselves: reading dates back from the OS after
    // scheduling is not reliable across all Android/expo-notifications versions
    // (the format is not always readable).
    const scheduled: { title: string; date: Date }[] = [];

    for (const packageItem of packages) {
      const medication = catalog.find((item) => item.id === packageItem.medicationId);
      if (!medication || !medication.slots || medication.slots.length === 0) continue;

      const alertDays = getAlertDays(medication, packageItem.remaining, ADVANCE_NOTICE_DAYS, now);

      for (const alertDay of alertDays) {
        if (alertDay.date <= now) continue; // today's time already passed

        const body =
          alertDay.daysUntilEnd === 0
            ? `Oggi è l'ultimo giorno di scorta di ${medication.name}. Ricorda di comprarla!`
            : `È l'ora della tua dose di ${medication.name}. Rimarrai senza scorta ${formatDaysRemaining(alertDay.daysUntilEnd)}.`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💊 ${medication.name}`,
            body,
            sound: true,
            priority: Notifications.AndroidNotificationPriority.MAX,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: alertDay.date,
          } as any,
        });
        scheduled.push({ title: `💊 ${medication.name}`, date: alertDay.date });
      }
    }

    scheduled.sort((a, b) => a.date.getTime() - b.date.getTime());
    let logText = `Notifiche programmate: ${scheduled.length}\n\n`;
    scheduled.forEach((notification, index) => {
      logText += `${index + 1}. ${notification.title} -> ${notification.date.toLocaleString('it-IT', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}\n`;
    });
    if (scheduled.length === 0) {
      logText += 'Nessun avviso in coda al momento (tutte le scorte sono ancora abbondanti).';
    }
    return logText;
  } catch (error) {
    console.error('Notification scheduling failed:', error);
    return 'Errore nella programmazione delle notifiche.';
  }
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔔 Test Pilly',
      body: 'Se leggi questo, il sistema di avvisi funziona perfettamente!',
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
    } as any,
  });
}
