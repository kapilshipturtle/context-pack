# Context Pack demo video (source)

The submission video, built with [HyperFrames](https://hyperframes.heygen.com) (HTML + GSAP, rendered to MP4).

- `assets/footage/`: real screen recordings of Context Pack running on a Jira Cloud site (production install).
- `compositions/`: one HTML scene per part of the story; `index.html` places them on the timeline with the voiceover.
- `assets/vo/`: narration generated with the open-weights Kokoro-82M model (voice am_michael); script in `SCRIPT.md`.
- The coding-agent scene replays a real recorded run against the Context Pack MCP server, condensed for time.

Render: GitHub Actions workflow **Render demo video** (`.github/workflows/render-demo.yml`), or locally with `npx hyperframes@0.9.41 render`.
