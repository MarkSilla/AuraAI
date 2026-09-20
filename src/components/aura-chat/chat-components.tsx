import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { styles } from './styles';
import type { AuraColors, Message } from './theme';

function getBubbleTextColor(color: string, fallback: string) {
  const hex = color.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return fallback;
  const [red, green, blue] = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luminance > 186 ? '#202123' : '#FFFFFF';
}

export function AuraMark({ size = 44 }: { size?: number }) {
  return (
    <View style={[styles.auraMark, { width: size, height: size, borderRadius: size / 3.5 }]}>
      <Image source={require('@/assets/images/aura_icon.png')} style={styles.auraMarkImage} resizeMode="cover" />
    </View>
  );
}

export function IconButton({
  label,
  onPress,
  children,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

export function SurfaceButton({
  label,
  onPress,
  variant = 'outline',
  colors,
  children,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost';
  colors: AuraColors;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.surfaceButton,
        variant === 'primary' && { backgroundColor: colors.accent, borderColor: colors.accent },
        variant === 'outline' && { backgroundColor: colors.surface, borderColor: colors.borderStrong },
        variant === 'ghost' && { backgroundColor: 'transparent', borderColor: 'transparent' },
        pressed && styles.pressed,
      ]}>
      {children}
    </Pressable>
  );
}

