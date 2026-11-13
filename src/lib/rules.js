/*
 * Context Pack rules: pure functions with no Forge or network calls.
 * Parsing Jira data, the Definition of Ready checks and the markdown handoff all live here,
 * so they are unit-tested in plain Node (see test/rules.test.mjs) and shared by the panel,
 * the readiness board, the Rovo agent and the MCP tools.
 */

// Confluence page ids found in a spec URL: /pages/123/... or ?pageId=123.
export function pageIdFromUrl(url) {
  const match = String(url || '').match(/\/pages\/(\d+)|[?&]pageId=(\d+)/);
  return match ? match[1] || match[2] : null;
}

// Jira work item keys look like "KAN-12". We validate them before using them in a URL,
// because Rovo inputs come from a language model and may be malformed.
export function normaliseKey(raw) {
  const key = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]+-\d+$/.test(key)) {
    throw new Error(`"${raw}" is not a Jira work item key. Use a key like KAN-12.`);
  }
  return key;
}

// Converts Atlassian Document Format (the JSON Jira uses for rich text) into plain text.
// Paragraphs and list items become separate lines; task-list items keep a [ ] / [x] marker.
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention') return node.attrs?.text || '@someone';
  if (node.type === 'inlineCard' || node.type === 'blockCard') return node.attrs?.url || '';
  const inner = (node.content || []).map(adfToText).join('');
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
    case 'blockquote':
      return `${inner}\n`;
    case 'listItem':
      return `- ${inner.trim()}\n`;
    case 'taskItem':
      return `[${node.attrs?.state === 'DONE' ? 'x' : ' '}] ${inner.trim()}\n`;
    default:
      return inner;
  }
}

// Collects every URL found anywhere inside an ADF document (links, smart cards).
export function adfUrls(node, found = []) {
  if (!node || typeof node !== 'object') return found;
  if (node.type === 'inlineCard' || node.type === 'blockCard') {
    if (node.attrs?.url) found.push(node.attrs.url);
  }
  for (const mark of node.marks || []) {
    if (mark.type === 'link' && mark.attrs?.href) found.push(mark.attrs.href);
  }
  for (const child of node.content || []) adfUrls(child, found);
  return found;
}

