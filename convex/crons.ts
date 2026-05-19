import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily-health-checks",
  { hourUTC: 1, minuteUTC: 0 },
  internal.alertsInternal.runDailyChecks,
);

crons.weekly(
  "weekly-ai-analysis",
  { dayOfWeek: "monday", hourUTC: 3, minuteUTC: 30 },
  internal.aiAnalysis.triggerWeeklyAnalysis,
);

// Sub-project B — nightly rebuild of the entity graph cache.
crons.daily(
  "entity-graph-rebuild",
  { hourUTC: 1, minuteUTC: 30 },
  internal.aiEntities.rebuildAll,
);

// Sub-project C — proactive autonomy.
// Hourly threshold scan (budget, silence, flat-line deliverables).
crons.interval(
  "proactive-threshold-scan",
  { hours: 1 },
  internal.aiProactive.scanThresholds,
);
// Daily scheduled-event scan (due-date approach, period close, cadence).
crons.daily(
  "proactive-schedule-scan",
  { hourUTC: 2, minuteUTC: 0 },
  internal.aiProactive.scanSchedules,
);

export default crons;
