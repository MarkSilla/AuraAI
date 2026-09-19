import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelBackgroundDownload, cancelTrackedDownload, listBackgroundDownloads, reconcileBackgroundDownloads, subscribeTrackedDownloads, type BackgroundDownload, type TrackedDownload } from '@/services/model-downloads';

export default function DownloadsScreen() {
  const router = useRouter();
  const dark = useColorScheme() === 'dark';
  const colors = { background: dark ? '#000' : '#F7F7F8', surface: dark ? '#111' : '#FFF', border: dark ? '#2A2A2A' : '#E5E5E5', text: dark ? '#ECECEC' : '#202123', muted: dark ? '#AFAFAF' : '#6B6B6B', accent: dark ? '#ECECEC' : '#202123' };
  const [downloads, setDownloads] = useState<BackgroundDownload[]>([]);
  const [trackedDownloads, setTrackedDownloads] = useState<TrackedDownload[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await reconcileBackgroundDownloads();
      setDownloads(await listBackgroundDownloads());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeTrackedDownloads(setTrackedDownloads);
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);

  const visibleDownloads: Array<BackgroundDownload | TrackedDownload> = trackedDownloads.length > 0 ? trackedDownloads : downloads;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityLabel="Go back">
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Downloads</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Model downloads continue in the background on Android.</Text>
        </View>
        {refreshing && <ActivityIndicator color={colors.accent} />}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {visibleDownloads.length === 0 ? <Text style={[styles.empty, { color: colors.muted }]}>No active model downloads.</Text> : visibleDownloads.map((download) => {
          const progress = download.totalBytes > 0 ? download.bytesWritten / download.totalBytes : 0;
          return (
            <View key={'key' in download ? download.key : download.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text numberOfLines={2} style={[styles.fileName, { color: colors.text }]}>{download.fileName}</Text>
              <Text style={[styles.meta, { color: colors.muted }]}>{'status' in download && download.status === 'queued' ? 'Queued — waiting for the current download' : download.totalBytes > 0 ? `${Math.round(progress * 100)}% downloaded` : 'Preparing download…'}</Text>
              <View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.min(100, progress * 100)}%` }]} /></View>
              <Pressable style={[styles.cancel, { borderColor: colors.border }]} onPress={() => 'key' in download ? cancelTrackedDownload(download.key) : void cancelBackgroundDownload(download.id).then(refresh)}>
                <Text style={[styles.cancelText, { color: colors.text }]}>Cancel download</Text>
              </Pressable>
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
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 3 },
  content: { padding: 18, gap: 12 },
  empty: { fontSize: 13, paddingTop: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  fileName: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 11 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  cancel: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  cancelText: { fontSize: 11, fontWeight: '800' },
});
