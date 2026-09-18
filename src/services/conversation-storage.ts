import { NativeModules } from 'react-native';

import type { Conversation, Message } from '@/database/models';
import type { ApiConversation, ApiMessage } from './aura-api';

let fallbackConversations: ApiConversation[] = [];

function hasWatermelonNativeBridge() {
  return Boolean(NativeModules.WMDatabaseBridge);
}

export async function loadLocalConversations(): Promise<ApiConversation[]> {
  if (!hasWatermelonNativeBridge()) return fallbackConversations;

  const { Q } = require('@nozbe/watermelondb');
  const { database } = require('@/database') as typeof import('@/database');
  const conversationsCollection = database.get<Conversation>('conversations');
  const messagesCollection = database.get<Message>('messages');
  const conversations = await conversationsCollection.query(Q.sortBy('updated_at', Q.desc)).fetch();
  const result: ApiConversation[] = [];

  for (const conversation of conversations) {
    const messages = await messagesCollection
      .query(Q.where('conversation_id', conversation.id), Q.sortBy('position', Q.asc))
      .fetch();

    result.push({
      id: conversation.id,
      title: conversation.title,
      preview: conversation.preview,
      updatedAt: new Date(conversation.updatedAt).toISOString(),
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
      })),
    });
  }

  return result;
}

export async function saveLocalConversation(messages: ApiMessage[]): Promise<ApiConversation> {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  const now = Date.now();
  const fallbackConversation: ApiConversation = {
    id: `conversation_${now}`,
    title: (firstUserMessage?.content || 'New conversation').slice(0, 28),
    preview: messages[messages.length - 1].content.slice(0, 42),
    updatedAt: new Date(now).toISOString(),
    messages,
  };

  if (!hasWatermelonNativeBridge()) {
    fallbackConversations = [
      fallbackConversation,
      ...fallbackConversations.filter((conversation) => conversation.id !== fallbackConversation.id),
    ];
    return fallbackConversation;
  }

  const { database } = require('@/database') as typeof import('@/database');
  const conversationsCollection = database.get<Conversation>('conversations');
  const messagesCollection = database.get<Message>('messages');
  const conversation = await database.write(async () => {
    const savedConversation = await conversationsCollection.create((record) => {
      record._raw.id = `conversation_${now}`;
      record.title = (firstUserMessage?.content || 'New conversation').slice(0, 28);
      record.preview = messages[messages.length - 1].content.slice(0, 42);
      record.updatedAt = now;
    });

    await Promise.all(
      messages.map((message, position) =>
        messagesCollection.create((record) => {
          record._raw.id = message.id;
          record.conversationId = savedConversation.id;
          record.role = message.role;
          record.content = message.content;
          record.position = position;
        }),
      ),
    );

    return savedConversation;
  });

  return {
    id: conversation.id,
    title: conversation.title,
    preview: conversation.preview,
    updatedAt: new Date(conversation.updatedAt).toISOString(),
    messages,
  };
}
