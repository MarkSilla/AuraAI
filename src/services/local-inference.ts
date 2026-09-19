import type { Message } from '@/components/aura-chat/theme';
import { Platform } from 'react-native';

type LlamaContext = {
  completion: (
    params: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      n_predict: number;
      temperature: number;
      stop?: string[];
    },
    onToken: (data: { token: string }) => void,
  ) => Promise<{ text: string; timings?: { predicted_n?: number } }>;
  stopCompletion?: () => Promise<void>;
  release?: () => Promise<void> | void;
};

type LlamaModule = {
  initLlama: (options: {
    model: string;
    use_mlock: boolean;
    n_ctx: number;
    n_gpu_layers: number;
  }) => Promise<LlamaContext>;
};

export type ThinkingLevel = 'low' | 'medium' | 'high';
type GenerationStatus = 'compacting' | 'generating';

const thinkingSettings: Record<ThinkingLevel, { temperature: number; instruction: string }> = {
  low: { temperature: 0.8, instruction: 'Keep reasoning focused and answer directly.' },
  medium: { temperature: 0.7, instruction: 'Use balanced reasoning and a clear answer.' },
  high: { temperature: 0.55, instruction: 'Think through the problem carefully and provide a thorough, accurate answer.' },
};

let loadedModelUri: string | null = null;
let loadedContextSize: number | null = null;
let context: LlamaContext | null = null;
let generationId = 0;

export class GenerationStoppedError extends Error {
  constructor() {
    super('Generation stopped by user.');
    this.name = 'GenerationStoppedError';
  }
}

const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|eot|>', '<|end_of_turn|>'];
const OUTPUT_TOKENS = 2048;
const MAX_CONTINUATIONS = 2;
const MAX_HISTORY_MESSAGES = 12;
const RECENT_HISTORY_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 2400;

function getContextSize(history: Message[]) {
  const characters = history.reduce((total, message) => total + message.content.length, 0);
  if (characters <= 6000) return 1536;
  if (characters <= 14000) return 2048;
  return 3072;
}

function buildModelHistory(history: Message[], onStatus?: (status: GenerationStatus) => void) {
  if (history.length <= MAX_HISTORY_MESSAGES) {
    return history.map(({ role, content }) => ({ role, content: content.slice(-MAX_MESSAGE_CHARS) }));
  }

  onStatus?.('compacting');
  const olderMessages = history.slice(0, -RECENT_HISTORY_MESSAGES);
  const summary = olderMessages
    .map(({ role, content }) => `${role === 'user' ? 'User' : 'AURA'}: ${content.replace(/\s+/g, ' ').trim().slice(0, 280)}`)
    .join(' | ')
    .slice(0, 2400);
  const recentMessages = history.slice(-RECENT_HISTORY_MESSAGES).map(({ role, content }) => ({
    role,
    content: content.slice(-MAX_MESSAGE_CHARS),
  }));
  return [
    { role: 'system' as const, content: `Compact conversation summary: ${summary}` },
    ...recentMessages,
  ];
}

export async function stopLocalResponse() {
  generationId += 1;
  await context?.stopCompletion?.();
}

export async function unloadLocalModel() {
  generationId += 1;
  const currentContext = context;
  try {
    await currentContext?.stopCompletion?.();
  } finally {
    try {
      await currentContext?.release?.();
    } finally {
      context = null;
      loadedModelUri = null;
      loadedContextSize = null;
    }
  }
}

function getLlamaModule(): LlamaModule {
  try {
    return require('llama.rn') as LlamaModule;
  } catch {
    throw new Error('Local AI requires an AURA development build. Expo Go cannot load llama.cpp.');
  }
}

export async function generateLocalResponse(
  modelUri: string,
  history: Message[],
  thinkingLevel: ThinkingLevel = 'medium',
  onToken?: (text: string) => void,
  onStatus?: (status: GenerationStatus) => void,
) {
  const requestId = ++generationId;
  const settings = thinkingSettings[thinkingLevel];
  const contextSize = getContextSize(history);
  if (loadedModelUri !== modelUri || loadedContextSize !== contextSize) {
    await context?.release?.();
    context = await getLlamaModule().initLlama({
      model: modelUri,
      use_mlock: false,
      n_ctx: contextSize,
      n_gpu_layers: Platform.OS === 'web' ? 0 : 99,
    });
    loadedModelUri = modelUri;
    loadedContextSize = contextSize;
  }

  if (!context) throw new Error('The local model could not be initialized.');
  let streamedText = '';
  let pendingUpdate = false;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  const emitStreamUpdate = () => {
    pendingUpdate = false;
    updateTimer = null;
    if (requestId === generationId) onToken?.(streamedText);
  };
  let continuation = 0;
  if (history.length > MAX_HISTORY_MESSAGES) {
    onStatus?.('compacting');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  let nextMessages = [
    { role: 'system' as const, content: `You are AURA, a helpful and concise AI assistant. ${settings.instruction} Format replies with Markdown: use headings and lists for structure, fenced code blocks with a language tag for code, and Markdown tables when comparing structured data.` },
    ...buildModelHistory(history, onStatus),
  ];
  onStatus?.('generating');
  let result: { text: string; timings?: { predicted_n?: number } } = { text: '' };
  do {
    result = await context.completion(
      {
        messages: nextMessages,
        n_predict: OUTPUT_TOKENS,
        temperature: settings.temperature,
        stop: stopWords,
      },
      ({ token }) => {
        streamedText += token;
        if (!pendingUpdate) {
          pendingUpdate = true;
          updateTimer = setTimeout(emitStreamUpdate, 50);
        }
      },
    );
    const reachedLimit = result.timings?.predicted_n === OUTPUT_TOKENS;
    if (!reachedLimit || continuation >= MAX_CONTINUATIONS) break;
    continuation += 1;
    nextMessages = [
      ...nextMessages,
      { role: 'assistant', content: streamedText.trim() },
      { role: 'user', content: 'Continue the previous answer from where it stopped. Do not repeat anything.' },
    ];
  } while (requestId === generationId);
  if (updateTimer) clearTimeout(updateTimer);
  emitStreamUpdate();
  if (requestId !== generationId) throw new GenerationStoppedError();
  const response = streamedText.trim() || result.text.trim();
  if (!response) throw new Error('AURA could not generate a response. Please try again.');
  return response;
}
