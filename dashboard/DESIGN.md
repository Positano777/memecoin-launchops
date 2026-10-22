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

Next milestone: preserve the approved logo, palette and layout. Add a third launch-plan tab with a form on the left and findings on the right; warnings remain visible even when supported checks pass. Add an expandable snapshot guide under the existing inspector so provider setup stays outside the normal browser flow.

Launch map direction: keep the approved logo and green/gray palette. One prominent SVG relationship map connects the token to fee-payer gain observations using dashed, undirected lines. These lines encode evidence association, never funding/transfer edges. A selected wallet has its address and source transactions in the adjacent panel. The lower table handles all supplied evidence; the map limits visible nodes. A separate supplied fee-payer outflow list has explicit upstream-heuristic labels. No invented timeline, current-holding claim or risk score. Branded PNG cards retain source/coverage/limits.