export function MessageBubble({
  message,
  colors,
  onCopy,
  onSpeak,
  userActionsVisible = false,
  onUserActionsChange,
  streaming = false,
}: {
  message: Message;
  colors: AuraColors;
  onCopy: (content: string) => void;
  onSpeak: (content: string) => void;
  userActionsVisible?: boolean;
  onUserActionsChange: (visible: boolean) => void;
  streaming?: boolean;
}) {
  const isUser = message.role === 'user';
  const userBubbleTextColor = getBubbleTextColor(colors.userBubble, colors.userBubbleText);
  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow, userActionsVisible && styles.userMessageRowOpen]}>
      {!isUser && <AuraMark size={28} />}
      <View style={styles.messageColumn}>
        {!isUser && (
          <View style={styles.assistantHeader}>
            <Text style={[styles.assistantName, { color: colors.text }]}>AURA</Text>
            <View style={[styles.assistantStatusDot, { backgroundColor: colors.accent }]} />
            <Text style={[styles.assistantMeta, { color: colors.muted }]}>AI Assistant</Text>
          </View>
        )}
        {isUser ? (
          <View>
            <Pressable
              onLongPress={() => onUserActionsChange(true)}
              delayLongPress={350}
              style={[styles.bubble, { backgroundColor: colors.userBubble, shadowColor: colors.shadow }, styles.userBubble]}>
              {message.attachmentName && (
                <View style={[styles.attachmentCard, { borderColor: userBubbleTextColor }]}>
                  <SymbolView name={{ ios: 'doc.fill', android: 'description', web: 'description' }} size={17} tintColor={userBubbleTextColor} />
                  <Text numberOfLines={1} style={[styles.attachmentName, { color: userBubbleTextColor }]}>{message.attachmentName}</Text>
                </View>
              )}
              <Text style={[styles.messageText, { color: userBubbleTextColor }]}>{message.content}</Text>
            </Pressable>
            {userActionsVisible && (
              <View style={[styles.userMessageActions, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Copy message"
                  style={styles.actionBubbleItem}
                  onPress={() => {
                    onUserActionsChange(false);
                    void onCopy(message.content);
                  }}>
                  <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={16} tintColor={colors.text} />
                  <Text style={[styles.actionBubbleText, { color: colors.text }]}>Copy</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <MarkdownMessage content={message.content} colors={colors} onCopy={onCopy} />
        )}
        {!isUser && streaming && (
          <View style={styles.thinkingRow}>
            <View style={[styles.typingDot, { backgroundColor: colors.accent }]} />
            <View style={[styles.typingDot, { backgroundColor: colors.accent, opacity: 0.65 }]} />
            <View style={[styles.typingDot, { backgroundColor: colors.accent, opacity: 0.35 }]} />
          </View>
        )}
        {!isUser && (
          <View style={styles.responseActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Play AURA response"
              onPress={() => onSpeak(message.content)}
              style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'speaker.wave.2', android: 'volume_up', web: 'volume_up' }} size={13} tintColor={colors.muted} />
              <Text style={[styles.copyText, { color: colors.muted }]}>Speak</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy AURA response"
              onPress={() => onCopy(message.content)}
              style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'link' }} size={13} tintColor={colors.muted} />
              <Text style={[styles.copyText, { color: colors.muted }]}>Copy</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseTable(lines: string[]) {
  const rows = lines.map((line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  return { headers: rows[0] || [], rows: rows.slice(2) };
}

function renderInlineMarkdown(text: string, colors: AuraColors) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <Text key={index} style={{ fontWeight: '800' }}>{part.slice(2, -2)}</Text>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <Text key={index} style={{ fontStyle: 'italic' }}>{part.slice(1, -1)}</Text>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <Text key={index} style={[styles.codeText, { color: colors.text }]}>{part.slice(1, -1)}</Text>;
    }
    return <Text key={index}>{part}</Text>;
  });
}

function MarkdownMessage({
  content,
  colors,
  onCopy,
}: {
  content: string;
  colors: AuraColors;
  onCopy: (content: string) => void;
}) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim() || 'code';
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push(
        <View key={`code-${index}`} style={[styles.codeBlock, { backgroundColor: colors.accentSoft, borderColor: colors.border }]}>
          <View style={styles.codeHeader}>
            <Text style={[styles.codeLanguage, { color: colors.muted }]}>{language}</Text>
            <Pressable onPress={() => onCopy(codeLines.join('\n'))} style={styles.codeCopyButton}>
              <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={13} tintColor={colors.muted} />
              <Text style={[styles.copyText, { color: colors.muted }]}>Copy code</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.codeText, { color: colors.text }]}>{codeLines.join('\n')}</Text>
          </ScrollView>
        </View>,
      );
      index += 1;
      continue;
    }

    if (line.trim() && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const table = parseTable(tableLines);
      blocks.push(
        <ScrollView key={`table-${index}`} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
          <View style={[styles.table, { borderColor: colors.border }]}>
            <View style={[styles.tableRow, { backgroundColor: colors.accentSoft }]}>
              {table.headers.map((cell, cellIndex) => <Text key={cellIndex} style={[styles.tableCell, styles.tableHeader, { color: colors.text, borderColor: colors.border }]}>{renderInlineMarkdown(cell, colors)}</Text>)}
            </View>
            {table.rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.tableRow}>
                {row.map((cell, cellIndex) => <Text key={cellIndex} style={[styles.tableCell, { color: colors.text, borderColor: colors.border }]}>{renderInlineMarkdown(cell, colors)}</Text>)}
              </View>
            ))}
          </View>
        </ScrollView>,
      );
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^\s*={3,}\s*$/.test(line)) {
      index += 1;
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    const numbered = line.match(/^\s*(\d+)\.\s+(.+)$/);
    blocks.push(
      <Text
        key={`line-${index}`}
        style={[
          styles.assistantMessageText,
          heading ? styles.markdownHeading : undefined,
          bullet || numbered ? styles.markdownListItem : undefined,
          { color: colors.text },
        ]}>
        {renderInlineMarkdown(
          heading?.[2] || (bullet ? `• ${bullet[1]}` : numbered ? `${numbered[1]}. ${numbered[2]}` : line),
          colors,
        )}
      </Text>,
    );
    index += 1;
  }

  return <View style={styles.markdownContent}>{blocks}</View>;
}

export function TypingIndicator({ colors }: { colors: AuraColors }) {
  const statuses = ['AURA is thinking…', 'Analyzing text…', 'Preparing a helpful reply…'];
  const [statusIndex, setStatusIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStatusIndex((current) => (current + 1) % statuses.length), 900);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.messageRow, styles.assistantRow]}>
      <AuraMark size={28} />
      <View style={styles.messageColumn}>
        <View style={styles.assistantHeader}>
          <Text style={[styles.assistantName, { color: colors.text }]}>AURA</Text>
          <View style={[styles.assistantStatusDot, { backgroundColor: colors.accent }]} />
          <Text style={[styles.assistantMeta, { color: colors.muted }]}>AI Assistant</Text>
        </View>
        <View style={styles.thinkingRow}>
          <Text style={[styles.thinkingText, { color: colors.muted }]}>{statuses[statusIndex]}</Text>
          <View style={[styles.typingDot, { backgroundColor: colors.accent }]} />
          <View style={[styles.typingDot, { backgroundColor: colors.accent, opacity: 0.65 }]} />
          <View style={[styles.typingDot, { backgroundColor: colors.accent, opacity: 0.35 }]} />
        </View>
      </View>
    </View>
  );
}
