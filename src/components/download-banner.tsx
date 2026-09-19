import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelBackgroundDownload, cancelTrackedDownload, listBackgroundDownloads, subscribeTrackedDownloads, type BackgroundDownload, type TrackedDownload } from '@/services/model-downloads';

const STATUS_RUNNING = 2;
const STATUS_PENDING = 1;
const STATUS_PAUSED = 4;
const RING_SEGMENTS = 60;

export function DownloadBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [download, setDownload] = useState<BackgroundDownload | TrackedDownload | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const refresh = useCallback(async () => {
    if (download && 'key' in download) return;
    const active = (await listBackgroundDownloads()).find((item) => item.status === STATUS_RUNNING || item.status === STATUS_PENDING || item.status === STATUS_PAUSED) || null;
    setDownload(active);
  }, [download]);

  useEffect(() => {
    const unsubscribe = subscribeTrackedDownloads((downloads) => {
      setDownload(downloads.find((item) => item.status === 'downloading') || downloads[0] || null);
      setQueuedCount(downloads.filter((item) => item.status === 'queued').length);
    });
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [refresh]);

  if (!download || pathname === '/downloads') return null;

  const progress = download.totalBytes > 0 ? Math.min(1, download.bytesWritten / download.totalBytes) : 0;
  const fileName = download.fileName.replace(/\.gguf\.part$/i, '').replace(/\.gguf$/i, '');
  const percentage = Math.round(progress * 100);

  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.overlay}>
      <Pressable
        style={[styles.widget, expanded && styles.expandedWidget]}
        onPress={() => setExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Minimize download progress' : 'Expand download progress'}>
        <View style={styles.ring}>
          <View style={styles.ringTrack} />
          {Array.from({ length: RING_SEGMENTS }, (_, segment) => (
            <View
              key={segment}
              style={[
                styles.ringSegment,
                {
                  transform: [
                    { rotate: `${segment * (360 / RING_SEGMENTS)}deg` },
                    { translateY: -17 },
                  ],
                  opacity: progress > segment / RING_SEGMENTS ? 1 : 0,
                },
              ]}
            />
          ))}
          <Text style={styles.percent}>{download.totalBytes > 0 ? `${percentage}%` : '…'}</Text>
        </View>
        {expanded && (
          <View style={styles.expandedCopy}>
            <Text numberOfLines={1} style={styles.title}>Downloading {fileName}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
            <Text style={styles.meta}>{download.totalBytes > 0 ? `${percentage}% downloaded` : 'Preparing download…'}{queuedCount > 0 ? ` · ${queuedCount} queued` : ''}</Text>
            <View style={styles.actions}>
              <Pressable style={styles.details} onPress={(event) => { event.stopPropagation(); router.push('/downloads'); }} accessibilityLabel="Open download manager">
                <Text style={styles.cancelText}>Details</Text>
              </Pressable>
              <Pressable
                style={styles.cancel}
                onPress={(event) => {
                  event.stopPropagation();
                  if ('key' in download) cancelTrackedDownload(download.key);
                  else void cancelBackgroundDownload(download.id).then(refresh);
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel model download">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 0, right: 0, top: 48, zIndex: 1000, elevation: 1000, alignItems: 'center' },
  widget: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  expandedWidget: { width: 300, minHeight: 88, height: 'auto', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  ring: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  ringTrack: { position: 'absolute', width: 42, height: 42, borderRadius: 21, borderWidth: 4, borderColor: '#444444' },
  ringSegment: { position: 'absolute', top: 17, width: 3, height: 8, borderRadius: 2, backgroundColor: '#FFFFFF' },
  percent: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  expandedCopy: { flex: 1, gap: 5 },
  title: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: '#444444' },
  fill: { height: 5, borderRadius: 3, backgroundColor: '#FFFFFF' },
  meta: { color: '#BDBDBD', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginTop: 2 },
  details: { borderWidth: 1, borderColor: '#666666', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  cancel: { borderWidth: 1, borderColor: '#666666', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  cancelText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
