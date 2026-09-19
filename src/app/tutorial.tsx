import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadAppSettings, saveAppSettings } from '@/services/app-settings';

const STEPS = [
  { title: 'Welcome to AURA', image: require('@/assets/images/Welcome.jpg'), body: 'AURA is your private local AI assistant. Your conversations and downloaded models stay on this device.' },
  { title: 'Choose a model', image: require('@/assets/images/modelpick.jpg'), body: 'Open Models to download a GGUF model. After it finishes, select it as your active model before chatting.' },
  { title: 'Start chatting', image: require('@/assets/images/chat.jpg'), body: 'Type a message or tap a suggestion. AURA will stream the response, and you can stop it anytime.' },
  { title: 'Make it yours', image: require('@/assets/images/yours.jpg'), body: 'Use Settings to change the theme, response length, Enter behavior, and your cute message bubble color.' },
] as const;

function RoundedImage({ source }: { source: number }) {
  return (
    <View style={styles.imageFrame}>
      <Image source={source} style={styles.image} contentFit="cover" transition={150} />
    </View>
  );
}

export default function TutorialScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const [step, setStep] = useState(0);
  const colors = {
    background: isDark ? '#000000' : '#F7F7F8',
    surface: isDark ? '#111111' : '#FFFFFF',
    border: isDark ? '#2A2A2A' : '#E5E5E5',
    text: isDark ? '#ECECEC' : '#202123',
    muted: isDark ? '#AFAFAF' : '#6B6B6B',
    accent: isDark ? '#ECECEC' : '#202123',
  };
  const finish = () => {
    saveAppSettings({ ...loadAppSettings(), hasSeenTutorial: true });
    router.back();
  };
  const current = STEPS[step];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={finish} style={styles.iconButton} accessibilityLabel="Close tutorial">
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>AURA Tutorial</Text>
        <View style={styles.iconButton} />
      </View>
      <View style={styles.progress}>
        {STEPS.map((item, index) => <View key={item.title} style={[styles.dot, { backgroundColor: index === step ? colors.accent : colors.border }]} />)}
      </View>
      <View style={styles.content}>
        <RoundedImage source={current.image} />
        <Text style={[styles.stepCount, { color: colors.muted }]}>STEP {step + 1} OF {STEPS.length}</Text>
        <Text style={[styles.title, { color: colors.text }]}>{current.title}</Text>
        <Text style={[styles.body, { color: colors.muted }]}>{current.body}</Text>
      </View>
      <View style={styles.actions}>
        {step > 0 ? <Pressable onPress={() => setStep((value) => value - 1)} style={[styles.button, styles.secondaryButton, { borderColor: colors.border }]}><Text style={[styles.buttonText, { color: colors.text }]}>Back</Text></Pressable> : <View style={styles.buttonPlaceholder} />}
        <Pressable onPress={() => step === STEPS.length - 1 ? finish() : setStep((value) => value + 1)} style={[styles.button, styles.primaryButton, { backgroundColor: colors.accent, borderColor: colors.accent }]}><Text style={[styles.buttonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>{step === STEPS.length - 1 ? 'Done' : 'Next'}</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  progress: { flexDirection: 'row', gap: 6, marginHorizontal: 22, marginTop: 10 },
  dot: { flex: 1, height: 5, borderRadius: 3 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 28 },
  imageFrame: { width: 300, height: 220, alignSelf: 'center', marginBottom: 24, overflow: 'hidden', borderRadius: 24 },
  image: { width: '100%', height: '100%' },
  stepCount: { fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginBottom: 15 },
  title: { fontSize: 32, lineHeight: 38, fontWeight: '800', letterSpacing: -0.7, marginBottom: 14 },
  body: { fontSize: 16, lineHeight: 25, maxWidth: 360 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingBottom: 18 },
  buttonPlaceholder: { minWidth: 112, minHeight: 52 },
  button: { minWidth: 112, minHeight: 52, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  secondaryButton: { backgroundColor: 'transparent' },
  primaryButton: { shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  buttonText: { fontSize: 14, fontWeight: '800' },
});
