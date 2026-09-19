# AgentDelta

A machine-first, pay-per-use freshness checker for AI agents.

## What it does

`GET /v1/check?url=<PUBLIC_HTTPS_URL>&known=<OPTIONAL_SHA256>`

AgentDelta fetches a public HTTPS page, removes common HTML noise, normalizes the visible text and returns a SHA-256 fingerprint. If an agent sends a previous fingerprint in `known`, the response says whether the page changed.

The paid endpoint uses **x402 v2**. No user account or API key is required.

## Current test configuration

- Price: **$0.001**
- Network: **Base Sepolia testnet** (`eip155:84532`)
- Recipient: `0x61811D96F79c0719271DACD8A5483ac878EcD67C`
- Facilitator: `https://x402.org/facilitator`

Testnet payments are not revenue. We only count success after a real third-party Base-mainnet USDC settlement reaches the recipient wallet.

## Free discovery

- `/`
- `/health`
- `/demo`
- `/llms.txt`
- `/openapi.json`

## Deploy

This project targets Cloudflare Workers.

```bash
npm install
npm run typecheck
npm run deploy
```

Do **not** add a seed phrase or private key. A resource server only needs the public receiving address.
