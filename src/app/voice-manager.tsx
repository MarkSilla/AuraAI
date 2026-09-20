import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/use-app-theme';
import { loadAppSettings, saveAppSettings } from '@/services/app-settings';

import {
  areKokoroArtifactsDownloaded,
  DEFAULT_KOKORO_VOICE,
  downloadKokoroArtifacts,
  KOKORO_VOICES,
  synthesizeKokoroText,
  type KokoroDownloadProgress,
  type KokoroVoiceId,
} from '@/services/kokoro-tts';

export default function VoiceManagerScreen() {
  const router = useRouter();
  const dark = useAppTheme() === 'dark';
  const colors = { background: dark ? '#000' : '#F7F7F8', surface: dark ? '#111' : '#FFF', border: dark ? '#2A2A2A' : '#E5E5E5', text: dark ? '#ECECEC' : '#202123', muted: dark ? '#AFAFAF' : '#6B6B6B', accent: dark ? '#ECECEC' : '#202123' };
  const [selected, setSelected] = useState<KokoroVoiceId>(() => {
    const saved = loadAppSettings().kokoroVoice;
    return KOKORO_VOICES.some((voice) => voice.id === saved) ? saved as KokoroVoiceId : DEFAULT_KOKORO_VOICE;
  });
  const [progress, setProgress] = useState<KokoroDownloadProgress | null>(null);
  const [status, setStatus] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const download = async () => {
    setStatus('Preparing voice download…');
    try {
      await downloadKokoroArtifacts((next) => {
        setProgress(next);
        setStatus(`Downloading ${next.artifact === 'model' ? 'shared Kokoro model' : 'voice'}…`);
      }, selected);
      setStatus('Voice saved on this device.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The voice download failed.');
    }
  };

  const preview = async () => {
    if (!areKokoroArtifactsDownloaded(selected)) {
      Alert.alert('Voice not downloaded', 'Download this voice before playing its preview.');
      return;
    }
    setPreviewing(true);
    setStatus('Generating voice preview…');
    try {
      await synthesizeKokoroText('Hello, I am AURA. This is a preview of my voice.', selected);
      setStatus('Playing voice preview.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The voice preview failed.');
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={goBack} style={styles.headerButton} accessibilityLabel="Go back"><SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} /></Pressable>
        <View style={styles.headerCopy}><Text style={[styles.title, { color: colors.text }]}>Voice Manager</Text><Text style={[styles.subtitle, { color: colors.muted }]}>Download and preview offline Kokoro voices.</Text></View>
        <Pressable onPress={() => router.push('/downloads')} style={styles.headerButton} accessibilityLabel="Open Download Manager"><SymbolView name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} size={20} tintColor={colors.muted} /></Pressable>
      </View>
      <View style={styles.content}>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>AVAILABLE VOICES</Text>
        <ScrollView style={styles.voiceList} showsVerticalScrollIndicator>
          {KOKORO_VOICES.map((voice) => {
            const saved = areKokoroArtifactsDownloaded(voice.id);
            return <Pressable key={voice.id} onPress={() => { setSelected(voice.id); saveAppSettings({ ...loadAppSettings(), kokoroVoice: voice.id }); setProgress(null); setStatus(''); }} style={[styles.voiceCard, { borderColor: selected === voice.id ? colors.accent : colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.voiceIcon, { backgroundColor: selected === voice.id ? colors.accent : colors.background }]}><SymbolView name={{ ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }} size={18} tintColor={selected === voice.id ? (dark ? '#000' : '#FFF') : colors.muted} /></View>
              <View style={styles.voiceCopy}><Text style={[styles.voiceName, { color: colors.text }]}>{voice.name}</Text><Text style={[styles.voiceDescription, { color: colors.muted }]}>{voice.description}</Text></View>
              <Text style={[styles.savedLabel, { color: saved ? '#16803C' : colors.muted }]}>{saved ? 'Saved' : 'Download'}</Text>
            </Pressable>;
          })}
        </ScrollView>
        <View style={[styles.actionCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.actionCopy}><Text style={[styles.actionTitle, { color: colors.text }]}>Selected voice: {KOKORO_VOICES.find((voice) => voice.id === selected)?.name}</Text><Text style={[styles.actionDescription, { color: colors.muted }]}>Download the shared model and this voice to use speech offline.</Text></View>
          <Pressable onPress={() => void download()} disabled={areKokoroArtifactsDownloaded(selected)} style={[styles.actionButton, { borderColor: colors.border, opacity: areKokoroArtifactsDownloaded(selected) ? 0.55 : 1 }]}><Text style={[styles.actionButtonText, { color: colors.text }]}>{areKokoroArtifactsDownloaded(selected) ? 'Saved' : 'Download'}</Text></Pressable>
        </View>
        {progress && <View style={[styles.track, { backgroundColor: colors.border }]}><View style={[styles.fill, { backgroundColor: colors.accent, width: `${Math.min(100, progress.progress * 100)}%` }]} /></View>}
        {status ? <Text style={[styles.status, { color: colors.muted }]}>{status}</Text> : null}
        <View style={styles.bottomActions}>
          <Pressable onPress={() => void preview()} disabled={previewing} style={[styles.previewButton, { backgroundColor: colors.accent, opacity: previewing ? 0.6 : 1 }]}>
            {previewing ? <ActivityIndicator color={dark ? '#000' : '#FFF'} /> : <SymbolView name={{ ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' }} size={17} tintColor={dark ? '#000' : '#FFF'} />}
            <Text style={[styles.previewText, { color: dark ? '#000' : '#FFF' }]}>{previewing ? 'Preparing preview…' : 'Play voice preview'}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, gap: 10 },
  headerButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 3 },
  content: { flex: 1, padding: 18, paddingTop: 4, paddingBottom: 18 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 8 },
  voiceList: { flex: 1, minHeight: 120, marginBottom: 8 },
  voiceCard: { minHeight: 68, borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  voiceIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  voiceCopy: { flex: 1 },
  voiceName: { fontSize: 14, fontWeight: '700' },
  voiceDescription: { fontSize: 12, marginTop: 3 },
  savedLabel: { fontSize: 10, fontWeight: '800' },
  actionCard: { minHeight: 72, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  actionCopy: { flex: 1 },
  actionTitle: { fontSize: 13, fontWeight: '700' },
  actionDescription: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  actionButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  actionButtonText: { fontSize: 10, fontWeight: '800' },
  previewButton: { minHeight: 44, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  previewText: { fontSize: 13, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  fill: { height: 5, borderRadius: 3 },
  status: { fontSize: 11, lineHeight: 16, marginTop: 10 },
  bottomActions: { marginTop: 'auto', paddingTop: 10 },
});
