# Contributing to pdfrev

Thank you for your interest in contributing to **pdfrev**! We welcome contributions from the community to help make pdfrev the best local-first PDF reader, editor, and drawing takeoff application.

---

## 1. Core Principles

- **Local-First & Fearless:** All documents and calculations stay on the user's machine. Zero external analytics or telemetry.
- **Strict Quality Gates:** Every pull request must pass the automated quality gate (`node scripts/verify.mjs`), which includes unit tests, parity audits, TypeScript compilation, bundle size checks, and Rust native tests.
- **TDD (Test-Driven Development):** Write failing regression tests before implementing fixes or new capabilities.
- **Zero Secrets / Zero PII:** Never commit local file paths, personal usernames, API keys, or proprietary tokens.

---

## 2. Development Setup

### Prerequisites

- **Node.js:** v20.x or v22.x LTS (with `npm` and `npx`)
- **Rust:** v1.85+ or v1.90+ (with Cargo)
- **Windows:** Windows 10/11 x64 with WebView2 Runtime installed
- **Visual Studio Build Tools:** C++ build tools installed for native Windows compilation

### Initial Setup

```powershell
# Clone the repository
git clone https://github.com/jacobavina/pdfrev.git
cd pdfrev

# Install frontend dependencies
npm install

# Verify that all tests pass
node scripts/verify.mjs
```

---

## 3. Running the Project

### Frontend Development Server
```powershell
npm run dev
```

### Desktop Application (Tauri Debug)
```powershell
npx tauri dev
```

### Headless CLI for AI Agents
```powershell
cargo run --bin pdfrev-cli -- --help
```

---

## 4. Verification & Testing

Before submitting a Pull Request, verify that your changes pass all quality gates:

```powershell
# Run the complete test suite and quality gates
node scripts/verify.mjs

# Run native smoke build test
npm run test:native:build
```

---

## 5. Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add polygon cutout area subtraction`
- `fix: resolve coordinate transform in rotated pages`
- `perf: optimize markups hit-testing on dense blueprints`
- `docs: update AI agent CLI usage examples`
- `test: add regression test for incremental PDF save`
- `chore: update dependencies`

---

## 6. Submitting a Pull Request

1. Fork the repository and create a branch from `master`.
2. Follow TDD: add test cases verifying your changes.
3. Verify that `node scripts/verify.mjs` exits with code 0.
4. Push your branch and open a Pull Request with a clear description of changes and test evidence.
