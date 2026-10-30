---
title:        "Vibe gets you code. Craft gets you software."
date:         2026-03-17 13:46:00
category:     Engineering
tags:         [ai-coding, craftsmanship, forge-cli]
linkedin_url: https://www.linkedin.com/in/pascr/recent-activity/all/
image:        /assets/social/vibe-gets-you-code-craft-gets-you-software.png
excerpt:      LLMs optimize for output, not for engineering discipline. Forge CLI is a small experiment in making that discipline non-negotiable.
---

Vibecoding is fun. Shipping production software is something else.

I built [Forge CLI](https://github.com/redgreenlabs/forge-cli) as a pet project after running into the same pattern again and again: LLMs optimize for output, not for engineering discipline.

Most tools I tested produced plausible-looking code with no tests, no structure, no security awareness and no real version control hygiene. Just code that "works", until it doesn't.

So I built a small experiment to make software engineering discipline non-negotiable. Forge is an autonomous development orchestrator that tries to bring craftsmanship back into the loop:

- Tests before code. Red, green, refactor, enforced rather than suggested.
- Security checks on every iteration: secrets, security issues, dependencies.
- A clean git history, with a conventional commit per TDD phase.
- Six specialized agents, Architect, Implementer, Tester, Reviewer, Security and Documenter, assigned automatically.
- A circuit breaker that stops when things go nowhere instead of burning tokens.

Vibe gets you code. Craft gets you software.

If you're using Claude Code and want more than vibes, give it a try. Three commands and you're running: the docs and the repository are at [github.com/redgreenlabs/forge-cli](https://github.com/redgreenlabs/forge-cli).
