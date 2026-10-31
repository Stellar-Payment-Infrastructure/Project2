# Security Policy

## Supported Versions

We provide security updates for the latest release of each package.

## Reporting a Vulnerability

Please report security vulnerabilities to **security@stellar-pay.example.com**.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes

We aim to acknowledge reports within 48 hours and provide a fix timeline within 5 business days.

## Security Practices

- All packages use testnet only — mainnet is never targeted in code/CI
- Secrets managed via `stellar keys` and gitignored `.env` files
- No secrets in logs (Pino redaction)
- Webhook signatures verified with HMAC-SHA256
- SSRF protection on all outbound HTTP
- Soroban transaction verification before submit
- Contract invariants enforced in code + tests

## Dependencies

- Dependabot enabled for all packages
- `cargo audit` and `pnpm audit` in CI
- Exact version pinning in lockfiles