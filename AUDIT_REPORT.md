# AgreeYa Estimator — Full Codebase Audit Report

**Date:** 2026-05-06  
**Auditor:** Claude Code (claude-sonnet-4-6)  
**Scope:** Full-stack Next.js 16.2.4 estimation application  
**Files examined:** `db/schema.sql`, `lib/db.ts`, `lib/actions.ts`, `lib/types.ts`, all pages under `app/projects/[id]/`, all workspace components, `components/projects-table.tsx`, `components/project-summary.tsx`

---

## AUDIT RESULTS

### Critical Issues (5 found)

---

#### CRITICAL-1 — Missing `executive_summary` column in database schema

**File:** `db/schema.sql` (lines 2–10) cross-referenced with `lib/actions.ts` (line 77) and `lib/types.ts` (line 8)

**Problem:** The `projects` table in the schema has no `executive_summary` column. But `updateProject()` in `lib/actions.ts:77` tries to `UPDATE projects SET executive_summary = ?`, and `lib/types.ts:8` declares the field on the `Project` interface. Every time a user types in the Summary page's executive summary textarea and the 800ms auto-save fires, SQLite throws `SQLITE_ERROR: table projects has no column named executive_summary`. The error is swallowed by the `try/catch`, showing only a toast. Users lose their text silently.

**Fix — `db/schema.sql` (add column to projects table):**
```sql
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    client_name TEXT,
    description TEXT,
    executive_summary TEXT,          -- ADD THIS LINE
    status TEXT CHECK(status IN ('draft', 'submitted', 'won', 'lost')) DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
Because the schema uses `CREATE TABLE IF NOT EXISTS`, this fix only applies to newly created databases. For existing databases, also run the following migration (add it to `lib/db.ts` inside `getDb()` after `db.exec(schema)`):
```typescript
// In getDb(), after db.exec(schema):
try {
  db.exec("ALTER TABLE projects ADD COLUMN executive_summary TEXT");
} catch (_) {
  // Column already exists — safe to ignore
}
```

---

#### CRITICAL-2 — `spike` complexity rejected by DB CHECK constraint in `wbs_components`

**File:** `db/schema.sql` (line 19)

**Problem:** The constraint is `CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex'))` — `'spike'` is missing. The UI in `wbs-workspace.tsx` (lines 67, 540) allows selecting `spike` as a complexity, and `COMPLEXITY_DEFAULTS` has a spike entry. When a user sets any row to spike and the auto-save fires, the entire transaction fails with a CHECK constraint violation. Because `updateWBSComponents()` deletes all rows before re-inserting, this means **all WBS data for that project is deleted and nothing is re-inserted**. Complete data loss for the project.

**Fix — `db/schema.sql` (line 19):**
```sql
-- BEFORE:
complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex')),

-- AFTER:
complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex', 'spike')),
```

---

#### CRITICAL-3 — `spike` complexity rejected by DB CHECK constraint in `component_library`

**File:** `db/schema.sql` (line 110)

**Problem:** Same constraint omission as CRITICAL-2, in the `component_library` table. Attempting to save or bulk-import a library component with `complexity = 'spike'` will fail with a DB error.

**Fix — `db/schema.sql` (line 110):**
```sql
-- BEFORE:
complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex')),

-- AFTER:
complexity TEXT CHECK(complexity IN ('simple', 'medium', 'complex', 'very_complex', 'spike')),
```

---

#### CRITICAL-4 — "Generate Quote PDF" button is completely non-functional

**File:** `components/commercials-workspace.tsx` (line 452)

**Problem:** The button has no `onClick` handler. Clicking it does nothing. This is a primary user-facing feature.

```tsx
// CURRENT (broken):
<Button className="w-full bg-sidebar text-white hover:bg-sidebar-accent gap-2 h-11 text-base font-bold shadow-lg mt-4">
  <DollarSign className="h-5 w-5" />
  Generate Quote PDF
</Button>
```

