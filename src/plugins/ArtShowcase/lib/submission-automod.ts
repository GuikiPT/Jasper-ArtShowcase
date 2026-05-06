import automodRules from '../../../data/automod.json';

type AutomodRule = {
  enabled?: boolean;
  name?: string;
  actions?: Array<{ type?: string }>;
  exemptChannels?: string[];
  exemptRoles?: string[];
  trigger?: {
    raw?: {
      allowList?: string[];
      keywordFilter?: string[];
      regexPatterns?: string[];
    };
  };
};

type SubmissionAutomodContext = {
  channelId: string;
  memberRoleIds: string[];
};

export type SubmissionAutomodMatch = {
  matchedBy: 'keyword' | 'regex';
  matchedValue: string;
  ruleName: string;
};

let cachedRules: AutomodRule[] | null = null;

export function checkSubmissionDescriptionAgainstAutomod(
  description: string,
  context: SubmissionAutomodContext
): SubmissionAutomodMatch | null {
  const normalizedDescription = description.trim();
  if (!normalizedDescription) return null;

  const rules = loadAutomodRules();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!rule.actions?.some((action) => action.type === 'BLOCK_MESSAGE')) continue;
    if (rule.exemptChannels?.includes(context.channelId)) continue;
    if (rule.exemptRoles?.some((roleId) => context.memberRoleIds.includes(roleId))) continue;

    const allowList = rule.trigger?.raw?.allowList ?? [];
    if (allowList.some((entry) => matchesKeywordPattern(normalizedDescription, entry))) continue;

    const keywordFilter = rule.trigger?.raw?.keywordFilter ?? [];
    for (const keyword of keywordFilter) {
      if (matchesKeywordPattern(normalizedDescription, keyword)) {
        return {
          matchedBy: 'keyword',
          matchedValue: keyword,
          ruleName: rule.name || 'Unnamed rule'
        };
      }
    }

    const regexPatterns = rule.trigger?.raw?.regexPatterns ?? [];
    for (const pattern of regexPatterns) {
      if (matchesRegexPattern(normalizedDescription, pattern)) {
        return {
          matchedBy: 'regex',
          matchedValue: pattern,
          ruleName: rule.name || 'Unnamed rule'
        };
      }
    }
  }

  return null;
}

function loadAutomodRules() {
  if (cachedRules) return cachedRules;

  cachedRules = automodRules as AutomodRule[];

  return cachedRules;
}

function matchesKeywordPattern(content: string, pattern: string) {
  if (!pattern) return false;

  const hasWildcard = pattern.includes('*');
  const normalizedPattern = pattern.trim();
  if (!normalizedPattern) return false;

  const regexPattern = hasWildcard
    ? normalizedPattern
      .split('*')
      .map((segment) => escapeRegex(segment))
      .join('.*')
    : createWholeWordPattern(normalizedPattern);

  try {
    return new RegExp(regexPattern, 'iu').test(content);
  } catch {
    return false;
  }
}

function matchesRegexPattern(content: string, pattern: string) {
  if (!pattern) return false;

  try {
    return new RegExp(pattern, 'iu').test(content);
  } catch {
    return false;
  }
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function createWholeWordPattern(pattern: string) {
  const escapedPattern = escapeRegex(pattern);
  return `(?<![\\p{L}\\p{N}_])${escapedPattern}(?![\\p{L}\\p{N}_])`;
}
