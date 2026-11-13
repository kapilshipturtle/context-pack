---
name: jira-context-pack
description: Use before starting, planning or coding any Jira work item (keys like PLAT-123). Checks the item against the Definition of Ready through the Context Pack MCP tools, refuses to guess when it is not ready, and when it is ready, pulls the goal, acceptance criteria, spec text, decisions, people and linked code into the plan, then reports progress back to Jira on request.
license: MIT
---

# Jira Context Pack

Use the Context Pack MCP server (`https://mcp.atlassian.com/forge/e9f46537-efa3-4c85-99f5-9bec166d7368`) whenever the user mentions a Jira work item key or asks you to work on a ticket. It gives you, in one call, the context that usually sits in five places: the work item, its links, the Confluence spec, decisions in comments and the goal it serves.

Tool names below are the Context Pack tools. Some MCP clients show them with the app environment appended, for example `check-readiness_development`; they are the same tools.

## Workflow

1. **Check readiness first.** Call `check-readiness` with the work item key.
   - Not ready: tell the user the score and each missing check with its fix. Do not start coding. Offer to draft acceptance criteria (Given / When / Then, based only on the item's description, links and decisions) and label them as a draft for the team.
   - Ready: continue.
2. **Get the pack.** Call `get-context-pack`. Read the markdown in full. Treat these sections as requirements:
   - *Acceptance criteria*: every one must be met and tested.
   - *Decisions from comments*: constraints. Never contradict them without asking.
   - *Specs and design pages*: the spec text. Quote the parts you rely on.
   - *Why it matters*: the goal. Use it to choose between trade-offs.
   - *People to ask*: name them when something is unclear instead of guessing.
   - *Code already linked*: open pull requests or deployments. Check them before writing new code.
3. **Plan.** Map each acceptance criterion to the code change and the test that proves it. Show the plan before editing files.
4. **Build and test** as usual.
5. **Report back only when asked.** If the user asks you to update the ticket, call `post-progress` with a short summary: what changed, which criteria are covered by tests, and anything left open. Show the text first.

## Choosing what to work on

When the user asks what to pick up next, call `list-ready-items` with the project key and suggest the most ready items, with what each one is missing.

## Rules

- Never invent requirements that are not in the pack.
- Never post to Jira without the user's explicit request.
- The tools run with the signed-in user's Jira permissions; if a call fails with a permission error, say so instead of retrying with a different key.
