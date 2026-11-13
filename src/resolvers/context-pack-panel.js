/*
 * Backend resolvers for the Context Pack UI (issue panel and project page).
 * Work item and project keys come from the Forge context (never from the browser),
 * so they cannot be spoofed.
 */
import Resolver from '@forge/resolver';
import { buildContextPack, cloudIdFrom, isProjectAdmin, listReadyItems } from '../lib/contextPack';
import { getProjectSettings, resetProjectSettings, saveProjectSettings } from '../lib/settings';

const resolver = new Resolver();

resolver.define('getPack', async ({ context }) => {
  const key = context?.extension?.issue?.key;
  const cloudId = cloudIdFrom(context);
  try {
    return { ok: true, pack: await buildContextPack(key, { cloudId, siteUrl: context?.siteUrl }) };
  } catch (error) {
    console.error('Context Pack panel failed:', error);
    return { ok: false, error: String(error.message || error) };
  }
});

resolver.define('getBoard', async ({ context }) => {
  const projectKey = context?.extension?.project?.key;
  const started = Date.now();
  try {
    const items = await listReadyItems(projectKey, 25, { baseUrl: context?.siteUrl });
    console.log(`getBoard ${projectKey}: ${items.length} items in ${Date.now() - started} ms`);
    return { ok: true, projectKey, items };
  } catch (error) {
    console.error('Context Pack board failed:', error);
    return { ok: false, projectKey, error: String(error.message || error) };
  }
});

// Definition of Ready settings (project settings page). Anyone who can open the page may read
// them; only project admins may change them.
resolver.define('getSettings', async ({ context }) => {
  const projectKey = context?.extension?.project?.key;
  try {
    const [settings, canEdit] = await Promise.all([getProjectSettings(projectKey), isProjectAdmin(projectKey)]);
    return { ok: true, projectKey, settings, canEdit };
  } catch (error) {
    console.error('Reading settings failed:', error);
    return { ok: false, projectKey, error: String(error.message || error) };
  }
});

resolver.define('saveSettings', async ({ payload, context }) => {
  const projectKey = context?.extension?.project?.key;
  try {
    if (!(await isProjectAdmin(projectKey))) return { ok: false, error: 'Only project admins can change the Definition of Ready.' };
    const settings = payload?.reset ? await resetProjectSettings(projectKey) : await saveProjectSettings(projectKey, payload?.settings);
    return { ok: true, projectKey, settings, canEdit: true };
  } catch (error) {
    console.error('Saving settings failed:', error);
    return { ok: false, projectKey, error: String(error.message || error) };
  }
});

export const handler = resolver.getDefinitions();
