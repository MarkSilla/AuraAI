import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import type * as Ort from 'onnxruntime-react-native';
import { phonemizeKokoroText } from './kokoro-phonemizer';
import { downloadTrackedFile } from './model-downloads';

/**
 * Kokoro's ONNX graph is not a text model. It consumes phoneme IDs, a voice
 * style vector and a speed scalar. The model and voice files are public
 * Apache-2.0 artifacts; phonemisation is deliberately not guessed here.
 */
export const KOKORO_VOICES = [
  { id: 'af_heart', name: 'Heart', description: 'American female' },
  { id: 'af_bella', name: 'Bella', description: 'American female' },
  { id: 'af_sarah', name: 'Sarah', description: 'American female' },
  { id: 'am_adam', name: 'Adam', description: 'American male' },
  { id: 'am_michael', name: 'Michael', description: 'American male' },
  { id: 'bf_emma', name: 'Emma', description: 'British female' },
  { id: 'bf_isabella', name: 'Isabella', description: 'British female' },
  { id: 'bm_george', name: 'George', description: 'British male' },
] as const;
export type KokoroVoiceId = typeof KOKORO_VOICES[number]['id'];
export const DEFAULT_KOKORO_VOICE: KokoroVoiceId = 'af_heart';

export const KOKORO_ARTIFACTS = {
  model: {
    name: 'model_quantized.onnx',
    url: 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model_quantized.onnx',
  },
} as const;

const directory = new Directory(Paths.document, 'kokoro');
let session: Ort.InferenceSession | null = null;
let loadedModelUri: string | null = null;
let player: AudioPlayer | null = null;

function loadOnnxRuntime(): typeof Ort {
  try {
    // ONNX Runtime is a native module and is unavailable in Expo Go.
    // Load it only when speech generation is requested so the chat can still open.
    const runtime = require('onnxruntime-react-native') as typeof Ort;
    if (!runtime.InferenceSession || !runtime.Tensor) {
      throw new Error('The ONNX Runtime native module is missing from this Android build. Rebuild the development or release APK after installing the native module.');
    }
    return runtime;
  } catch (error) {
    if (error instanceof Error && error.message.includes('ONNX Runtime native module is missing')) {
      throw error;
    }
    throw new Error(
      error instanceof Error
        ? `Offline Kokoro could not load ONNX Runtime: ${error.message}`
        : 'Offline Kokoro speech needs an Android/iOS build with ONNX Runtime included. Expo Go cannot load it.',
    );
  }
}

export type KokoroDownloadProgress = {
  artifact: 'model' | 'voice';
  bytesWritten: number;
  totalBytes: number;
  progress: number;
};

function voiceArtifact(voice: KokoroVoiceId) {
  return { name: `${voice}.bin`, url: `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${voice}.bin` };
}

function artifactFile(kind: 'model' | 'voice', voice = DEFAULT_KOKORO_VOICE) {
  return new File(directory, kind === 'model' ? KOKORO_ARTIFACTS.model.name : voiceArtifact(voice).name);
}

async function downloadArtifact(
  kind: 'model' | 'voice',
  onProgress?: (progress: KokoroDownloadProgress) => void,
  voice = DEFAULT_KOKORO_VOICE,
) {
  directory.create({ idempotent: true, intermediates: true });
  const destination = artifactFile(kind, voice);
  if (destination.exists) return destination;

  const artifact = kind === 'model' ? KOKORO_ARTIFACTS.model : voiceArtifact(voice);
  return downloadTrackedFile(artifact.url, destination, (bytesWritten, totalBytes) => {
    onProgress?.({ artifact: kind, bytesWritten, totalBytes, progress: totalBytes ? bytesWritten / totalBytes : 0 });
  });
}

