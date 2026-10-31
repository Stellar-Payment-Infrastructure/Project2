# Contributing

Thank you for contributing to Stellar Payment Infrastructure!

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run verification: `./scripts/verify-all.sh`
5. Commit with Conventional Commits: `feat(core): add reclaim delay config`
6. Push and open a Pull Request

## Commit Format

We use Conventional Commits with package scope:

```
feat(core): add reclaim_delay to initialize
fix(api): handle webhook timeout correctly
feat(frontend): add PaymentStatusTracker component
docs(analytics): update METRICS.md formulas
```

Scopes: `core`, `api`, `frontend`, `analytics`, `root`

## Code Standards

- **Rust:** `cargo fmt`, `cargo clippy -D warnings`, no `unwrap()` in contract code
- **TypeScript:** `strict: true`, no `any`, Zod validation for all external inputs
- **Tests:** Every public function/route has happy path + failure path
- **Money:** Integer base units (`i128`/`bigint`), decimal strings in JSON

## Security

- Never commit secrets, keys, or mnemonics
- Use `stellar keys` for testnet identities
- Testnet only — never target mainnet
- Report vulnerabilities to security@stellar-pay.example.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.