// Finds the acceptance criteria inside a description.
// We look for a heading or line that starts the section ("Acceptance criteria", "AC:")
// and take the lines after it, or Given/When/Then lines, or task-list items.
export function extractAcceptanceCriteria(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => /^(acceptance criteria|ac\b|definition of done)/i.test(l.replace(/[#*:_-]/g, ' ').trim()));
  let criteria = [];
  if (start !== -1) {
    for (const line of lines.slice(start + 1)) {
      // A new section heading ends the criteria block.
      if (/^(notes?|out of scope|context|background|design|technical notes?)\b/i.test(line)) break;
      criteria.push(line.replace(/^[-*]\s*/, ''));
    }
  }
  if (criteria.length === 0) {
    criteria = lines.filter((l) => /^(given|when|then|and)\b/i.test(l) || /^\[( |x)\]/i.test(l));
  }
  return criteria.slice(0, 20);
}

// Picks comment lines that look like decisions, so a newcomer sees what was agreed.
export function extractDecisions(comments) {
  const pattern = /\b(decided|decision|agreed|we will|we'll|won't|will not|go with|approved|out of scope|instead of)\b/i;
  const decisions = [];
  for (const c of comments) {
    for (const line of adfToText(c.body).split('\n')) {
      const clean = line.replace(/^[-*]\s*/, '').trim();
      if (clean && pattern.test(clean)) {
        decisions.push({ text: clean.slice(0, 280), author: c.author?.displayName || 'Unknown', date: (c.created || '').slice(0, 10) });
      }
    }
  }
  return decisions.slice(0, 8);
}

// Finds the story point field id from the field names Jira returns with expand=names.
export function storyPointsFieldId(names = {}) {
  const wanted = ['story point estimate', 'story points'];
  return Object.keys(names).find((id) => wanted.includes(String(names[id]).toLowerCase()));
}

// The site (cloud) id is needed to build Teamwork Graph ARIs. Forge passes it in the
// invocation context; older contexts only carry it inside installContext (".../site/<id>").
export function cloudIdFrom(...contexts) {
  for (const c of contexts) {
    if (!c) continue;
    if (c.cloudId) return c.cloudId;
    const match = String(c.installContext || '').match(/site\/([0-9a-f-]{36})/i);
    if (match) return match[1];
  }
  return undefined;
}

// Turns Jira's issue links into a simple list, and works out which ones block this item.
export function summariseLinks(fields) {
  return (fields.issuelinks || []).map((link) => {
    const other = link.inwardIssue || link.outwardIssue;
    const relation = link.inwardIssue ? link.type?.inward : link.type?.outward;
    const statusCategory = other?.fields?.status?.statusCategory?.key;
    return {
      key: other?.key,
      summary: other?.fields?.summary || '',
      status: other?.fields?.status?.name || 'Unknown',
      relation: relation || 'relates to',
      done: statusCategory === 'done',
      // "is blocked by" on the inward side means the OTHER item blocks this one.
      blocksThisItem: Boolean(link.inwardIssue) && /blocked by/i.test(link.type?.inward || ''),
    };
  });
}

// Remote links (and links inside the description) that point at Confluence are treated as specs.
export function summariseSpecs(remoteLinks, descriptionAdf) {
  const fromRemote = remoteLinks
    .filter((r) => /confluence/i.test(r.application?.type || r.application?.name || '') || /\/wiki\//.test(r.object?.url || ''))
    .map((r) => ({ title: r.object?.title || r.object?.url, url: r.object?.url, pageId: pageIdFromUrl(r.object?.url) }));
  const fromDescription = adfUrls(descriptionAdf)
    .filter((u) => /\/wiki\//.test(u))
    .map((u) => ({ title: decodeURIComponent(u.split('/').pop() || u).replace(/\+/g, ' '), url: u, pageId: pageIdFromUrl(u) }));
  const seen = new Set();
  return [...fromRemote, ...fromDescription].filter((s) => s.url && !seen.has(s.url) && seen.add(s.url));
}

// The Definition of Ready a project uses. Project admins change it on the
// "Context Pack" project settings page; everything else uses these defaults.
export const CHECK_IDS = ['description', 'criteria', 'estimate', 'owner', 'blockers', 'spec'];
export const DEFAULT_SETTINGS = Object.freeze({
  checks: Object.freeze({ description: true, criteria: true, estimate: true, owner: true, blockers: true, spec: true }),
  minDescriptionWords: 20,
  // 'one-gap': ready when acceptance criteria and blockers pass and at most one other check fails.
  // 'all': ready only when every enabled check passes.
  readyRule: 'one-gap',
});

// Cleans settings from storage or from the settings form, so bad input can never break readiness.
export function normaliseSettings(raw) {
  const checks = {};
  for (const id of CHECK_IDS) {
    checks[id] = typeof raw?.checks?.[id] === 'boolean' ? raw.checks[id] : DEFAULT_SETTINGS.checks[id];
  }
  if (!CHECK_IDS.some((id) => checks[id])) checks.criteria = true; // at least one check must stay on
  const words = Number.parseInt(raw?.minDescriptionWords, 10);
  return {
    checks,
    minDescriptionWords: Number.isFinite(words) ? Math.min(Math.max(words, 5), 200) : DEFAULT_SETTINGS.minDescriptionWords,
    readyRule: raw?.readyRule === 'all' ? 'all' : 'one-gap',
  };
}

export function readinessChecks({ fields, names, criteria, links, specs }, settings = DEFAULT_SETTINGS) {
  const rules = normaliseSettings(settings);
  const description = adfToText(fields.description).trim();
  const words = description ? description.split(/\s+/).length : 0;
  const spField = storyPointsFieldId(names);
  const points = spField ? fields[spField] : null;
  const hasEstimate = (points !== null && points !== undefined && points !== '') || Boolean(fields.timetracking?.originalEstimate);
  const openBlockers = links.filter((l) => l.blocksThisItem && !l.done);

  const all = [
    { id: 'description', short: 'Description', label: 'Has a clear description', ok: words >= rules.minDescriptionWords, hint: words ? `Only ${words} words. Describe the problem and the expected result.` : 'The description is empty.' },
    { id: 'criteria', short: 'Acceptance criteria', label: 'Has acceptance criteria', ok: criteria.length > 0, hint: 'Add an "Acceptance criteria" section, or Given/When/Then lines.' },
    { id: 'estimate', short: 'Estimate', label: 'Is estimated', ok: hasEstimate, hint: 'Add story points or an original estimate.' },
    { id: 'owner', short: 'Assignee', label: 'Has an assignee', ok: Boolean(fields.assignee), hint: 'Assign an owner before work starts.' },
    { id: 'blockers', short: `Blocked by ${openBlockers.map((b) => b.key).join(', ')}`, label: 'No open blockers', ok: openBlockers.length === 0, hint: `Blocked by ${openBlockers.map((b) => b.key).join(', ')}.` },
    { id: 'spec', short: 'Spec page', label: 'Links a spec or design page', ok: specs.length > 0, hint: 'Link the Confluence page that explains the change.' },
  ];
  const checks = all.filter((c) => rules.checks[c.id]);
  const failed = checks.filter((c) => !c.ok);
  const criticalOk = checks.filter((c) => c.id === 'criteria' || c.id === 'blockers').every((c) => c.ok);
  const ready = failed.length === 0 || (rules.readyRule === 'one-gap' && criticalOk && failed.length === 1 && checks.length >= 4);
  return {
    score: Math.round(((checks.length - failed.length) / checks.length) * 100),
    ready,
    rule: rules.readyRule,
    checks: checks.map((c) => ({ ...c, hint: c.ok ? '' : c.hint })),
    missing: failed.map((c) => c.hint),
    gaps: failed.map((c) => c.short),
  };
}

// Who to talk to about this work item: owner, reporter, and the people behind the spec.
export function collectPeople(fields, specs) {
  const people = [];
  const add = (accountId, name, role) => {
    if (!accountId) return;
    const existing = people.find((p) => p.accountId === accountId);
    if (existing) {
      if (!existing.roles.includes(role)) existing.roles.push(role);
    } else {
      people.push({ accountId, name: name || '', roles: [role] });
    }
  };
  add(fields.assignee?.accountId, fields.assignee?.displayName, 'Assignee');
  add(fields.reporter?.accountId, fields.reporter?.displayName, 'Reporter');
  for (const spec of specs) {
    for (const o of spec.owners || []) add(o.accountId, o.name, 'Spec owner');
    for (const c of spec.contributors || []) add(c.accountId, c.name, 'Spec contributor');
  }
  return people.slice(0, 10);
}

// Markdown version of a pack, ready to paste into any AI coding agent.
// Sections follow the six kinds of context a team runs on: work, knowledge,
// people, communication, code and assets, plus the goal the work serves.
export function toMarkdown(p) {
  const list = (items, empty) => (items.length ? items.map((i) => `- ${i}`).join('\n') : `- ${empty}`);
  const specBlocks = p.specs.map((s) => {
    const who = [...(s.owners || []).map((o) => `${o.name} (owner)`), ...(s.contributors || []).map((c) => c.name)].join(', ');
    return [
      `### ${s.title}`,
      s.url ? `Link: ${s.url}${s.updated ? ` · updated ${s.updated}` : ''}` : '',
      who ? `People: ${who}` : '',
      s.text ? `\n${s.text}` : '',
    ].filter(Boolean).join('\n');
  });
  return [
    `# ${p.key}: ${p.summary}`,
    `${p.type} · ${p.status} · priority ${p.priority || 'none'} · owner ${p.assignee}`,
    p.url ? `Jira: ${p.url}` : '',
    p.parent ? `Parent: ${p.parent.key} ${p.parent.summary}` : '',
    '',
    `## Readiness: ${p.readiness.score}% ${p.readiness.ready ? '(ready to start)' : '(needs work)'}`,
    list(p.readiness.checks.map((c) => `${c.ok ? '[x]' : '[ ]'} ${c.label}${c.ok ? '' : ` (${c.hint})`}`), 'No checks'),
    '',
    '## Why it matters (goals)',
    list(p.goals.map((g) => `${g.type}: ${g.name}${g.owner ? ` (owner ${g.owner})` : ''}${g.url ? ` ${g.url}` : ''}`), 'No goal linked'),
    '',
    '## Acceptance criteria',
    list(p.acceptanceCriteria, 'None written yet'),
    '',
    '## Description',
    p.description || '(empty)',
    '',
    '## Linked work items',
    list(p.linkedItems.map((l) => `${l.relation} ${l.key}: ${l.summary} [${l.status}]`), 'None'),
    '',
    '## Specs and design pages',
    specBlocks.length ? specBlocks.join('\n\n') : '- None linked',
    '',
    '## Decisions from comments',
    list(p.decisions.map((d) => `${d.text} (${d.author}, ${d.date})`), 'None found'),
    '',
    '## People to ask',
    list(p.people.map((x) => `${x.name}: ${x.roles.join(', ')}`), 'Nobody found'),
    '',
    '## Code already linked',
    list([
      ...p.code.pullRequests.map((r) => `Pull request ${r.id} ${r.title} [${r.status}]${r.url ? ` ${r.url}` : ''}`),
      ...p.code.deployments.map((d) => `Deployment ${d.name} to ${d.environment || 'unknown environment'} [${d.state}]`),
    ], 'No pull requests or deployments linked yet'),
    '',
    '## Designs',
    list(p.designs.map((d) => `${d.name} [${d.status || 'no status'}]${d.url ? ` ${d.url}` : ''}`), 'None linked'),
    p.graph?.used && !p.graph.ok && p.graph.note ? `\n_Note: ${p.graph.note}_` : '',
  ]
    .filter((line, i, all) => !(line === '' && all[i - 1] === ''))
    .join('\n');
}
