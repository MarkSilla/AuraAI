export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string;
  attachmentContext?: string;
};

export type Conversation = {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
};

export type Tool = {
  label: 'Camera' | 'Image' | 'File' | 'Web' | 'Code';
  icon: string;
};

export type AuraColors = (typeof palette)['light'];

export const SUGGESTIONS = [
  'Explain something to me',
  'Help me write code',
  'Summarize this',
  'Give me an idea',
];

export const TOOLS: Tool[] = [
  { label: 'Camera', icon: 'camera' },
  { label: 'Image', icon: 'image' },
  { label: 'File', icon: 'insert_drive_file' },
  { label: 'Web', icon: 'language' },
  { label: 'Code', icon: 'code' },
];

export const configuredModel = process.env.EXPO_PUBLIC_MODEL_NAME?.trim();

export const MODEL_CATALOG = [
  { name: 'SmolLM2-360M-Instruct-Q4', source: 'Hugging Face · GGUF', size: '~250 MB', recommended: true, url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf?download=true' },
  { name: 'Llama 3.2 3B Instruct', source: 'Meta · GGUF', size: '~2 GB', url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true' },
  { name: 'Qwen2.5 3B Instruct', source: 'Alibaba · GGUF', size: '~2 GB', url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf?download=true' },
  { name: 'Phi-3.5 Mini Instruct', source: 'Microsoft · GGUF', size: '~2.4 GB', url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true' },
  { name: 'Gemma 3 4B Instruct', source: 'Google · GGUF', size: '~3 GB', url: 'https://huggingface.co/bartowski/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf?download=true' },
] as const;

export const palette = {
  light: {
    background: '#F7F7F8',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    border: '#E5E5E5',
    borderStrong: '#D1D1D1',
    text: '#202123',
    muted: '#6B6B6B',
    accent: '#202123',
    accentDeep: '#000000',
    accentSoft: '#F0F0F0',
    gold: '#737373',
    userBubble: '#202123',
    userBubbleText: '#FFFFFF',
    assistantBubble: '#FFFFFF',
    shadow: 'rgba(0, 0, 0, 0.12)',
    backdrop: 'rgba(0, 0, 0, 0.42)',
  },
  dark: {
    background: '#000000',
    surface: '#0A0A0A',
    surfaceRaised: '#111111',
    border: '#242424',
    borderStrong: '#363636',
    text: '#ECECEC',
    muted: '#AFAFAF',
    accent: '#ECECEC',
    accentDeep: '#FFFFFF',
    accentSoft: '#1A1A1A',
    gold: '#BDBDBD',
    userBubble: '#123A63',
    userBubbleText: '#F5F5F5',
    assistantBubble: '#102A43',
    shadow: 'rgba(0, 0, 0, 0.45)',
    backdrop: 'rgba(0, 0, 0, 0.6)',
  },
};
