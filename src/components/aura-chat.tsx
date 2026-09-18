import * as Clipboard from 'expo-clipboard';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadLocalConversations, saveLocalConversation } from '@/services/conversation-storage';
import { downloadModel, isModelDownloaded, listDownloadedModels, type ModelDownloadProgress } from '@/services/model-downloads';
import { generateLocalResponse } from '@/services/local-inference';
import { AuraMark, IconButton, MessageBubble, SurfaceButton, TypingIndicator } from './aura-chat/chat-components';
import { configuredModel, MODEL_CATALOG, palette, SUGGESTIONS, TOOLS, type Conversation, type Message } from './aura-chat/theme';
import { styles } from './aura-chat/styles';

const DRAWER_WIDTH = Math.min(310, Dimensions.get('window').width * 0.82);
const TOOL_ICONS = {
  Camera: { ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' },
  Image: { ios: 'photo', android: 'image', web: 'image' },
  File: { ios: 'doc.fill', android: 'insert_drive_file', web: 'description' },
  Voice: { ios: 'mic.fill', android: 'mic', web: 'mic' },
  Web: { ios: 'globe', android: 'language', web: 'language' },
  Code: { ios: 'chevron.left.forwardslash.chevron.right', android: 'code', web: 'code' },
} as const;

export default function AuraChat() {
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(systemScheme === 'dark' ? 'dark' : 'light');
  const isDark = themeMode === 'dark';
  const colors = palette[themeMode];
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [modelVisible, setModelVisible] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTyping, setShowTyping] = useState(true);
  const [modelUrl, setModelUrl] = useState('');
  const [modelStatus, setModelStatus] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelDownloads, setModelDownloads] = useState<Record<string, ModelDownloadProgress>>({});
  const [activeModelUri, setActiveModelUri] = useState<string | null>(null);
  const modelCancelActions = useRef<Record<string, () => void>>({});
  const scrollRef = useRef<ScrollView>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
  const drawerAnimation = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setDrawerMounted(true);
    setDrawerOpen(true);
  };
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    if (!drawerMounted) return;
    Animated.timing(drawerAnimation, {
      toValue: drawerOpen ? 1 : 0,
      duration: drawerOpen ? 300 : 240,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !drawerOpen) setDrawerMounted(false);
    });
  }, [drawerAnimation, drawerMounted, drawerOpen]);

  const drawerTranslateX = drawerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-DRAWER_WIDTH, 0],
  });

  useEffect(() => {
    loadLocalConversations().then(setConversations).catch(() => Alert.alert('Local database unavailable', 'AURA could not open its local SQLite database.'));
  }, []);
  useEffect(() => {
    const downloadedModels = listDownloadedModels();
    if (downloadedModels.length > 0) setActiveModelUri(downloadedModels[0].uri);
  }, []);
  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      if (autoScroll) requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    });
    return () => subscription.remove();
  }, [autoScroll]);
  useEffect(() => {
    if (!autoScroll || messages.length === 0) return;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages, isTyping, autoScroll]);

  const clearConversation = () => {
    setMessages([]);
    setIsTyping(false);
    setMenuVisible(false);
    closeDrawer();
  };
  const saveConversation = async () => {
    if (!messages.length) return;
    const saved = await saveLocalConversation(messages);
    setConversations((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
  };
  const newConversation = async () => {
    try {
      await saveConversation();
    } catch (error) {
      Alert.alert('Backend unavailable', error instanceof Error ? error.message : 'Start the AURA backend first.');
    }
    clearConversation();
  };
  const sendMessage = async (value = draft) => {
    const content = value.trim();
    if (!content || isTyping) return;
    if (!activeModelUri) {
      setModelStatus('Download a model on this device before starting a chat.');
      setModelVisible(true);
      return;
    }
    const userMessage: Message = { id: `${Date.now()}-user`, role: 'user', content };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setIsTyping(true);
    Animated.sequence([
      Animated.timing(sendScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.spring(sendScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    try {
      const response = await generateLocalResponse(activeModelUri, [...messages, userMessage]);
      setMessages((current) => [...current, { id: `${Date.now()}-assistant`, role: 'assistant', content: response }]);
    } catch (error) {
      Alert.alert(
        activeModelUri ? 'Local model unavailable' : 'Backend unavailable',
        error instanceof Error ? error.message : activeModelUri ? 'The downloaded model could not generate a response.' : 'Start the AURA backend first.',
      );
    } finally {
      setIsTyping(false);
    }
  };
  const copyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
    Alert.alert('Copied', 'AURA’s response is on your clipboard.');
  };
  const startModelDownload = async (url: string, name: string) => {
    if (modelDownloads[url]?.status === 'downloading') {
      modelCancelActions.current[url]?.();
      return;
    }
    setModelStatus(`Preparing ${name}…`);
    try {
      const file = await downloadModel(
        url,
        name,
        (progress) => setModelDownloads((current) => ({ ...current, [url]: progress })),
        (cancel) => { modelCancelActions.current[url] = cancel; },
      );
      setActiveModelUri(file.uri);
      setModelStatus(`${name} is saved on this device.`);
    } catch (error) {
      setModelStatus(error instanceof Error ? error.message : 'The model download failed.');
    }
  };
  const openModelUrl = async () => {
    const url = modelUrl.trim();
    if (!url) {
      Alert.alert('Model URL required', 'Paste a direct GGUF download URL to continue.');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      Alert.alert('Invalid model URL', 'Use a secure https:// download URL.');
      return;
    }
    await startModelDownload(url, 'Custom GGUF model');
  };
  const filteredConversations = conversations.filter((item) => item.title.toLowerCase().includes(search.toLowerCase()));
  const filteredModels = MODEL_CATALOG.filter((model) =>
    `${model.name} ${model.source}`.toLowerCase().includes(modelSearch.trim().toLowerCase()),
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <View style={[styles.floatingMenu, { top: 2 }]}>
          <View style={[styles.floatingMenuButton, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
            <IconButton label={drawerOpen ? 'Close AURA menu' : 'Open AURA menu'} onPress={() => (drawerOpen ? closeDrawer() : openDrawer())}>
              <SymbolView name={drawerOpen ? { ios: 'xmark', android: 'close', web: 'close' } : { ios: 'line.3.horizontal', android: 'menu', web: 'menu' }} size={20} tintColor={colors.text} />
            </IconButton>
          </View>
        </View>
        <View style={[styles.floatingActions, { top: 2 }]}>
          <View style={[styles.floatingActionsGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconButton label="Start new conversation" onPress={newConversation}><SymbolView name={{ ios: 'square.and.pencil', android: 'edit', web: 'edit' }} size={19} tintColor={colors.text} /></IconButton>
            <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />
            <IconButton label="Open conversation menu" onPress={() => setMenuVisible((open) => !open)}><SymbolView name={{ ios: 'ellipsis', android: 'more_vert', web: 'more_horiz' }} size={21} tintColor={colors.text} /></IconButton>
          </View>
          {menuVisible && <View style={[styles.actionBubble, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Pressable style={styles.actionBubbleItem} onPress={() => { setMenuVisible(false); setSettingsVisible(true); }}>
              <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={17} tintColor={colors.text} />
              <Text style={[styles.actionBubbleText, { color: colors.text }]}>Settings</Text>
            </Pressable>
            <Pressable style={styles.actionBubbleItem} onPress={() => { setMenuVisible(false); setModelVisible(true); }}>
              <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={17} tintColor={colors.text} />
              <Text style={[styles.actionBubbleText, { color: colors.text }]}>Models</Text>
            </Pressable>
            <Pressable style={styles.actionBubbleItem} onPress={() => { setMenuVisible(false); setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); }}>
              <SymbolView name={themeMode === 'dark' ? { ios: 'sun.max', android: 'light_mode', web: 'light_mode' } : { ios: 'moon', android: 'dark_mode', web: 'dark_mode' }} size={17} tintColor={colors.text} />
              <Text style={[styles.actionBubbleText, { color: colors.text }]}>{themeMode === 'dark' ? 'Light mode' : 'Dark mode'}</Text>
            </Pressable>
            <Pressable style={styles.actionBubbleItem} onPress={clearConversation}>
              <SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete' }} size={17} tintColor="#C25E5E" />
              <Text style={[styles.actionBubbleText, { color: colors.text }]}>Clear conversation</Text>
            </Pressable>
          </View>}
        </View>
        <ScrollView ref={scrollRef} style={styles.conversation} contentContainerStyle={[styles.conversationContent, messages.length === 0 && styles.emptyConversation, messages.length > 0 && styles.firstMessageClearance, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {messages.length === 0 ? <View style={styles.emptyState}>
            <AuraMark size={68} />
            <Text style={[styles.welcomeTitle, { color: colors.text }]}>Hello, I’m AURA.</Text>
            {!activeModelUri ? <View style={[styles.noModelCard, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Text style={[styles.noModelTitle, { color: colors.text }]}>You haven’t downloaded a model yet.</Text>
              <Text style={[styles.noModelText, { color: colors.muted }]}>Choose a GGUF model to run AURA directly on this device.</Text>
              <Pressable style={[styles.modelDownloadButton, { backgroundColor: colors.accent }]} onPress={() => setModelVisible(true)}>
                <Text style={styles.modelDownloadButtonText}>Download a model</Text>
              </Pressable>
            </View> : <>
              <Text style={[styles.welcomeSubtitle, { color: colors.muted }]}>How can I help you today?</Text>
              <View style={styles.suggestions}>{SUGGESTIONS.map((suggestion) => <SurfaceButton key={suggestion} label={suggestion} onPress={() => sendMessage(suggestion)} colors={colors}><Text style={[styles.suggestionText, { color: colors.text }]}>{suggestion}</Text><SymbolView name={{ ios: 'arrow.up.right', android: 'north_east', web: 'arrow_upward' }} size={14} tintColor={colors.accent} /></SurfaceButton>)}</View>
            </>}
          </View> : messages.map((message) => <MessageBubble key={message.id} message={message} colors={colors} onCopy={copyMessage} />)}
          {messages.length > 0 && isTyping && showTyping && <TypingIndicator colors={colors} />}
        </ScrollView>
        <View style={[styles.composerArea, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.composer, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}>
            <IconButton label="Open tools" onPress={() => setToolsVisible(true)}><Text style={[styles.plus, { color: colors.accent }]}>+</Text></IconButton>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Ask AURA anything..." placeholderTextColor={colors.muted} multiline maxLength={2000} style={[styles.input, { color: colors.text }]} onSubmitEditing={() => sendMessage()} blurOnSubmit={false} accessibilityLabel="Message AURA" />
            <IconButton label="Record a voice message" onPress={() => Alert.alert('Voice input', 'Voice input is ready to connect to your device microphone.')}><SymbolView name={{ ios: 'mic', android: 'mic', web: 'mic' }} size={18} tintColor={colors.muted} /></IconButton>
            <Animated.View style={{ transform: [{ scale: sendScale }] }}><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={!draft.trim() || isTyping} onPress={() => sendMessage()} style={[styles.sendButton, { backgroundColor: draft.trim() && !isTyping ? colors.accent : colors.border }]}><SymbolView name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={17} tintColor="#FFFFFF" /></Pressable></Animated.View>
          </View>
          <Text style={[styles.disclaimer, { color: colors.muted }]}>AURA can make mistakes. Check important information.</Text>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={drawerMounted} transparent animationType="none" onRequestClose={closeDrawer} statusBarTranslucent>
        <View style={styles.drawerRoot}>
          <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH, backgroundColor: colors.surfaceRaised, borderRightColor: colors.border, transform: [{ translateX: drawerTranslateX }] }]}>
          <View style={styles.drawerSurface}>
          <View style={styles.drawerHeader}><View><Text style={[styles.drawerTitle, { color: colors.text }]}>AURA</Text><Text style={[styles.drawerSubtitle, { color: colors.muted }]}>Your AI assistant</Text></View><IconButton label="Close AURA menu" onPress={closeDrawer}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={colors.muted} /></IconButton></View>
          <Text style={[styles.menuSectionLabel, { color: colors.muted }]}>MENU</Text>
          <Pressable style={styles.drawerItem} onPress={() => { closeDrawer(); setSettingsVisible(true); }}>
            <SymbolView name={{ ios: 'gearshape', android: 'settings', web: 'settings' }} size={19} tintColor={colors.muted} />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>Settings</Text>
          </Pressable>
          <Pressable style={styles.drawerItem} onPress={() => { closeDrawer(); setModelVisible(true); }}>
            <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={19} tintColor={colors.muted} />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>Models</Text>
          </Pressable>
          <Pressable style={styles.drawerItem} onPress={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}>
            <SymbolView name={themeMode === 'dark' ? { ios: 'sun.max', android: 'light_mode', web: 'light_mode' } : { ios: 'moon', android: 'dark_mode', web: 'dark_mode' }} size={19} tintColor={colors.muted} />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>{themeMode === 'dark' ? 'Light mode' : 'Dark mode'}</Text>
          </Pressable>
          <Pressable style={styles.drawerItem} onPress={clearConversation}>
            <SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete' }} size={19} tintColor="#C25E5E" />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>Clear conversation</Text>
          </Pressable>
          <Pressable style={styles.drawerItem} onPress={newConversation}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={colors.text} />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>New conversation</Text>
          </Pressable>
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: 'transparent' }]}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search conversations" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} /></View>
          <Text style={[styles.menuSectionLabel, { color: colors.muted }]}>RECENT</Text>
          <ScrollView contentContainerStyle={styles.drawerRecentContent} style={styles.drawerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{filteredConversations.length === 0 ? <Text style={[styles.emptyHistory, { color: colors.muted }]}>No recent conversations</Text> : filteredConversations.map((item) => <Pressable key={item.id} style={styles.drawerItem} onPress={() => { setMessages(item.messages); closeDrawer(); }}><SymbolView name={{ ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat' }} size={18} tintColor={colors.muted} /><View style={styles.conversationItemCopy}><Text numberOfLines={1} style={[styles.drawerItemText, { color: colors.text }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.conversationPreview, { color: colors.muted }]}>{item.preview}</Text></View></Pressable>)}</ScrollView>
          <View style={[styles.drawerFooter, { borderTopColor: colors.border }]}><Pressable style={[styles.modelWidget, { borderColor: colors.border, backgroundColor: colors.surfaceRaised }]} onPress={() => { closeDrawer(); setModelVisible(true); }}><View style={[styles.modelBadge, { borderColor: colors.border }]}><SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={17} tintColor={colors.accent} /></View><View style={styles.modelCopy}><Text style={[styles.drawerFooterTitle, { color: colors.text }]}>{configuredModel || 'No model connected'}</Text><Text style={[styles.drawerFooterText, { color: colors.muted }]}>Manage connected models</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={colors.muted} /></Pressable></View>
          </View>
          <View pointerEvents="none" style={[styles.drawerFadeTop, { backgroundColor: colors.surfaceRaised }]} />
          <View pointerEvents="none" style={[styles.drawerFadeBottom, { backgroundColor: colors.surfaceRaised }]} />
          </Animated.View>
          <Animated.View style={[styles.drawerBackdropWrap, { opacity: drawerAnimation }]}>
            <Pressable style={[styles.drawerBackdrop, { backgroundColor: colors.backdrop }]} onPress={closeDrawer} />
          </Animated.View>
        </View>
      </Modal>
      <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSettingsVisible(false)}>
          <View style={[styles.settingsSheet, { backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.settingsHeader}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Settings</Text><Text style={[styles.settingsSubtitle, { color: colors.muted }]}>Make AURA work the way you do.</Text></View><IconButton label="Close settings" onPress={() => setSettingsVisible(false)}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={colors.muted} /></IconButton></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.settingsSection, { color: colors.muted }]}>CHAT</Text>
              <View style={[styles.settingsCard, { borderColor: colors.border }]}>
                <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.text }]}>Auto-scroll</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>Keep the latest message in view.</Text></View><Switch value={autoScroll} onValueChange={setAutoScroll} /></View>
                <View style={[styles.settingInline, { borderTopColor: colors.border }]}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.text }]}>Typing indicator</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>Show AURA’s response status.</Text></View><Switch value={showTyping} onValueChange={setShowTyping} /></View>
              </View>
              <Text style={[styles.settingsSection, { color: colors.muted }]}>APPEARANCE</Text>
              <View style={[styles.settingsCard, { borderColor: colors.border }]}>
                <View style={styles.settingRow}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.text }]}>Theme</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>Choose a comfortable reading mode.</Text></View><Pressable style={styles.settingValueButton} onPress={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}><Text style={[styles.settingValue, { color: colors.text }]}>{themeMode === 'dark' ? 'Dark' : 'Light'}</Text><SymbolView name={{ ios: 'chevron.up.chevron.down', android: 'unfold_more', web: 'unfold_more' }} size={14} tintColor={colors.muted} /></Pressable></View>
              </View>
              <Text style={[styles.settingsSection, { color: colors.muted }]}>MODEL</Text>
              <View style={[styles.settingsCard, { borderColor: colors.border }]}><View style={styles.settingRow}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.text }]}>Active model</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>{configuredModel || 'No model connected'}</Text></View></View><View style={[styles.settingInline, { borderTopColor: colors.border }]}><Pressable onPress={() => { setSettingsVisible(false); setModelVisible(true); }}><Text style={[styles.settingValue, { color: colors.text }]}>Manage models</Text></Pressable></View></View>
              <Text style={[styles.settingsSection, { color: colors.muted }]}>DATA</Text>
              <View style={[styles.settingsCard, { borderColor: colors.border }]}><Pressable style={styles.settingRow} onPress={clearConversation}><View style={styles.settingCopy}><Text style={[styles.settingTitle, { color: colors.text }]}>Clear current conversation</Text><Text style={[styles.settingDescription, { color: colors.muted }]}>Remove messages from this screen.</Text></View><SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete' }} size={17} tintColor={colors.muted} /></Pressable></View>
              <Text style={[styles.aboutNote, { color: colors.muted }]}>AURA keeps your conversations on this device when local storage is available.</Text>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
      <Modal visible={modelVisible} transparent animationType="slide" onRequestClose={() => setModelVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setModelVisible(false)}>
          <View style={[styles.modelSheet, { backgroundColor: colors.surfaceRaised }]}>
            <View style={styles.modelSheetHeader}><View><Text style={[styles.sheetTitle, { color: colors.text }]}>Model Manager</Text><Text style={[styles.modelDescription, { color: colors.muted }]}>Connect a hosted model or download a GGUF model for local replies.</Text></View><IconButton label="Close model manager" onPress={() => setModelVisible(false)}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} tintColor={colors.muted} /></IconButton></View>
            <View style={[styles.modelSearchBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={colors.muted} />
              <TextInput
                value={modelSearch}
                onChangeText={setModelSearch}
                placeholder="Search GGUF models"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.modelSearchInput, { color: colors.text }]}
              />
            </View>
            <Text style={[styles.modelSectionLabel, { color: colors.muted }]}>AVAILABLE MODELS</Text>
            <ScrollView style={styles.modelCatalog} showsVerticalScrollIndicator={false}>
              {filteredModels.length > 0 ? filteredModels.map((model) => (
                <Pressable
                  key={model.name}
                  style={({ pressed }) => [styles.modelCatalogItem, { borderColor: colors.border, backgroundColor: colors.background }, pressed && styles.pressed]}
                  onPress={() => startModelDownload(model.url, model.name)}>
                  <View style={[styles.modelOptionIcon, { backgroundColor: colors.accentSoft }]}>
                    <SymbolView name={{ ios: 'cpu', android: 'memory', web: 'memory' }} size={18} tintColor={colors.text} />
                  </View>
                  <View style={styles.modelOptionCopy}>
                    <Text style={[styles.modelOptionTitle, { color: colors.text }]}>{model.name}</Text>
                    <Text style={[styles.modelOptionText, { color: colors.muted }]}>GGUF · {model.source}</Text>
                  </View>
                  <View style={[styles.modelSizeBadge, { backgroundColor: colors.accentSoft }]}>
                    <Text style={[styles.modelSizeText, { color: colors.text }]}>{model.size}</Text>
                  </View>
                  <Text style={[styles.modelDownloadLabel, { color: colors.muted }]}>
                    {modelDownloads[model.url]?.status === 'downloading'
                      ? 'Cancel'
                      : modelDownloads[model.url]?.status === 'completed' || isModelDownloaded(model.url, model.name) ? 'Saved' : 'Download'}
                  </Text>
                </Pressable>
              )) : <Text style={[styles.modelNotice, { color: colors.muted }]}>No matching models. Try another search.</Text>}
            </ScrollView>
            <Pressable
              style={[styles.modelOption, { borderColor: colors.border }]}
              onPress={() => setModelStatus('Choose a model above or paste a direct .gguf URL below.')}>
              <View style={[styles.modelOptionIcon, { backgroundColor: colors.accentSoft }]}>
                <SymbolView name={{ ios: 'arrow.down.circle', android: 'download_for_offline', web: 'download' }} size={19} tintColor={colors.accent} />
              </View>
              <View style={styles.modelOptionCopy}>
                <Text style={[styles.modelOptionTitle, { color: colors.text }]}>Client-side download</Text>
                <Text style={[styles.modelOptionText, { color: colors.muted }]}>Search compatible GGUF models, check their file size, and download one to this device.</Text>
              </View>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={16} tintColor={colors.muted} />
            </Pressable>
            <View style={[styles.directDownload, { borderColor: colors.border }]}>
              <View style={styles.modelOptionCopy}>
                <Text style={[styles.modelOptionTitle, { color: colors.text }]}>Direct download</Text>
                <Text style={[styles.modelOptionText, { color: colors.muted }]}>Paste a direct .gguf URL. Check the file size before downloading.</Text>
              </View>
              <TextInput value={modelUrl} onChangeText={(value) => { setModelUrl(value); setModelStatus(''); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…/model.gguf" placeholderTextColor={colors.muted} style={[styles.modelUrlInput, { color: colors.text, borderColor: colors.border }]} />
              <Pressable style={[styles.modelDownloadButton, { backgroundColor: colors.accent }]} onPress={openModelUrl}><Text style={styles.modelDownloadButtonText}>Download to this device</Text></Pressable>
              {modelStatus ? <Text style={[styles.modelNotice, { color: colors.muted }]}>{modelStatus}</Text> : null}
            </View>
            <Text style={[styles.modelNotice, { color: colors.muted }]}>Only download models from sources you trust. Large files may use significant storage and bandwidth.</Text>
            <Pressable style={styles.modelBrowseLink} onPress={() => Linking.openURL('https://huggingface.co/models?library=gguf')}>
              <Text style={[styles.modelBrowseLinkText, { color: colors.text }]}>Browse all GGUF models on Hugging Face</Text>
              <SymbolView name={{ ios: 'arrow.up.right', android: 'open_in_new', web: 'open_in_new' }} size={15} tintColor={colors.muted} />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <Modal visible={toolsVisible} transparent animationType="slide" onRequestClose={() => setToolsVisible(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setToolsVisible(false)}>
          <View style={[styles.toolSheet, { backgroundColor: colors.surfaceRaised }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.borderStrong }]} />
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Tools</Text>
            <View style={styles.toolsGrid}>
              {TOOLS.map((tool) => (
                <Pressable
                  key={tool.label}
                  accessibilityRole="button"
                  accessibilityLabel={tool.label}
                  style={({ pressed }) => [
                    styles.toolItem,
                    { backgroundColor: colors.background, borderColor: colors.border },
                    pressed && { backgroundColor: colors.accentSoft, opacity: 0.8 },
                  ]}
                  onPress={() => {
                    setToolsVisible(false);
                    Alert.alert(tool.label, `${tool.label} support will be connected soon.`);
                  }}>
                  <View style={[styles.toolIcon, { backgroundColor: colors.accentSoft }]}>
                    <SymbolView
                      name={TOOL_ICONS[tool.label]}
                      size={20}
                      tintColor={colors.text}
                    />
                  </View>
                  <Text style={[styles.toolLabel, { color: colors.text }]}>{tool.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
