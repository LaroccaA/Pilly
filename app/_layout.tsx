import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

const blueHeader = {
  headerStyle: { backgroundColor: '#3498db' },
  headerTintColor: '#fff',
  headerTitleStyle: { color: '#fff' },
} as const;

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Pilly' }} />
        <Stack.Screen
          name="add-package"
          options={{ presentation: 'modal', title: 'Rifornimento Scorte', ...blueHeader }}
        />
        <Stack.Screen name="medications" options={{ title: 'Catalogo Farmaci', ...blueHeader }} />
        <Stack.Screen
          name="medication-form"
          options={{ presentation: 'modal', title: 'Scheda Farmaco', ...blueHeader }}
        />
        <Stack.Screen name="pill-count" options={{ title: 'Calcolo Pillole', ...blueHeader }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
