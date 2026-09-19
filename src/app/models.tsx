import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteDownloadedModelFile, listDownloadedModels, reconcileBackgroundDownloads } from '@/services/model-downloads';
import { loadAppSettings, saveAppSettings } from '@/services/app-settings';
import { unloadLocalModel } from '@/services/local-inference';

export default function ModelsScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const colors = {
    background: dark ? '#000000' : '#F7F7F8',
    surface: dark ? '#111111' : '#FFFFFF',
    border: dark ? '#2A2A2A' : '#E5E5E5',
    text: dark ? '#ECECEC' : '#202123',
    muted: dark ? '#AFAFAF' : '#6B6B6B',
    accent: dark ? '#ECECEC' : '#202123',
    danger: '#C25E5E',
  };
  const [models, setModels] = useState(() => listDownloadedModels());
  const [activeUri, setActiveUri] = useState<string | null>(() => loadAppSettings().activeModelUri || null);
  const [offloadingUri, setOffloadingUri] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await reconcileBackgroundDownloads();
    const nextModels = listDownloadedModels();
    const savedUri = loadAppSettings().activeModelUri;
    setModels(nextModels);
    setActiveUri(savedUri && nextModels.some((file) => file.uri === savedUri) ? savedUri : null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectModel = (uri: string) => {
    setActiveUri(uri);
    saveAppSettings({ ...loadAppSettings(), activeModelUri: uri });
  };

  const offloadModel = async (uri: string) => {
    setOffloadingUri(uri);
    try {
      await unloadLocalModel();
      setActiveUri(null);
      saveAppSettings({ ...loadAppSettings(), activeModelUri: null });
      return true;
    } catch (error) {
      Alert.alert('Offload failed', error instanceof Error ? error.message : 'The model could not be offloaded.');
      return false;
    } finally {
      setOffloadingUri(null);
    }
  };

  const removeModel = (file: (typeof models)[number]) => {
    Alert.alert('Remove model?', `Delete ${file.name} from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
          if (file.uri === activeUri && !(await offloadModel(file.uri))) return;
            deleteDownloadedModelFile(file);
            void refresh();
          })();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityLabel="Go back">
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Downloaded models</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Manage models stored on this device.</Text>
        </View>
        <Pressable onPress={() => router.push('/downloads')} style={styles.headerButton} accessibilityLabel="Open downloads">
          <SymbolView name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} size={22} tintColor={colors.text} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {models.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={28} tintColor={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No downloaded models</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Download a GGUF model from the Model Manager to use it offline.</Text>
          </View>
        ) : models.map((file) => {
          const active = activeUri === file.uri;
          return (
            <View key={file.uri} style={[styles.card, { backgroundColor: colors.surface, borderColor: active ? colors.accent : colors.border }]}>
              <View style={styles.modelIcon}>
                <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={20} tintColor={active ? colors.accent : colors.muted} />
              </View>
              <View style={styles.modelCopy}>
                <Text numberOfLines={2} style={[styles.modelName, { color: colors.text }]}>{file.name}</Text>
                <Text style={[styles.modelMeta, { color: colors.muted }]}>{file.size ? `${(file.size / 1024 / 1024 / 1024).toFixed(2)} GB` : 'Size unavailable'}{active ? ' · Active' : ''}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable disabled={offloadingUri !== null} onPress={() => active ? void offloadModel(file.uri) : selectModel(file.uri)} style={[styles.actionButton, { borderColor: colors.border, opacity: offloadingUri ? 0.6 : 1 }]}>
                  <Text style={[styles.actionText, { color: colors.text }]}>{offloadingUri === file.uri ? 'Offloading…' : active ? 'Offload' : 'Use'}</Text>
                </Pressable>
                <Pressable onPress={() => removeModel(file)} style={styles.removeButton} accessibilityLabel={`Remove ${file.name}`}>
                  <SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete' }} size={18} tintColor={colors.danger} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 8 },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 3 },
  content: { padding: 18, gap: 12 },
  card: { minHeight: 88, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  modelIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#80808020' },
  modelCopy: { flex: 1 },
  modelName: { fontSize: 14, fontWeight: '700' },
  modelMeta: { fontSize: 11, marginTop: 5 },
  actions: { alignItems: 'flex-end', gap: 7 },
  actionButton: { minWidth: 66, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' },
  actionText: { fontSize: 11, fontWeight: '800' },
  removeButton: { padding: 5 },
  emptyCard: { minHeight: 180, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 9 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
