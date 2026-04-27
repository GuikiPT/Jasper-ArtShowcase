import { formatDetailLine } from './submission-components';

interface SightengineCheckResponse {
  status: string;
  error?: {
    code?: number | string;
    message?: string;
  };
  type?: {
    ai_generated?: number;
    ai_generators?: Record<string, number>;
  };
}

export interface SightengineAiDetectionResult {
  aiGeneratedScore: number;
  generators: Record<string, number>;
}

export type SightengineDetectionSummary =
  | {
    fileName: string;
    status: 'success';
    detection: SightengineAiDetectionResult;
  }
  | {
    fileName: string;
    status: 'error';
    errorMessage: string;
  };

export function isSightengineConfigured() {
  return Boolean(process.env.SIGHTENGINE_API_USER && process.env.SIGHTENGINE_API_SECRET);
}

export async function detectAiGeneratedImage(imageUrl: string): Promise<SightengineAiDetectionResult> {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;

  if (!apiUser || !apiSecret) {
    throw new Error('Sightengine credentials are not configured.');
  }

  const formData = new FormData();
  formData.append('url', imageUrl);
  formData.append('models', 'genai');
  formData.append('api_user', apiUser);
  formData.append('api_secret', apiSecret);

  const response = await fetch('https://api.sightengine.com/1.0/check.json', {
    method: 'POST',
    body: formData
  });

  const payload = (await response.json()) as SightengineCheckResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || `Sightengine request failed with status ${response.status}.`);
  }

  if (payload.status !== 'success') {
    throw new Error(payload.error?.message || 'Sightengine returned an unsuccessful response.');
  }

  return {
    aiGeneratedScore: payload.type?.ai_generated ?? 0,
    generators: payload.type?.ai_generators ?? {}
  };
}

export function summarizeAiGeneratedScore(score: number) {
  if (score >= 0.85) return 'Very high';
  if (score >= 0.6) return 'High';
  if (score >= 0.35) return 'Medium';
  return 'Low';
}

export function formatGeneratorName(generator: string) {
  return generator
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildSightengineAdvisoryLines(results: SightengineDetectionSummary[]) {
  const lines = [
    'Sightengine genai results for staff review only.',
    'Treat these scores as a signal, not an automatic verdict.',
    ''
  ];

  for (const [index, result] of results.entries()) {
    lines.push(`### Image ${index + 1}`);
    lines.push(formatDetailLine('File', result.fileName));

    if (result.status === 'error') {
      lines.push(formatDetailLine('Status', 'Check failed'));
      lines.push(formatDetailLine('Error', result.errorMessage));
      lines.push('');
      continue;
    }

    const percent = Math.round(result.detection.aiGeneratedScore * 100);
    lines.push(formatDetailLine('AI likelihood', `${summarizeAiGeneratedScore(result.detection.aiGeneratedScore)} (${percent}%)`));

    const topGenerator = Object.entries(result.detection.generators).sort((left, right) => right[1] - left[1])[0];
    if (topGenerator && topGenerator[1] > 0) {
      lines.push(formatDetailLine('Top generator', `${formatGeneratorName(topGenerator[0])} (${Math.round(topGenerator[1] * 100)}%)`));
    }

    lines.push('');
  }

  while (lines.at(-1) === '') lines.pop();

  return lines;
}
