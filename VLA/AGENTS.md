# Repository Instructions

## Project Goal

This repository hosts a public academic website for Hyunsik Min, including the VLA / GUIDANCE demo page.
Current VLA work focuses on updating the No-GUIDANCE vs GUIDANCE page to show final 150-trial controlled CARLA simulation comparison results for Ramp merge and Speed-gap stress.

## Data Accuracy Rules

- Never invent metrics.
- Use exact source-of-truth values provided in the task prompt.
- Preserve units and decimal precision.
- For min TTC, higher is better.
- For TTC risk ratios, collision trial rate, excessive acceleration/deceleration, and jerk, lower is better.

## Asset Rules

- Do not invent GIF/image filenames.
- Search asset directories before referencing an image.
- Do not create broken image links.
- If needed GIFs are missing, document them in `docs/missing_gif_assets.md`.

## Scientific Boundary

- This is controlled CARLA simulation diagnostic evidence.
- Do not claim real-world vehicle safety certification.
- Do not generalize to all driving scenarios.
- Always include a limitation/claim-boundary section.

## Implementation Rules

- Keep the site lightweight.
- Avoid new dependencies unless clearly justified.
- Preserve existing branding, footer, and author/contact information unless the task explicitly says otherwise.
- Make the page responsive and accessible.
- Add alt text for all meaningful images/GIFs.

## Testing / Checks

Agents should run available build, lint, and test commands discovered from `package.json`, `Makefile`, `README`, or docs.
At minimum, verify:

- Page builds or renders.
- No broken local asset paths.
- Exact metric values appear.
- Mobile layout is usable.

## Reports

Subagents should write short reports under `docs/codex_reports/`.
Do not overwrite another subagent's report.

## Safe Website Editing

- This repository is the dedicated VLA / GUIDANCE GitHub Pages project site served at `https://minun001.github.io/VLA/`.
- Treat the public landing page, assets, and any shared static CSS/JS as high-risk surfaces.
- Keep edits scoped to the requested VLA / GUIDANCE demo content. Do not change unrelated deployment or helper scripts unless explicitly asked.
- After implementation, always provide a changed-file list, diff summary, verification checklist, and rollback instructions.

## Codex + Claude Web Manual Review Workflow

- Never directly connect to Claude web, Claude Code, or the Anthropic API.
- Never ask for `ANTHROPIC_API_KEY` or any other Anthropic credential.
- Use `.ai-handoff/CLAUDE_REVIEW_BUNDLE.md` as the manual review bundle for Claude web.
- Treat Claude web as an external reviewer only. The user copies the bundle into Claude web manually.
- Codex should generate the Claude web review bundle automatically when asked.
- Never include secrets, API keys, private tokens, cookies, passwords, or credentials in the review bundle.
- Before generating the bundle, run or recommend running `python tools/check_diff_for_secrets.py`.
- After Claude review, apply only critical fixes unless the user explicitly approves optional improvements.
- Do not broaden scope while applying Claude feedback. Preserve the original task scope.
- Always include verification and rollback instructions after implementation.
