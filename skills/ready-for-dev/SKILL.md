---
name: ready-for-dev
description: Use when someone wants to start, plan, estimate or hand off a Jira work item to a developer or an AI coding agent. Checks the work item against the Definition of Ready, explains each gap with its fix, and when it is ready, turns its full context (goal, acceptance criteria, specs, decisions, people, code) into a plan.
allowed-tools: check-readiness get-context-pack list-ready-items post-progress
metadata:
  app: Context Pack
---

# Ready for development

Help a team start the right work with the right context. Never start, plan or hand off work that is not ready without saying so.

## 1. Check readiness first

Call `check-readiness` with the work item key. If the user is looking at a work item and gave no key, call it without a key.

- If the item is **not ready**, report the readiness score and list every missing check with its fix, one line each. Then offer help that fits the gaps:
  - missing acceptance criteria: offer to draft three to six testable criteria in Given / When / Then form, based only on the description, linked work items and decisions. Label them "Draft, please confirm".
  - open blockers: name the blocking work item keys and their status.
  - missing spec: ask which Confluence page explains the change.
  Stop there. Do not write a plan for an item that is not ready unless the user insists, and then mark every assumption.
- If the item **is ready**, continue with step 2.

## 2. Get the full context

Call `get-context-pack`. Use only facts from the pack. Present, in this order:

1. **Goal**: one sentence on what changes for the user, and which goal it serves if one is linked.
2. **Acceptance criteria**: as written, numbered.
3. **Constraints**: decisions from comments and anything marked out of scope.
4. **Knowledge**: the spec pages and the key points from their text.
5. **People to ask**: the spec owner and the assignee.
6. **Existing code**: linked pull requests and deployments, if any.

## 3. Turn it into a plan

Map every acceptance criterion to at least one task and one test. Flag any criterion that the spec or decisions contradict. Keep the plan short enough to read in a minute.

## 4. Report progress only when asked

Call `post-progress` only when the user explicitly asks to post an update. Show the exact text first and post it only after they confirm.

## Picking the next item

When someone asks what to work on next, call `list-ready-items` with the project key and suggest the most ready items first, with what each one is missing.
