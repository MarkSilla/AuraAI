import * as Device from 'expo-device';
import * as LegacyFileSystem from 'expo-file-system/legacy';

export type DeviceResources = {
  totalMemory?: number;
  freeStorage?: number;
  deviceName: string;
};

export type CompatibilityStatus = 'compatible' | 'slow' | 'not-recommended' | 'unsupported' | 'unknown';

export type ModelCompatibility = {
  status: CompatibilityStatus;
  label: string;
  detail: string;
};

const supportedArchitectures = ['llama', 'qwen', 'mistral', 'gemma', 'phi', 'tinyllama', 'deepseek', 'yi', 'internlm', 'granite', 'command-r'];

export async function getDeviceResources(): Promise<DeviceResources> {
  let freeStorage: number | undefined;
  try {
    freeStorage = await LegacyFileSystem.getFreeDiskStorageAsync();
  } catch {
    freeStorage = undefined;
  }
  return {
    totalMemory: typeof Device.totalMemory === 'number' ? Device.totalMemory : undefined,
    freeStorage,
    deviceName: [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'This device',
  };
}

function hasSupportedArchitecture(modelId: string, fileName: string) {
  const name = `${modelId} ${fileName}`.toLowerCase();
  return supportedArchitectures.some((architecture) => name.includes(architecture));
}

export function estimateModelCompatibility(
  modelId: string,
  fileName: string,
  fileSize: number | undefined,
  resources: DeviceResources,
): ModelCompatibility {
  if (!hasSupportedArchitecture(modelId, fileName)) {
    return {
      status: 'unsupported',
      label: 'Unsupported architecture',
      detail: 'This model name does not match an architecture supported by AURA.',
    };
  }
  if (!fileSize || !resources.totalMemory || !resources.freeStorage) {
    return {
      status: 'unknown',
      label: 'Compatibility unknown',
      detail: 'The model or device metadata is incomplete. AURA will check again when loading it.',
    };
  }

  const estimatedRuntimeMemory = fileSize * 1.25 + 512 * 1024 * 1024;
  const hasStorage = resources.freeStorage >= fileSize * 1.1;
  const hasMemory = resources.totalMemory >= estimatedRuntimeMemory;
  const hasComfortableMemory = resources.totalMemory >= estimatedRuntimeMemory * 1.35;

  if (!hasStorage || !hasMemory) {
    return {
      status: 'not-recommended',
      label: 'Not recommended',
      detail: `Needs about ${formatMemory(estimatedRuntimeMemory)} RAM and ${formatMemory(fileSize * 1.1)} free storage.`,
    };
  }
  if (!hasComfortableMemory) {
    return {
      status: 'slow',
      label: 'May be slow',
      detail: `It should run on ${formatMemory(resources.totalMemory)} RAM, but generation may be slower.`,
    };
  }
  return {
    status: 'compatible',
    label: 'Compatible',
    detail: `Fits this device's ${formatMemory(resources.totalMemory)} RAM and available storage.`,
  };
}

export function formatMemory(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
