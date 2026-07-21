# Final Acceptance Checklist

## Operator-reported production acceptance before Phase 6
- [x] Phases 1-5 and migrations 001-011 reported applied and working by repository owner.

## Local Ollama acceptance
- [ ] Apply migration 012 to Supabase.
- [ ] Configure `.env.local` with local Ollama values.
- [ ] Run `npm run ai:smoke` against a real installed model.
- [ ] Exercise all six AI workflows and explicit approvals in an owned project.

## Production Vercel acceptance
- [ ] Deploy with AI disabled unless a secured reachable HTTPS provider exists.
- [ ] Confirm AI Workspace shows disabled/configuration-required/unreachable honestly.
- [ ] Re-run auth, projects, workspace, CTI, graph, reports, exports, and storage journeys.
