# Context Pack

**Know a Jira work item is ready, then hand its full context to a person or an AI coding agent.**

AI coding agents are only as good as the context they get. A ticket that says "Make checkout faster" gives them nothing. The real context is spread across the work item, its links, a Confluence spec, decisions buried in comments, the goal it serves and the people who know the area. Context Pack gathers all of it in one place, checks it against a Definition of Ready, and serves it to every surface a team uses:

| Surface | What it does |
|---|---|
| **Jira issue panel** | Readiness score with a one-line fix per gap, plus a Context tab and a paste-ready handoff for agents |
| **Readiness board** (project page) | The top 25 open work items of the space's backlog, most ready first, with what each one is missing |
| **Definition of Ready** (project settings) | Project admins choose which checks apply, the minimum description length and how strict "ready" is |
| **Rovo agent "Context Pack"** | "Is this ready to start?", "Draft acceptance criteria", "Which items are ready?" |
| **Rovo skill `ready-for-dev`** | Reusable instructions that take a work item from "is it ready?" to a plan |
| **MCP server (`rovo:mcp`)** | The same four tools for Claude Code, Cursor and any MCP client, with the user's own Jira permissions |

## What goes into a pack

The pack covers the six kinds of context a team runs on:

- **Work**: summary, type, status, priority, owner, parent, linked work items and open blockers (Jira REST).
- **Knowledge**: linked Confluence spec pages, including their text, owner and last update (Teamwork Graph).
- **People**: the assignee, the reporter, and the spec owners and contributors to ask (Jira and Teamwork Graph).
- **Communication**: decisions and out-of-scope notes found in the comments.
- **Code**: pull requests and deployments linked to the work item (Teamwork Graph).
- **Assets**: designs linked to the work item (Teamwork Graph).
- **Goals**: the goal the work contributes to, which is the "why" an agent usually never sees (Teamwork Graph).

## Definition of Ready

Six explainable checks, with no black-box score:

1. Has a clear description (at least 20 words)
2. Has acceptance criteria (an "Acceptance criteria" section, or Given / When / Then lines)
3. Is estimated (story points or an original estimate)
4. Has an assignee
5. No open blockers (an "is blocked by" link to a work item that is not done)
6. Links a spec or design page (a Confluence remote link, or a wiki link in the description)

By default an item is **ready** when all checks pass, or when acceptance criteria and blockers pass and at most one other check fails. The score is the share of passed checks.

Project admins can change this per space under **Project settings → Context Pack**: switch checks off (for example estimates, for teams that do not estimate), set the minimum description length, or require every check to pass. The panel, the board, the Rovo agent and the MCP tools all use the same settings.

## Tools (Rovo actions, also exposed over MCP)

| Tool | Verb | Inputs | Returns |
|---|---|---|---|
| `get-context-pack` | GET | `issueKey` (optional on a work item) | readiness summary + the full pack as markdown |
| `check-readiness` | GET | `issueKey` (optional on a work item) | score, ready flag, every check with its fix |
| `list-ready-items` | GET | `projectKey`, `limit` (max 25) | open items, most ready first, with their gaps |
| `post-progress` | CREATE | `issueKey`, `message` | adds a "Progress update" comment |

Some MCP clients show the tools with the app environment appended, for example `check-readiness_production`.

## How it is built

- **Forge** app, Runs on Atlassian (no egress, no external services, no paid AI). Node 24 runtime, UI Kit only.
- Every Jira call runs **as the current user** (`asUser`), so nobody sees anything they could not open in Jira.
- **Teamwork Graph**: curated queries (`jiraWorkItemGoals`, `jiraWorkItemLinkedExternalPullRequests`, `jiraWorkItemLinkedExternalDeployments`, `jiraWorkItemLinkedExternalDesigns`, `confluencePageOwners`, `confluencePageContributors`) plus one persisted Cypher query that returns a spec page by its ARI:
  ```cypher
  MATCH (page:ConfluencePage {ari: $pageId}) RETURN page
  ```
  Graph calls are fail-soft: if the graph is unavailable, the pack is still built from Jira data and says what is missing.
- Per-project settings live in Forge Key-Value Storage (`storage:app`). Saving them requires the Jira "Administer projects" permission, checked as the current user.
- Pure rules (parsing, readiness, markdown) live in `src/lib/rules.js` and are unit-tested with Node's built-in test runner (`npm test`, 16 tests).

```
src/
  lib/rules.js            Definition of Ready, ADF parsing, markdown handoff (pure, tested)
  lib/contextPack.js      Jira REST reads and the pack builder
  lib/teamworkGraph.js    Teamwork Graph queries
  lib/settings.js         per-project Definition of Ready (Forge storage)
  actions.js              Rovo action / MCP tool handlers
  resolvers/              UI resolvers (panel and board)
  frontend/               UI Kit panel and readiness board
skills/ready-for-dev/     rovo:skill instructions
agent-skill/              the same workflow as an open skill for third-party agents
test/rules.test.mjs       unit tests
```

## Run it yourself

```bash
npm install
npm test                                  # unit tests
forge deploy -e development
forge install --site <your-site>.atlassian.net --product Jira -e development
```

To let a coding agent use the tools over MCP, a site admin opens **Atlassian Administration → your site → Connected apps → Context Pack → Details → Tools** and selects **Enable tools**. Then, for example in Claude Code:

```bash
claude mcp add --transport http context-pack https://mcp.atlassian.com/forge/e9f46537-efa3-4c85-99f5-9bec166d7368
```

Run `/mcp` to sign in with your Atlassian account and pick your site.

## Privacy and terms

Context Pack runs on Atlassian Forge, calls no external services and stores no personal data. See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md).

Questions and bug reports: [GitHub issues](https://github.com/kapilshipturtle/context-pack/issues).

## License

[MIT](LICENSE)
