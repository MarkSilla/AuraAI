import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export class Conversation extends Model {
  static table = 'conversations';

  @field('title') title: string;
  @field('preview') preview: string;
  @field('updated_at') updatedAt: number;
}

export class Message extends Model {
  static table = 'messages';

  @field('conversation_id') conversationId: string;
  @field('role') role: 'user' | 'assistant';
  @field('content') content: string;
  @field('attachment_name') attachmentName?: string;
  @field('attachment_type') attachmentType?: string;
  @field('attachment_mime_type') attachmentMimeType?: string;
  @field('attachment_uri') attachmentUri?: string;
  @field('attachment_context') attachmentContext?: string;
  @field('position') position: number;
}
