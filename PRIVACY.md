# Context Pack privacy policy

Last updated: 13 November 2026

Context Pack is a Forge app for Jira. This page explains what it reads, what it keeps and where it runs.

## What the app reads

When someone uses Context Pack (the Jira issue panel, the readiness board, the Rovo agent or the MCP tools), the app reads, **with that person's own Atlassian permissions**:

- the Jira work item, its comments, links and remote links;
- open work items in the project (readiness board and `list-ready-items` only);
- through Atlassian Teamwork Graph: goals the work item contributes to, linked pull requests, deployments and designs, and the text, owners and contributors of linked Confluence pages.

Nobody can see anything through Context Pack that they could not already open in Jira or Confluence.

## What the app stores

Only the **Definition of Ready settings** of each project: which readiness checks are switched on, the minimum description length and the ready rule. They are kept in Forge storage inside your own installation and contain no personal data. Uninstalling the app removes them.

Context Pack does not copy, cache or keep work items, comments, page text or user information. Packs are built on request and returned to the person who asked.

## What the app writes

Only when a person (or a coding agent acting for that person) explicitly calls the `post-progress` tool, the app adds one comment to the named work item as that person.

## Where it runs

Context Pack runs on Atlassian Forge and qualifies for **Runs on Atlassian**: it calls no external services, sends no data outside Atlassian and uses no third-party analytics. AI answers in Rovo chat come from Atlassian Rovo; coding agents connected over MCP are chosen and authorised by your own users and site admins.

## Logs

Forge keeps error logs for the app. They may contain work item keys or error messages. Site admins can switch off log sharing with the developer in Atlassian Administration under Connected apps.

## Contact

Questions or requests: open an issue at https://github.com/kapilshipturtle/context-pack/issues