**Fix — implement via `window.print()` with print-specific styles, or route to the Summary page:**
```tsx
// OPTION A: Route to Summary tab which has a working Print button
import { useRouter } from "next/navigation"
// (add to component top):
const router = useRouter()

// (on button):
<Button
  onClick={() => router.push(`/projects/${projectId}/summary`)}
  className="w-full bg-sidebar text-white hover:bg-sidebar-accent gap-2 h-11 text-base font-bold shadow-lg mt-4"
>
  <DollarSign className="h-5 w-5" />
  Generate Quote (Summary)
</Button>
```

---

#### CRITICAL-5 — Resource loading grid crashes when any resource has a null or empty date

**File:** `components/resource-workspace.tsx` (lines 84–98)

**Problem:** The `periods` `useMemo` does:
```typescript
const startDates = resources.map(r => parseISO(r.allocation_start))
const earliest = min(startDates)
return eachWeekOfInterval({ start: earliest, end: latest })...
```
If a user clears the start or end date input field for any resource, `allocation_start` becomes `""`. `parseISO("")` returns `Invalid Date`. `min([Invalid Date, ...])` returns `Invalid Date`. `eachWeekOfInterval({ start: Invalid Date, ... })` throws `"RangeError: Invalid interval"`, crashing the entire Resources tab with an unhandled error.

The `resources` table has no NOT NULL constraint on `allocation_start/allocation_end`, so this can also happen via direct DB edits.

**Fix — `components/resource-workspace.tsx` (lines 81–100):**
```typescript
const periods = useMemo(() => {
  if (resources.length === 0) return []

  const validResources = resources.filter(
    r => r.allocation_start && r.allocation_end
  )
  if (validResources.length === 0) return []

  const startDates = validResources.map(r => parseISO(r.allocation_start))
  const endDates = validResources.map(r => parseISO(r.allocation_end))

  const earliest = min(startDates)
  const latest = max(endDates)

  if (isNaN(earliest.getTime()) || isNaN(latest.getTime())) return []
  if (earliest > latest) return []

  if (periodType === 'weekly') {
    return eachWeekOfInterval({ start: earliest, end: latest }).map(date => ({
      label: format(date, "MMM d, yyyy"),
      key: format(date, "yyyy-MM-dd")
    }))
  } else {
    return eachMonthOfInterval({ start: earliest, end: latest }).map(date => ({
      label: format(date, "MMM yyyy"),
      key: format(date, "yyyy-MM")
    }))
  }
}, [resources, periodType])
```

---

### High Issues (7 found)

---

#### HIGH-1 — `verbose: console.log` logs every SQL query in all environments

**File:** `lib/db.ts` (line 13)

**Problem:** `new Database(DB_PATH, { verbose: console.log })` prints every SQL statement and its bound parameters to stdout — including the full WBS batch-insert of 50+ rows, every 800ms during editing. In production, this floods logs and leaks data.

**Fix — `lib/db.ts` (line 13):**
```typescript
// BEFORE:
db = new Database(DB_PATH, { verbose: console.log });

// AFTER:
db = new Database(DB_PATH, { verbose: process.env.NODE_ENV === 'development' ? console.log : undefined });
```

---

#### HIGH-2 — `updateProject()` never calls `revalidatePath()`

**File:** `lib/actions.ts` (lines 68–88)

**Problem:** When the executive summary auto-saves or a user updates project name/status, `updateProject()` completes without calling `revalidatePath()`. The Next.js cache is not invalidated. Navigating to the Projects list will show stale project names, statuses, and descriptions.

