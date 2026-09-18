import { Directory, File, Paths } from 'expo-file-system';

export type ModelDownloadProgress = {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  bytesWritten: number;
  totalBytes: number;
  uri?: string;
  error?: string;
};

const modelsDirectory = new Directory(Paths.document, 'models');

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
  if (destination.exists) {
    onProgress({ status: 'completed', progress: 1, bytesWritten: destination.size, totalBytes: destination.size, uri: destination.uri });
    return destination;
  }

  const task = File.createDownloadTask(url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress({
        status: 'downloading',
        progress: totalBytes > 0 ? bytesWritten / totalBytes : 0,
        bytesWritten,
        totalBytes,
      });
      onCancel?.(() => task.cancel());
    },
  });

  onProgress({ status: 'downloading', progress: 0, bytesWritten: 0, totalBytes: 0 });
  try {
    const file = await task.downloadAsync();
    if (!file) throw new Error('The download did not complete.');
    onProgress({ status: 'completed', progress: 1, bytesWritten: file.size, totalBytes: file.size, uri: file.uri });
    return file;
  } catch (error) {
    if (destination.exists) destination.delete();
    const message = error instanceof Error ? error.message : 'The model download failed.';
    onProgress({ status: 'error', progress: 0, bytesWritten: 0, totalBytes: 0, error: message });
    throw new Error(message);
  } finally {
    onCancel?.(() => undefined);
    task.release();
  }
}

export function deleteDownloadedModel(url: string, fallbackName: string) {
  const file = getModelFile(url, fallbackName);
  if (file.exists) file.delete();
}
