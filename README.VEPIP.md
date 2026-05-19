# VE-PIP Implementation Notes

VE-PIP is now shaped as Vision Empower's internal project intelligence dashboard.

## What is included

- Leadership dashboard at `/dashboard`
- Vision Empower navigation and branding
- Email/password authentication with Convex + Better Auth
- Login-only access: public signup routes redirect to login
- Server-side restriction to `@visionempowertrust.org`
- Bootstrapped superadmin account: `chandrakiran@visionempowertrust.org`
- Role-based project access: admins and leadership see all projects; other users only see assigned projects
- Convex schema for funders, people, projects, deliverables, milestones, budgets, expenses, activities, reports, and alerts
- Convex mutations/queries for portfolio listing, AI draft project creation, activity logging, expense recording, and report input gathering
- NVIDIA NIM routes:
  - `POST /api/ai/extract-project`
  - `POST /api/ai/generate-report`

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Add `NVIDIA_NIM_API_KEY`.
3. Run `npx convex dev` once to create/connect the Convex deployment and populate Convex environment values.
4. Run `npm run dev` and open `http://localhost:3000/dashboard`.

The Convex provider is intentionally tolerant of a missing `NEXT_PUBLIC_CONVEX_URL`, so the dashboard can still render before Convex is initialized.

## Authentication model

VE-PIP uses Better Auth sessions integrated with Convex. The auth route is mounted at `/api/auth/[...all]`, and Convex validates the session token before protected queries and mutations run.

- Users sign in with email/password.
- Users do not self-register. Existing users create new user records with an initial password.
- New user emails must end with `@visionempowertrust.org`.
- The superadmin is `chandrakiran@visionempowertrust.org`.
- For local development, the temporary bootstrap password is stored in `SUPERADMIN_INITIAL_PASSWORD`; rotate it immediately.
- Admin and leadership users can view every project.
- Program managers, account managers, and finance users only see projects where they are assigned directly or through `projectMembers`.
- Users can create users at their own role level or lower.

## AI Intake PDF extraction

PDF upload now uses a hybrid extraction path:

- `unpdf` / PDF.js extracts native PDF text.
- PDF.js also extracts positioned text elements so the AI receives layout-aware content.
- If a page has little or no native text, the server renders that page and OCRs it with Tesseract.js.
- DOCX files still use Mammoth, and TXT files are decoded directly.

