import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelBackgroundDownload, cancelTrackedDownload, listBackgroundDownloads, subscribeTrackedDownloads, type BackgroundDownload, type TrackedDownload } from '@/services/model-downloads';

const STATUS_RUNNING = 2;
const STATUS_PENDING = 1;
const STATUS_PAUSED = 4;

export function DownloadBanner() {
  const router = useRouter();
  const [download, setDownload] = useState<BackgroundDownload | TrackedDownload | null>(null);

  const refresh = useCallback(async () => {
    if (download && 'key' in download) return;
    const active = (await listBackgroundDownloads()).find((item) => item.status === STATUS_RUNNING || item.status === STATUS_PENDING || item.status === STATUS_PAUSED) || null;
    setDownload(active);
  }, [download]);

  useEffect(() => {
    const unsubscribe = subscribeTrackedDownloads((downloads) => setDownload(downloads[0] || null));
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);

  if (!download) return null;

  const progress = download.totalBytes > 0 ? Math.min(1, download.bytesWritten / download.totalBytes) : 0;
  const fileName = download.fileName.replace(/\.gguf\.part$/i, '').replace(/\.gguf$/i, '');

  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
      <View style={styles.banner}>
        <Pressable style={styles.copy} onPress={() => router.push('/downloads')} accessibilityLabel="Open download manager">
          <Text numberOfLines={1} style={styles.title}>Downloading {fileName}</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
          <Text style={styles.meta}>{download.totalBytes > 0 ? `${Math.round(progress * 100)}%` : 'Preparing download…'}</Text>
        </Pressable>
        <Pressable
          style={styles.cancel}
          onPress={() => {
            if ('key' in download) cancelTrackedDownload(download.key);
            else void cancelBackgroundDownload(download.id).then(refresh);
          }}
          accessibilityRole="button"
          accessibilityLabel="Cancel model download">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 1000, elevation: 1000 },
  banner: { marginHorizontal: 12, marginTop: 8, padding: 11, borderRadius: 14, backgroundColor: '#171717', flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  copy: { flex: 1, gap: 5 },
  title: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#444444' },
  fill: { height: 5, borderRadius: 3, backgroundColor: '#FFFFFF' },
  meta: { color: '#BDBDBD', fontSize: 10 },
  cancel: { borderWidth: 1, borderColor: '#666666', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  cancelText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
