import { ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES } from '../constants';

const submissionCooldowns = new Map<string, number>();

export function getSubmissionCooldownDurationMs() {
  return Math.max(ART_SHOWCASE_SUBMISSION_COOLDOWN_MINUTES, 0) * 60_000;
}

export function getSubmissionCooldownExpiresAt(userId: string) {
  const cooldownDurationMs = getSubmissionCooldownDurationMs();
  if (cooldownDurationMs === 0) {
    submissionCooldowns.delete(userId);
    return null;
  }

  const lastSubmissionAt = submissionCooldowns.get(userId);
  if (!lastSubmissionAt) return null;

  const expiresAt = lastSubmissionAt + cooldownDurationMs;
  if (expiresAt <= Date.now()) {
    submissionCooldowns.delete(userId);
    return null;
  }

  return expiresAt;
}

export function setSubmissionCooldown(userId: string, submittedAt = Date.now()) {
  const cooldownDurationMs = getSubmissionCooldownDurationMs();
  if (cooldownDurationMs === 0) {
    submissionCooldowns.delete(userId);
    return null;
  }

  submissionCooldowns.set(userId, submittedAt);
  return submittedAt + cooldownDurationMs;
}
