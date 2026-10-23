# 3-minute demo video script (record with OBS/Loom; upload to YouTube as unlisted or public)

**0:00–0:20: Problem.** Show an x402 settlement on Basescan (tx 0x91575d9f…e47b).
"AI agents now pay for APIs in USDC: thousands of 2-cent purchases a day. There's no invoice, no terms, no fiat value and no VAT treatment. That is unusable for accounts, audits or disputes."

**0:20–0:40: What it is.** Show the README diagram.
"AgentReceipts turns each agent payment into an evidence-grade receipt. It records the parties, the hash-pinned terms, the USD value from the Chainlink USDC/USD round in effect at the settlement block, and indicative UK/EU VAT treatment. Anyone can verify it."

**0:40–1:30: Live demo (UI at localhost:8787).**
1. Paste the tx hash and seller details. Set buyer country DE, business = yes. Click **Issue receipt**.
2. Open the printable receipt and point out:
   - payer and payee taken from the on-chain Transfer log;
   - Chainlink round ID and rate;
   - reverse-charge treatment;
   - terms hash;
   - receipt hash.
3. Click **Verify** and show all checks green, including oracle_round ("was the latest round at settlement time").

**1:30–2:00: Tamper.** Click **Tamper amount + verify**: amount and hash fail.
In the terminal, run `npm run demo`. It shows that even if the attacker recomputes the hash, `amount` still fails, because the truth is re-derived from Base.

**2:00–2:30: Chainlink on-chain.**
- Show `ReceiptRegistry.sol` `anchor()`: it reads `latestRoundData` and rejects stale or invalid rounds.
- Show that it enforces one live receipt per settlement.
- Run `npm run test:contracts` (7 pass) and `npm run test:fork` (live Base Chainlink feed passes).

**2:30–3:00: Legal design and next steps.**
- Show `terms/agent-terms-v1.txt`: contract formed at settlement, agency clause, records clause.
- Next steps: the x402 `onAfterSettle` plug-in for sellers, ERC-8004 buyer identity, CCIP cross-chain receipts, and an accountant CSV export.
- "Built with AI assistance; all code open-source (MIT)."
