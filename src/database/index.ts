import { appSchema, tableSchema } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Database } from '@nozbe/watermelondb';

import { Conversation, Message } from './models';

const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'conversations',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'preview', type: 'string' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'conversation_id', type: 'string', isIndexed: true },
        { name: 'role', type: 'string' },
        { name: 'content', type: 'string' },
        { name: 'position', type: 'number' },
      ],
    }),
  ],
});

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'aura',
  onSetUpError: (error) => {
    console.error('AURA local database failed to initialize.', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Conversation, Message],
});
