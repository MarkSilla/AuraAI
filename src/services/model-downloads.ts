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
  status: 'downloading';
  bytesWritten: number;
  totalBytes: number;
  cancel: () => void;
};

const trackedDownloads = new Map<string, TrackedDownload>();
const downloadListeners = new Set<(downloads: TrackedDownload[]) => void>();

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
  trackedDownloads.get(key)?.cancel();
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

export async function downloadModel(
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
  const report = (progress: ModelDownloadProgress) => {
    onProgress(progress);
    if (progress.status === 'downloading') {
      const existing = trackedDownloads.get(key);
      if (existing) {
        trackedDownloads.set(key, { ...existing, bytesWritten: progress.bytesWritten, totalBytes: progress.totalBytes });
        notifyTrackedDownloads();
      }
    } else {
      trackedDownloads.delete(key);
      notifyTrackedDownloads();
    }
  };
  if (destination.exists) {
    report({ status: 'completed', progress: 1, bytesWritten: destination.size, totalBytes: destination.size, uri: destination.uri });
    return destination;
  }

  if (Platform.OS === 'android' && nativeDownloader) {
    const fileName = modelFileName(url, fallbackName);
    const download = await nativeDownloader.start(url, fileName);
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
          const file = new File(uri);
          report({ status: 'completed', progress: 1, bytesWritten: file.size, totalBytes: file.size, uri: file.uri });
          return file;
        }
        if (status.status === 16) throw new Error(`The Android download failed (${status.reason ?? 'unknown error'}).`);
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
      report({ status: 'error', progress: 0, bytesWritten: 0, totalBytes: 0, error: message });
      throw new Error(message);
    } finally {
      onCancel?.(() => undefined);
    }
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  onCancel?.(cancel);
  trackedDownloads.set(key, { key, fileName: destination.name, url, status: 'downloading', bytesWritten: 0, totalBytes: 0, cancel });
  notifyTrackedDownloads();
  report({ status: 'downloading', progress: 0, bytesWritten: 0, totalBytes: 0 });

  try {
    const file = await File.downloadFileAsync(url, temporaryDestination, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        report({
          status: 'downloading',
          progress: totalBytes > 0 ? bytesWritten / totalBytes : 0,
          bytesWritten,
          totalBytes,
        });
      },
    });
    temporaryDestination.move(destination);
    report({ status: 'completed', progress: 1, bytesWritten: destination.size, totalBytes: destination.size, uri: destination.uri });
    return destination;
  } catch (error) {
    if (temporaryDestination.exists) temporaryDestination.delete();
    const message = error instanceof Error ? error.message : 'The model download failed.';
    report({ status: 'error', progress: 0, bytesWritten: 0, totalBytes: 0, error: message });
    throw new Error(message);
  } finally {
    onCancel?.(() => undefined);
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
