export type ProjectStatus = 'draft' | 'submitted' | 'won' | 'lost';

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
