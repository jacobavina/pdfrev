# Security Policy

## Supported Versions

Security fixes and updates are applied to the active major release:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

---

## Reporting a Vulnerability

The **pdfrev** team takes software security seriously. Because pdfrev is a local-first application processing potentially sensitive architectural plans and legal documents, memory safety and sandbox isolation are top priorities.

If you believe you have discovered a vulnerability in pdfrev:

1. **Do not create a public GitHub issue.**
2. Submit a private report via **GitHub Private Vulnerability Reporting**:
   👉 [https://github.com/jacobavina/pdfrev/security/advisories/new](https://github.com/jacobavina/pdfrev/security/advisories/new)
   Or directly email the maintainer at `jacobavin@proton.me` with:
   - Description of the issue and affected components.
   - Minimal reproduction steps or sample PDF file demonstrating the issue.
   - Any proposed remediation or patches.
3. You will receive an initial response within 48 hours.
4. Once verified, a fix will be published promptly in an updated release with full security advisory attribution.

---

## Binary Integrity & Code Signing

Official releases of `pdfrev` are built deterministically via GitHub Actions workflows and published with a cryptographic `SHA256SUMS.txt` checksum file.

To verify a downloaded installer or portable zip against tampering:

```powershell
Get-FileHash -Algorithm SHA256 .\pdfrev_0.1.0_x64-setup.exe
```

Compare the resulting hash with the corresponding entry in `SHA256SUMS.txt` published on GitHub Releases.

Because `pdfrev` is an independent open-source initiative without a commercial EV/OV code-signing certificate, Windows SmartScreen may present an *"Unknown Publisher"* warning. You can safely proceed by clicking **"More info" → "Run anyway"** once you have verified the SHA-256 hash.