**Fix — `lib/actions.ts` (line 87, before the closing brace of the try block):**
```typescript
export async function updateProject(id: string, updates: Partial<Project>) {
  try {
    const db = getDb();
    const setClauses = [];
    const values = [];
    
    if (updates.name !== undefined) { setClauses.push("name = ?"); values.push(updates.name); }
    if (updates.client_name !== undefined) { setClauses.push("client_name = ?"); values.push(updates.client_name); }
    if (updates.description !== undefined) { setClauses.push("description = ?"); values.push(updates.description); }
    if (updates.executive_summary !== undefined) { setClauses.push("executive_summary = ?"); values.push(updates.executive_summary); }
    if (updates.status !== undefined) { setClauses.push("status = ?"); values.push(updates.status); }
    
    if (setClauses.length > 0) {
      values.push(id);
      db.prepare(`UPDATE projects SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    }
    revalidatePath("/projects");          // ADD THIS
    revalidatePath(`/projects/${id}`);    // ADD THIS
  } catch (error) {
    console.error("Failed to update project:", error);
    throw error;
  }
}
```

---

#### HIGH-3 — Single `debouncedSaveResource` shared across all resources causes data loss

**File:** `components/resource-workspace.tsx` (lines 119–127, 180)

**Problem:** A single `debounce` instance is used for all resources via `useCallback`. When a user edits Resource A, then edits Resource B within 800ms, the debounce timer resets and only fires once — with Resource B's data. Resource A's changes are never saved. Silent data loss for any edit flurry across multiple rows.

**Fix — `components/resource-workspace.tsx` — save the entire resources array instead of one resource:**
```typescript
// Replace the single-resource debounce with a whole-roster save:
const debouncedSaveRoster = useCallback(
  debounce((allResources: Resource[]) => {
    setSaving(true)
    Promise.all(allResources.map(res => updateResource(projectId, res)))
      .then(() => setSaving(false))
      .catch(() => {
        toast.error("Failed to save resources")
        setSaving(false)
      })
  }, 800),
  [projectId]
)

// In handleResourceUpdate, replace debouncedSaveResource(updated) with:
const handleResourceUpdate = (id: string, updates: Partial<Resource>) => {
  setResources(prev => {
    const next = prev.map(r => {
      if (r.id !== id) return r
      if (updates.rate_per_hour !== undefined && updates.rate_per_hour < 0) updates.rate_per_hour = 0
      const updated = { ...r, ...updates }
      if (updates.role) {
        const roleData = rateCard.find(rc => rc.role_title === updates.role)
        if (roleData) updated.rate_per_hour = roleData.standard_rate
      }
      return updated
    })
    debouncedSaveRoster(next)   // pass ALL resources
    return next
  })
}
```

---

#### HIGH-4 — `getFinalEstimatedHours()` excludes WBS confidence contingency, making Resources validation incorrect

**File:** `lib/actions.ts` (lines 245–270)

**Problem:** `getFinalEstimatedHours()` calculates: `construction_hours + enabled_overhead_hours + project_contingency`. It does NOT include the per-row confidence-based contingency (10–35% per WBS row) that the WBS workspace displays as "Total Estimated Hours". The Resources tab validation card compares planned capacity against this number, labelling it "Estimated Effort (Overhead Tab)". This is accurate but creates a confusing disconnect: the WBS tab shows a higher "Total Estimated Hours" number (construction + confidence contingency), while the Resources tab shows a different "Estimated Effort" (construction + overhead + project contingency). Neither is labelled clearly as the authoritative target. Estimators may over- or under-staff.

**Fix — add a `getWBSConfidenceHours()` helper and expose both numbers. In `lib/actions.ts` after line 270:**
```typescript
export async function getWBSConfidenceHours(projectId: string): Promise<number> {
  try {
    const db = getDb();
    const components = db.prepare(
      "SELECT base_hours, confidence_level FROM wbs_components WHERE project_id = ?"
    ).all(projectId) as { base_hours: number; confidence_level: string }[];

    const CONFIDENCE_CONTINGENCY: Record<string, number> = {
      high: 0.1, medium: 0.2, low: 0.35, spike: 0
    };
    return components.reduce((acc, c) => {
      return acc + (c.base_hours || 0) * (CONFIDENCE_CONTINGENCY[c.confidence_level] || 0);
    }, 0);
  } catch {
    return 0;
  }
}
```
Then in `app/projects/[id]/resources/page.tsx`, also fetch and pass `wbsConfidenceHours` to `ResourceWorkspace`, and update the validation card to show both estimates side by side.

---

#### HIGH-5 — Disabled overhead rows still display non-zero hours, misleading users

**File:** `components/overhead-workspace.tsx` (lines 130–189)

**Problem:** Every `OverheadRow` receives `calculatedHours={constructionHours * (config.ba_percent / 100)}` and always renders `{calculatedHours.toFixed(1)}` in the Hours column. Even when a row's toggle is off (disabled/greyed-out), it still shows, e.g., "15.0 hrs" in the table. This makes users think those hours count toward the total.

**Fix — `components/overhead-workspace.tsx` — update each `OverheadRow` call to pass 0 when disabled. Replace the `calculatedHours` prop in every `OverheadRow` invocation:**
```tsx
// For each standard OverheadRow, e.g. Business Analysis:
<OverheadRow
  label="Business Analysis"
  percent={config.ba_percent}
  enabled={config.ba_enabled}
  onPercentChange={v => updateConfig({ ba_percent: v })}
  onEnabledChange={v => updateConfig({ ba_enabled: v })}
  calculatedHours={config.ba_enabled ? constructionHours * (config.ba_percent / 100) : 0}
