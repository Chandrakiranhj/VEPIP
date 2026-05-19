"use client";

// ---------------------------------------------------------------------------
// SlidePreviewGrid — CSS/HTML representation of the 9 PPTX slides
// NOT a rendered PPTX: styled React cards mimicking slide content at 16:9
// ---------------------------------------------------------------------------

const DARK_BG = "#2A1508";
const GOLD = "#C49A32";
const LIGHT_GOLD = "#EDD98A";
const CREAM = "#F7F3EE";
const CREAM_BG = "#F7F3EE";

export interface SlidePreviewProps {
  project: {
    name: string;
    funderName: string;
    grantAmount: number;
    startDate: string;
    endDate: string;
    states: string[];
    summary?: string;
    deliverables?: Array<{
      title: string;
      target?: number;
      achieved?: number;
      unit?: string;
      status: string;
    }>;
    budgets?: Array<{
      name: string;
      approvedAmount: number;
      spentAmount: number;
    }>;
    activities?: Array<{
      title: string;
      activityDate?: string;
      state?: string;
      teachersReached?: number;
      studentsReached?: number;
    }>;
    gallery?: Array<{ url: string | null; caption?: string }>;
    testimonials?: Array<{ content: string; author: string; role?: string }>;
    funderLogoUrl?: string | null;
    approvedBudget?: number;
    spentBudget?: number;
    deliverablesDone?: number;
    deliverablesTotal?: number;
  };
  reportType: "quarterly" | "full";
  periodStart?: string;
  periodEnd?: string;
  draft?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  if (n >= 10_00_000) return `₹${(n / 10_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
}

function pct(num: number, den: number) {
  if (!den) return 0;
  return Math.round((num / den) * 100);
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// Slide number badge shown at bottom-left of every card
function SlideLabel({ n }: { n: number }) {
  return (
    <span
      style={{
        position: "absolute",
        bottom: 6,
        left: 8,
        background: "rgba(0,0,0,0.35)",
        color: "#fff",
        fontSize: 9,
        fontWeight: 700,
        borderRadius: 4,
        padding: "1px 5px",
        letterSpacing: "0.04em",
      }}
    >
      {n}
    </span>
  );
}

// Status badge for deliverables
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    completed: { bg: "#16a34a", color: "#fff", label: "Done" },
    in_progress: { bg: GOLD, color: DARK_BG, label: "In Progress" },
    overdue: { bg: "#dc2626", color: "#fff", label: "Overdue" },
    not_started: { bg: "#9ca3af", color: "#fff", label: "Not Started" },
  };
  const s = map[status] ?? map.not_started;
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontSize: 7,
        fontWeight: 700,
        borderRadius: 3,
        padding: "1px 4px",
        whiteSpace: "nowrap",
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {s.label}
    </span>
  );
}

// Wrapper for every slide card — enforces 16:9 and common chrome
function SlideCard({
  n,
  children,
  className = "",
}: {
  n: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg border shadow-md ${className}`}
      style={{ aspectRatio: "16/9", background: "#fff" }}
    >
      {children}
      <SlideLabel n={n} />
    </div>
  );
}

