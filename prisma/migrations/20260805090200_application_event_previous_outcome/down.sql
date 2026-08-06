-- Down-migration (rollback) for application_event_previous_outcome (REM-4).
ALTER TABLE "ApplicationEvent" DROP COLUMN "previousOutcome";
