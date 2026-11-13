/*
 * Rovo actions. Each export is the handler of one `action` module in manifest.yml.
 * The same actions are:
 *   - used by the "Context Pack" Rovo agent inside Jira and Confluence, and
 *   - published as MCP tools (rovo:mcp) so Claude Code, Cursor and other
 *     MCP clients can call them with the user's own Jira permissions.
 *
 * Handlers receive (payload, context). Action inputs are top-level keys of the payload.
 * When the user is looking at a work item, Rovo also passes it in payload.context.jira,
 * so "is this ready?" works without typing a key.
 */
import { buildContextPack, checkReadiness, cloudIdFrom, listReadyItems, postProgress } from './lib/contextPack';

// Uses the key the user (or model) gave; otherwise the work item on screen.
function pickKey(payload) {
  return payload?.issueKey || payload?.context?.jira?.issueKey || payload?.context?.jira?.issue?.key;
}

// Wraps a handler so any failure comes back as a clear sentence instead of a stack trace.
function safe(fn) {
  return async (payload, context) => {
    try {
      return await fn(payload, context);
    } catch (error) {
      console.error('Context Pack action failed:', error);
      return { error: String(error.message || error) };
    }
  };
}

// GET: the full context of one work item, as JSON plus ready-to-paste markdown.
// Rovo puts the site id in payload.context; MCP calls may carry it in the second argument.
export const getContextPack = safe(async (payload, context) => {
  const cloudId = cloudIdFrom(payload?.context, context);
  console.log(`get-context-pack: cloudId ${cloudId ? 'found' : 'missing'} (payload.context keys: ${Object.keys(payload?.context || {}).join(',')}; context keys: ${Object.keys(context || {}).join(',')})`);
  const pack = await buildContextPack(pickKey(payload), { cloudId });
  // The markdown holds every section; the rest is a short summary agents can branch on.
  return {
    key: pack.key,
    url: pack.url,
    summary: pack.summary,
    readiness: { score: pack.readiness.score, ready: pack.readiness.ready, missing: pack.readiness.missing },
    markdown: pack.markdown,
  };
});

// GET: is the work item ready to start, and what exactly is missing?
export const checkItemReadiness = safe(async (payload) => checkReadiness(pickKey(payload)));

// GET: open work items in a project, most ready first.
export const listReady = safe(async (payload) => {
  const projectKey = payload?.projectKey || payload?.context?.jira?.projectKey;
  return { projectKey, items: await listReadyItems(projectKey, payload?.limit) };
});

// CREATE: post a progress comment, e.g. a coding agent reporting what it changed.
export const postProgressUpdate = safe(async (payload) => postProgress(pickKey(payload), payload?.message));