// Eyebrow label used in light-theme slides
function Eyebrow({ text }: { text: string }) {
  return (
    <div
      style={{
        fontSize: 7,
        fontWeight: 800,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: GOLD,
        marginBottom: 3,
      }}
    >
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slide 1 — Cover (dark)
// ---------------------------------------------------------------------------
function Slide1Cover({
  project,
  periodStart,
  periodEnd,
  reportType,
}: {
  project: SlidePreviewProps["project"];
  periodStart?: string;
  periodEnd?: string;
  reportType: string;
}) {
  const period =
    reportType === "quarterly" && periodStart && periodEnd
      ? `${periodStart} → ${periodEnd}`
      : `${project.startDate} → ${project.endDate}`;

  return (
    <SlideCard n={1}>
      <div style={{ display: "flex", height: "100%" }}>
        {/* Left — dark panel */}
        <div
          style={{
            width: "45%",
            background: DARK_BG,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 7,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: GOLD,
            }}
          >
            Funder Update
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: CREAM,
              lineHeight: 1.2,
            }}
          >
            {project.name}
          </div>
          <div style={{ fontSize: 7, color: LIGHT_GOLD, marginTop: 4 }}>
            {period}
          </div>
          {/* VE logo placeholder */}
          <div
            style={{
              marginTop: "auto",
              fontSize: 6,
              color: "rgba(255,255,255,0.35)",
              letterSpacing: "0.06em",
            }}
          >
            Vision Empower Trust
          </div>
        </div>

        {/* Right — white panel: funder */}
        <div
          style={{
            width: "55%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 12,
          }}
        >
          {project.funderLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.funderLogoUrl}
              alt={project.funderName}
              style={{ maxHeight: 40, maxWidth: "80%", objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: GOLD,
                textAlign: "center",
                lineHeight: 1.2,
              }}
            >
              {project.funderName}
            </div>
          )}
          <div style={{ fontSize: 7, color: "#6b7280" }}>Prepared for</div>
        </div>
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 2 — Project Overview (light)
// ---------------------------------------------------------------------------
function Slide2Overview({ project }: { project: SlidePreviewProps["project"] }) {
  return (
    <SlideCard n={2}>
      <div style={{ display: "flex", height: "100%" }}>
        {/* Gold left bar */}
        <div style={{ width: 4, background: GOLD, flexShrink: 0 }} />
        <div style={{ flex: 1, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          <Eyebrow text="Overview" />
          <div style={{ fontSize: 12, fontWeight: 800, color: DARK_BG, lineHeight: 1.2 }}>
            About This Project
          </div>
          {project.summary && (
            <div style={{ fontSize: 7.5, color: "#374151", lineHeight: 1.5, flex: 1 }}>
              {truncate(project.summary, 220)}
            </div>
          )}
          {/* Grant amount stat */}
          <div
            style={{
              marginTop: "auto",
              display: "inline-flex",
              alignItems: "baseline",
              gap: 4,
              background: CREAM_BG,
              borderRadius: 6,
              padding: "4px 8px",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 800, color: DARK_BG }}>
              {fmt(project.grantAmount)}
            </span>
            <span style={{ fontSize: 7, color: "#6b7280" }}>Grant Amount</span>
          </div>
        </div>
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 3 — Key Impact (light) — 2×2 stat grid
// ---------------------------------------------------------------------------
function Slide3Impact({ project }: { project: SlidePreviewProps["project"] }) {
  const delivPct = pct(project.deliverablesDone ?? 0, project.deliverablesTotal ?? 1);
  const budgPct = pct(project.spentBudget ?? 0, project.approvedBudget ?? 1);
  const teachers = (project.activities ?? []).reduce(
    (s, a) => s + (a.teachersReached ?? 0),
    0,
  );
  const students = (project.activities ?? []).reduce(
    (s, a) => s + (a.studentsReached ?? 0),
    0,
  );

  const stats = [
    { label: "Deliverables", value: `${delivPct}%`, sub: "complete" },
    { label: "Budget Used", value: `${budgPct}%`, sub: "of approved" },
    { label: "Teachers", value: teachers.toLocaleString(), sub: "reached" },
    { label: "Students", value: students.toLocaleString(), sub: "reached" },
  ];

  return (
    <SlideCard n={3}>
      <div style={{ height: "100%", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
        <Eyebrow text="Key Impact" />
        <div style={{ fontSize: 11, fontWeight: 800, color: DARK_BG, marginBottom: 4 }}>
          Results at a Glance
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            gap: 6,
            flex: 1,
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: CREAM_BG,
                borderRadius: 6,
                padding: "6px 8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 2,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 900, color: DARK_BG, lineHeight: 1 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 7, color: "#4b5563" }}>
                {s.label}
                <span style={{ color: "#9ca3af", marginLeft: 3 }}>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 4 — Deliverables (light) — mini table
// ---------------------------------------------------------------------------
function Slide4Deliverables({ project }: { project: SlidePreviewProps["project"] }) {
  const items = (project.deliverables ?? []).slice(0, 5);
  return (
    <SlideCard n={4}>
      <div style={{ height: "100%", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        <Eyebrow text="Deliverables" />
        <div style={{ fontSize: 11, fontWeight: 800, color: DARK_BG, marginBottom: 4 }}>
          Key Outputs
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: 8, color: "#9ca3af", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            No deliverables added yet.
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
            {/* Header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 60px 55px",
                fontSize: 6.5,
                fontWeight: 700,
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                borderBottom: "1px solid #e5e7eb",
                paddingBottom: 2,
              }}
            >
              <span>Deliverable</span>
              <span style={{ textAlign: "center" }}>Progress</span>
              <span style={{ textAlign: "right" }}>Status</span>
            </div>
            {items.map((d, i) => {
              const p = pct(d.achieved ?? 0, d.target ?? 1);
              return (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 60px 55px",
                    alignItems: "center",
                    borderBottom: "1px solid #f3f4f6",
                    paddingBottom: 3,
                    gap: 4,
                  }}
                >
                  <div style={{ fontSize: 7.5, color: DARK_BG, fontWeight: 500 }}>
                    {truncate(d.title, 25)}
                  </div>
                  <div style={{ textAlign: "center" }}>
                    {d.target ? (
                      <span style={{ fontSize: 7, color: "#6b7280" }}>
                        {d.achieved ?? 0}/{d.target} {d.unit ?? ""} ({p}%)
                      </span>
                    ) : (
                      <span style={{ fontSize: 7, color: "#9ca3af" }}>—</span>
                    )}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <StatusBadge status={d.status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 5 — Activities (light) — list + photo thumbnails
// ---------------------------------------------------------------------------
function Slide5Activities({ project }: { project: SlidePreviewProps["project"] }) {
  const acts = (project.activities ?? []).slice(0, 5);
  const photos = (project.gallery ?? [])
    .filter((g) => g.url)
    .slice(0, 4);

  return (
    <SlideCard n={5}>
      <div style={{ height: "100%", display: "flex" }}>
        {/* Left — activity list */}
        <div style={{ flex: 1, padding: "10px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          <Eyebrow text="Activities" />
          <div style={{ fontSize: 11, fontWeight: 800, color: DARK_BG, marginBottom: 3 }}>
            Recent Sessions
          </div>
          {acts.length === 0 ? (
            <div style={{ fontSize: 8, color: "#9ca3af", flex: 1, display: "flex", alignItems: "center" }}>
              No activities recorded yet.
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              {acts.map((a, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <div style={{ fontSize: 7.5, fontWeight: 600, color: DARK_BG }}>
                    {truncate(a.title, 30)}
                  </div>
                  <div style={{ fontSize: 6.5, color: "#6b7280" }}>
                    {[a.activityDate, a.state].filter(Boolean).join(" · ")}
                    {a.teachersReached ? ` · ${a.teachersReached} teachers` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right — photo thumbnails */}
        {photos.length > 0 && (
          <div
            style={{
              width: "38%",
              padding: "10px 10px 10px 0",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "1fr 1fr",
              gap: 4,
              alignContent: "start",
            }}
          >
            {photos.map((g, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={g.url!}
                alt={g.caption ?? `Photo ${i + 1}`}
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  objectFit: "cover",
                  borderRadius: 4,
                  border: "1px solid #e5e7eb",
                }}
              />
            ))}
          </div>
        )}
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 6 — Stories / Testimonials (light)
// ---------------------------------------------------------------------------
function Slide6Stories({ project }: { project: SlidePreviewProps["project"] }) {
  const testimonial = (project.testimonials ?? [])[0];
  const teachers = (project.activities ?? []).reduce((s, a) => s + (a.teachersReached ?? 0), 0);
  const students = (project.activities ?? []).reduce((s, a) => s + (a.studentsReached ?? 0), 0);

  return (
    <SlideCard n={6}>
      <div style={{ height: "100%", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 5 }}>
        <Eyebrow text="Stories" />
        {testimonial ? (
          <>
            {/* Large quote mark */}
            <div
              style={{
                fontSize: 28,
                lineHeight: 0.6,
                color: GOLD,
                fontFamily: "Georgia, serif",
                opacity: 0.6,
              }}
            >
              &ldquo;
            </div>
            <div
              style={{
                fontSize: 8.5,
                fontStyle: "italic",
                color: "#374151",
                lineHeight: 1.6,
                flex: 1,
              }}
            >
              {truncate(testimonial.content, 280)}
            </div>
            <div style={{ borderTop: `2px solid ${GOLD}`, paddingTop: 5 }}>
              <div style={{ fontSize: 8, fontWeight: 700, color: DARK_BG }}>
                {testimonial.author}
              </div>
              {testimonial.role && (
                <div style={{ fontSize: 7, color: "#6b7280" }}>{testimonial.role}</div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: DARK_BG }}>Reach Data</div>
            <div style={{ flex: 1, display: "flex", gap: 8, alignItems: "center" }}>
              {[
                { label: "Teachers Reached", value: teachers },
                { label: "Students Reached", value: students },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    flex: 1,
                    background: CREAM_BG,
                    borderRadius: 6,
                    padding: "10px 8px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 900, color: DARK_BG }}>{s.value.toLocaleString()}</div>
                  <div style={{ fontSize: 7, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 7 — Geographic Reach (light)
// ---------------------------------------------------------------------------
function Slide7Geographic({ project }: { project: SlidePreviewProps["project"] }) {
  const states = project.states ?? [];
  const actCount = (project.activities ?? []).length;

  return (
    <SlideCard n={7}>
      <div style={{ height: "100%", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        <Eyebrow text="Geographic Reach" />
        <div style={{ fontSize: 11, fontWeight: 800, color: DARK_BG }}>Where We Work</div>
        <div
          style={{
            fontSize: 8,
            color: "#6b7280",
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {states.length} State{states.length !== 1 ? "s" : ""} · {actCount} Activit{actCount !== 1 ? "ies" : "y"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {states.map((st) => (
            <span
              key={st}
              style={{
                border: `1.5px solid ${GOLD}`,
                borderRadius: 12,
                padding: "2px 8px",
                fontSize: 7.5,
                fontWeight: 600,
                color: DARK_BG,
                background: "#fffbf0",
              }}
            >
              {st}
            </span>
          ))}
          {states.length === 0 && (
            <span style={{ fontSize: 8, color: "#9ca3af" }}>No states listed.</span>
          )}
        </div>
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 8 — Financial Summary (light) — budget utilization bars
// ---------------------------------------------------------------------------
function Slide8Financial({ project }: { project: SlidePreviewProps["project"] }) {
  const budgets = (project.budgets ?? []).slice(0, 5);
  const totalApproved = project.approvedBudget ?? 1;
  const totalSpent = project.spentBudget ?? 0;
  const overall = pct(totalSpent, totalApproved);

  return (
    <SlideCard n={8}>
      <div style={{ height: "100%", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        <Eyebrow text="Financial Summary" />
        <div style={{ fontSize: 11, fontWeight: 800, color: DARK_BG, marginBottom: 2 }}>
          Budget Utilisation
        </div>

        {/* Overall bar */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#6b7280", marginBottom: 2 }}>
            <span>Overall</span>
            <span style={{ fontWeight: 700, color: DARK_BG }}>{overall}%</span>
          </div>
          <div style={{ height: 6, background: "#e5e7eb", borderRadius: 3, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${overall}%`,
                background: overall > 90 ? "#dc2626" : GOLD,
                borderRadius: 3,
                transition: "width 0.3s",
              }}
            />
          </div>
        </div>

        {/* Category bars */}
        {budgets.length === 0 ? (
          <div style={{ fontSize: 8, color: "#9ca3af", flex: 1, display: "flex", alignItems: "center" }}>
            No budget categories added yet.
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            {budgets.map((b) => {
              const p = pct(b.spentAmount, b.approvedAmount || 1);
              return (
                <div key={b.name} style={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 7,
                      color: "#374151",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{truncate(b.name, 22)}</span>
                    <span style={{ color: "#6b7280" }}>{p}%</span>
                  </div>
                  <div style={{ height: 4, background: "#e5e7eb", borderRadius: 2, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${p}%`,
                        background: p > 90 ? "#f59e0b" : LIGHT_GOLD,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// Slide 9 — Closing (dark)
// ---------------------------------------------------------------------------
function Slide9Closing() {
  return (
    <SlideCard n={9}>
      <div style={{ display: "flex", height: "100%" }}>
        {/* Left — white panel: challenges / next steps */}
        <div
          style={{
            width: "55%",
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: DARK_BG,
                marginBottom: 3,
              }}
            >
              Challenges
            </div>
            <div
              style={{
                height: 1,
                background: "#e5e7eb",
                marginBottom: 4,
              }}
            />
            <div style={{ fontSize: 7, color: "#6b7280", fontStyle: "italic" }}>
              Detailed in the accompanying report narrative.
            </div>
          </div>
          <div>
            <div
              style={{
                fontSize: 8,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: DARK_BG,
                marginBottom: 3,
              }}
            >
              Next Steps
            </div>
            <div
              style={{
                height: 1,
                background: "#e5e7eb",
                marginBottom: 4,
              }}
            />
            <div style={{ fontSize: 7, color: "#6b7280", fontStyle: "italic" }}>
              Planned activities and milestones for the next period.
            </div>
          </div>
        </div>

        {/* Right — dark panel */}
        <div
          style={{
            width: "45%",
            background: DARK_BG,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              fontStyle: "italic",
              color: CREAM,
              textAlign: "center",
              lineHeight: 1.2,
            }}
          >
            Thank You
          </div>
          <div
            style={{
              width: 24,
              height: 2,
              background: GOLD,
              borderRadius: 1,
            }}
          />
          <div
            style={{
              fontSize: 8,
              fontWeight: 600,
              color: LIGHT_GOLD,
              textAlign: "center",
              letterSpacing: "0.06em",
            }}
          >
            Vision Empower
          </div>
          <div
            style={{
              fontSize: 6.5,
              color: "rgba(255,255,255,0.3)",
              textAlign: "center",
              marginTop: 4,
            }}
          >
            chandrakiran@visionempowertrust.org
          </div>
        </div>
      </div>
    </SlideCard>
  );
}

// ---------------------------------------------------------------------------
// SlidePreviewGrid — main export
// ---------------------------------------------------------------------------
export default function SlidePreviewGrid({
  project,
  reportType,
  periodStart,
  periodEnd,
}: SlidePreviewProps) {
  return (
    <div className="grid grid-cols-3 gap-4 w-full">
      <Slide1Cover
        project={project}
        periodStart={periodStart}
        periodEnd={periodEnd}
        reportType={reportType}
      />
      <Slide2Overview project={project} />
      <Slide3Impact project={project} />
      <Slide4Deliverables project={project} />
      <Slide5Activities project={project} />
      <Slide6Stories project={project} />
      <Slide7Geographic project={project} />
      <Slide8Financial project={project} />
      <Slide9Closing />
    </div>
  );
}
