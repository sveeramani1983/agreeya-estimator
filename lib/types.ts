export interface Client {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  // computed
  project_count?: number;
  total_pipeline?: number;
  total_won?: number;
  primary_contact_name?: string | null;
}

export interface ClientContact {
  id: string;
  client_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
  created_at: string;
}

export interface ClientNote {
  id: string;
  client_id: string;
  content: string;
  category: 'general' | 'meeting' | 'follow_up' | 'opportunity';
  created_by: string | null;
  created_at: string;
}

export type ProjectStatus = 'draft' | 'submitted' | 'won' | 'lost';
export type ProjectLifecycleStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed';
export type DealSizeCategory = 'small' | 'medium' | 'large' | 'strategic';
export type ProjectVertical = 'state_government' | 'local_government' | 'federal' | 'healthcare' | 'enterprise' | 'other';
export type ServiceLine = 'custom_build' | 'platform_impl' | 'integration' | 'data_analytics' | 'cloud_infra' | 'ai_ml' | 'other';

export interface Project {
  id: string;
  name: string;
  client_name: string;
  description: string | null;
  executive_summary: string | null;
  timeline_start: string | null;
  timeline_end: string | null;
  timeline_mode: 'range' | 'duration' | null;
  timeline_duration_value: number | null;
  timeline_duration_unit: 'weeks' | 'months' | null;
  status: ProjectStatus;
  outcome_data: string | null;
  project_status?: ProjectLifecycleStatus;
  project_start_date?: string | null;
  project_target_end_date?: string | null;
  created_at: string;
  updated_at: string;
  total_hours?: number;
  total_cost?: number;
  tax_label?: string;
  tax_percent?: number;
  tax_mode?: 'full' | 'additional_only' | 'not_applicable';
  loading_period_type?: 'weekly' | 'monthly';
  resource_hours_loaded?: number;
  margin_percent?: number;
  // Client link
  client_id?: string | null;
  // Pipeline pursuit fields
  win_probability?: number;
  deal_size_category?: DealSizeCategory | null;
  expected_start_date?: string | null;
  pursuit_owner?: string | null;
  vertical?: ProjectVertical | null;
  service_line?: ServiceLine | null;
}

export interface PipelineProject extends Project {
  win_probability: number;
  quoted_price: number;
}

export interface MonthlyForecast {
  month: string;
  total: number;
  weighted: number;
  deals: number;
}

export interface PipelineMetrics {
  totalPipeline: number;
  weightedPipeline: number;
  wonRevenue: number;
  lostRevenue: number;
  winRate: number;
  dealCount: number;
}

export interface PipelineData {
  pipeline: PipelineProject[];
  wonThisYear: PipelineProject[];
  lostThisYear: PipelineProject[];
  allWon: PipelineProject[];
  allLost: PipelineProject[];
  metrics: PipelineMetrics;
  monthlyForecast: MonthlyForecast[];
}

export interface WBSSubtask {
  id: string;
  task_name: string;
  hours: number;
}

export interface WBSComponent {
  id: string;
  project_id: string;
  category: string;
  component_name: string;
  description: string | null;
  complexity: 'simple' | 'medium' | 'complex' | 'very_complex' | 'spike';
  story_points: number;
  base_hours: number;
  confidence_level: 'high' | 'medium' | 'low' | 'spike';
  notes: string | null;
  sort_order: number;
  subtasks?: WBSSubtask[];
  is_hours_overridden?: boolean;
}

export interface CustomOverhead {
  id: string;
  label: string;
  percent: number;
  sort_order: number;
}

export interface OverheadConfig {
  id: string;
  project_id: string;
  // Layer 1 — Direct Effort (base = estimateBase / constructionHours)
  ba_percent: number;
  ba_enabled: boolean;
  qa_percent: number;
  qa_enabled: boolean;
  devops_percent: number;
  devops_enabled: boolean;
  ux_percent: number;
  ux_enabled: boolean;
  // Layer 2 — Management & Support (base = layer1Subtotal)
  pm_percent: number;
  pm_enabled: boolean;
  change_mgmt_percent: number;
  change_mgmt_enabled: boolean;
  solutions_arch_percent: number;
  solutions_arch_enabled: boolean;
  training_percent: number;
  training_enabled: boolean;
  warranty_percent: number;
  warranty_enabled: boolean;
  risk_buffer_percent: number;
  risk_buffer_enabled: boolean;
  // Layer 3 — Custom overheads (base = layer1Subtotal, stored as JSON)
  customOverheads: CustomOverhead[];
  // Contingency applied to Grand Total
  project_contingency_percent: number;
}

export interface Resource {
  id: string;
  project_id: string;
  name: string;
  role: string | null;
  rate_per_hour: number;
  allocation_start: string;
  allocation_end: string;
  location: 'onsite' | 'offshore';
}

export interface ResourceLoading {
  id: string;
  resource_id: string;
  project_id: string;
  period_label: string;
  hours: number;
}

export interface AdditionalCost {
  id: string;
  project_id: string;
  label: string;
  cost_type: 'fixed' | 'monthly';
  amount: number;
  duration_months: number;
  notes: string | null;
}

export interface RateCardItem {
  id: string;
  role_title: string;
  standard_rate: number;
  onsite_rate: number;
  offshore_rate: number;
  notes: string | null;
}

export interface CommercialsConfig {
  id: string;
  project_id: string;
  margin_percent: number;
  rates_include_margin: boolean;
  show_margin_to_client: boolean;
  quote_narrative: string | null;
}

