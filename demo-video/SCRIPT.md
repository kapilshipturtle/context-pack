# Context Pack: demo video script (narration, Kokoro am_michael, speed 1.0)

s1-hook: AI coding agents can build a feature in minutes. But hand one a ticket that says "make checkout faster", and it will guess. The real context lives somewhere else: a spec in Confluence, decisions buried in comments, the goal behind the work, and the people who know the code.

s2-intro: Context Pack is a Forge app that checks whether a Jira work item is ready to start, then hands its full context to people and to AI agents. In Jira, in Rovo, and over M C P.

s3-weak: Here's that checkout ticket. Context Pack scores it seventeen percent, and every gap comes with a fix: a six word description, no acceptance criteria, no estimate, no spec, and an open blocker.

s4-ready: Now a story that's ready. All six checks pass, and the Context tab pulls together six kinds of context. Why it matters: the goal it contributes to, read from Teamwork Graph. The acceptance criteria. Linked work and blockers. The spec itself, its text and its owner, fetched with a persisted Teamwork Graph query. Decisions found in the comments. And the people to ask. The For AI Agents tab turns all of it into one handoff, plus the M C P address.

s5-board: For sprint planning, the readiness board checks every open item in the space, most ready first, with each gap tagged. And every team decides what ready means. Project admins switch checks on or off, so a team that doesn't estimate is never marked down for it.

s6-rovo: In Rovo, the Context Pack agent uses the same actions and a reusable skill. Ask whether this ticket is ready, and it explains every gap without inventing anything. Ask what's ready across the project, and it ranks the backlog.

s7-mcp: Now the part that changes how teams ship. The same four tools are exposed through the Atlassian M C P server, so any M C P client can use them, with the user's own permissions. We point a coding agent at the checkout ticket. It checks readiness first, and refuses to guess. On the ready story, it pulls the context pack, builds the retries exactly as the spec and the decisions say, and writes a test for every acceptance criterion. All eight pass. It even catches that the spec and the code disagree on a decline code, because it read the spec, not just a link. Then it posts its progress back to Jira, where the whole team can see it.

s8-arch: Under the hood, it's one Forge app that runs on Atlassian, with no outside services. An issue panel, a project page and settings, Rovo actions, an agent and a skill, an M C P server, and Teamwork Graph queries. Every call is made as the user.

s9-close: Context Pack. Know it's ready, then hand over everything. Build with context, and ship with confidence.
