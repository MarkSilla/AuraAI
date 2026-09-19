import { File, Paths } from 'expo-file-system';

type AppSettings = {
  activeModelUri?: string | null;
  thinkingLevel?: 'low' | 'medium' | 'high';
  themeMode?: 'light' | 'dark';
  pinnedConversationIds?: string[];
};

const settingsFile = new File(Paths.document, 'aura-settings.json');

export function loadAppSettings(): AppSettings {
  if (!settingsFile.exists) return {};
  try {
    return JSON.parse(settingsFile.textSync()) as AppSettings;
  } catch {
    return {};
  }
}

export function saveAppSettings(settings: AppSettings) {
  if (settingsFile.exists) settingsFile.write(JSON.stringify(settings));
  else {
    settingsFile.create({ intermediates: true });
    settingsFile.write(JSON.stringify(settings));
  }
}
