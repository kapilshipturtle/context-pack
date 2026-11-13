/*
 * Teamwork Graph: the "why", "who", "code" and "knowledge" parts of a context pack.
 *
 * Jira's REST API tells us about the work item itself. Teamwork Graph tells us what the
 * work item is connected to across Atlassian and connected tools:
 *   - goals the item contributes to        (why it matters)
 *   - pull requests and deployments        (code that already exists)
 *   - designs                              (assets)
 *   - the spec page's text, owner and contributors (knowledge, and who to ask)
 *
 * Calls run as the current user, so results are filtered by what that user can see.
 * Teamwork Graph is in Preview: every call here is fail-soft. If the graph is unavailable
 * or a scope was not granted, the pack is still built from Jira data and says so.
 */
import api from '@forge/api';

// Persisted Cypher query registered for this app in Teamwork Graph:
//   MATCH (page:ConfluencePage {ari: $pageId}) RETURN page
export const SPEC_PAGE_QUERY_KEY = '39500af2-9725-4991-91b7-368ba1c4501c';

// Teamwork Graph requires operation names shaped like `company_operation`.
async function graph(operationName, query, variables, cloudId) {
  const headers = cloudId ? { 'X-Query-Context': `ari:cloud:platform::site/${cloudId}` } : {};
  const response = await api.asUser().requestTeamworkGraph(query, variables, operationName, undefined, headers);
  const json = await response.json();
  return { data: json?.data || {}, errors: (json?.errors || []).map((e) => e.message) };
}

const edgesOf = (connection) => (connection?.edges || []).map((e) => e?.node).filter(Boolean);
const accountIdOf = (userAri) => String(userAri || '').split('/').pop();

const WORK_ITEM_QUERY = `
query contextpack_workItemGraph($id: ID!) {
  jiraWorkItemGoals(id: $id, first: 10) {
    edges { node { __typename ... on AtlassianGoal { id key name url archived goalType { name } owner { name } } } }
  }
  jiraWorkItemLinkedExternalPullRequests(id: $id, first: 10) {
    edges { node { __typename ... on ExternalPullRequest { displayId title status url lastUpdatedAt author { name } provider { name } } } }
  }
  jiraWorkItemLinkedExternalDeployments(id: $id, first: 10) {
    edges { node { __typename ... on ExternalDeployment { displayName state url lastUpdatedAt environment { displayName type } provider { name } } } }
  }
  jiraWorkItemLinkedExternalDesigns(id: $id, first: 10) {
    edges { node { __typename ... on ExternalDesign { displayName status url provider { name } } } }
  }
}`;

const SPEC_PAGE_QUERY = `
query contextpack_specPage($pageId: ID!, $queryKey: String!, $queryParams: CypherRequestParams) {
  customQuery(queryKey: $queryKey, queryParams: $queryParams, first: 1) {
    edges { node { columns { key value { __typename ... on CypherQueryResultNode { id data { __typename
      ... on ConfluencePage { title webUrl lastUpdatedAt content { atlasDocFormat { value } } }
    } } } } } }
  }
  confluencePageOwners(id: $pageId, first: 5) {
    edges { node { __typename ... on AtlassianUser { id name } } }
  }
  confluencePageContributors(id: $pageId, first: 10) {
    edges { node { __typename ... on AtlassianUser { id name } } }
  }
}`;

// Goals, pull requests, deployments and designs connected to one work item.
export async function workItemGraph({ cloudId, issueId }) {
  if (!cloudId || !issueId) return { ok: false, note: 'Teamwork Graph needs the site id and work item id.' };
  const { data, errors } = await graph('contextpack_workItemGraph', WORK_ITEM_QUERY, { id: `ari:cloud:jira:${cloudId}:issue/${issueId}` }, cloudId);
  return {
    ok: errors.length === 0,
    note: errors.length ? `Teamwork Graph returned: ${errors.join('; ').slice(0, 300)}` : '',
    goals: edgesOf(data.jiraWorkItemGoals)
      .filter((g) => g.__typename === 'AtlassianGoal' && !g.archived)
      .map((g) => ({ key: g.key, name: g.name, url: g.url, type: g.goalType?.name || 'Goal', owner: g.owner?.name || '' })),
    pullRequests: edgesOf(data.jiraWorkItemLinkedExternalPullRequests)
      .filter((p) => p.__typename === 'ExternalPullRequest')
      .map((p) => ({ id: p.displayId || '', title: p.title || '', status: p.status || 'UNKNOWN', url: p.url, author: p.author?.name || '', updated: (p.lastUpdatedAt || '').slice(0, 10), provider: p.provider?.name || '' })),
    deployments: edgesOf(data.jiraWorkItemLinkedExternalDeployments)
      .filter((d) => d.__typename === 'ExternalDeployment')
      .map((d) => ({ name: d.displayName || '', state: d.state || 'UNKNOWN', environment: d.environment?.displayName || d.environment?.type || '', url: d.url, updated: (d.lastUpdatedAt || '').slice(0, 10) })),
    designs: edgesOf(data.jiraWorkItemLinkedExternalDesigns)
      .filter((d) => d.__typename === 'ExternalDesign')
      .map((d) => ({ name: d.displayName || '', status: d.status || '', url: d.url, provider: d.provider?.name || '' })),
  };
}

// Text, owner and contributors of one Confluence spec page.
export async function specPageGraph({ cloudId, pageId, adfToText }) {
  const pageAri = `ari:cloud:confluence:${cloudId}:page/${pageId}`;
  const { data, errors } = await graph('contextpack_specPage', SPEC_PAGE_QUERY, {
    pageId: pageAri,
    queryKey: SPEC_PAGE_QUERY_KEY,
    queryParams: { pageId: pageAri },
  }, cloudId);

  let page = null;
  for (const edge of data.customQuery?.edges || []) {
    for (const column of edge?.node?.columns || []) {
      if (column?.value?.data?.__typename === 'ConfluencePage') page = column.value.data;
    }
  }
  let text = '';
  const adf = page?.content?.atlasDocFormat?.value;
  if (adf) {
    try {
      text = adfToText(typeof adf === 'string' ? JSON.parse(adf) : adf).trim();
    } catch (e) {
      text = '';
    }
  }
  const people = (connection) => edgesOf(connection)
    .filter((u) => u.__typename === 'AtlassianUser')
    .map((u) => ({ accountId: accountIdOf(u.id), name: u.name || '' }));
  const owners = people(data.confluencePageOwners);
  const ownerIds = new Set(owners.map((o) => o.accountId));
  return {
    ok: errors.length === 0,
    note: errors.length ? errors.join('; ').slice(0, 300) : '',
    title: page?.title || '',
    updated: (page?.lastUpdatedAt || '').slice(0, 10),
    text: text.slice(0, 4000),
    owners,
    contributors: people(data.confluencePageContributors).filter((c) => !ownerIds.has(c.accountId)),
  };
}
