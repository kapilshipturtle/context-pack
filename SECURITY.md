# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue: open this repository's **Security** tab and select **Report a vulnerability**. Only the maintainer can see the report.

## How Context Pack protects your data

- **Runs on Atlassian.** Context Pack is a Forge app. It calls no external services, has no remote back end and sends no data outside Atlassian.
- **The user's own permissions.** Every Jira and Teamwork Graph call is made as the current user (`asUser()`), so nobody sees anything through the app that they could not already open in Jira or Confluence.
- **Admin-only settings.** Saving a project's Definition of Ready also checks the user's "Administer projects" permission on the server.
- **No secrets.** The app never asks for API tokens, personal access tokens, passwords or other shared secrets. MCP clients sign in with Atlassian OAuth, and a site admin must enable the MCP tools first.
- **Minimal storage.** The only stored data is each project's Definition of Ready settings, kept in Forge hosted storage. See [PRIVACY.md](PRIVACY.md).

## Supported versions

Only the current production version of the Forge app gets security fixes. A fix that needs no new permissions reaches every installation automatically when it is deployed.
