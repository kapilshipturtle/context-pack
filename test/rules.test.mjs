// Unit tests for the Context Pack rules. Run: npm test (Node 22+, no dependencies).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adfToText,
  cloudIdFrom,
  collectPeople,
  extractAcceptanceCriteria,
  extractDecisions,
  normaliseKey,
  normaliseSettings,
  pageIdFromUrl,
  readinessChecks,
  summariseLinks,
  summariseSpecs,
  toMarkdown,
} from '../src/lib/rules.js';

const para = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const heading = (text) => ({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text }] });
const bullets = (...items) => ({ type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [para(t)] })) });
const doc = (...content) => ({ type: 'doc', version: 1, content });

test('normaliseKey accepts work item keys and rejects anything else', () => {
  assert.equal(normaliseKey(' plat-12 '), 'PLAT-12');
  assert.throws(() => normaliseKey('PLAT 12'), /not a Jira work item key/);
  assert.throws(() => normaliseKey('../admin'), /not a Jira work item key/);
});

test('adfToText keeps paragraphs, list items and task states', () => {
  const text = adfToText(doc(
    heading('Goal'),
    bullets('one', 'two'),
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { state: 'DONE' }, content: [{ type: 'text', text: 'shipped' }] }] },
  ));
  assert.equal(text, 'Goal\n- one\n- two\n[x] shipped\n');
});

test('acceptance criteria are read from their section and stop at the next section', () => {
  const text = adfToText(doc(
    para('Retry failed renewals.'),
    heading('Acceptance criteria'),
    bullets('Given a soft decline, then retry after 24 hours.', 'Hard declines are never retried.'),
    heading('Notes'),
    para('Ask Finance before changing the cap.'),
  ));
  assert.deepEqual(extractAcceptanceCriteria(text), [
    'Given a soft decline, then retry after 24 hours.',
    'Hard declines are never retried.',
  ]);
});

test('Given/When/Then lines count as criteria when there is no section', () => {
  const text = 'Some intro\nGiven a user\nWhen they pay\nThen it works';
  assert.deepEqual(extractAcceptanceCriteria(text), ['Given a user', 'When they pay', 'Then it works']);
});

test('decisions are picked from comments, small talk is not', () => {
  const comments = [
    { body: doc(para('Decision: cap retries at 3.')), author: { displayName: 'Ana' }, created: '2026-11-13T09:00:00Z' },
    { body: doc(para('Thanks, looks good!')), author: { displayName: 'Ben' }, created: '2026-11-13T10:00:00Z' },
  ];
  assert.deepEqual(extractDecisions(comments), [{ text: 'Decision: cap retries at 3.', author: 'Ana', date: '2026-11-13' }]);
});

test('only "is blocked by" links count as blockers of this item', () => {
  const links = summariseLinks({
    issuelinks: [
      { type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'A-1', fields: { summary: 'SDK', status: { name: 'To Do', statusCategory: { key: 'new' } } } } },
      { type: { inward: 'is blocked by', outward: 'blocks' }, outwardIssue: { key: 'A-2', fields: { summary: 'Later', status: { name: 'To Do', statusCategory: { key: 'new' } } } } },
    ],
  });
  assert.equal(links[0].relation, 'is blocked by');
  assert.equal(links[0].blocksThisItem, true);
  assert.equal(links[1].relation, 'blocks');
  assert.equal(links[1].blocksThisItem, false);
});

test('Confluence remote links and wiki links in the description become specs with page ids', () => {
  const specs = summariseSpecs(
    [{ application: { type: 'com.atlassian.confluence' }, object: { title: 'Spec', url: 'https://acme.atlassian.net/wiki/pages/viewpage.action?pageId=42' } }],
    doc({ type: 'paragraph', content: [{ type: 'inlineCard', attrs: { url: 'https://acme.atlassian.net/wiki/spaces/ENG/pages/77/Design' } }] }),
  );
  assert.deepEqual(specs.map((s) => s.pageId), ['42', '77']);
  assert.equal(pageIdFromUrl('https://x/wiki/spaces/A/pages/123/T'), '123');
  assert.equal(pageIdFromUrl('https://x/browse/A-1'), null);
});

const readyFields = () => ({
  description: doc(para('Renewal charges that fail with a soft decline should be retried automatically so that customers do not churn by accident when a card has a temporary problem.')),
  assignee: { accountId: 'u1', displayName: 'Ana' },
  reporter: { accountId: 'u2', displayName: 'Ben' },
  customfield_10031: 5,
  issuelinks: [],
});
const check = (fields, extra = {}) => readinessChecks({
  fields,
  names: { customfield_10031: 'Story Points' },
  criteria: ['Given x then y'],
  links: summariseLinks(fields),
  specs: [{ title: 'Spec', url: 'u' }],
  ...extra,
});

test('a complete work item is ready at 100%', () => {
  const r = check(readyFields());
  assert.equal(r.score, 100);
  assert.equal(r.ready, true);
  assert.deepEqual(r.gaps, []);
});

