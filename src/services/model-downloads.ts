import { Directory, File, Paths } from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';

export type ModelDownloadProgress = {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  bytesWritten: number;
  totalBytes: number;
  uri?: string;
  error?: string;
};

const modelsDirectory = new Directory(Paths.document, 'models');
const pendingDownloadsFile = new File(Paths.document, 'aura-pending-downloads.json');
const nativeDownloader = NativeModules.AuraBackgroundModelDownload as {
  start: (url: string, fileName: string) => Promise<{ id: number }>;
  status: (id: number) => Promise<{ status: number; bytesWritten: number; totalBytes: number; reason: number }>;
  complete: (id: number, fileName: string) => Promise<string>;
  cancel: (id: number) => Promise<void>;
  list: () => Promise<Array<{ id: number; fileName: string; url: string; status: number; bytesWritten: number; totalBytes: number; reason: number }>>;
  reconcile: () => Promise<{ completed: number; canceled: Array<{ fileName: string; url: string }> }>;
} | undefined;

export type BackgroundDownload = {
  id: number;
  fileName: string;
  url: string;
  status: number;
  bytesWritten: number;
  totalBytes: number;
  reason: number;
};

export type TrackedDownload = {
  key: string;
  fileName: string;
  url: string;
  status: 'queued' | 'downloading';
  bytesWritten: number;
  totalBytes: number;
  cancel: () => void;
};

const trackedDownloads = new Map<string, TrackedDownload>();
const downloadListeners = new Set<(downloads: TrackedDownload[]) => void>();
const queuedDownloads: Array<{
  key: string;
  url: string;
  fallbackName: string;
  onProgress: (progress: ModelDownloadProgress) => void;
  onCancel?: (cancel: () => void) => void;
  resolve: (file: File) => void;
  reject: (error: Error) => void;
}> = [];
let processingQueue = false;

export type PendingDownload = { url: string; fallbackName: string; fileName: string };

function readPendingDownloads(): PendingDownload[] {
  if (!pendingDownloadsFile.exists) return [];
  try {
    const value: unknown = JSON.parse(pendingDownloadsFile.textSync());
    return Array.isArray(value) ? value.filter((item): item is PendingDownload => (
      typeof item?.url === 'string' &&
      typeof item?.fallbackName === 'string' &&
      typeof item?.fileName === 'string'
    )) : [];
  } catch {
    return [];
  }
}

function writePendingDownloads(downloads: PendingDownload[]) {
  if (downloads.length === 0) {
    if (pendingDownloadsFile.exists) pendingDownloadsFile.delete();
    return;
  }
  if (!pendingDownloadsFile.exists) pendingDownloadsFile.create({ intermediates: true });
  pendingDownloadsFile.write(JSON.stringify(downloads));
}

function rememberPendingDownload(url: string, fallbackName: string) {
  const fileName = modelFileName(url, fallbackName);
  const downloads = readPendingDownloads().filter((item) => item.fileName !== fileName);
  downloads.push({ url, fallbackName, fileName });
  writePendingDownloads(downloads);
}

function forgetPendingDownload(fileName: string) {
  writePendingDownloads(readPendingDownloads().filter((item) => item.fileName !== fileName));
}

function isTransientDownloadError(message: string) {
  return /socket|connection|network|timeout|abort|canceled|cancelled/i.test(message);
}

