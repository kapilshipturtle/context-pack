/*
 * Context Pack: the shared core.
 *
 * Everything here works on ONE Jira work item and answers two questions:
 *   1. "What is the full working context of this item?"  (buildContextPack)
 *   2. "Is it ready to start, and if not, what is missing?" (checkReadiness)
 *
 * The same functions back three surfaces, so they always agree with each other:
 *   - the Jira issue panel (via the UI resolver),
 *   - the Rovo agent (via Rovo actions),
 *   - third-party AI coding agents like Claude Code or Cursor (via the rovo:mcp module).
 *
 * All requests run as the current user (asUser), so nobody ever sees
 * an item, comment or link they could not already open in Jira.
 * No external AI service is called: the app only reads and shapes Jira data.
 */
import api, { route } from '@forge/api';
import { getProjectSettings } from './settings';
import { specPageGraph, workItemGraph } from './teamworkGraph';
import {
  adfToText,
  collectPeople,
  extractAcceptanceCriteria,
  extractDecisions,
  normaliseKey,
  readinessChecks,
  summariseLinks,
  summariseSpecs,
  toMarkdown,
} from './rules';

export { cloudIdFrom, toMarkdown } from './rules';

/* ----------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

// Calls a Jira REST endpoint as the current user and returns parsed JSON.
// Throws a readable error so the caller (agent, MCP client, panel) can show it.
async function jira(path, options = {}) {
  const response = await api.asUser().requestJira(path, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Jira returned ${response.status} for this request: ${body.slice(0, 300)}`);
  }
  return response.status === 204 ? null : response.json();
}

// The site address (for example https://acme.atlassian.net), used to build browse links.
// Read from serverInfo because issue "self" links may point at the API gateway instead.
// Not cached in module scope: a Forge runtime can serve more than one site.
function siteBaseUrl() {
  return jira(route`/rest/api/3/serverInfo`).then((info) => info?.baseUrl || '').catch(() => '');
}

/* ----------------------------------------------------------------------------
 * Reading one work item
 * ------------------------------------------------------------------------- */

// lite: readiness only needs the work item and its remote links, so skip comments and the site address.
async function loadItem(issueKey, { lite = false, knownBaseUrl = '' } = {}) {
  const key = normaliseKey(issueKey);
  // One request for the work item with every field and the field names,
  // plus small requests for remote links, the latest comments and the site address.
  const [issue, remoteLinks, commentPage, baseUrl] = await Promise.all([
    jira(route`/rest/api/3/issue/${key}?expand=names&fields=*all`),
    jira(route`/rest/api/3/issue/${key}/remotelink`).catch(() => []),
    lite ? { comments: [] } : jira(route`/rest/api/3/issue/${key}/comment?orderBy=-created&maxResults=20`).catch(() => ({ comments: [] })),
    lite || knownBaseUrl ? knownBaseUrl : siteBaseUrl(),
  ]);
  return { key, issue, remoteLinks: remoteLinks || [], comments: commentPage?.comments || [], baseUrl };
}

/* ----------------------------------------------------------------------------
 * Readiness: a short, explainable checklist (no black-box score)
 * ------------------------------------------------------------------------- */

/* ----------------------------------------------------------------------------
 * Public API used by actions, the agent and the panel
 * ------------------------------------------------------------------------- */

// Builds the full context pack for one work item.
// options.cloudId: the site id from the Forge context (needed for Teamwork Graph ARIs).
// options.withGraph: false skips Teamwork Graph (readiness checks only need Jira data).
export async function buildContextPack(issueKey, { cloudId, withGraph = true, lite = false, siteUrl = '' } = {}) {
  const { key, issue, remoteLinks, comments, baseUrl } = await loadItem(issueKey, { lite, knownBaseUrl: siteUrl });
  const fields = issue.fields || {};
  const names = issue.names || {};
  const description = adfToText(fields.description).trim();
  const criteria = extractAcceptanceCriteria(description);
  const links = summariseLinks(fields);
  const specs = summariseSpecs(remoteLinks, fields.description);
  const decisions = extractDecisions(comments);
  const settings = await getProjectSettings(fields.project?.key);
  const readiness = readinessChecks({ fields, names, criteria, links, specs }, settings);

  const pack = {
    key,
    url: baseUrl ? `${baseUrl}/browse/${key}` : '',
    summary: fields.summary || '',
    type: fields.issuetype?.name || '',
    status: fields.status?.name || '',
    priority: fields.priority?.name || '',
    project: fields.project?.name || '',
    assignee: fields.assignee?.displayName || 'Unassigned',
    reporter: fields.reporter?.displayName || '',
    labels: fields.labels || [],
    components: (fields.components || []).map((c) => c.name),
    parent: fields.parent ? { key: fields.parent.key, summary: fields.parent.fields?.summary || '' } : null,
    description: description.slice(0, 6000),
    acceptanceCriteria: criteria,
    linkedItems: links,
    specs,
    decisions,
    readiness,
    goals: [],
    code: { pullRequests: [], deployments: [] },
    designs: [],
    people: [],
    graph: { used: false, ok: false, note: 'Teamwork Graph was not queried.' },
  };

  if (withGraph) await addTeamworkGraph(pack, { cloudId, issueId: issue.id });
  pack.people = collectPeople(fields, pack.specs);
  pack.markdown = toMarkdown(pack);
  return pack;
}

