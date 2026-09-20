import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/use-app-theme';

import { cancelTrackedDownload, downloadModel, subscribeTrackedDownloads, type TrackedDownload } from '@/services/model-downloads';
import { formatModelSize, getHuggingFaceFileSize, getHuggingFaceFileUrl, isLoadableGgufFile, searchHuggingFaceModels, type HuggingFaceModel } from '@/services/huggingface-models';
import { estimateModelCompatibility, formatMemory, getDeviceResources, type DeviceResources } from '@/services/model-compatibility';

export default function ModelBrowserScreen() {
  const router = useRouter();
  const dark = useAppTheme() === 'dark';
  const colors = {
    background: dark ? '#000000' : '#F7F7F8',
    surface: dark ? '#111111' : '#FFFFFF',
    border: dark ? '#2A2A2A' : '#E5E5E5',
    text: dark ? '#ECECEC' : '#202123',
    muted: dark ? '#AFAFAF' : '#6B6B6B',
    accent: dark ? '#ECECEC' : '#202123',
    accentText: dark ? '#000000' : '#FFFFFF',
  };
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<HuggingFaceModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [trackedDownloads, setTrackedDownloads] = useState<TrackedDownload[]>([]);
  const [resources, setResources] = useState<DeviceResources | null>(null);
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const sizeAttempts = useRef(new Set<string>());
  const canceledDownloads = useRef(new Set<string>());

  const search = async () => {
    setLoading(true);
    setError(null);
    try {
      setModels(await searchHuggingFaceModels(query));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Unable to search Hugging Face.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void search();
    void getDeviceResources().then(setResources);
    return subscribeTrackedDownloads((downloads) => {
      setTrackedDownloads(downloads);
      const active = downloads.find((download) => download.status === 'downloading');
      if (active) {
        setProgress(active.totalBytes > 0 ? active.bytesWritten / active.totalBytes : 0);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSizes = async () => {
      const sizedModels = await Promise.all(models.map(async (model) => {
        const files = (model.siblings || [])
          .filter((file) => file.name.toLowerCase().endsWith('.gguf') && !file.size && !sizeAttempts.current.has(`${model.id}/${file.name}`))
          .slice(0, 6);
        files.forEach((file) => sizeAttempts.current.add(`${model.id}/${file.name}`));
        const sizedFiles = await Promise.all(files.map(async (file) => ({
          ...file,
          size: file.size ?? await getHuggingFaceFileSize(model.id, file.name).catch(() => undefined),
        })));
        const sizedByName = new Map(sizedFiles.map((file) => [file.name, file.size]));
        return {
          ...model,
          siblings: model.siblings?.map((file) => ({ ...file, size: sizedByName.get(file.name) ?? file.size })),
        };
      }));
      if (!cancelled) setModels(sizedModels);
    };
    if (models.length > 0 && models.some((model) => model.siblings?.some((file) => file.name.toLowerCase().endsWith('.gguf') && !file.size && !sizeAttempts.current.has(`${model.id}/${file.name}`)))) {
      void loadSizes();
    }
    return () => { cancelled = true; };
  }, [models]);

  const download = async (model: HuggingFaceModel, fileName: string, fileSize?: number) => {
    const key = `${model.id}/${fileName}`;
    const tracked = trackedDownloads.find((item) => item.fileName === fileName.split('/').pop());
    if (tracked) {
      canceledDownloads.current.add(key);
      cancelTrackedDownload(tracked.key);
      return;
    }
    const compatibility = resources
      ? estimateModelCompatibility(model.id, fileName, fileSize, resources)
      : { status: 'unknown' as const, label: 'Compatibility unknown', detail: 'Device information is still loading.' };
    if (compatibility.status === 'unsupported') {
      Alert.alert('Model not supported', compatibility.detail);
      return;
    }
    if (compatibility.status === 'not-recommended' || compatibility.status === 'slow' || compatibility.status === 'unknown') {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          compatibility.label,
          `${compatibility.detail}\n\nDo you want to download it anyway?`,
          [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Download anyway', onPress: () => resolve(true) }],
        );
      });
      if (!confirmed) return;
    }
    setProgress(0);
    try {
      await downloadModel(
        getHuggingFaceFileUrl(model.id, fileName),
        `${model.id.split('/').pop()}-${fileName.split('/').pop()}`,
        (next) => setProgress(next.progress),
      );
    } catch (downloadError) {
      setError(canceledDownloads.current.has(key) ? 'Download canceled.' : downloadError instanceof Error ? downloadError.message : 'The model download failed.');
    } finally {
      canceledDownloads.current.delete(key);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton} accessibilityLabel="Go back">
          <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: colors.text }]}>Browse Hugging Face</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>Internet connection required to search and download.</Text>
        </View>
        <Pressable onPress={() => router.push('/downloads')} accessibilityLabel="Open downloads">
          <SymbolView name={{ ios: 'arrow.down.circle', android: 'download', web: 'download' }} size={22} tintColor={colors.text} />
        </Pressable>
      </View>
      <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={17} tintColor={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void search()}
          placeholder="Search models, e.g. Qwen or Llama"
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.text }]}
          returnKeyType="search"
        />
        <Pressable onPress={() => void search()} accessibilityLabel="Search Hugging Face">
          <Text style={[styles.searchAction, { color: colors.text }]}>Search</Text>
        </Pressable>
      </View>
      {resources && <Text style={[styles.deviceInfo, { color: colors.muted }]}>
        {resources.deviceName} · {resources.totalMemory ? `${formatMemory(resources.totalMemory)} RAM` : 'RAM unavailable'} · {resources.freeStorage ? `${formatMemory(resources.freeStorage)} free storage` : 'storage unavailable'}
      </Text>}
      {loading && <ActivityIndicator style={styles.loader} color={colors.accent} />}
      {error && <Text style={[styles.notice, { color: colors.muted }]}>{error}</Text>}
      <ScrollView contentContainerStyle={styles.content}>
        {!loading && !error && models.length === 0 && <Text style={[styles.notice, { color: colors.muted }]}>No compatible GGUF models found.</Text>}
        {models.map((model) => {
          const files = (model.siblings || []).filter((file) => isLoadableGgufFile(file.name));
          const expanded = expandedModels.has(model.id);
          const tags = (model.tags || []).map((tag) => tag.toLowerCase());
          const hasVision = tags.some((tag) => /vision|image|multimodal|visual/.test(tag)) || /vision|vl|visual/i.test(model.id);
          const hasCode = tags.some((tag) => /code|programming/.test(tag)) || /coder|code/i.test(model.id);
          const capabilities = [
            `Text generation${model.pipeline_tag ? ` (${model.pipeline_tag})` : ''}`,
            hasCode ? 'Code assistance indicated by model metadata' : null,
            hasVision ? 'Image input: not supported by AURA local runtime' : null,
          ].filter((capability): capability is string => Boolean(capability));
          return (
            <View key={model.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${model.id}`}
                onPress={() => setExpandedModels((current) => {
                  const next = new Set(current);
                  if (next.has(model.id)) next.delete(model.id); else next.add(model.id);
                  return next;
                })}>
                <View style={styles.modelHeaderRow}>
                  <View style={styles.fileCopy}>
                    <Text style={[styles.modelName, { color: colors.text }]}>{model.id}</Text>
                    <Text style={[styles.meta, { color: colors.muted }]}>
                      {model.downloads ? `${model.downloads.toLocaleString()} downloads` : 'Downloads unavailable'} · {files.length} GGUF file{files.length === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <SymbolView name={{ ios: expanded ? 'chevron.up' : 'chevron.down', android: expanded ? 'expand_less' : 'expand_more', web: expanded ? 'expand_less' : 'expand_more' }} size={18} tintColor={colors.muted} />
                </View>
              </Pressable>
              {expanded && <View style={[styles.details, { borderTopColor: colors.border }]}>
                <Text style={[styles.detailsTitle, { color: colors.text }]}>Model features</Text>
                {capabilities.map((capability) => <Text key={capability} style={[styles.detailsText, { color: colors.muted }]}>• {capability}</Text>)}
                <Text style={[styles.detailsText, { color: colors.muted }]}>• GGUF runtime: llama.rn / AURA local inference</Text>
                {model.library_name && <Text style={[styles.detailsText, { color: colors.muted }]}>• Library: {model.library_name}</Text>}
                {tags.length > 0 && <Text style={[styles.detailsText, { color: colors.muted }]}>• Tags: {tags.slice(0, 8).join(', ')}</Text>}
              </View>}
              {files.slice(0, 6).map((file) => {
                const key = `${model.id}/${file.name}`;
                const tracked = trackedDownloads.find((item) => item.fileName === file.name);
                const active = tracked?.status === 'downloading';
                const queued = tracked?.status === 'queued';
                const compatibility = resources ? estimateModelCompatibility(model.id, file.name, file.size, resources) : null;
                return (
                  <Pressable key={file.name} onPress={() => void download(model, file.name, file.size)} style={[styles.fileRow, { borderTopColor: colors.border, opacity: queued ? 0.7 : 1 }]}>
                    <View style={styles.fileCopy}>
                      <Text numberOfLines={2} style={[styles.fileName, { color: colors.text }]}>{file.name}</Text>
                      <Text style={[styles.meta, { color: colors.muted }]}>{formatModelSize(file.size)}</Text>
                      {compatibility && <Text style={[styles.compatibility, { color: compatibility.status === 'compatible' ? '#2E8B57' : compatibility.status === 'unsupported' || compatibility.status === 'not-recommended' ? '#C25E5E' : '#B07A20' }]}>{compatibility.label}</Text>}
                    </View>
                    <Text style={[styles.downloadLabel, { color: colors.text }]}>{active ? `Cancel ${Math.round(progress * 100)}%` : queued ? 'Queued · Cancel' : 'Download'}</Text>
                    {active && <ActivityIndicator size="small" color={colors.accent} />}
                  </Pressable>
                );
              })}
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
  searchBox: { marginHorizontal: 18, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, fontSize: 14 },
  searchAction: { fontSize: 12, fontWeight: '800' },
  loader: { marginTop: 18 },
  content: { padding: 18, gap: 12 },
  notice: { paddingHorizontal: 18, paddingTop: 18, fontSize: 13, lineHeight: 19 },
  deviceInfo: { paddingHorizontal: 18, paddingTop: 10, fontSize: 11 },
  card: { borderWidth: 1, borderRadius: 16, padding: 13 },
  modelHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelName: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 11, marginTop: 5 },
  details: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 11, paddingTop: 10, gap: 4 },
  detailsTitle: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
  detailsText: { fontSize: 11, lineHeight: 16 },
  fileRow: { minHeight: 58, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 12, fontWeight: '600' },
  compatibility: { fontSize: 11, fontWeight: '800', marginTop: 3 },
  downloadLabel: { fontSize: 11, fontWeight: '800' },
});