export interface EstimateVersion {
  id: string;
  project_id: string;
  version_number: number;
  version_label: string;
  snapshot: string;
  total_hours: number | null;
  total_cost: number | null;
  total_sp: number | null;
  notes: string | null;
  created_at: string;
}

export interface Assumption {
  id: string;
  project_id: string;
  type: 'assumption' | 'risk';
  title: string;
  description: string | null;
  category: string | null;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  risk_score: number | null;
  mitigation: string | null;
  owner: string | null;
  status: 'open' | 'accepted' | 'resolved' | 'transferred';
  sort_order: number;
  created_at: string;
}

export interface Phase {
  id: string;
  project_id: string;
  name: string;
  start_date: string;
  end_date: string;
  color: string;
  sort_order: number;
  notes: string | null;
  created_at: string;
}

export interface PhaseTemplatePhase {
  name: string;
  durationWeeks: number;
  color: string;
  offsetWeeks: number;
}

export interface PhaseTemplate {
  id: string;
  template_name: string;
  engagement_type: string;
  phases_json: string;
  is_default: number;
}

export interface CoverageWarning {
  phaseId: string;
  phaseName: string;
  resourceId: string;
  resourceName: string;
  message: string;
  severity: 'warning' | 'info';
}

export interface ResourceGanttData {
  resources: Resource[];
  loading: ResourceLoading[];
}

export interface WBSActual {
  id: string;
  project_id: string;
  wbs_component_id: string;
  actual_hours: number;
  recorded_at: string;
  notes: string | null;
}

export interface WBSComponentWithActual extends WBSComponent {
  actual_hours?: number | null;
  accuracy_pct?: number | null; // actual/estimated*100; null if no actual recorded
}

export interface PeriodCost {
  period: string;        // raw key: YYYY-MM-DD (weekly) or YYYY-MM (monthly)
  label: string;         // display: "Jan 6" or "Jan 2025"
  cost: number;          // raw labor cost
  margined_cost: number; // cost with margin applied when !rates_include_margin
  cumulative: number;    // running total of margined_cost
}

// ── Project Tracker types ─────────────────────────────────────────────────────

export type ReportingCadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export interface PeriodBurnResourceEntry {
  resource_id: string;
  resource_name: string;
  hours: number;
}

export interface PeriodBurn {
  id: string;
  tracker_project_id: string;
  period_start: string;
  period_end: string;
  period_label: string;
  total_hours: number;
  resource_breakdown: PeriodBurnResourceEntry[] | null;
  notes: string | null;
  is_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export interface TrackerProject {
  id: string;
  project_id: string;
  baseline_snapshot: string; // JSON blob frozen at win time
  baseline_total_cost: number | null;
  baseline_total_hours: number | null;
  kicked_off_at: string;
  notes: string | null;
  reporting_cadence?: ReportingCadence | null;
}

export interface TrackerProjectRow extends TrackerProject {
  project_name: string;
  client_name: string;
  project_status: ProjectLifecycleStatus | null;
  project_start_date: string | null;
  project_target_end_date: string | null;
}

export interface ProjectActual {
  id: string;
  tracker_project_id: string;
  period_label: string;
  actual_cost: number;
  notes: string | null;
  recorded_at: string;
}

export type InvoiceStatus = 'not_invoiced' | 'invoiced' | 'paid' | 'overdue';
export type TriggerType   = 'date' | 'milestone' | 'phase_complete' | 'client_approval' | 'contract_signing';

export interface BillingMilestone {
  id: string;
  project_id: string;
  tracker_project_id: string | null;
  title: string;
  description: string | null;
  deliverables: string | null;
  percentage: number;
  amount: number;
  planned_date: string | null;
  actual_date: string | null;
  invoice_number: string | null;
  invoice_status: InvoiceStatus;
  payment_terms: number;
  trigger_type: TriggerType;
  sort_order: number;
  notes: string | null;
  revised_date?: string | null;
  milestone_notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneTemplate {
  id: string;
  template_name: string;
  milestones_json: string;
}

export interface ComponentActual {
  id: string;
  tracker_project_id: string;
  wbs_component_id: string;
  actual_hours: number;
  is_complete: boolean;
  as_of_date: string;
  notes: string | null;
  updated_at: string;
}

export interface ComponentWithActual extends WBSComponent {
  actual_hours: number;
  is_complete: boolean;
  as_of_date: string | null;
  notes: string | null;
  variance: number;
  variance_percent: number;
  status: 'complete' | 'in_progress' | 'not_started';
  remaining: number;
}

export interface HealthSnapshot {
  id: string;
  tracker_project_id: string;
  snapshot_date: string;
  percent_complete: number | null;
  schedule_status: 'on_track' | 'at_risk' | 'behind';
  budget_status: 'on_track' | 'at_risk' | 'over_budget';
  scope_status: 'on_track' | 'at_risk' | 'changes_pending';
  notes: string | null;
  created_at: string;
}

export interface StatusReport {
  id: string;
  tracker_project_id: string;
  report_date: string;
  content: string;
  generated_by: 'ai' | 'manual';
  created_at: string;
}

export interface ChangeRequest {
  id: string;
  tracker_project_id: string;
  title: string;
  description: string | null;
  requested_by: string | null;
  status: 'open' | 'approved' | 'rejected';
  impact_hours: number | null;
  impact_cost: number | null;
  created_at: string;
}