export async function downloadKokoroArtifacts(
  onProgress?: (progress: KokoroDownloadProgress) => void,
  voice = DEFAULT_KOKORO_VOICE,
) {
  const model = await downloadArtifact('model', onProgress);
  const voiceFile = await downloadArtifact('voice', onProgress, voice);
  return { model, voice: voiceFile };
}

export function areKokoroArtifactsDownloaded(voice = DEFAULT_KOKORO_VOICE) {
  return artifactFile('model').exists && artifactFile('voice', voice).exists;
}

function voiceStyle(bytes: Uint8Array, tokenCount: number) {
  const floats = new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
  const offset = tokenCount * 256;
  if (offset + 256 > floats.length) {
    throw new Error('The downloaded Kokoro voice file is incomplete or incompatible.');
  }
  return Float32Array.from(floats.slice(offset, offset + 256));
}

function wavFile(samples: Float32Array | number[]) {
  const pcm = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(samples[index])));
    pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const bytes = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 24000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  return bytes;
}

/**
 * Runs the native ONNX graph for already-phonemised Kokoro input.
 * `phonemeIds` must be produced by a compatible Kokoro/Misaki tokenizer.
 */
export async function synthesizeKokoroPhonemes(
  phonemeIds: number[],
  speed = 1,
  voice = DEFAULT_KOKORO_VOICE,
) {
  const audio = await synthesizeKokoroAudio(phonemeIds, speed, voice);
  directory.create({ idempotent: true, intermediates: true });
  const result = new File(directory, `speech-${Date.now()}.wav`);
  result.write(wavFile(audio));
  return result;
}

async function synthesizeKokoroAudio(
  phonemeIds: number[],
  speed = 1,
  voice = DEFAULT_KOKORO_VOICE,
) {
  if (phonemeIds.length === 0 || phonemeIds.length > 510) {
    throw new Error('Kokoro phoneme input must contain between 1 and 510 IDs.');
  }
  const { model, voice: voiceFile } = await downloadKokoroArtifacts(undefined, voice);
  const ort = loadOnnxRuntime();
  if (!session || loadedModelUri !== model.uri) {
    session = await ort.InferenceSession.create(model.uri);
    loadedModelUri = model.uri;
  }
  const ids = new BigInt64Array([0n, ...phonemeIds.map((id) => BigInt(id)), 0n]);
  const inputIds = new ort.Tensor('int64', ids, [1, ids.length]);
  const style = new ort.Tensor('float32', voiceStyle(await voiceFile.bytes(), phonemeIds.length), [1, 256]);
  const speedTensor = new ort.Tensor('float32', new Float32Array([speed]), [1]);
  const output = await session.run({ input_ids: inputIds, style, speed: speedTensor });
  const audio = output.audio ?? Object.values(output)[0];
  if (!audio?.data) throw new Error('Kokoro returned no audio output.');
  return Float32Array.from(audio.data as Float32Array);
}

export async function synthesizeKokoroText(text: string, voice = DEFAULT_KOKORO_VOICE) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) {
    throw new Error('Kokoro could not find pronounceable text in this response.');
  }
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    try {
      phonemizeKokoroText(candidate);
      current = candidate;
    } catch (error) {
      if (!current) throw error;
      chunks.push(current);
      current = word;
      phonemizeKokoroText(current);
    }
  }
  if (current) chunks.push(current);

  const audioChunks: Float32Array[] = [];
  for (const chunk of chunks) {
    audioChunks.push(await synthesizeKokoroAudio(phonemizeKokoroText(chunk), 1, voice));
  }

  const totalSamples = audioChunks.reduce((total, chunk) => total + chunk.length, 0);
  const samples = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of audioChunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  directory.create({ idempotent: true, intermediates: true });
  const wav = new File(directory, `speech-${Date.now()}.wav`);
  wav.write(wavFile(samples));
  playKokoroWav(wav);
  return wav;
}

export function playKokoroWav(file: File) {
  player?.pause();
  player?.release();
  player = createAudioPlayer(file.uri);
  player.play();
  return player;
}