async function downloadWithResume(
  url: string,
  destination: File,
  signal: AbortSignal,
  onProgress: (bytesWritten: number, totalBytes: number) => void,
) {
  let existingBytes = destination.exists ? destination.size : 0;
  let response = await fetch(url, {
    headers: existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : undefined,
    signal,
  });

  if (!response.ok && response.status !== 416) {
    throw new Error(`Download failed (${response.status}).`);
  }
  if (existingBytes > 0 && response.status !== 206) {
    existingBytes = 0;
    response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Download failed (${response.status}).`);
  }
  if (!response.body) throw new Error('The download response did not provide a readable stream.');

  const contentLength = Number(response.headers.get('content-length') || 0);
  const totalBytes = response.status === 206 ? existingBytes + contentLength : contentLength;
  let bytesWritten = existingBytes;
  let firstChunk = existingBytes === 0;
  const reader = response.body.getReader();

  onProgress(bytesWritten, totalBytes);
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (chunk.value.byteLength === 0) continue;
    destination.write(chunk.value, { append: !firstChunk });
    firstChunk = false;
    bytesWritten += chunk.value.byteLength;
    onProgress(bytesWritten, totalBytes);
  }
  return { bytesWritten, totalBytes };
}

export function listPendingDownloads(): PendingDownload[] {
  return readPendingDownloads().filter((item) => new File(modelsDirectory, `${item.fileName}.part`).exists);
}

function notifyTrackedDownloads() {
  const downloads = [...trackedDownloads.values()];
  downloadListeners.forEach((listener) => listener(downloads));
}

export function subscribeTrackedDownloads(listener: (downloads: TrackedDownload[]) => void) {
  downloadListeners.add(listener);
  listener([...trackedDownloads.values()]);
  return () => downloadListeners.delete(listener);
}

export function cancelTrackedDownload(key: string) {
  const active = trackedDownloads.get(key);
  if (active?.status === 'downloading') {
    active.cancel();
    return;
  }
  const index = queuedDownloads.findIndex((item) => item.key === key);
  if (index >= 0) {
    const [queued] = queuedDownloads.splice(index, 1);
    trackedDownloads.delete(key);
    notifyTrackedDownloads();
    queued.reject(new Error('The model download was canceled.'));
  }
}

export async function listBackgroundDownloads() {
  if (Platform.OS !== 'android' || !nativeDownloader) return [] as BackgroundDownload[];
  return nativeDownloader.list();
}

export async function cancelBackgroundDownload(id: number) {
  if (Platform.OS === 'android' && nativeDownloader) await nativeDownloader.cancel(id);
}

export async function reconcileBackgroundDownloads() {
  if (Platform.OS === 'android' && nativeDownloader) {
    return nativeDownloader.reconcile();
  }
  return { completed: 0, canceled: [] as Array<{ fileName: string; url: string }> };
}

export function modelFileName(url: string, fallbackName: string) {
  const lastSegment = url.split('?')[0].split('/').pop();
  return lastSegment?.toLowerCase().endsWith('.gguf') ? lastSegment : `${fallbackName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gguf`;
}

export function getModelFile(url: string, fallbackName: string) {
  return new File(modelsDirectory, modelFileName(url, fallbackName));
}

export function isModelDownloaded(url: string, fallbackName: string) {
  return getModelFile(url, fallbackName).exists;
}

export function listDownloadedModels() {
  if (!modelsDirectory.exists) return [];
  return modelsDirectory.list().filter((item): item is File => item instanceof File && item.name.toLowerCase().endsWith('.gguf'));
}

async function performDownload(
  url: string,
  fallbackName: string,
  onProgress: (progress: ModelDownloadProgress) => void,
  onCancel?: (cancel: () => void) => void,
) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Use a valid http:// or https:// GGUF URL.');
  if (!url.toLowerCase().includes('.gguf')) throw new Error('The download URL must point to a .gguf file.');

  modelsDirectory.create({ idempotent: true, intermediates: true });
  const destination = getModelFile(url, fallbackName);
  const temporaryDestination = new File(modelsDirectory, `${destination.name}.part`);
  const key = destination.name;
  rememberPendingDownload(url, fallbackName);
  const report = (progress: ModelDownloadProgress) => {
    onProgress(progress);
    if (progress.status === 'downloading') {
      const existing = trackedDownloads.get(key);
      if (existing) {
        trackedDownloads.set(key, { ...existing, bytesWritten: progress.bytesWritten, totalBytes: progress.totalBytes });
        notifyTrackedDownloads();
      }
    }
  };
  if (destination.exists) {
    forgetPendingDownload(destination.name);
    report({ status: 'completed', progress: 1, bytesWritten: destination.size, totalBytes: destination.size, uri: destination.uri });
    forgetPendingDownload(destination.name);
    return destination;
  }

  if (Platform.OS === 'android' && nativeDownloader && !temporaryDestination.exists) {
    const fileName = modelFileName(url, fallbackName);
    let download: { id: number } | null = null;
    try {
      download = await nativeDownloader.start(url, fileName);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!/unsupported path|destination/i.test(message)) {
        forgetPendingDownload(destination.name);
        throw error;
      }
      // Older release binaries may point DownloadManager at the app-private
      // directory, which Android does not allow as a direct download target.
      // Continue with expo-file-system, which writes into that directory itself.
      download = null;
    }
    if (download) {
      let canceled = false;
      const cancel = () => {
        canceled = true;
        void nativeDownloader.cancel(download.id);
      };
      onCancel?.(cancel);
      trackedDownloads.set(key, { key, fileName, url, status: 'downloading', bytesWritten: 0, totalBytes: 0, cancel });
      notifyTrackedDownloads();
      report({ status: 'downloading', progress: 0, bytesWritten: 0, totalBytes: 0 });
      try {
        while (!canceled) {
          const status = await nativeDownloader.status(download.id);
          if (status.status === 8) {
            const uri = await nativeDownloader.complete(download.id, fileName);
            const downloadedFile = new File(uri);
            if (downloadedFile.uri !== destination.uri) {
              if (destination.exists) destination.delete();
              downloadedFile.copy(destination);
            }
            report({ status: 'completed', progress: 1, bytesWritten: destination.size, totalBytes: destination.size, uri: destination.uri });
            return destination;
          }
          if (status.status === 16) {
            forgetPendingDownload(destination.name);
            throw new Error(`The Android download failed (${status.reason ?? 'unknown error'}).`);
          }
          report({
            status: 'downloading',
            progress: status.totalBytes > 0 ? status.bytesWritten / status.totalBytes : 0,
            bytesWritten: status.bytesWritten,
            totalBytes: status.totalBytes,
          });
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error('The model download was canceled.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The model download failed.';
        if (!isTransientDownloadError(message)) forgetPendingDownload(destination.name);
        report({ status: 'error', progress: 0, bytesWritten: 0, totalBytes: 0, error: message });
        throw new Error(message);
      } finally {
        onCancel?.(() => undefined);
      }
    }
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  onCancel?.(cancel);
  trackedDownloads.set(key, { key, fileName: destination.name, url, status: 'downloading', bytesWritten: 0, totalBytes: 0, cancel });
  notifyTrackedDownloads();
  report({ status: 'downloading', progress: 0, bytesWritten: temporaryDestination.size, totalBytes: 0 });

  try {
    const progress = await downloadWithResume(
      url,
      temporaryDestination,
      controller.signal,
      (bytesWritten, totalBytes) => {
        report({
          status: 'downloading',
          progress: totalBytes > 0 ? bytesWritten / totalBytes : 0,
          bytesWritten,
          totalBytes,
        });
      },
    );
    temporaryDestination.move(destination);
    report({
      status: 'completed',
      progress: 1,
      bytesWritten: progress.bytesWritten,
      totalBytes: progress.totalBytes || progress.bytesWritten,
      uri: destination.uri,
    });
    forgetPendingDownload(destination.name);
    return destination;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The model download failed.';
    report({ status: 'error', progress: 0, bytesWritten: 0, totalBytes: 0, error: message });
    throw new Error(message);
  } finally {
    onCancel?.(() => undefined);
  }
}

export function downloadModel(
  url: string,
  fallbackName: string,
  onProgress: (progress: ModelDownloadProgress) => void,
  onCancel?: (cancel: () => void) => void,
) {
  const key = modelFileName(url, fallbackName);
  if (trackedDownloads.has(key) || queuedDownloads.some((item) => item.key === key)) {
    return Promise.reject(new Error('This model is already downloading.'));
  }
  return new Promise<File>((resolve, reject) => {
    const queuedCancel = () => cancelTrackedDownload(key);
    queuedDownloads.push({ key, url, fallbackName, onProgress, onCancel, resolve, reject });
    trackedDownloads.set(key, {
      key,
      fileName: key,
      url,
      status: 'queued',
      bytesWritten: 0,
      totalBytes: 0,
      cancel: queuedCancel,
    });
    notifyTrackedDownloads();
    onCancel?.(queuedCancel);
    void processDownloadQueue();
  });
}

export function downloadTrackedFile(
  url: string,
  destination: File,
  onProgress?: (bytesWritten: number, totalBytes: number) => void,
) {
  const key = `asset:${destination.name}`;
  if (trackedDownloads.has(key)) return Promise.reject(new Error('This file is already downloading.'));
  return new Promise<File>((resolve, reject) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    trackedDownloads.set(key, { key, fileName: destination.name, url, status: 'downloading', bytesWritten: 0, totalBytes: 0, cancel });
    notifyTrackedDownloads();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}).`);
        const totalBytes = Number(response.headers.get('content-length') || 0);
        const reader = response.body.getReader();
        let bytesWritten = 0;
        let firstChunk = true;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (chunk.value.byteLength === 0) continue;
          destination.write(chunk.value, { append: !firstChunk });
          firstChunk = false;
          bytesWritten += chunk.value.byteLength;
          const current = trackedDownloads.get(key);
          if (current) trackedDownloads.set(key, { ...current, bytesWritten, totalBytes });
          notifyTrackedDownloads();
          onProgress?.(bytesWritten, totalBytes);
        }
        resolve(destination);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('The file download failed.'));
      } finally {
        trackedDownloads.delete(key);
        notifyTrackedDownloads();
      }
    })();
  });
}

async function processDownloadQueue() {
  if (processingQueue) return;
  processingQueue = true;
  try {
    while (queuedDownloads.length > 0) {
      const item = queuedDownloads.shift();
      if (!item) continue;
      const current = trackedDownloads.get(item.key);
      if (current?.status === 'queued') {
        trackedDownloads.delete(item.key);
        notifyTrackedDownloads();
      }
      try {
        const file = await performDownload(item.url, item.fallbackName, item.onProgress, item.onCancel);
        item.resolve(file);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error('The model download failed.'));
      } finally {
        trackedDownloads.delete(item.key);
        notifyTrackedDownloads();
      }
    }
  } finally {
    processingQueue = false;
  }
}

export function deleteDownloadedModel(url: string, fallbackName: string) {
  const file = getModelFile(url, fallbackName);
  if (file.exists) file.delete();
  const partial = new File(modelsDirectory, `${file.name}.part`);
  if (partial.exists) partial.delete();
}

export function deleteDownloadedModelFile(file: File) {
  if (file.exists) file.delete();
  const partial = new File(modelsDirectory, `${file.name}.part`);
  if (partial.exists) partial.delete();
}