/>

// For custom rows:
calculatedHours={
  (config[`custom_enabled_${num}` as keyof OverheadConfig] as boolean)
    ? constructionHours * ((config[`custom_percent_${num}` as keyof OverheadConfig] as number) / 100)
    : 0
}
```

---

#### HIGH-6 — `total_cost` is hardcoded to 0 in the projects list query

**File:** `lib/actions.ts` (line 15)

**Problem:** `getProjects()` returns `0 as total_cost` for every project. The Projects Table shows a "Total Cost" column that always reads `$0`. This is misleading for users tracking project values.

**Fix — `lib/actions.ts` (lines 11–21) — replace the query:**
```typescript
export async function getProjects() {
  try {
    const db = getDb();
    const projects = db.prepare(`
      SELECT 
        p.*,
        COALESCE(SUM(w.base_hours), 0) as total_hours,
        COALESCE((
          SELECT SUM(rl.hours * r.rate_per_hour)
          FROM resources r
          LEFT JOIN resource_loading rl ON r.id = rl.resource_id
          WHERE r.project_id = p.id
        ), 0) as total_cost
      FROM projects p
      LEFT JOIN wbs_components w ON p.id = w.project_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all() as Project[];
    return projects;
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return [];
  }
}
```

---

#### HIGH-7 — Bulk CSV import has no validation; invalid data silently corrupts the library

**File:** `lib/actions.ts` (lines 525–543)

**Problem:** `bulkImportLibraryComponents()` accepts `components: any[]` with no validation. If a CSV row has an invalid `complexity` value (e.g., `"COMPLEX"` with wrong casing, or a typo), SQLite throws a CHECK constraint error. The whole transaction rolls back with no helpful user message. Required fields like `component_name` are also not validated.

**Fix — `lib/actions.ts` (replace `bulkImportLibraryComponents`):**
```typescript
const VALID_COMPLEXITIES = new Set(['simple', 'medium', 'complex', 'very_complex', 'spike']);

export async function bulkImportLibraryComponents(components: any[]) {
  try {
    const db = getDb();
    const errors: string[] = [];
    const valid: any[] = [];

    components.forEach((item, i) => {
      if (!item.component_name?.trim()) {
        errors.push(`Row ${i + 1}: missing component_name`);
        return;
      }
      if (!VALID_COMPLEXITIES.has(item.complexity)) {
        errors.push(`Row ${i + 1}: invalid complexity "${item.complexity}"`);
        return;
      }
      valid.push(item);
    });

    if (errors.length > 0) {
      throw new Error(`Import errors:\n${errors.join('\n')}`);
    }

    const insert = db.prepare(`
      INSERT INTO component_library (id, category, component_name, description, complexity, story_points, base_hours, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = db.transaction((items) => {
      for (const item of items) {
        insert.run(uuidv4(), item.category, item.component_name, item.description || null, item.complexity, item.story_points ?? 0, item.base_hours ?? 0, item.notes || null);
      }
    });
    transaction(valid);
    revalidatePath("/library");
  } catch (error) {
    console.error("Failed bulk import:", error);
    throw error;
  }
}
```

---

### Medium Issues (7 found)

---

#### MEDIUM-1 — `client_name` null crash in search filter

**File:** `components/projects-table.tsx` (line 99)

**Problem:** `p.client_name.toLowerCase()` will throw `TypeError: Cannot read properties of null` if `client_name` is null. The `projects` DB table has no NOT NULL on `client_name`.

**Fix — `components/projects-table.tsx` (line 96–100):**
```typescript
const filteredProjects = sortedProjects.filter(
  (p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.client_name ?? "").toLowerCase().includes(search.toLowerCase())
)
```

---

#### MEDIUM-2 — No loading states for project sub-pages

**Files:** Missing `app/projects/[id]/estimate/loading.tsx`, `overhead/loading.tsx`, `resources/loading.tsx`, `commercials/loading.tsx`, `summary/loading.tsx`

**Problem:** When switching between tabs (Estimate → Overhead → Resources etc.), the page goes blank until the async Server Component resolves. For slow DB queries (e.g., large WBS), this is a noticeable blank flash.

**Fix — create `app/projects/[id]/loading.tsx`** (applies to all sub-routes via the layout):
```tsx
import { Skeleton } from "@/components/ui/skeleton"

export default function ProjectLoading() {
  return (
    <div className="space-y-6 pt-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
```

---

#### MEDIUM-3 — `saving` boolean is shared across concurrent auto-saves, causing premature "Saved" display

**File:** All workspace components (`wbs-workspace.tsx`, `overhead-workspace.tsx`, `resource-workspace.tsx`, `commercials-workspace.tsx`)

**Problem:** When multiple debounced saves overlap (e.g., user triggers both a resource save and a loading save), the first to complete calls `setSaving(false)`, showing "Saved" even though the second save is still in flight.

**Fix — use a ref counter instead of a boolean. Replace in each workspace:**
```typescript
// Replace:  const [saving, setSaving] = useState(false)
const saveCount = useRef(0)
const [saving, setSaving] = useState(false)

// Replace every:  setSaving(true)
saveCount.current += 1
setSaving(true)

// Replace every:  setSaving(false)
saveCount.current -= 1
if (saveCount.current <= 0) {
  saveCount.current = 0
  setSaving(false)
}
```

---

#### MEDIUM-4 — `toLocaleString()` without locale causes wrong currency formatting on non-US systems

**Files:** `components/commercials-workspace.tsx` (lines 219, 232, 311, etc.), `components/project-summary.tsx` (lines 194, 197, etc.), multiple other locations

**Problem:** `(1250000).toLocaleString()` on a European browser returns `"1.250.000"` with dots. Rendered as `$1.250.000`, it looks like $1.25 to a US reader. All financial values must specify the locale.

**Fix — `lib/utils.ts` — add a helper and replace all `toLocaleString()` calls on currency values:**
```typescript
export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
```
Then replace all `${value.toLocaleString()}` with `${formatCurrency(value)}`.

---

#### MEDIUM-5 — `revalidatePath("/rate-card")` revalidates a path that doesn't exist

**File:** `lib/actions.ts` (lines 553, 572, 587)

**Problem:** `createRateCard`, `updateRateCard`, and `deleteRateCard` all call `revalidatePath("/rate-card")`, but the actual page is at `/rates` (`app/rates/page.tsx`). The cache is never properly invalidated after rate changes.

**Fix — `lib/actions.ts` (lines 553, 572, 587):**
```typescript
// BEFORE:
revalidatePath("/rate-card");

// AFTER (in all three functions):
revalidatePath("/rates");
```

---

#### MEDIUM-6 — No UNIQUE constraint on `resource_loading (resource_id, period_label)`

**File:** `db/schema.sql` (lines 71–79)

**Problem:** `updateManyResourceLoading()` uses `ON CONFLICT(id)`. If the same resource/period combination is inserted with two different IDs (e.g., from a race condition or client-side bug generating a new UUID), duplicate rows accumulate. Both will be summed, doubling that period's hours in `getLaborCosts()`.

**Fix — `db/schema.sql`:**
```sql
CREATE TABLE IF NOT EXISTS resource_loading (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    period_label TEXT NOT NULL,
    hours REAL DEFAULT 0,
    UNIQUE(resource_id, period_label),   -- ADD THIS
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```
And update `updateManyResourceLoading()` to use the composite key for conflict resolution:
```typescript
const upsert = db.prepare(`
  INSERT INTO resource_loading (id, resource_id, project_id, period_label, hours)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(resource_id, period_label) DO UPDATE SET hours = excluded.hours
`);
```

---

#### MEDIUM-7 — `addResource()` direct call to `updateResource()` has no error handling

**File:** `components/resource-workspace.tsx` (line 153)

**Problem:** When adding a new resource, `updateResource(projectId, newRes)` is called without `.catch()`. If the DB insert fails (e.g., DB locked), the resource appears in the UI but is not persisted. The user doesn't know.

**Fix — `components/resource-workspace.tsx` (lines 141–154):**
```typescript
const addResource = () => {
  const today = new Date()
  const newRes: Resource = {
    id: uuidv4(),
    project_id: projectId,
    name: "New Resource",
    role: rateCard[0]?.role_title || "Developer",
    rate_per_hour: rateCard[0]?.standard_rate || 100,
    allocation_start: format(today, "yyyy-MM-dd"),
    allocation_end: format(addMonths(today, 3), "yyyy-MM-dd")
  }
  setResources(prev => [...prev, newRes])
  updateResource(projectId, newRes).catch(() => {
    toast.error("Failed to add resource")
    setResources(prev => prev.filter(r => r.id !== newRes.id))
  })
}
```

---

### Low Issues (5 found)

---

#### LOW-1 — Excel export contains static values, no formulas

**File:** `components/project-summary.tsx` (lines 59–110)

**Problem:** The exported Excel file uses `json_to_sheet` which creates plain data cells. Totals are pre-computed values, not Excel `SUM()` formulas. If a recipient modifies a row in Excel, subtotals won't update.

**Fix:** Use `XLSX.utils.sheet_add_aoa` to insert formula cells for subtotal rows. Example for the Additional Costs sheet:
```typescript
// After building addData, append a totals formula row:
const wsAdd = XLSX.utils.json_to_sheet(addData)
const lastRow = addData.length + 2 // 1-indexed + header row
XLSX.utils.sheet_add_aoa(wsAdd, [[
  "TOTAL", "", "", "",
  { f: `SUM(E2:E${lastRow - 1})` }
]], { origin: `A${lastRow}` })
XLSX.utils.book_append_sheet(wb, wsAdd, "Additional Costs")
```

---

#### LOW-2 — Excel filename not sanitized for OS-invalid characters

**File:** `components/project-summary.tsx` (line 109)

**Problem:** `project.name.replace(/\s+/g, '_')` only replaces spaces. Characters like `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|` are invalid in Windows filenames and will cause the download to fail or produce a garbled filename.

**Fix — `components/project-summary.tsx` (line 109):**
```typescript
// BEFORE:
XLSX.writeFile(wb, `${project.name.replace(/\s+/g, '_')}_Estimate.xlsx`)

// AFTER:
const safeName = project.name.replace(/[/\\:*?"<>|\s]+/g, '_').slice(0, 100)
XLSX.writeFile(wb, `${safeName}_Estimate.xlsx`)
```

---

#### LOW-3 — "Duplicate" project menu item is non-functional

**File:** `components/projects-table.tsx` (lines 186–188)

**Problem:** The Duplicate `DropdownMenuItem` has no `onClick` handler. It renders clickably but does nothing.

**Fix — `components/projects-table.tsx` (lines 186–188) and `lib/actions.ts`:**

Add to `lib/actions.ts`:
```typescript
export async function duplicateProject(id: string) {
  try {
    const db = getDb();
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
    if (!project) throw new Error("Project not found");
    const newId = uuidv4();
    db.prepare(
      "INSERT INTO projects (id, name, client_name, description, status) VALUES (?, ?, ?, ?, 'draft')"
    ).run(newId, `${project.name} (Copy)`, project.client_name, project.description);
    db.prepare("INSERT INTO overhead_config (id, project_id) VALUES (?, ?)").run(uuidv4(), newId);
    const wbsRows = db.prepare("SELECT * FROM wbs_components WHERE project_id = ?").all(id) as WBSComponent[];
    const insertWbs = db.prepare(
      "INSERT INTO wbs_components (id, project_id, category, component_name, description, complexity, story_points, base_hours, confidence_level, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    db.transaction(() => {
      for (const row of wbsRows) insertWbs.run(uuidv4(), newId, row.category, row.component_name, row.description, row.complexity, row.story_points, row.base_hours, row.confidence_level, row.notes, row.sort_order);
    })();
    revalidatePath("/projects");
    return { id: newId };
  } catch (error) {
    console.error("Failed to duplicate project:", error);
    throw error;
  }
}
```

In `components/projects-table.tsx`:
```tsx
import { deleteProject, duplicateProject } from "@/lib/actions"
// ...
<DropdownMenuItem onClick={async () => {
  try {
    await duplicateProject(project.id)
    toast.success("Project duplicated")
  } catch {
    toast.error("Failed to duplicate project")
  }
}}>
  <Copy className="mr-2 h-4 w-4" /> Duplicate
</DropdownMenuItem>
```

---

#### LOW-4 — Dashboard "Total Estimated Value" is hardcoded to $1,250,000

**File:** `lib/actions.ts` (line 117)

**Problem:** `getProjectStats()` always returns `totalValue: 1250000`. The dashboard KPI tile is decorative, not real.

**Fix — `lib/actions.ts` (replace lines 108–118):**
```typescript
const totalValueResult = db.prepare(`
  SELECT COALESCE(SUM(rl.hours * r.rate_per_hour), 0) as total
  FROM resources r
  LEFT JOIN resource_loading rl ON r.id = rl.resource_id
`).get() as { total: number };

return {
  totalProjects: totalProjects.count,
  activeEstimates: activeEstimates.count,
  wonProjects: wonProjects.count,
  totalValue: totalValueResult.total
};
```

---

#### LOW-5 — CSS class typo `ladies-tight` in WBS velocity card

**File:** `components/wbs-workspace.tsx` (line 424)

**Problem:** `className="... ladies-tight"` — this Tailwind class does not exist. It appears to be a typo for `leading-tight`. No visual impact because unknown classes are silently ignored, but it clutters the markup.

**Fix — `components/wbs-workspace.tsx` (line 424):**
```tsx
// BEFORE:
<div className="bg-orange-50 border border-orange-200 p-2 rounded text-[11px] text-orange-800 ladies-tight">

// AFTER:
<div className="bg-orange-50 border border-orange-200 p-2 rounded text-[11px] text-orange-800 leading-tight">
```

---

### Summary

**Overall assessment:** The application has a solid architectural foundation — clean separation of Server Actions from components, proper use of SQLite transactions, debounced auto-save throughout, and good TypeScript typing. The UI structure and UX flow are well-designed.

However, there are **two database schema bugs (CRITICAL-1 and CRITICAL-2)** that cause silent data loss today: the missing `executive_summary` column breaks the Summary page auto-save, and the missing `spike` value in the CHECK constraint causes complete WBS data loss when any row is set to Spike complexity. These must be fixed before any user data is stored.

The **five critical issues** together mean:
- Executive summary text is never saved
- Projects with Spike WBS rows lose all their WBS data on every auto-save
- Library items can't be saved with spike complexity
- Quote PDF is a dead button
- The Resource tab crashes if any date field is cleared

The **seven high issues** produce incorrect estimates or silent data loss in common workflows.

**Priority fix order:** CRITICAL-1 → CRITICAL-2 → CRITICAL-3 → CRITICAL-5 → HIGH-3 → HIGH-1 → HIGH-2, then remaining high/medium issues.

**Readiness verdict:** Not production-ready. Fix all Critical and High issues before first real use with client data.

---

*Report generated by full static analysis of all source files. No test suite was run.*
