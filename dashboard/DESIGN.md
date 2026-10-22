# Dashboard direction

Purpose: make a public mint's lifecycle and fee evidence readable, without implying safety or claimability.

Palette: field gray #f1f4f1, white #ffffff, deep green #20372e, action green #2d604b, pale mint #e5eee8, warning amber #88621e. This extends Positano's existing green identity with a cooler functional workspace. System Segoe UI provides a quiet variable sans; monospaced type is limited to addresses and raw evidence.

Layout: a compact project header, a left inspector, and one ordered report surface. The lifecycle is a real curve-to-pool sequence, with only the observed current state emphasized. Fees use a clear split between per-mint counters and creator-wide vaults. Receipt analysis has its own tab.

```text
LaunchOps                            source / preview
Heading                                  network
[Launch overview] [Transaction receipt]
Mint inspector | source / download
               | lifecycle sequence
               | waiting fees / vault explanation
               | fee source table / next steps
               | expandable evidence
```

The first view is explicitly synthetic. Live requests clear stale results; uploaded snapshots remain unverified. No prices, token promotion, wallet-connect controls, or implied completed milestones. Responsive stacking preserves the accounting explanation and downloadable evidence.
