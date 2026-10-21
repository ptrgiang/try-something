# Security Policy

Try Something hosts user-generated content, so we take security reports seriously.

## Reporting a vulnerability

**Please don't open public issues for security problems.** Use GitHub's private reporting: **Security → Report a vulnerability** on this repository.

Include what you found, steps to reproduce, and the impact. We aim to acknowledge reports within 3 days.

Please do not test against other users' accounts or data, run automated scanners against production at high volume, or attempt denial of service.

## Scope

In scope: the code in this repository and the production site at `trysometh.ing` — e.g. authentication/session issues, privilege escalation, XSS/HTML injection, SSRF through URL metadata fetching, CSRF, data leaks.

Out of scope: third-party sites listed on Try Something, Cloudflare platform issues (report to Cloudflare), and social engineering.

## Supported versions

Only the latest `main` branch / production deployment is supported.