// Adds goals, code, designs and spec knowledge from Teamwork Graph. Never throws:
// the graph is in Preview, so a failure only adds a note to the pack.
async function addTeamworkGraph(pack, { cloudId, issueId }) {
  try {
    const specPages = pack.specs.filter((s) => s.pageId).slice(0, 3);
    const [item, ...pages] = await Promise.all([
      workItemGraph({ cloudId, issueId }),
      ...specPages.map((s) => specPageGraph({ cloudId, pageId: s.pageId, adfToText }).catch((e) => ({ ok: false, note: String(e.message || e) }))),
    ]);
    pack.goals = item.goals || [];
    pack.code = { pullRequests: item.pullRequests || [], deployments: item.deployments || [] };
    pack.designs = item.designs || [];
    specPages.forEach((spec, i) => {
      const page = pages[i] || {};
      spec.title = page.title || spec.title;
      spec.updated = page.updated || '';
      spec.text = page.text || '';
      spec.owners = page.owners || [];
      spec.contributors = page.contributors || [];
    });
    const notes = [item.note, ...pages.map((p) => p.note)].filter(Boolean);
    pack.graph = { used: true, ok: item.ok && pages.every((p) => p.ok), note: notes.join(' ') };
  } catch (error) {
    console.error('Teamwork Graph lookup failed:', error);
    pack.graph = { used: true, ok: false, note: `Teamwork Graph is unavailable right now: ${String(error.message || error).slice(0, 200)}` };
  }
}

// Only the readiness part (cheaper to read, same rules as the full pack).
export async function checkReadiness(issueKey) {
  const pack = await buildContextPack(issueKey, { withGraph: false, lite: true });
  return { key: pack.key, summary: pack.summary, ...pack.readiness };
}

// Lists open work items in a project with their readiness, most ready first.
// One search returns every field the checks need; only remote links (for the spec check)
// are read per work item, all in parallel.
export async function listReadyItems(projectKey, limit = 15, { baseUrl } = {}) {
  const project = String(projectKey || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+$/.test(project)) throw new Error(`"${projectKey}" is not a Jira project key. Use a key like KAN.`);
  const [allFields, siteUrl, settings] = await Promise.all([
    jira(route`/rest/api/3/field`),
    baseUrl ? baseUrl : siteBaseUrl(),
    getProjectSettings(project),
  ]);
  const names = Object.fromEntries((allFields || []).map((f) => [f.id, f.name]));
  const pointFields = Object.keys(names).filter((id) => ['story point estimate', 'story points'].includes(String(names[id]).toLowerCase()));
  const result = await jira(route`/rest/api/3/search/jql`, {
    method: 'POST',
    body: JSON.stringify({
      jql: `project = "${project}" AND statusCategory != Done ORDER BY rank ASC`,
      fields: ['summary', 'status', 'assignee', 'description', 'issuelinks', 'timetracking', ...pointFields],
      maxResults: Math.min(Number(limit) || 15, 25),
    }),
  });
  const items = await Promise.all((result.issues || []).map(async (issue) => {
    const fields = issue.fields || {};
    const url = siteUrl ? `${siteUrl}/browse/${issue.key}` : '';
    try {
      const remoteLinks = await jira(route`/rest/api/3/issue/${issue.key}/remotelink`).catch(() => []);
      const description = adfToText(fields.description).trim();
      const r = readinessChecks({
        fields,
        names,
        criteria: extractAcceptanceCriteria(description),
        links: summariseLinks(fields),
        specs: summariseSpecs(remoteLinks || [], fields.description),
      }, settings);
      return { key: issue.key, url, summary: fields.summary || '', status: fields.status?.name || '', assignee: fields.assignee?.displayName || 'Unassigned', score: r.score, ready: r.ready, missing: r.missing, gaps: r.gaps };
    } catch (error) {
      return { key: issue.key, url, summary: fields.summary || '', status: fields.status?.name || '', assignee: '', score: 0, ready: false, missing: [`Could not be checked: ${String(error.message || error).slice(0, 120)}`], gaps: ['Could not be checked'] };
    }
  }));
  return items.sort((a, b) => b.score - a.score);
}

// True when the current user may administer the project (used before saving settings,
// because storage writes run as the app, not as the user).
export async function isProjectAdmin(projectKey) {
  const project = String(projectKey || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+$/.test(project)) return false;
  const result = await jira(route`/rest/api/3/mypermissions?projectKey=${project}&permissions=ADMINISTER_PROJECTS`);
  return Boolean(result?.permissions?.ADMINISTER_PROJECTS?.havePermission);
}

// Adds a progress comment written by a person or a coding agent.
export async function postProgress(issueKey, message) {
  const key = normaliseKey(issueKey);
  const text = String(message || '').trim();
  if (!text) throw new Error('The progress message is empty.');
  const body = {
    type: 'doc',
    version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Progress update (posted with Context Pack)', marks: [{ type: 'strong' }] }] },
      ...text.split('\n').filter(Boolean).slice(0, 30).map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line.slice(0, 1000) }] })),
    ],
  };
  const created = await jira(route`/rest/api/3/issue/${key}/comment`, { method: 'POST', body: JSON.stringify({ body }) });
  return { key, commentId: created?.id, posted: true };
}
