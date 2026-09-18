import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
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
import {
  deleteLocalConversations,
  loadLocalConversations,
  renameLocalConversation,
  saveLocalConversation,
} from '@/services/conversation-storage';
import { downloadModel, isModelDownloaded, listDownloadedModels, type ModelDownloadProgress } from '@/services/model-downloads';
import { generateLocalResponse, GenerationStoppedError, stopLocalResponse } from '@/services/local-inference';
import { AuraMark, IconButton, MessageBubble, SurfaceButton, TypingIndicator } from './aura-chat/chat-components';
import { configuredModel, MODEL_CATALOG, palette, SUGGESTIONS, TOOLS, type Conversation, type Message } from './aura-chat/theme';
import { styles } from './aura-chat/styles';

const DRAWER_WIDTH = Math.min(310, Dimensions.get('window').width * 0.82);
const CONVERSATION_MENU_HEIGHT = 222;
const CONVERSATION_ROW_HEIGHT = 48;
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
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null);
  const [conversationMenuAnchor, setConversationMenuAnchor] = useState({ top: 0, opensAbove: false });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedConversationIds, setSelectedConversationIds] = useState<string[]>([]);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [renameTarget, setRenameTarget] = useState<Conversation | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTyping, setShowTyping] = useState(true);
  const [modelUrl, setModelUrl] = useState('');
  const [modelStatus, setModelStatus] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [modelDownloads, setModelDownloads] = useState<Record<string, ModelDownloadProgress>>({});
  const [activeModelUri, setActiveModelUri] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const modelCancelActions = useRef<Record<string, () => void>>({});
  const scrollRef = useRef<ScrollView>(null);
  const sendScale = useRef(new Animated.Value(1)).current;
  const drawerAnimation = useRef(new Animated.Value(0)).current;
  const drawerSurfaceRef = useRef<View>(null);
  const conversationRowRefs = useRef<Record<string, View | null>>({});

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
    setShowScrollToBottom(false);
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
      if (error instanceof GenerationStoppedError) return;
      Alert.alert(
        activeModelUri ? 'Local model unavailable' : 'Backend unavailable',
        error instanceof Error ? error.message : activeModelUri ? 'The downloaded model could not generate a response.' : 'Start the AURA backend first.',
      );
    } finally {
      setIsTyping(false);
    }
  };
  const stopMessageGeneration = async () => {
    try {
      await stopLocalResponse();
    } catch (error) {
      Alert.alert('Unable to stop response', error instanceof Error ? error.message : 'The AI response could not be stopped.');
    }
  };
  const copyMessage = async (content: string) => {
    await Clipboard.setStringAsync(content);
    Alert.alert('Copied', 'AURA’s response is on your clipboard.');
  };
  const exportConversations = async (items: Conversation[]) => {
    if (items.length === 0) return;
    const exportText = items
      .map((item) => [`# ${item.title}`, item.preview, '', ...item.messages.map((message) => `${message.role === 'user' ? 'You' : 'AURA'}: ${message.content}`)].join('\n'))
      .join('\n\n---\n\n');
    await Clipboard.setStringAsync(exportText);
    Alert.alert('Exported', `${items.length} conversation${items.length === 1 ? '' : 's'} copied to your clipboard.`);
  };
  const deleteConversations = (ids: string[]) => {
    if (ids.length === 0) return;
    Alert.alert(
      ids.length === 1 ? 'Delete conversation?' : 'Delete conversations?',
      `This will permanently delete ${ids.length === 1 ? 'this conversation' : `${ids.length} conversations`}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalConversations(ids);
              setConversations((current) => current.filter((item) => !ids.includes(item.id)));
              setSelectedConversationIds([]);
              setSelectionMode(false);
              setConversationMenuId(null);
            } catch (error) {
              Alert.alert('Delete failed', error instanceof Error ? error.message : 'The conversation could not be deleted.');
            }
          },
        },
      ],
    );
  };
  const toggleConversationSelection = (id: string) => {
    setSelectedConversationIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };
  const enterSelectionMode = (id?: string) => {
    setConversationMenuId(null);
    setSelectionMode(true);
    setSelectedConversationIds(id ? [id] : []);
  };
  const renameConversation = (conversation: Conversation) => {
    setConversationMenuId(null);
    setRenameTarget(conversation);
    setRenameDraft(conversation.title);
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
  const pinnedConversations = filteredConversations.filter((item) => pinnedConversationIds.includes(item.id));
  const displayedConversations = filteredConversations.filter((item) => !pinnedConversationIds.includes(item.id));
  const selectableConversations = [...pinnedConversations, ...displayedConversations];
  const selectedPinnedCount = pinnedConversations.filter((item) => selectedConversationIds.includes(item.id)).length;
  const selectedRecentCount = displayedConversations.filter((item) => selectedConversationIds.includes(item.id)).length;
  const openConversationMenu = (id: string) => {
    const row = conversationRowRefs.current[id];
    if (!row || !drawerSurfaceRef.current) return;
    row.measureInWindow((_rowX, rowY, _rowWidth, rowHeight) => {
      drawerSurfaceRef.current?.measureInWindow((_drawerX, drawerY, _drawerWidth, drawerHeight) => {
        const rowTop = rowY - drawerY;
        const rowBottom = rowTop + rowHeight;
        const spaceBelow = drawerHeight - rowBottom - 12;
        const opensAbove = spaceBelow < CONVERSATION_MENU_HEIGHT && rowTop > CONVERSATION_MENU_HEIGHT;
        setConversationMenuAnchor({
          top: opensAbove ? rowTop - CONVERSATION_MENU_HEIGHT : rowBottom,
          opensAbove,
        });
        setConversationMenuId(id);
      });
    });
  };
  const availableTools = activeModelUri ? new Set(['Code', 'File', 'Web']) : new Set<string>();
  const handleToolPress = async (tool: (typeof TOOLS)[number]) => {
    if (!activeModelUri || !availableTools.has(tool.label)) {
      setToolsVisible(false);
      Alert.alert(
        'Tool unavailable',
        activeModelUri
          ? `${tool.label} requires a model capability that the downloaded text-only GGUF model does not provide.`
          : 'Download an AI model first. Tools are enabled according to the active model capabilities.',
      );
      return;
    }

    if (tool.label === 'Code') {
      setDraft((current) => current || 'Help me write or debug this code:\n\n');
      setToolsVisible(false);
      return;
    }

    if (tool.label === 'Web') {
      setToolsVisible(false);
      await Linking.openURL('https://www.google.com/search?q=');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/*', 'application/json', 'application/xml'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const file = new File(result.assets[0].uri);
    const text = await file.text();
    setDraft((current) => `${current ? `${current}\n\n` : ''}Use this file as context:\n\n${text.slice(0, 12000)}`);
    setToolsVisible(false);
  };
  const renderConversationItem = (item: Conversation, keyPrefix: 'recent' | 'pinned') => {
    const selected = selectedConversationIds.includes(item.id);
    const isActionMenuOpen = !selectionMode && conversationMenuId === item.id;
    const conversationTextColor = selectionMode && !selected ? colors.muted : colors.text;
    return <View key={`${keyPrefix}-${item.id}`} ref={(node) => { conversationRowRefs.current[item.id] = node; }} style={[styles.conversationRow, isActionMenuOpen && styles.conversationRowWithMenu]}>
      <Pressable
        style={[
          styles.drawerItem,
          !selectionMode && (selected || isActionMenuOpen) && { backgroundColor: colors.accentSoft },
          isActionMenuOpen && { borderColor: colors.borderStrong, borderWidth: 1 },
        ]}
        onPress={() => selectionMode ? toggleConversationSelection(item.id) : (setMessages(item.messages), closeDrawer())}
        onLongPress={() => { setSelectedConversationIds([]); openConversationMenu(item.id); }}
        delayLongPress={450}>
        {selectionMode ? <View style={[styles.checkbox, { borderColor: selected ? colors.accent : colors.borderStrong, backgroundColor: selected ? colors.accent : 'transparent' }]}>{selected && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor={themeMode === 'dark' ? '#000' : '#FFF'} />}</View> : <SymbolView name={{ ios: pinnedConversationIds.includes(item.id) ? 'pin.fill' : 'bubble.left', android: pinnedConversationIds.includes(item.id) ? 'push_pin' : 'chat_bubble_outline', web: pinnedConversationIds.includes(item.id) ? 'push_pin' : 'chat' }} size={18} tintColor={pinnedConversationIds.includes(item.id) ? colors.text : colors.muted} />}
        <View style={styles.conversationItemCopy}><Text numberOfLines={1} style={[styles.drawerItemText, { color: conversationTextColor }]}>{item.title}</Text><Text numberOfLines={1} style={[styles.conversationPreview, { color: selectionMode && selected ? colors.text : colors.muted }]}>{item.preview}</Text></View>
      </Pressable>
    </View>;
  };

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
        <View style={styles.conversationFrame}>
          <ScrollView
            ref={scrollRef}
            style={styles.conversation}
            contentContainerStyle={[styles.conversationContent, messages.length === 0 && styles.emptyConversation, messages.length > 0 && styles.firstMessageClearance, { paddingBottom: 24 }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={({ nativeEvent }) => {
              const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
              const isAwayFromBottom = contentSize.height > layoutMeasurement.height + 40
                && contentOffset.y + layoutMeasurement.height < contentSize.height - 40;
              setShowScrollToBottom(isAwayFromBottom);
            }}>
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
          {showScrollToBottom && <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll to latest message"
            onPress={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
              setShowScrollToBottom(false);
            }}
            style={({ pressed }) => [
              styles.scrollToBottomButton,
              { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, shadowColor: colors.shadow },
              pressed && styles.pressed,
            ]}>
            <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} size={18} tintColor={colors.text} />
          </Pressable>}
        </View>
        <View style={[styles.composerArea, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.composer, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}>
            <IconButton label="Open tools" onPress={() => setToolsVisible(true)}><Text style={[styles.plus, { color: colors.accent }]}>+</Text></IconButton>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Ask AURA anything..." placeholderTextColor={colors.muted} multiline maxLength={2000} style={[styles.input, { color: colors.text }]} onSubmitEditing={() => sendMessage()} blurOnSubmit={false} accessibilityLabel="Message AURA" />
            <IconButton label="Record a voice message" onPress={() => Alert.alert('Voice input', 'Voice input is ready to connect to your device microphone.')}><SymbolView name={{ ios: 'mic', android: 'mic', web: 'mic' }} size={18} tintColor={colors.muted} /></IconButton>
            <Animated.View style={{ transform: [{ scale: sendScale }] }}><Pressable accessibilityRole="button" accessibilityLabel={isTyping ? 'Stop AURA response' : 'Send message'} disabled={!isTyping && !draft.trim()} onPress={() => void (isTyping ? stopMessageGeneration() : sendMessage())} style={[styles.sendButton, { backgroundColor: isTyping || draft.trim() ? colors.accent : colors.border }]}><SymbolView name={isTyping ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={isTyping ? 15 : 17} tintColor="#FFFFFF" /></Pressable></Animated.View>
          </View>
          <Text style={[styles.disclaimer, { color: colors.muted }]}>AURA can make mistakes. Check important information.</Text>
        </View>
      </KeyboardAvoidingView>
      <Modal visible={drawerMounted} transparent animationType="none" onRequestClose={closeDrawer} statusBarTranslucent>
        <View style={styles.drawerRoot}>
          <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH, backgroundColor: colors.surfaceRaised, borderRightColor: colors.border, transform: [{ translateX: drawerTranslateX }] }]}>
          <View ref={drawerSurfaceRef} style={styles.drawerSurface}>
          {conversationMenuId && <Pressable style={styles.menuDismissOverlay} onPress={() => setConversationMenuId(null)} />}
          {conversationMenuId && (() => {
            const item = conversations.find((conversation) => conversation.id === conversationMenuId);
            if (!item) return null;
            return <View style={[styles.drawerConversationActionBubble, { top: conversationMenuAnchor.top, backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Pressable style={styles.actionBubbleItem} onPress={() => { setPinnedConversationIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [item.id, ...current]); setConversationMenuId(null); }}><SymbolView name={{ ios: pinnedConversationIds.includes(item.id) ? 'pin.slash' : 'pin', android: 'push_pin', web: 'push_pin' }} size={17} tintColor={colors.text} /><Text style={[styles.actionBubbleText, { color: colors.text }]}>{pinnedConversationIds.includes(item.id) ? 'Unpin' : 'Pin'}</Text></Pressable>
              <Pressable style={styles.actionBubbleItem} onPress={() => renameConversation(item)}><SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={17} tintColor={colors.text} /><Text style={[styles.actionBubbleText, { color: colors.text }]}>Rename</Text></Pressable>
              <Pressable style={styles.actionBubbleItem} onPress={() => { setConversationMenuId(null); exportConversations([item]); }}><SymbolView name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }} size={17} tintColor={colors.text} /><Text style={[styles.actionBubbleText, { color: colors.text }]}>Export</Text></Pressable>
              <Pressable style={styles.actionBubbleItem} onPress={() => deleteConversations([item.id])}><SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete' }} size={17} tintColor="#C25E5E" /><Text style={[styles.actionBubbleText, { color: '#C25E5E' }]}>Delete</Text></Pressable>
              <Pressable style={styles.actionBubbleItem} onPress={() => enterSelectionMode()}><SymbolView name={{ ios: 'checkmark.circle', android: 'check_circle_outline', web: 'check_circle' }} size={17} tintColor={colors.text} /><Text style={[styles.actionBubbleText, { color: colors.text }]}>Select</Text></Pressable>
            </View>;
          })()}
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
          <Pressable style={styles.drawerItem} onPress={clearConversation}>
            <SymbolView name={{ ios: 'trash', android: 'delete_outline', web: 'delete' }} size={19} tintColor="#C25E5E" />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>Clear conversation</Text>
          </Pressable>
          <Pressable style={styles.drawerItem} onPress={newConversation}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={19} tintColor={colors.text} />
            <Text style={[styles.drawerItemText, { color: colors.text }]}>New conversation</Text>
          </Pressable>
          <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: 'transparent' }]}><SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={16} tintColor={colors.muted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search conversations" placeholderTextColor={colors.muted} style={[styles.searchInput, { color: colors.text }]} /></View>
          {selectionMode && <View style={styles.bulkActions}>
            <Pressable style={[styles.bulkAction, { borderColor: colors.border }]} onPress={() => setSelectedConversationIds(selectedConversationIds.length === selectableConversations.length ? [] : selectableConversations.map((item) => item.id))}>
              <Text style={[styles.bulkActionText, { color: colors.text }]}>{selectedConversationIds.length === selectableConversations.length ? 'Deselect all' : 'Select all'}</Text>
            </Pressable>
            <Pressable disabled={selectedConversationIds.length === 0} style={[styles.bulkAction, { borderColor: colors.border, opacity: selectedConversationIds.length ? 1 : 0.45 }]} onPress={() => exportConversations(selectableConversations.filter((item) => selectedConversationIds.includes(item.id)))}>
              <Text style={[styles.bulkActionText, { color: colors.text }]}>Export</Text>
            </Pressable>
            <Pressable disabled={selectedConversationIds.length === 0} style={[styles.bulkAction, { borderColor: colors.border, opacity: selectedConversationIds.length ? 1 : 0.45 }]} onPress={() => deleteConversations(selectedConversationIds)}>
              <Text style={[styles.bulkActionText, { color: '#C25E5E' }]}>Delete</Text>
            </Pressable>
            <Pressable style={[styles.bulkAction, { borderColor: colors.border }]} onPress={() => { setSelectionMode(false); setSelectedConversationIds([]); }}>
              <Text style={[styles.bulkActionText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </View>}
          {pinnedConversations.length > 0 && <>
            <Text style={[styles.menuSectionLabel, { color: colors.muted }]}>{selectionMode ? `PINNED (${selectedPinnedCount})` : 'PINNED'}</Text>
            {pinnedConversations.length >= 3 ? (
              <ScrollView
                contentContainerStyle={styles.pinnedContent}
                style={[styles.pinnedScroll, { height: CONVERSATION_ROW_HEIGHT * 3 }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                {pinnedConversations.map((item) => renderConversationItem(item, 'pinned'))}
              </ScrollView>
            ) : (
              <View style={styles.pinnedContent}>
                {pinnedConversations.map((item) => renderConversationItem(item, 'pinned'))}
              </View>
            )}
          </>}
          <View style={[styles.recentHeader, pinnedConversations.length > 0 && styles.recentHeaderAfterPinned]}>
            <Text style={[styles.menuSectionLabel, { color: colors.muted }, pinnedConversations.length > 0 && styles.sectionLabelAfterPinned]}>{selectionMode ? `RECENT (${selectedRecentCount})` : 'RECENT'}</Text>
          </View>
          <ScrollView contentContainerStyle={styles.drawerRecentContent} style={styles.drawerScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {displayedConversations.length === 0 ? <Text style={[styles.emptyHistory, { color: colors.muted }]}>No recent conversations</Text> : displayedConversations.map((item) => renderConversationItem(item, 'recent'))}
          </ScrollView>
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
                    { backgroundColor: colors.background, borderColor: colors.border, opacity: availableTools.has(tool.label) ? 1 : 0.5 },
                    pressed && { backgroundColor: colors.accentSoft, opacity: 0.8 },
                  ]}
                  onPress={() => void handleToolPress(tool)}>
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
      <Modal visible={renameTarget !== null} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setRenameTarget(null)}>
          <Pressable style={[styles.renameSheet, { backgroundColor: colors.surfaceRaised }]} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Rename conversation</Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              selectTextOnFocus
              placeholder="Conversation name"
              placeholderTextColor={colors.muted}
              style={[styles.renameInput, { color: colors.text, borderColor: colors.border }]}
            />
            <View style={styles.renameActions}>
              <Pressable style={[styles.renameButton, { borderColor: colors.border }]} onPress={() => setRenameTarget(null)}>
                <Text style={[styles.bulkActionText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.renameButton, { backgroundColor: colors.accent }]}
                onPress={async () => {
                  const title = renameDraft.trim();
                  if (!renameTarget || !title) return;
                  try {
                    await renameLocalConversation(renameTarget.id, title);
                    setConversations((current) => current.map((item) => item.id === renameTarget.id ? { ...item, title } : item));
                    setRenameTarget(null);
                  } catch (error) {
                    Alert.alert('Rename failed', error instanceof Error ? error.message : 'The conversation could not be renamed.');
                  }
                }}>
                <Text style={[styles.bulkActionText, { color: themeMode === 'dark' ? '#000' : '#FFF' }]}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
