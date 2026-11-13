/*
 * Context Pack issue panel (UI Kit).
 * On every Jira work item it shows:
 *   - Readiness: a checklist with a one-line fix for each gap,
 *   - Context: why it matters (goals), acceptance criteria, linked work, specs with their
 *     owners, decisions, people to ask, code and designs (Jira + Teamwork Graph),
 *   - For AI agents: the whole pack as markdown, and how to connect a coding agent over MCP.
 * Only components from @forge/react are used (UI Kit requirement).
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  CodeBlock,
  DynamicTable,
  Heading,
  Inline,
  Link,
  List,
  ListItem,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  User,
} from '@forge/react';
import { invoke } from '@forge/bridge';

// The MCP endpoint of this app (https://mcp.atlassian.com/forge/<app id from manifest.yml>).
const MCP_URL = 'https://mcp.atlassian.com/forge/e9f46537-efa3-4c85-99f5-9bec166d7368';

const PR_APPEARANCE = { OPEN: 'inprogress', DRAFT: 'default', MERGED: 'success', DECLINED: 'removed' };
const DEPLOY_APPEARANCE = { SUCCESSFUL: 'success', FAILED: 'removed', ROLLED_BACK: 'removed', IN_PROGRESS: 'inprogress', PENDING: 'default' };
const nice = (value) => String(value || '').toLowerCase().replace(/_/g, ' ');
// First few lines of a spec page, joined so headings stay readable on one line.
const excerpt = (text) => {
  const flat = text.split('\n').map((l) => l.trim()).filter(Boolean).join(' · ');
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
};

// One section with a small heading and its content.
const Section = ({ title, children }) => (
  <Stack space="space.075">
    <Heading size="xsmall">{title}</Heading>
    {children}
  </Stack>
);

const Empty = ({ children }) => <Text color="color.text.subtlest">{children}</Text>;

const ReadinessTab = ({ r }) => {
  const anyMissing = r.checks.some((c) => !c.ok);
  const head = [
    { key: 'state', content: 'Status', width: anyMissing ? 18 : 25 },
    { key: 'check', content: 'Check', width: anyMissing ? 32 : 75 },
    ...(anyMissing ? [{ key: 'fix', content: 'How to fix', width: 50 }] : []),
  ];
  return (
    <Stack space="space.150">
      <DynamicTable
        head={{ cells: head }}
        rows={r.checks.map((c) => ({
          key: `check-${c.id}`,
          cells: [
            { key: 'state', content: <Lozenge appearance={c.ok ? 'success' : 'removed'}>{c.ok ? 'Done' : 'Missing'}</Lozenge> },
            { key: 'check', content: c.label },
            ...(anyMissing ? [{ key: 'fix', content: c.ok ? '' : c.hint }] : []),
          ],
        }))}
      />
      {anyMissing ? (
        <Text>
          Ask the <Strong>Context Pack</Strong> agent in Rovo to draft what is missing, for example the acceptance criteria.
        </Text>
      ) : (
        <Text>Everything a developer or coding agent needs is in place.</Text>
      )}
    </Stack>
  );
};

const ContextTab = ({ p }) => (
  <Stack space="space.200">
    <Section title="Why it matters">
      {p.goals.length ? (
        <List type="unordered">
          {p.goals.map((g, i) => (
            <ListItem key={`goal-${i}`}>
              <Inline space="space.075" alignBlock="center">
                <Lozenge appearance="new">{g.type}</Lozenge>
                {g.url ? <Link href={g.url} openNewTab>{g.name}</Link> : <Text>{g.name}</Text>}
              </Inline>
            </ListItem>
          ))}
        </List>
      ) : (
        <Empty>No goal is linked to this work item.</Empty>
      )}
    </Section>

    <Section title="Acceptance criteria">
      {p.acceptanceCriteria.length ? (
        <List type="ordered">
          {p.acceptanceCriteria.map((line, i) => (
            <ListItem key={`ac-${i}`}>
              <Text>{line}</Text>
            </ListItem>
          ))}
        </List>
      ) : (
        <Empty>None written yet. Ask the Context Pack agent in Rovo to draft them.</Empty>
      )}
    </Section>

    <Section title="Linked work">
      {p.linkedItems.length ? (
        <DynamicTable
          head={{ cells: [{ key: 'relation', content: 'Relation' }, { key: 'item', content: 'Work item' }, { key: 'status', content: 'Status' }] }}
          rows={p.linkedItems.map((l, i) => ({
            key: `link-${i}`,
            cells: [
              { key: 'relation', content: l.relation },
              { key: 'item', content: `${l.key}: ${l.summary}` },
              { key: 'status', content: <Lozenge appearance={l.done ? 'success' : l.blocksThisItem ? 'removed' : 'inprogress'}>{l.status}</Lozenge> },
            ],
          }))}
        />
      ) : (
        <Empty>No linked work items.</Empty>
      )}
    </Section>

    <Section title="Specs and design pages">
      {p.specs.length ? (
        <Stack space="space.150">
          {p.specs.map((s, i) => (
            <Stack key={`spec-${i}`} space="space.050">
              <Link href={s.url} openNewTab>
                {s.title}
              </Link>
              {s.owners?.length ? (
                <Text color="color.text.subtle">
                  Owner: {s.owners.map((o) => o.name).join(', ')}
                  {s.updated ? ` · updated ${s.updated}` : ''}
                </Text>
              ) : null}
              {s.text ? <Text color="color.text.subtle">{excerpt(s.text)}</Text> : null}
            </Stack>
          ))}
        </Stack>
      ) : (
        <Empty>No Confluence page linked yet.</Empty>
      )}
    </Section>

    <Section title="Decisions from comments">
      {p.decisions.length ? (
        <List type="unordered">
          {p.decisions.map((d, i) => (
            <ListItem key={`dec-${i}`}>
              <Text>
                {d.text} ({d.author}, {d.date})
              </Text>
            </ListItem>
          ))}
        </List>
      ) : (
        <Empty>No decisions found in the comments.</Empty>
      )}
    </Section>

    <Section title="People to ask">
      {p.people.length ? (
        <Stack space="space.075">
          {p.people.map((person) => (
            <Inline key={person.accountId} space="space.100" alignBlock="center">
              <User accountId={person.accountId} />
              <Text color="color.text.subtle">{person.roles.join(', ')}</Text>
            </Inline>
          ))}
        </Stack>
      ) : (
        <Empty>Nobody found yet.</Empty>
      )}
    </Section>

    <Section title="Code already linked">
      {p.code.pullRequests.length || p.code.deployments.length ? (
        <Stack space="space.075">
          {p.code.pullRequests.map((r, i) => (
            <Inline key={`pr-${i}`} space="space.075" alignBlock="center">
              <Lozenge appearance={PR_APPEARANCE[r.status] || 'default'}>{nice(r.status)}</Lozenge>
              {r.url ? <Link href={r.url} openNewTab>{`${r.id} ${r.title}`}</Link> : <Text>{`${r.id} ${r.title}`}</Text>}
            </Inline>
          ))}
          {p.code.deployments.map((d, i) => (
            <Inline key={`dep-${i}`} space="space.075" alignBlock="center">
              <Lozenge appearance={DEPLOY_APPEARANCE[d.state] || 'default'}>{nice(d.state)}</Lozenge>
              <Text>{`${d.name} to ${d.environment || 'an environment'}`}</Text>
            </Inline>
          ))}
        </Stack>
      ) : (
        <Empty>No pull requests or deployments linked yet.</Empty>
      )}
    </Section>

    <Section title="Designs">
      {p.designs.length ? (
        <List type="unordered">
          {p.designs.map((d, i) => (
            <ListItem key={`design-${i}`}>
              {d.url ? <Link href={d.url} openNewTab>{d.name}</Link> : <Text>{d.name}</Text>}
            </ListItem>
          ))}
        </List>
      ) : (
        <Empty>No designs linked.</Empty>
      )}
    </Section>

    {p.graph?.used && !p.graph.ok && p.graph.note ? (
      <SectionMessage appearance="information" title="Some connected context is unavailable">
        <Text>{p.graph.note}</Text>
      </SectionMessage>
    ) : null}
  </Stack>
);

const AgentsTab = ({ p }) => (
  <Stack space="space.150">
    <Text>
      Paste this into any AI coding agent, or connect the agent to Context Pack over MCP so it can fetch the pack,
      check readiness and post progress back to Jira by itself.
    </Text>
    <CodeBlock language="markdown" text={p.markdown} showLineNumbers={false} />
    <Section title="Connect a coding agent (MCP)">
      <Text>
        MCP server address: <Strong>{MCP_URL}</Strong>
      </Text>
      <Text color="color.text.subtle">
        A site admin first turns on the Context Pack tools in Atlassian Administration, under Apps, Sites, your site,
        Connected apps. The agent then signs in with your Atlassian account and only sees what you can see.
      </Text>
    </Section>
  </Stack>
);

const App = () => {
  const [state, setState] = useState({ loading: true });

  // Ask the backend resolver for this work item's pack once, when the panel opens.
  useEffect(() => {
    invoke('getPack').then((result) => setState({ loading: false, ...result }));
  }, []);

  if (state.loading) return <Spinner label="Building the context pack" />;
  if (!state.ok) {
    return (
      <SectionMessage appearance="error" title="Context Pack could not load">
        <Text>{state.error}</Text>
      </SectionMessage>
    );
  }

  const p = state.pack;
  const r = p.readiness;

  return (
    <Stack space="space.200">
      <Stack space="space.075">
        <Inline space="space.100" alignBlock="center">
          <Lozenge appearance={r.ready ? 'success' : 'moved'} isBold>
            {r.ready ? 'Ready to start' : 'Needs work'}
          </Lozenge>
          <Text>
            Readiness <Strong>{r.score}%</Strong>
          </Text>
        </Inline>
        <ProgressBar value={r.score / 100} appearance={r.ready ? 'success' : 'default'} ariaLabel="Readiness" />
      </Stack>

      <Tabs id="context-pack-tabs">
        <TabList>
          <Tab>Readiness</Tab>
          <Tab>Context</Tab>
          <Tab>For AI agents</Tab>
        </TabList>
        <TabPanel>
          <Box paddingBlockStart="space.150">
            <ReadinessTab r={r} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlockStart="space.150">
            <ContextTab p={p} />
          </Box>
        </TabPanel>
        <TabPanel>
          <Box paddingBlockStart="space.150">
            <AgentsTab p={p} />
          </Box>
        </TabPanel>
      </Tabs>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
