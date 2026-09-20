import { appSchema, tableSchema } from '@nozbe/watermelondb';
import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Database } from '@nozbe/watermelondb';

import { Conversation, Message } from './models';

const schema = appSchema({
  version: 2,
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
        { name: 'attachment_name', type: 'string', isOptional: true },
        { name: 'attachment_type', type: 'string', isOptional: true },
        { name: 'attachment_mime_type', type: 'string', isOptional: true },
        { name: 'attachment_uri', type: 'string', isOptional: true },
        { name: 'attachment_context', type: 'string', isOptional: true },
        { name: 'position', type: 'number' },
      ],
    }),
  ],
});

const adapter = new SQLiteAdapter({
  schema,
  migrations: schemaMigrations({
    migrations: [
      {
        toVersion: 2,
        steps: [
          addColumns({
            table: 'messages',
            columns: [
              { name: 'attachment_name', type: 'string', isOptional: true },
              { name: 'attachment_type', type: 'string', isOptional: true },
              { name: 'attachment_mime_type', type: 'string', isOptional: true },
              { name: 'attachment_uri', type: 'string', isOptional: true },
              { name: 'attachment_context', type: 'string', isOptional: true },
            ],
          }),
        ],
      },
    ],
  }),
  dbName: 'aura',
  onSetUpError: (error) => {
    console.error('AURA local database failed to initialize.', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Conversation, Message],
});
