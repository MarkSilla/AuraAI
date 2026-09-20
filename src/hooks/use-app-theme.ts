import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useColorScheme } from 'react-native';

import { loadAppSettings } from '@/services/app-settings';

export function useAppTheme() {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => loadAppSettings().themeMode || (systemScheme === 'dark' ? 'dark' : 'light'));

  useFocusEffect(useCallback(() => {
    const saved = loadAppSettings().themeMode;
    setThemeMode(saved || (systemScheme === 'dark' ? 'dark' : 'light'));
  }, [systemScheme]));

  return themeMode;
}
