export type HuggingFaceFile = {
  name: string;
  size?: number;
};

type HuggingFaceApiFile = {
  rfilename?: string;
  size?: number;
};

export type HuggingFaceModel = {
  id: string;
  author?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  pipeline_tag?: string;
  library_name?: string;
  tags?: string[];
  siblings?: HuggingFaceFile[];
};

const API_URL = 'https://huggingface.co/api/models';

export async function searchHuggingFaceModels(query: string) {
  const params = new URLSearchParams({
    search: query.trim() || 'gguf',
    filter: 'gguf',
    sort: 'downloads',
    direction: '-1',
    limit: '30',
    expand: 'siblings',
  });
  const response = await fetch(`${API_URL}?${params.toString()}`);
  if (!response.ok) throw new Error(`Hugging Face search failed (${response.status}).`);
  const models = await response.json() as Array<Omit<HuggingFaceModel, 'siblings'> & { siblings?: HuggingFaceApiFile[] }>;
  return models
    .filter((model) => model.id && model.siblings?.some((file) => file.rfilename?.toLowerCase().endsWith('.gguf')))
    .map((model) => ({
      ...model,
      siblings: model.siblings
        ?.filter((file): file is HuggingFaceApiFile & { rfilename: string } => Boolean(file.rfilename))
        .map((file) => ({ name: file.rfilename, size: file.size })),
    }));
}

export function getHuggingFaceFileUrl(modelId: string, fileName: string) {
  return `https://huggingface.co/${modelId}/resolve/main/${fileName.split('/').map(encodeURIComponent).join('/')}?download=true`;
}

export async function getHuggingFaceFileSize(modelId: string, fileName: string) {
  const response = await fetch(getHuggingFaceFileUrl(modelId, fileName), { method: 'HEAD' });
  if (!response.ok) return undefined;
  const contentLength = response.headers.get('content-length');
  const size = contentLength ? Number(contentLength) : NaN;
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

export function formatModelSize(bytes?: number) {
  if (!bytes) return 'Size unavailable';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}