test('an open blocker makes an item not ready even when everything else passes', () => {
  const fields = { ...readyFields(), issuelinks: [{ type: { inward: 'is blocked by', outward: 'blocks' }, inwardIssue: { key: 'P-9', fields: { summary: 'SDK', status: { name: 'To Do', statusCategory: { key: 'new' } } } } }] };
  const r = check(fields);
  assert.equal(r.ready, false);
  assert.deepEqual(r.gaps, ['Blocked by P-9']);
  assert.equal(r.score, 83);
});

test('a short description and missing estimate are explained with a fix', () => {
  const fields = { ...readyFields(), description: doc(para('Make checkout faster')), customfield_10031: null };
  const r = check(fields, { criteria: [] });
  assert.equal(r.ready, false);
  assert.deepEqual(r.gaps, ['Description', 'Acceptance criteria', 'Estimate']);
  assert.match(r.missing[0], /Only 3 words/);
});

test('cloudIdFrom reads cloudId or the site id inside installContext', () => {
  assert.equal(cloudIdFrom(undefined, { cloudId: 'abc' }), 'abc');
  assert.equal(cloudIdFrom({ installContext: 'ari:cloud:jira::site/7cfcbdaa-f810-4ec9-a1da-e646030f6d18' }), '7cfcbdaa-f810-4ec9-a1da-e646030f6d18');
  assert.equal(cloudIdFrom({}), undefined);
});

test('people are merged by account with every role they hold', () => {
  const people = collectPeople(readyFields(), [{ owners: [{ accountId: 'u1', name: 'Ana' }], contributors: [{ accountId: 'u3', name: 'Cy' }] }]);
  assert.deepEqual(people, [
    { accountId: 'u1', name: 'Ana', roles: ['Assignee', 'Spec owner'] },
    { accountId: 'u2', name: 'Ben', roles: ['Reporter'] },
    { accountId: 'u3', name: 'Cy', roles: ['Spec contributor'] },
  ]);
});

test('markdown handoff has every section an agent needs', () => {
  const fields = readyFields();
  const md = toMarkdown({
    key: 'P-1', summary: 'Retry payments', type: 'Story', status: 'To Do', priority: 'High', assignee: 'Ana', url: 'https://acme.atlassian.net/browse/P-1', parent: null,
    readiness: check(fields), goals: [{ type: 'Objective', name: 'Cut churn', owner: 'Dee', url: 'https://g' }],
    acceptanceCriteria: ['Given x then y'], description: 'desc', linkedItems: [],
    specs: [{ title: 'Spec', url: 'https://s', owners: [{ name: 'Ana' }], contributors: [], text: 'Problem: churn' }],
    decisions: [{ text: 'Cap at 3', author: 'Ana', date: '2026-11-13' }], people: collectPeople(fields, []),
    code: { pullRequests: [{ id: '#7', title: 'Add retries', status: 'OPEN', url: 'https://pr' }], deployments: [] }, designs: [], graph: { used: true, ok: true },
  });
  for (const section of ['## Readiness: 100% (ready to start)', '## Why it matters (goals)', 'Objective: Cut churn', '## Acceptance criteria', '### Spec', 'Problem: churn', '## Decisions from comments', '## People to ask', 'Pull request #7 Add retries [OPEN]']) {
    assert.ok(md.includes(section), `missing: ${section}`);
  }
});

test('a project can switch off checks it does not use, such as estimates', () => {
  const fields = { ...readyFields(), customfield_10031: null };
  const strict = { checks: { description: true, criteria: true, estimate: true, owner: true, blockers: true, spec: true }, readyRule: 'all' };
  assert.equal(check(fields, {}).ready, true); // default rule tolerates one non-critical gap
  const r1 = readinessChecks({ fields, names: { customfield_10031: 'Story Points' }, criteria: ['x'], links: [], specs: [{}] }, strict);
  assert.equal(r1.ready, false);
  const r2 = readinessChecks({ fields, names: { customfield_10031: 'Story Points' }, criteria: ['x'], links: [], specs: [{}] }, { ...strict, checks: { ...strict.checks, estimate: false } });
  assert.equal(r2.ready, true);
  assert.equal(r2.score, 100);
  assert.equal(r2.checks.length, 5);
});

test('the one-gap rule never forgives missing acceptance criteria', () => {
  const r = check(readyFields(), { criteria: [] });
  assert.equal(r.ready, false);
  assert.deepEqual(r.gaps, ['Acceptance criteria']);
});

test('settings from storage or a form are cleaned before use', () => {
  const s = normaliseSettings({ checks: { description: 'yes', estimate: false }, minDescriptionWords: '999', readyRule: 'nonsense' });
  assert.equal(s.checks.description, true);
  assert.equal(s.checks.estimate, false);
  assert.equal(s.minDescriptionWords, 200);
  assert.equal(s.readyRule, 'one-gap');
  const none = normaliseSettings({ checks: { description: false, criteria: false, estimate: false, owner: false, blockers: false, spec: false } });
  assert.equal(none.checks.criteria, true);
});
