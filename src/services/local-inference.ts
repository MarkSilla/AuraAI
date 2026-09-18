import type { Message } from '@/components/aura-chat/theme';

type LlamaContext = {
  completion: (
    params: {
      messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
      n_predict: number;
      temperature: number;
    },
    onToken: (data: { token: string }) => void,
  ) => Promise<{ text: string }>;
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

let loadedModelUri: string | null = null;
let context: LlamaContext | null = null;
let generationId = 0;

export class GenerationStoppedError extends Error {
  constructor() {
    super('Generation stopped by user.');
    this.name = 'GenerationStoppedError';
  }
}

export async function stopLocalResponse() {
  generationId += 1;
  await context?.stopCompletion?.();
}

function getLlamaModule(): LlamaModule {
  try {
    return require('llama.rn') as LlamaModule;
  } catch {
    throw new Error('Local AI requires an AURA development build. Expo Go cannot load llama.cpp.');
  }
}

export async function generateLocalResponse(modelUri: string, history: Message[]) {
  const requestId = ++generationId;
  if (loadedModelUri !== modelUri) {
    await context?.release?.();
    context = await getLlamaModule().initLlama({
      model: modelUri,
      use_mlock: false,
      n_ctx: 2048,
      n_gpu_layers: 0,
    });
    loadedModelUri = modelUri;
  }

  if (!context) throw new Error('The local model could not be initialized.');
  const result = await context.completion(
    {
      messages: [
        { role: 'system', content: 'You are AURA, a helpful and concise AI assistant.' },
        ...history.map(({ role, content }) => ({ role, content })),
      ],
      n_predict: 256,
      temperature: 0.7,
    },
    () => undefined,
  );
  if (requestId !== generationId) throw new GenerationStoppedError();
  return result.text.trim();
}
