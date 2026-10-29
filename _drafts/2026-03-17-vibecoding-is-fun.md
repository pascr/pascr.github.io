---
layout:       post
title:        "Vibecoding is fun"
date:         2026-03-17 13:46:00
category:     Leadership
author:       pascr
tags:         
linkedin_url: 
imported:     linkedin-post
draft:        true
---
Vibecoding is fun. Shipping production software is something else.

I built Forge CLI as a pet project after running into the same pattern again and again: LLMs optimize for output, not for engineering discipline.

Most tools I tested produced plausible-looking code with:
No tests. No structure. No security awareness. No real version control hygiene. Just code that "works"... until it doesn't.

So I built a small experiment to make software engineering discipline non-negotiable.

Forge is an autonomous dev orchestrator that tries to bring craftsmanship back into the loop:
- Tests before code. Red-Green-Refactor enforced, not suggested
- Security checks on every iteration (secrets, security issues, dependencies)
- Clean git history with conventional commits per TDD phase
- 6 specialized agents (Architect, Implementer, Tester, Reviewer, Security, Documenter) assigned automatically
- Circuit breaker that stops when things go nowhere instead of burning tokens

Vibe gets you code. Craft gets you software.

If you're using Claude Code and want more than vibes, give it a try. 
Three commands and you're running. Docs and repo in the comments.
