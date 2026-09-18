import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { styles } from './styles';
import type { AuraColors, Message } from './theme';

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
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
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
}: {
  message: Message;
  colors: AuraColors;
  onCopy: (content: string) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
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
          <View style={[styles.bubble, { backgroundColor: colors.userBubble, shadowColor: colors.shadow }, styles.userBubble]}>
            <Text style={[styles.messageText, { color: colors.userBubbleText }]}>{message.content}</Text>
          </View>
        ) : (
          <Text style={[styles.assistantMessageText, { color: colors.text }]}>{message.content}</Text>
        )}
        {!isUser && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy AURA response"
            onPress={() => onCopy(message.content)}
            style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
            <SymbolView name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'link' }} size={13} tintColor={colors.muted} />
            <Text style={[styles.copyText, { color: colors.muted }]}>Copy</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
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
