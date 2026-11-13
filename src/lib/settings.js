/*
 * Per-project Definition of Ready, stored with Forge Key-Value Storage.
 * Storage is per installation, so one site's settings can never be read by another.
 * Writes are only allowed after the resolver has checked the user is a project admin.
 */
import { kvs } from '@forge/kvs';
import { DEFAULT_SETTINGS, normaliseSettings } from './rules';

const keyFor = (projectKey) => `definition-of-ready:${String(projectKey || '').toUpperCase()}`;

// Returns the project's settings, or the defaults when none are saved (or storage fails).
export async function getProjectSettings(projectKey) {
  if (!projectKey) return { ...normaliseSettings(DEFAULT_SETTINGS), customised: false };
  try {
    const saved = await kvs.get(keyFor(projectKey));
    return { ...normaliseSettings(saved || DEFAULT_SETTINGS), customised: Boolean(saved) };
  } catch (error) {
    console.error('Reading Definition of Ready settings failed; using defaults.', error);
    return { ...normaliseSettings(DEFAULT_SETTINGS), customised: false };
  }
}

export async function saveProjectSettings(projectKey, raw) {
  const clean = normaliseSettings(raw);
  await kvs.set(keyFor(projectKey), clean);
  return { ...clean, customised: true };
}

export async function resetProjectSettings(projectKey) {
  await kvs.delete(keyFor(projectKey));
  return { ...normaliseSettings(DEFAULT_SETTINGS), customised: false };
}
