export type ApiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentMimeType?: string;
  attachmentUri?: string;
  attachmentContext?: string;
};

export type ApiConversation = {
  id: string;
  title: string;
  preview: string;
  messages: ApiMessage[];
  updatedAt: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('The optional backend is not configured. AURA local mode does not use localhost.');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Backend request failed (${response.status}).`);
  return payload as T;
}

export function fetchConversations() {
  return request<ApiConversation[]>('/api/conversations');
}

export function requestAssistantResponse(message: string, history: ApiMessage[]) {
  return request<{ content: string }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
}

export function saveConversation(messages: ApiMessage[]) {
  return request<ApiConversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ messages }),
  });
}
