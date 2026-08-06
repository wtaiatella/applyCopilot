-- Audit Remediation (011) — application_event_previous_outcome (REM-4)
--
-- Purely additive nullable column — zero-downtime, safe to deploy independently. undoTransition
-- simply has nothing to restore from for events created before this migration (falls back to
-- today's existing `null` behavior for historical events, a strict improvement, never worse).
ALTER TABLE "ApplicationEvent" ADD COLUMN "previousOutcome" "ApplicationOutcome";
