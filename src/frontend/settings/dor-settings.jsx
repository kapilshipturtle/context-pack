/*
 * Definition of Ready settings (Jira project settings page, UI Kit).
 * Project admins choose which readiness checks this project uses, the minimum description
 * length, and how strict "ready" is. The issue panel, the readiness board, the Rovo agent
 * and the MCP tools all read these settings, so every surface gives the same answer.
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Heading,
  Inline,
  Label,
  RadioGroup,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
  Textfield,
  Toggle,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const CHECKS = [
  { id: 'description', label: 'Has a clear description', help: 'The description has at least the minimum number of words below.' },
  { id: 'criteria', label: 'Has acceptance criteria', help: 'An "Acceptance criteria" section, or Given / When / Then lines.' },
  { id: 'estimate', label: 'Is estimated', help: 'Story points or an original estimate. Turn off if your team does not estimate.' },
  { id: 'owner', label: 'Has an assignee', help: 'Someone owns the work item before it starts.' },
  { id: 'blockers', label: 'No open blockers', help: 'No "is blocked by" link to a work item that is not done.' },
  { id: 'spec', label: 'Links a spec or design page', help: 'A linked Confluence page that explains the change.' },
];

const numberFieldStyle = xcss({ maxWidth: '120px' });

const RULES = [
  { name: 'readyRule', value: 'one-gap', label: 'Allow one gap: ready when acceptance criteria and blockers pass and at most one other check fails' },
  { name: 'readyRule', value: 'all', label: 'Strict: ready only when every check passes' },
];

const App = () => {
  const [state, setState] = useState({ loading: true });
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState(null);

  const apply = (result) => {
    setState({ loading: false, ...result });
    if (result.ok) setDraft(result.settings);
  };

  useEffect(() => {
    invoke('getSettings').then(apply);
  }, []);

  if (state.loading || (state.ok && !draft)) return <Spinner label="Loading the Definition of Ready" />;
  if (!state.ok) {
    return (
      <SectionMessage appearance="error" title="Settings could not load">
        <Text>{state.error}</Text>
      </SectionMessage>
    );
  }

  const canEdit = state.canEdit;
  const setCheck = (id, on) => setDraft({ ...draft, checks: { ...draft.checks, [id]: on } });
  const save = (reset = false) => {
    setMessage(null);
    invoke('saveSettings', reset ? { reset: true } : { settings: draft }).then((result) => {
      if (result.ok) {
        apply(result);
        setMessage({ appearance: 'success', text: reset ? 'Back to the default Definition of Ready.' : 'Saved. Every Context Pack surface in this space now uses these rules.' });
      } else {
        setMessage({ appearance: 'error', text: result.error });
      }
    });
  };

  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="medium">Definition of Ready for {state.projectKey}</Heading>
        <Text>
          Choose what "ready to start" means in this space. The issue panel, the readiness board, the Rovo agent and
          coding agents connected over MCP all use these rules.
        </Text>
        {!canEdit ? (
          <SectionMessage appearance="information" title="Read only">
            <Text>Only project admins can change these settings.</Text>
          </SectionMessage>
        ) : null}
      </Stack>

      <Stack space="space.200">
        <Heading size="small">Checks</Heading>
        {CHECKS.map((c) => (
          <Inline key={c.id} space="space.150" alignBlock="start">
            <Toggle
              id={`check-${c.id}`}
              label={c.label}
              isChecked={Boolean(draft.checks[c.id])}
              isDisabled={!canEdit}
              onChange={(event) => setCheck(c.id, Boolean(event.target.checked))}
            />
            <Stack space="space.025">
              <Strong>{c.label}</Strong>
              <Text color="color.text.subtle">{c.help}</Text>
            </Stack>
          </Inline>
        ))}
      </Stack>

      <Stack space="space.100">
        <Label labelFor="min-words">Minimum words in a clear description</Label>
        <Box xcss={numberFieldStyle}>
          <Textfield
            id="min-words"
            name="minDescriptionWords"
            type="number"
            min={5}
            max={200}
            value={String(draft.minDescriptionWords)}
            isDisabled={!canEdit || !draft.checks.description}
            onChange={(event) => setDraft({ ...draft, minDescriptionWords: event.target.value })}
          />
        </Box>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">When is a work item ready?</Heading>
        <RadioGroup
          name="readyRule"
          options={RULES}
          value={draft.readyRule}
          isDisabled={!canEdit}
          onChange={(event) => setDraft({ ...draft, readyRule: event.target.value })}
        />
      </Stack>

      {message ? (
        <SectionMessage appearance={message.appearance}>
          <Text>{message.text}</Text>
        </SectionMessage>
      ) : null}

      {canEdit ? (
        <ButtonGroup label="Save settings">
          <Button appearance="primary" onClick={() => save(false)}>
            Save
          </Button>
          <Button appearance="subtle" onClick={() => save(true)}>
            Reset to defaults
          </Button>
        </ButtonGroup>
      ) : null}
      <Text color="color.text.subtlest">
        {state.settings.customised ? 'This space uses its own Definition of Ready.' : 'This space uses the default Definition of Ready.'}
      </Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
