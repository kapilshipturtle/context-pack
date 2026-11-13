/*
 * Readiness board (Jira project page, UI Kit).
 * Answers the sprint-planning question "which open work items are ready for development,
 * and what is missing on the others?" using the same checks as the issue panel,
 * the Rovo agent and the MCP tools.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  DonutChart,
  DynamicTable,
  Heading,
  Inline,
  Link,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const [state, setState] = useState({ loading: true });

  const load = () => {
    setState({ loading: true });
    invoke('getBoard').then((result) => setState({ loading: false, ...result }));
  };
  useEffect(load, []);

  if (state.loading) return <Spinner label="Checking open work items" />;
  if (!state.ok) {
    return (
      <SectionMessage appearance="error" title="The readiness board could not load">
        <Text>{state.error}</Text>
      </SectionMessage>
    );
  }

  const items = state.items || [];
  const ready = items.filter((i) => i.ready).length;
  const notReady = items.length - ready;

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="medium">Which work items are ready for development?</Heading>
        <Text>
          Context Pack checks every open work item in {state.projectKey} for a clear description, acceptance criteria,
          an estimate, an owner, open blockers and a linked spec. Fix the gaps before the sprint, or before you hand an
          item to a coding agent.
        </Text>
      </Stack>

      {items.length === 0 ? (
        <SectionMessage appearance="information" title="No open work items">
          <Text>There are no open work items in this space yet.</Text>
        </SectionMessage>
      ) : (
        <>
          <Inline space="space.400" alignBlock="center" shouldWrap>
            <Box>
              <DonutChart
                data={[
                  { type: 'Ready', label: 'Ready to start', value: ready },
                  { type: 'Needs work', label: 'Needs work', value: notReady },
                ]}
                colorAccessor="type"
                labelAccessor="label"
                valueAccessor="value"
                height={300}
                width={300}
                innerRadius={62}
                outerRadius={100}
                colorPalette={[
                  { key: 'Ready', value: '#22A06B' },
                  { key: 'Needs work', value: '#E2B203' },
                ]}
                hideMenu
              />
            </Box>
            <Stack space="space.100">
              <Text>
                <Strong>{ready}</Strong> of {items.length} open work items are ready to start.
              </Text>
              <Text>
                <Strong>{notReady}</Strong> need work before anyone, person or agent, picks them up.
              </Text>
              <Box>
                <Button onClick={load}>Check again</Button>
              </Box>
            </Stack>
          </Inline>

          <DynamicTable
            head={{
              cells: [
                { key: 'item', content: 'Work item', width: 34 },
                { key: 'state', content: 'Readiness', width: 16 },
                { key: 'owner', content: 'Owner', width: 14 },
                { key: 'missing', content: 'What is missing', width: 36 },
              ],
            }}
            rows={items.map((i) => ({
              key: i.key,
              cells: [
                { key: 'item', content: i.url ? <Link href={i.url} openNewTab>{`${i.key}: ${i.summary}`}</Link> : `${i.key}: ${i.summary}` },
                {
                  key: 'state',
                  content: (
                    <Stack space="space.050">
                      <Lozenge appearance={i.ready ? 'success' : 'moved'}>{i.ready ? 'Ready' : `${i.score}%`}</Lozenge>
                      <ProgressBar value={i.score / 100} appearance={i.ready ? 'success' : 'default'} ariaLabel={`Readiness of ${i.key}`} />
                    </Stack>
                  ),
                },
                { key: 'owner', content: i.assignee || 'Unassigned' },
                {
                  key: 'missing',
                  content: i.gaps?.length ? (
                    <Inline space="space.050" shouldWrap>
                      {i.gaps.map((g) => (
                        <Lozenge key={`${i.key}-${g}`} appearance="removed">{g}</Lozenge>
                      ))}
                    </Inline>
                  ) : (
                    <Text>Nothing</Text>
                  ),
                },
              ],
            }))}
          />
          <Text color="color.text.subtlest">Showing up to 25 open work items, most ready first.</Text>
        </>
      )}
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
