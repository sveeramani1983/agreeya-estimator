"use server";

import { getDb } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import { revalidatePath } from "next/cache";
import { Project, ProjectStatus, WBSComponent, OverheadConfig, CustomOverhead, Resource, ResourceLoading, RateCardItem, AdditionalCost, CommercialsConfig, EstimateVersion, Assumption, Phase, PhaseTemplate, CoverageWarning, ResourceGanttData, WBSActual, PeriodCost, TrackerProject, TrackerProjectRow, ProjectActual, HealthSnapshot, StatusReport, ChangeRequest, PeriodBurn, PeriodBurnResourceEntry, ReportingCadence, BillingMilestone, MilestoneTemplate, InvoiceStatus, PipelineProject, MonthlyForecast, PipelineData, Client, ClientContact, ClientNote } from "./types";

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
          AND (
            (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(rl.period_label) = 10) OR
            (p.loading_period_type = 'monthly' AND length(rl.period_label) = 7)
          )
        ), 0) as total_cost,
        COALESCE((
          SELECT SUM(rl.hours)
          FROM resources r
          LEFT JOIN resource_loading rl ON r.id = rl.resource_id
          WHERE r.project_id = p.id
        ), 0) as resource_hours_loaded,
        COALESCE((
          SELECT cc.margin_percent
          FROM commercials_config cc
          WHERE cc.project_id = p.id
        ), 0) as margin_percent
      FROM projects p
      LEFT JOIN wbs_components w ON p.id = w.project_id
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).all() as any[];
    return projects;
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return [];
  }
}

export async function getProject(id: string) {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project;
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return null;
  }
}

export async function createProject(data: {
  name: string;
  client_name: string;
  client_id?: string | null;
  description?: string;
  status?: ProjectStatus;
}) {
  try {
    const db = getDb();
    const id = uuidv4();
    const status = data.status || "draft";

    // Auto-create a client record if a free-text name is given but no client_id
    let clientId = data.client_id ?? null;
    if (!clientId && data.client_name.trim()) {
      const existing = db.prepare("SELECT id FROM clients WHERE name = ?").get(data.client_name.trim()) as { id: string } | undefined;
      clientId = existing?.id ?? uuidv4();
      if (!existing) {
        db.prepare("INSERT INTO clients (id, name) VALUES (?, ?)").run(clientId, data.client_name.trim());
      }
    }

    db.prepare(`
      INSERT INTO projects (id, name, client_name, client_id, description, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.client_name, clientId, data.description || null, status);
    
    // Initialize default overhead config
    db.prepare(`
      INSERT INTO overhead_config (id, project_id)
      VALUES (?, ?)
    `).run(uuidv4(), id);

    revalidatePath("/projects");
    return { id };
  } catch (error) {
    console.error("Failed to create project:", error);
    throw new Error("Could not create project");
  }
}

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
    if (updates.timeline_start !== undefined) { setClauses.push("timeline_start = ?"); values.push(updates.timeline_start); }
    if (updates.timeline_end !== undefined) { setClauses.push("timeline_end = ?"); values.push(updates.timeline_end); }
    if (updates.timeline_mode !== undefined) { setClauses.push("timeline_mode = ?"); values.push(updates.timeline_mode); }
    if (updates.timeline_duration_value !== undefined) { setClauses.push("timeline_duration_value = ?"); values.push(updates.timeline_duration_value); }
    if (updates.timeline_duration_unit !== undefined) { setClauses.push("timeline_duration_unit = ?"); values.push(updates.timeline_duration_unit); }
    if (updates.tax_label !== undefined) { setClauses.push("tax_label = ?"); values.push(updates.tax_label); }
    if (updates.tax_percent !== undefined) { setClauses.push("tax_percent = ?"); values.push(updates.tax_percent); }
    if (updates.tax_mode !== undefined) { setClauses.push("tax_mode = ?"); values.push(updates.tax_mode); }
    if (updates.loading_period_type !== undefined) { setClauses.push("loading_period_type = ?"); values.push(updates.loading_period_type); }
    if (updates.client_id !== undefined) { setClauses.push("client_id = ?"); values.push(updates.client_id); }
    if (updates.project_status !== undefined) { setClauses.push("project_status = ?"); values.push(updates.project_status); }
    if (updates.project_start_date !== undefined) { setClauses.push("project_start_date = ?"); values.push(updates.project_start_date); }
    if (updates.project_target_end_date !== undefined) { setClauses.push("project_target_end_date = ?"); values.push(updates.project_target_end_date); }
    if (updates.win_probability !== undefined) { setClauses.push("win_probability = ?"); values.push(updates.win_probability); }
    if (updates.deal_size_category !== undefined) { setClauses.push("deal_size_category = ?"); values.push(updates.deal_size_category); }
    if (updates.expected_start_date !== undefined) { setClauses.push("expected_start_date = ?"); values.push(updates.expected_start_date); }
    if (updates.pursuit_owner !== undefined) { setClauses.push("pursuit_owner = ?"); values.push(updates.pursuit_owner); }
    if (updates.vertical !== undefined) { setClauses.push("vertical = ?"); values.push(updates.vertical); }
    if (updates.service_line !== undefined) { setClauses.push("service_line = ?"); values.push(updates.service_line); }

    if (setClauses.length > 0) {
      values.push(id);
      db.prepare(`UPDATE projects SET ${setClauses.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values);
    }
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
  } catch (error) {
    console.error("Failed to update project:", error);
    throw error;
  }
}

export async function deleteProject(id: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    revalidatePath("/projects");
  } catch (error) {
    console.error("Failed to delete project:", error);
    throw error;
  }
}

export async function getProjectStats() {
  try {
    const db = getDb();
    const totalProjects = db.prepare("SELECT COUNT(*) as count FROM projects").get() as { count: number };
    const activeEstimates = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'draft'").get() as { count: number };
    const wonProjects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'won'").get() as { count: number };
    
    // Sum of labor costs and additional costs for all projects
    // This is complex for a simple query, so we'll approximate with a reasonable placeholder or a multi-step fetch
    // For now, let's sum total hours * $100 as a proxy if we wanted real logic, 
    // but the user just wants the number tiles to work.
    
    const totalValueResult = db.prepare(`
      SELECT COALESCE(SUM(rl.hours * r.rate_per_hour), 0) as total
      FROM resources r
      JOIN projects p ON r.project_id = p.id
      LEFT JOIN resource_loading rl ON r.id = rl.resource_id
      AND (
        (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(rl.period_label) = 10) OR
        (p.loading_period_type = 'monthly' AND length(rl.period_label) = 7)
      )
    `).get() as { total: number };

    return {
      totalProjects: totalProjects.count,
      activeEstimates: activeEstimates.count,
      wonProjects: wonProjects.count,
      totalValue: totalValueResult.total
    };
  } catch (error) {
    console.error("Failed to fetch project stats:", error);
    return { totalProjects: 0, activeEstimates: 0, wonProjects: 0, totalValue: 0 };
  }
}

export async function getWBSComponents(projectId: string) {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM wbs_components WHERE project_id = ? ORDER BY sort_order ASC").all(projectId) as any[];
    return rows.map(r => ({
      ...r,
      subtasks: r.subtasks ? JSON.parse(r.subtasks) : [],
      is_hours_overridden: !!r.is_hours_overridden
    })) as WBSComponent[];
  } catch (error) {
    console.error("Failed to fetch WBS components:", error);
    return [];
  }
}

export async function getTotalConstructionHours(projectId: string) {
  try {
    const db = getDb();
    const result = db.prepare("SELECT SUM(base_hours) as total FROM wbs_components WHERE project_id = ?").get(projectId) as { total: number | null };
    return result.total || 0;
  } catch (error) {
    console.error("Failed to fetch total construction hours:", error);
    return 0;
  }
}

export async function getProjectSummaryData(projectId: string) {
  try {
    const finalHours = await getFinalEstimatedHours(projectId);
    const totalCost = await getProjectTotalCost(projectId);
    const wbsStats = await getWBSStats(projectId);
    
    return {
      baseHours: wbsStats.totalHours,
      contingencyAndOverhead: Math.max(0, finalHours - wbsStats.totalHours),
      finalCost: totalCost
    };
  } catch (error) {
    console.error("Failed to get project summary data:", error);
    return { baseHours: 0, contingencyAndOverhead: 0, finalCost: 0 };
  }
}

export async function getProjectTotalCost(projectId: string): Promise<number> {
  try {
    const project = await getProject(projectId);
    const laborCosts = await getLaborCosts(projectId);
    const additionalCosts = await getAdditionalCosts(projectId);
    const config = await getCommercialsConfig(projectId);
    
    if (!project) return 0;

    const loadedLaborCost = laborCosts.reduce((acc, curr) => acc + curr.total_cost, 0);
    const totalAdditionalCosts = additionalCosts.reduce((acc, curr) => {
      const lineTotal = curr.cost_type === 'monthly' ? (curr.amount || 0) * (curr.duration_months || 1) : (curr.amount || 0);
      return acc + lineTotal;
    }, 0);

    const subtotal = loadedLaborCost + totalAdditionalCosts;
    let marginAmount = 0;
    let preTaxTotal = subtotal;

    if (!config.rates_include_margin) {
      marginAmount = subtotal * (Math.max(0, config.margin_percent || 0) / 100);
      preTaxTotal = subtotal + marginAmount;
    }

    let taxAmount = 0;
    const taxPercent = project.tax_percent || 0;
    const taxMode = project.tax_mode || 'not_applicable';

    if (taxMode === 'full') {
      taxAmount = preTaxTotal * (taxPercent / 100);
    } else if (taxMode === 'additional_only') {
      taxAmount = totalAdditionalCosts * (taxPercent / 100);
    }

    return preTaxTotal + taxAmount;
  } catch (error) {
    console.error("Failed to calculate total cost:", error);
    return 0;
  }
}

export async function updateWBSComponents(projectId: string, components: WBSComponent[]) {
  try {
    const db = getDb();
    const update = db.transaction((items: WBSComponent[]) => {
      db.prepare("DELETE FROM wbs_components WHERE project_id = ?").run(projectId);
      const insert = db.prepare(`
        INSERT INTO wbs_components (
          id, project_id, category, component_name, description, 
          complexity, story_points, base_hours, confidence_level, 
          notes, sort_order, subtasks, is_hours_overridden
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insert.run(
          item.id, item.project_id, item.category, item.component_name, 
          item.description, item.complexity, item.story_points, 
          item.base_hours, item.confidence_level, item.notes, item.sort_order,
          JSON.stringify(item.subtasks || []),
          item.is_hours_overridden ? 1 : 0
        );
      }
    });
    update(components);
  } catch (error) {
    console.error("Failed to update WBS components:", error);
    throw error;
  }
}

export async function getLibraryComponents() {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM component_library ORDER BY category, component_name").all() as any[];
  } catch (error) {
    console.error("Failed to fetch library components:", error);
    return [];
  }
}

export async function getOverheadConfig(projectId: string): Promise<OverheadConfig> {
  try {
    const db = getDb();
    let config = db.prepare("SELECT * FROM overhead_config WHERE project_id = ?").get(projectId) as any;
    if (!config) {
      const id = uuidv4();
      db.prepare("INSERT INTO overhead_config (id, project_id) VALUES (?, ?)").run(id, projectId);
      config = db.prepare("SELECT * FROM overhead_config WHERE project_id = ?").get(projectId);
    }
    let customOverheads: CustomOverhead[] = [];
    try { customOverheads = config.custom_overheads ? JSON.parse(config.custom_overheads) : []; } catch {}
    return {
      ...config,
      ba_enabled: !!config.ba_enabled,
      qa_enabled: !!config.qa_enabled,
      devops_enabled: !!config.devops_enabled,
      ux_enabled: !!config.ux_enabled,
      pm_enabled: !!config.pm_enabled,
      change_mgmt_percent: config.change_mgmt_percent ?? 8,
      change_mgmt_enabled: !!config.change_mgmt_enabled,
      solutions_arch_percent: config.solutions_arch_percent ?? 5,
      solutions_arch_enabled: !!config.solutions_arch_enabled,
      training_percent: config.training_percent ?? 5,
      training_enabled: !!config.training_enabled,
      warranty_percent: config.warranty_percent ?? 10,
      warranty_enabled: !!config.warranty_enabled,
      risk_buffer_percent: config.risk_buffer_percent ?? 5,
      risk_buffer_enabled: !!config.risk_buffer_enabled,
      customOverheads,
    } as OverheadConfig;
  } catch (error) {
    console.error("Failed to fetch overhead config:", error);
    throw error;
  }
}

export async function updateOverheadConfig(projectId: string, config: OverheadConfig) {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE overhead_config SET
        ba_percent=?, ba_enabled=?,
        qa_percent=?, qa_enabled=?,
        devops_percent=?, devops_enabled=?,
        ux_percent=?, ux_enabled=?,
        pm_percent=?, pm_enabled=?,
        change_mgmt_percent=?, change_mgmt_enabled=?,
        solutions_arch_percent=?, solutions_arch_enabled=?,
        training_percent=?, training_enabled=?,
        warranty_percent=?, warranty_enabled=?,
        risk_buffer_percent=?, risk_buffer_enabled=?,
        custom_overheads=?,
        project_contingency_percent=?
      WHERE project_id=?
    `).run(
      config.ba_percent, config.ba_enabled ? 1 : 0,
      config.qa_percent, config.qa_enabled ? 1 : 0,
      config.devops_percent, config.devops_enabled ? 1 : 0,
      config.ux_percent, config.ux_enabled ? 1 : 0,
      config.pm_percent, config.pm_enabled ? 1 : 0,
      config.change_mgmt_percent, config.change_mgmt_enabled ? 1 : 0,
      config.solutions_arch_percent, config.solutions_arch_enabled ? 1 : 0,
      config.training_percent, config.training_enabled ? 1 : 0,
      config.warranty_percent, config.warranty_enabled ? 1 : 0,
      config.risk_buffer_percent, config.risk_buffer_enabled ? 1 : 0,
      JSON.stringify(config.customOverheads || []),
      config.project_contingency_percent,
      projectId
    );
  } catch (error) {
    console.error("Failed to update overhead config:", error);
    throw error;
  }
}

export async function getFinalEstimatedHours(projectId: string) {
  try {
    const constructionHours = await getTotalConstructionHours(projectId);
    const config = await getOverheadConfig(projectId);

    // Layer 1: % of constructionHours
    const l1Hours = [
      { percent: config.ba_percent, enabled: config.ba_enabled },
      { percent: config.qa_percent, enabled: config.qa_enabled },
      { percent: config.devops_percent, enabled: config.devops_enabled },
      { percent: config.ux_percent, enabled: config.ux_enabled },
    ].reduce((acc, i) => acc + (i.enabled ? constructionHours * (i.percent / 100) : 0), 0);
    const layer1Subtotal = constructionHours + l1Hours;

    // Layer 2: % of layer1Subtotal
    const l2Hours = [
      { percent: config.pm_percent, enabled: config.pm_enabled },
      { percent: config.change_mgmt_percent, enabled: config.change_mgmt_enabled },
      { percent: config.solutions_arch_percent, enabled: config.solutions_arch_enabled },
      { percent: config.training_percent, enabled: config.training_enabled },
      { percent: config.warranty_percent, enabled: config.warranty_enabled },
      { percent: config.risk_buffer_percent, enabled: config.risk_buffer_enabled },
    ].reduce((acc, i) => acc + (i.enabled ? layer1Subtotal * (i.percent / 100) : 0), 0);

    // Layer 3: % of layer1Subtotal (custom overheads)
    const l3Hours = (config.customOverheads || []).reduce(
      (acc, co) => acc + layer1Subtotal * (co.percent / 100), 0
    );

    const grandTotal = layer1Subtotal + l2Hours + l3Hours;
    const contingency = grandTotal * (config.project_contingency_percent / 100);
    return grandTotal + contingency;
  } catch (error) {
    console.error("Failed to calculate final hours:", error);
    return 0;
  }
}

export async function getResources(projectId: string) {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM resources WHERE project_id = ?").all(projectId) as Resource[];
  } catch (error) {
    console.error("Failed to fetch resources:", error);
    return [];
  }
}

export async function getRateCard() {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM rate_card ORDER BY role_title").all() as RateCardItem[];
  } catch (error) {
    console.error("Failed to fetch rate card:", error);
    return [];
  }
}

export async function updateResource(projectId: string, resource: Resource) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO resources (id, project_id, name, role, rate_per_hour, allocation_start, allocation_end, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        rate_per_hour = excluded.rate_per_hour,
        allocation_start = excluded.allocation_start,
        allocation_end = excluded.allocation_end,
        location = excluded.location
    `).run(
      resource.id, projectId, resource.name, resource.role,
      resource.rate_per_hour, resource.allocation_start, resource.allocation_end,
      resource.location ?? 'onsite'
    );
  } catch (error) {
    console.error("Failed to update resource:", error);
    throw error;
  }
}

export async function deleteResource(id: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM resources WHERE id = ?").run(id);
  } catch (error) {
    console.error("Failed to delete resource:", error);
    throw error;
  }
}

export async function getResourceLoading(projectId: string) {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM resource_loading WHERE project_id = ?").all(projectId) as ResourceLoading[];
  } catch (error) {
    console.error("Failed to fetch resource loading:", error);
    return [];
  }
}

export async function updateManyResourceLoading(items: ResourceLoading[]) {
  try {
    const db = getDb();
    
    const checkStmt = db.prepare("SELECT id FROM resource_loading WHERE resource_id = ? AND period_label = ?");
    const updateStmt = db.prepare("UPDATE resource_loading SET hours = ? WHERE id = ?");
    const insertStmt = db.prepare(`
      INSERT INTO resource_loading (id, resource_id, project_id, period_label, hours)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((list: ResourceLoading[]) => {
      for (const item of list) {
        const existing = checkStmt.get(item.resource_id, item.period_label) as { id: string } | undefined;
        if (existing) {
          updateStmt.run(item.hours, existing.id);
        } else {
          insertStmt.run(item.id, item.resource_id, item.project_id, item.period_label, item.hours);
        }
      }
    });
    
    transaction(items);
  } catch (error) {
    console.error("Failed to update resource loading:", error);
    throw error;
  }
}

export async function applyStaffingPlan(
  projectId: string,
  resources: Resource[],
  loading: ResourceLoading[]
) {
  try {
    const db = getDb();
    const insertResource = db.prepare(`
      INSERT INTO resources (id, project_id, name, role, rate_per_hour, allocation_start, allocation_end, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLoading = db.prepare(`
      INSERT INTO resource_loading (id, resource_id, project_id, period_label, hours)
      VALUES (?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      db.prepare("DELETE FROM resource_loading WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM resources WHERE project_id = ?").run(projectId);

      for (const r of resources) {
        insertResource.run(
          r.id,
          projectId,
          r.name,
          r.role,
          r.rate_per_hour,
          r.allocation_start,
          r.allocation_end,
          r.location ?? "onsite"
        );
      }

      for (const l of loading) {
        if (l.hours > 0) {
          insertLoading.run(l.id, l.resource_id, projectId, l.period_label, l.hours);
        }
      }
    });

    transaction();
    revalidatePath(`/projects/${projectId}/resources`);
    return { success: true };
  } catch (error) {
    console.error("Failed to apply staffing plan:", error);
    throw error;
  }
}

export async function applyCommercialsPlan(
  projectId: string,
  configUpdates: {
    margin_percent: number;
    quote_narrative: string;
  },
  milestones?: Array<{
    title: string;
    trigger_type: string;
    percentage: number;
    description: string;
    deliverables?: string;
  }>
) {
  try {
    const db = getDb();
    const transaction = db.transaction(() => {
      // 1. Update or Insert Commercials Config
      const existing = db.prepare("SELECT id FROM commercials_config WHERE project_id = ?").get(projectId) as { id: string } | undefined;
      if (existing) {
        db.prepare("UPDATE commercials_config SET margin_percent = ?, quote_narrative = ? WHERE project_id = ?").run(
          configUpdates.margin_percent,
          configUpdates.quote_narrative,
          projectId
        );
      } else {
        db.prepare("INSERT INTO commercials_config (id, project_id, margin_percent, quote_narrative) VALUES (?, ?, ?, ?)").run(
          uuidv4(),
          projectId,
          configUpdates.margin_percent,
          configUpdates.quote_narrative
        );
      }

      // 2. If milestones are provided, insert them
      if (milestones && milestones.length > 0) {
        db.prepare("DELETE FROM billing_milestones WHERE project_id = ?").run(projectId);
        
        // Deterministic quoted price calculation for milestone amounts
        const laborCost = db.prepare(`
          SELECT COALESCE(SUM(l.hours * r.rate_per_hour), 0) as total
          FROM resources r
          LEFT JOIN resource_loading l ON l.resource_id = r.id AND l.project_id = r.project_id
          WHERE r.project_id = ?
        `).get(projectId) as { total: number } | undefined;

        const addCost = db.prepare(`
          SELECT COALESCE(SUM(CASE WHEN cost_type = 'monthly' THEN amount * duration_months ELSE amount END), 0) as total
          FROM additional_costs WHERE project_id = ?
        `).get(projectId) as { total: number } | undefined;

        const subtotal = (laborCost?.total || 0) + (addCost?.total || 0);
        const quotedPrice = subtotal * (1 + configUpdates.margin_percent / 100);

        const insertMilestone = db.prepare(`
          INSERT INTO billing_milestones (
            id, project_id, title, description, deliverables, percentage, amount,
            invoice_status, payment_terms, trigger_type, sort_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'not_invoiced', 30, ?, ?)
        `);

        let sortOrder = 0;
        for (const m of milestones) {
          const mAmount = Math.round(quotedPrice * (m.percentage / 100));
          insertMilestone.run(
            uuidv4(),
            projectId,
            m.title,
            m.description || null,
            m.deliverables || null,
            m.percentage,
            mAmount,
            m.trigger_type || "milestone",
            sortOrder++
          );
        }
      }
    });

    transaction();
    revalidatePath(`/projects/${projectId}/commercials`);
    revalidatePath(`/projects/${projectId}/summary`);
    return { success: true };
  } catch (error) {
    console.error("Failed to apply commercials plan:", error);
    throw error;
  }
}

export async function getAdditionalCosts(projectId: string) {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM additional_costs WHERE project_id = ?").all(projectId) as AdditionalCost[];
  } catch (error) {
    console.error("Failed to fetch additional costs:", error);
    return [];
  }
}

export async function updateAdditionalCost(projectId: string, cost: AdditionalCost) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO additional_costs (id, project_id, label, cost_type, amount, duration_months, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label = excluded.label,
        cost_type = excluded.cost_type,
        amount = excluded.amount,
        duration_months = excluded.duration_months,
        notes = excluded.notes
    `).run(cost.id, projectId, cost.label, cost.cost_type, cost.amount, cost.duration_months, cost.notes);
  } catch (error) {
    console.error("Failed to update additional cost:", error);
    throw error;
  }
}

export async function deleteAdditionalCost(id: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM additional_costs WHERE id = ?").run(id);
  } catch (error) {
    console.error("Failed to delete additional cost:", error);
    throw error;
  }
}

export async function getCommercialsConfig(projectId: string) {
  try {
    const db = getDb();
    let config = db.prepare("SELECT * FROM commercials_config WHERE project_id = ?").get(projectId) as any;
    if (!config) {
      const id = uuidv4();
      db.prepare("INSERT INTO commercials_config (id, project_id) VALUES (?, ?)").run(id, projectId);
      config = db.prepare("SELECT * FROM commercials_config WHERE project_id = ?").get(projectId);
    }
    return {
      ...config,
      rates_include_margin: !!config.rates_include_margin,
      show_margin_to_client: !!config.show_margin_to_client,
    } as CommercialsConfig;
  } catch (error) {
    console.error("Failed to fetch commercials config:", error);
    throw error;
  }
}

export async function updateCommercialsConfig(projectId: string, config: CommercialsConfig) {
  try {
    const db = getDb();
    db.prepare(`
      UPDATE commercials_config SET
        margin_percent = ?,
        rates_include_margin = ?,
        show_margin_to_client = ?,
        quote_narrative = ?
      WHERE project_id = ?
    `).run(
      config.margin_percent,
      config.rates_include_margin ? 1 : 0,
      config.show_margin_to_client ? 1 : 0,
      config.quote_narrative,
      projectId
    );
  } catch (error) {
    console.error("Failed to update commercials config:", error);
    throw error;
  }
}

export async function getLaborCosts(projectId: string) {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT
        r.id as resource_id,
        r.name,
        r.role,
        r.rate_per_hour,
        COALESCE(r.location, 'onsite') as location,
        COALESCE(SUM(l.hours), 0) as total_hours,
        (COALESCE(SUM(l.hours), 0) * r.rate_per_hour) as total_cost
      FROM resources r
      JOIN projects p ON r.project_id = p.id
      LEFT JOIN resource_loading l
        ON l.resource_id = r.id 
        AND l.project_id = r.project_id
        AND (
          (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(l.period_label) = 10) OR
          (p.loading_period_type = 'monthly' AND length(l.period_label) = 7)
        )
      WHERE r.project_id = ?
      GROUP BY r.id
    `).all(projectId) as any[];
  } catch (error) {
    console.error("Failed to fetch labor costs:", error);
    return [];
  }
}

export async function clearAllResourceLoading(projectId: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM resource_loading WHERE project_id = ?").run(projectId);
    revalidatePath(`/projects/${projectId}/resources`);
  } catch (error) {
    console.error("Failed to clear resource loading:", error);
    throw error;
  }
}

export async function deleteManyResourceLoading(projectId: string, periodLabels: string[]) {
  try {
    const db = getDb();
    const del = db.prepare("DELETE FROM resource_loading WHERE project_id = ? AND period_label = ?");
    db.transaction(() => {
      for (const label of periodLabels) del.run(projectId, label);
    })();
  } catch (error) {
    console.error("Failed to delete resource loading:", error);
    throw error;
  }
}

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

export async function getProjectConfidenceScore(projectId: string): Promise<number> {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT base_hours, confidence_level FROM wbs_components WHERE project_id = ?"
    ).all(projectId) as { base_hours: number; confidence_level: string }[];

    if (rows.length === 0) return 0;

    const CONFIDENCE_CONTINGENCY: Record<string, number> = {
      high: 0.1, medium: 0.2, low: 0.35, spike: 0
    };

    const baseHours = rows.reduce((sum, r) => sum + (r.base_hours || 0), 0);
    if (baseHours === 0) return 0;

    const contingencyHours = rows.reduce((sum, r) => {
      return sum + (r.base_hours || 0) * (CONFIDENCE_CONTINGENCY[r.confidence_level] || 0);
    }, 0);

    const weightedContingency = (contingencyHours / baseHours) * 100;
    return Math.round(Math.max(0, Math.min(100, 100 - weightedContingency)));
  } catch {
    return 0;
  }
}

export async function getWBSStats(projectId: string) {
  try {
    const db = getDb();
    const result = db.prepare(`
      SELECT
        SUM(CASE WHEN complexity != 'spike' THEN story_points ELSE 0 END) as total_sp,
        SUM(base_hours) as total_hours
      FROM wbs_components
      WHERE project_id = ?
    `).get(projectId) as { total_sp: number | null, total_hours: number | null };
    return {
      totalSP: result.total_sp || 0,
      totalHours: result.total_hours || 0
    };
  } catch (error) {
    console.error("Failed to fetch WBS stats:", error);
    return { totalSP: 0, totalHours: 0 };
  }
}

export async function createLibraryComponent(data: any) {
  try {
    const db = getDb();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO component_library (id, category, component_name, description, complexity, story_points, base_hours, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.category, data.component_name, data.description || null, data.complexity, data.story_points, data.base_hours, data.notes || null);
    revalidatePath("/library");
  } catch (error) {
    console.error("Failed to create library component:", error);
    throw error;
  }
}

export async function updateLibraryComponent(id: string, updates: any) {
  try {
    const db = getDb();
    const setClauses = [];
    const values = [];
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue;
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
    if (setClauses.length > 0) {
      values.push(id);
      db.prepare(`UPDATE component_library SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
    }
    revalidatePath("/library");
  } catch (error) {
    console.error("Failed to update library component:", error);
    throw error;
  }
}

export async function deleteLibraryComponent(id: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM component_library WHERE id = ?").run(id);
    revalidatePath("/library");
  } catch (error) {
    console.error("Failed to delete library component:", error);
    throw error;
  }
}

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
        errors.push(`Row ${i + 1}: invalid complexity "${item.complexity}" — must be one of simple, medium, complex, very_complex, spike`);
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

export async function duplicateProject(id: string) {
  try {
    const db = getDb();
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
    if (!project) throw new Error("Project not found");

    const newId = uuidv4();

    db.transaction(() => {
      // 1. Clone projects row (preserve tax/timeline settings; force status=draft)
      db.prepare(`
        INSERT INTO projects (id, name, client_name, description, status, tax_label, tax_percent, tax_mode, loading_period_type)
        VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
      `).run(newId, `${project.name} (Copy)`, project.client_name, project.description,
             project.tax_label, project.tax_percent, project.tax_mode, project.loading_period_type);

      // 2. Clone overhead_config with actual values (not schema defaults)
      const oc = db.prepare("SELECT * FROM overhead_config WHERE project_id = ?").get(id) as any;
      if (oc) {
        db.prepare(`
          INSERT INTO overhead_config (
            id, project_id,
            ba_percent, ba_enabled, qa_percent, qa_enabled, pm_percent, pm_enabled,
            devops_percent, devops_enabled, ux_percent, ux_enabled,
            custom_label_1, custom_percent_1, custom_enabled_1,
            custom_label_2, custom_percent_2, custom_enabled_2,
            custom_label_3, custom_percent_3, custom_enabled_3,
            custom_label_4, custom_percent_4, custom_enabled_4,
            project_contingency_percent,
            change_mgmt_percent, change_mgmt_enabled,
            solutions_arch_percent, solutions_arch_enabled,
            training_percent, training_enabled,
            warranty_percent, warranty_enabled,
            risk_buffer_percent, risk_buffer_enabled,
            custom_overheads
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          uuidv4(), newId,
          oc.ba_percent, oc.ba_enabled, oc.qa_percent, oc.qa_enabled,
          oc.pm_percent, oc.pm_enabled, oc.devops_percent, oc.devops_enabled,
          oc.ux_percent, oc.ux_enabled,
          oc.custom_label_1, oc.custom_percent_1, oc.custom_enabled_1,
          oc.custom_label_2, oc.custom_percent_2, oc.custom_enabled_2,
          oc.custom_label_3, oc.custom_percent_3, oc.custom_enabled_3,
          oc.custom_label_4, oc.custom_percent_4, oc.custom_enabled_4,
          oc.project_contingency_percent,
          oc.change_mgmt_percent, oc.change_mgmt_enabled,
          oc.solutions_arch_percent, oc.solutions_arch_enabled,
          oc.training_percent, oc.training_enabled,
          oc.warranty_percent, oc.warranty_enabled,
          oc.risk_buffer_percent, oc.risk_buffer_enabled,
          oc.custom_overheads ?? '[]'
        );
      } else {
        db.prepare("INSERT INTO overhead_config (id, project_id) VALUES (?, ?)").run(uuidv4(), newId);
      }

      // 3. Clone wbs_components
      const wbsRows = db.prepare("SELECT * FROM wbs_components WHERE project_id = ?").all(id) as WBSComponent[];
      const insertWbs = db.prepare(`
        INSERT INTO wbs_components (
          id, project_id, category, component_name, description,
          complexity, story_points, base_hours, confidence_level,
          notes, sort_order, subtasks, is_hours_overridden
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const row of wbsRows) {
        insertWbs.run(
          uuidv4(), newId, row.category, row.component_name, row.description,
          row.complexity, row.story_points, row.base_hours, row.confidence_level,
          row.notes, row.sort_order,
          row.subtasks || '[]',
          row.is_hours_overridden ? 1 : 0
        );
      }

      // 4. Clone resources (build old→new ID map for resource_loading)
      const resources = db.prepare("SELECT * FROM resources WHERE project_id = ?").all(id) as any[];
      const resourceIdMap = new Map<string, string>();
      const insertRes = db.prepare(
        "INSERT INTO resources (id, project_id, name, role, rate_per_hour, allocation_start, allocation_end, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      for (const r of resources) {
        const newResId = uuidv4();
        resourceIdMap.set(r.id, newResId);
        insertRes.run(newResId, newId, r.name, r.role, r.rate_per_hour, r.allocation_start, r.allocation_end, r.location ?? 'onsite');
      }

      // 5. Clone resource_loading (remap resource_id)
      const loadingRows = db.prepare("SELECT * FROM resource_loading WHERE project_id = ?").all(id) as any[];
      const insertRL = db.prepare(
        "INSERT INTO resource_loading (id, resource_id, project_id, period_label, hours) VALUES (?, ?, ?, ?, ?)"
      );
      for (const rl of loadingRows) {
        const newResId = resourceIdMap.get(rl.resource_id);
        if (newResId) insertRL.run(uuidv4(), newResId, newId, rl.period_label, rl.hours);
      }

      // 6. Clone additional_costs
      const costs = db.prepare("SELECT * FROM additional_costs WHERE project_id = ?").all(id) as any[];
      const insertAC = db.prepare(
        "INSERT INTO additional_costs (id, project_id, label, cost_type, amount, duration_months, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      for (const ac of costs) {
        insertAC.run(uuidv4(), newId, ac.label, ac.cost_type, ac.amount, ac.duration_months, ac.notes);
      }

      // 7. Clone commercials_config
      const cc = db.prepare("SELECT * FROM commercials_config WHERE project_id = ?").get(id) as any;
      if (cc) {
        db.prepare(
          "INSERT INTO commercials_config (id, project_id, margin_percent, rates_include_margin, show_margin_to_client, quote_narrative) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(uuidv4(), newId, cc.margin_percent, cc.rates_include_margin, cc.show_margin_to_client, cc.quote_narrative);
      }

      // 8. Clone assumptions
      const assumptions = db.prepare("SELECT * FROM assumptions WHERE project_id = ?").all(id) as any[];
      const insertA = db.prepare(`
        INSERT INTO assumptions (id, project_id, type, title, description, category, likelihood, impact, risk_score, mitigation, owner, status, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const a of assumptions) {
        insertA.run(uuidv4(), newId, a.type, a.title, a.description, a.category, a.likelihood, a.impact, a.risk_score, a.mitigation, a.owner, a.status, a.sort_order);
      }
    })();

    revalidatePath("/projects");
    return { id: newId };
  } catch (error) {
    console.error("Failed to duplicate project:", error);
    throw error;
  }
}

export async function createRateCard(data: { role_title: string; onsite_rate: number; offshore_rate: number; notes?: string | null }) {
  try {
    const db = getDb();
    const id = uuidv4();
    db.prepare(`
      INSERT INTO rate_card (id, role_title, standard_rate, onsite_rate, offshore_rate, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.role_title, data.onsite_rate, data.onsite_rate, data.offshore_rate, data.notes || null);
    revalidatePath("/rates");
  } catch (error) {
    console.error("Failed to create rate card role:", error);
    throw error;
  }
}

export async function updateRateCard(id: string, updates: Partial<RateCardItem>) {
  try {
    const db = getDb();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (updates.role_title !== undefined) { setClauses.push("role_title = ?"); values.push(updates.role_title); }
    if (updates.onsite_rate !== undefined) {
      setClauses.push("onsite_rate = ?"); values.push(updates.onsite_rate);
      setClauses.push("standard_rate = ?"); values.push(updates.onsite_rate);
    } else if (updates.standard_rate !== undefined) {
      setClauses.push("standard_rate = ?"); values.push(updates.standard_rate);
      setClauses.push("onsite_rate = ?"); values.push(updates.standard_rate);
    }
    if (updates.offshore_rate !== undefined) { setClauses.push("offshore_rate = ?"); values.push(updates.offshore_rate); }
    if (updates.notes !== undefined) { setClauses.push("notes = ?"); values.push(updates.notes); }
    if (setClauses.length > 0) {
      values.push(id);
      db.prepare(`UPDATE rate_card SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
    }
    revalidatePath("/rates");
  } catch (error) {
    console.error("Failed to update rate card:", error);
    throw error;
  }
}

export async function deleteRateCard(id: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM rate_card WHERE id = ?").run(id);
    revalidatePath("/rates");
  } catch (error) {
    console.error("Failed to delete rate card role:", error);
    throw error;
  }
}

// ── Estimate Versioning ───────────────────────────────────────────────────────

export async function getEstimateVersions(projectId: string): Promise<EstimateVersion[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM estimate_versions WHERE project_id = ? ORDER BY version_number DESC").all(projectId) as EstimateVersion[];
  } catch (error) {
    console.error("Failed to fetch estimate versions:", error);
    return [];
  }
}

export async function createEstimateVersion(projectId: string, label: string, notes: string | null): Promise<string> {
  try {
    const db = getDb();
    const maxResult = db.prepare("SELECT COALESCE(MAX(version_number), 0) as max_v FROM estimate_versions WHERE project_id = ?").get(projectId) as { max_v: number };
    const versionNumber = maxResult.max_v + 1;

    const wbsComponents = db.prepare("SELECT * FROM wbs_components WHERE project_id = ?").all(projectId);
    const overheadConfig = db.prepare("SELECT * FROM overhead_config WHERE project_id = ?").get(projectId);
    const resources = db.prepare("SELECT * FROM resources WHERE project_id = ?").all(projectId);
    const resourceLoading = db.prepare("SELECT rl.* FROM resource_loading rl JOIN resources r ON rl.resource_id = r.id WHERE r.project_id = ?").all(projectId);
    const additionalCosts = db.prepare("SELECT * FROM additional_costs WHERE project_id = ?").all(projectId);
    const commercialsConfig = db.prepare("SELECT * FROM commercials_config WHERE project_id = ?").get(projectId);

    const totalHoursResult = db.prepare("SELECT COALESCE(SUM(base_hours),0) as total FROM wbs_components WHERE project_id = ?").get(projectId) as { total: number };
    const totalSPResult = db.prepare("SELECT COALESCE(SUM(CASE WHEN complexity!='spike' THEN story_points ELSE 0 END),0) as total FROM wbs_components WHERE project_id = ?").get(projectId) as { total: number };
    
    // Accurate calculation including margin, additional costs, and taxes
    const finalTotalCost = await getProjectTotalCost(projectId);

    const snapshot = JSON.stringify({ wbsComponents, overheadConfig, resources, resourceLoading, additionalCosts, commercialsConfig });
    const id = uuidv4();
    db.prepare("INSERT INTO estimate_versions (id, project_id, version_number, version_label, snapshot, total_hours, total_cost, total_sp, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, projectId, versionNumber, label, snapshot, totalHoursResult.total, finalTotalCost, totalSPResult.total, notes);

    revalidatePath(`/projects/${projectId}/versions`);
    return id;
  } catch (error) {
    console.error("Failed to create estimate version:", error);
    throw error;
  }
}

export async function restoreEstimateVersion(projectId: string, versionId: string) {
  try {
    const db = getDb();
    const version = db.prepare("SELECT * FROM estimate_versions WHERE id = ? AND project_id = ?").get(versionId, projectId) as EstimateVersion;
    if (!version) throw new Error("Version not found");

    // Auto-save current state before overwriting
    await createEstimateVersion(projectId, `Auto-save before restore ${new Date().toLocaleString()}`, null);

    const snapshot = JSON.parse(version.snapshot);

    db.transaction(() => {
      db.prepare("DELETE FROM wbs_components WHERE project_id = ?").run(projectId);
      const iWBS = db.prepare(`
        INSERT INTO wbs_components (
          id, project_id, category, component_name, description, 
          complexity, story_points, base_hours, confidence_level, 
          notes, sort_order, subtasks, is_hours_overridden
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of (snapshot.wbsComponents || [])) {
        iWBS.run(
          c.id, projectId, c.category, c.component_name, c.description, 
          c.complexity, c.story_points, c.base_hours, c.confidence_level, 
          c.notes, c.sort_order,
          c.subtasks ? JSON.stringify(c.subtasks) : '[]',
          c.is_hours_overridden ? 1 : 0
        );
      }

      if (snapshot.overheadConfig) {
        const oc = snapshot.overheadConfig;
        db.prepare(`UPDATE overhead_config SET
          ba_percent=?,ba_enabled=?,qa_percent=?,qa_enabled=?,devops_percent=?,devops_enabled=?,ux_percent=?,ux_enabled=?,
          pm_percent=?,pm_enabled=?,
          change_mgmt_percent=?,change_mgmt_enabled=?,solutions_arch_percent=?,solutions_arch_enabled=?,
          training_percent=?,training_enabled=?,warranty_percent=?,warranty_enabled=?,risk_buffer_percent=?,risk_buffer_enabled=?,
          custom_overheads=?,project_contingency_percent=? WHERE project_id=?`)
          .run(
            oc.ba_percent??10, oc.ba_enabled??1, oc.qa_percent??15, oc.qa_enabled??1,
            oc.devops_percent??8, oc.devops_enabled??0, oc.ux_percent??5, oc.ux_enabled??0,
            oc.pm_percent??12, oc.pm_enabled??1,
            oc.change_mgmt_percent??8, oc.change_mgmt_enabled??1,
            oc.solutions_arch_percent??5, oc.solutions_arch_enabled??0,
            oc.training_percent??5, oc.training_enabled??0,
            oc.warranty_percent??10, oc.warranty_enabled??0,
            oc.risk_buffer_percent??5, oc.risk_buffer_enabled??0,
            oc.custom_overheads ?? '[]',
            oc.project_contingency_percent??0, projectId
          );
      }

      db.prepare("DELETE FROM resources WHERE project_id = ?").run(projectId);
      const iRes = db.prepare("INSERT INTO resources (id, project_id, name, role, rate_per_hour, allocation_start, allocation_end, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const r of (snapshot.resources || [])) {
        iRes.run(r.id, projectId, r.name, r.role, r.rate_per_hour, r.allocation_start, r.allocation_end, r.location || 'onsite');
      }

      db.prepare("DELETE FROM resource_loading WHERE project_id = ?").run(projectId);
      const iRL = db.prepare("INSERT INTO resource_loading (id, resource_id, project_id, period_label, hours) VALUES (?, ?, ?, ?, ?)");
      for (const rl of (snapshot.resourceLoading || [])) {
        iRL.run(rl.id, rl.resource_id, projectId, rl.period_label, rl.hours);
      }

      db.prepare("DELETE FROM additional_costs WHERE project_id = ?").run(projectId);
      const iAC = db.prepare("INSERT INTO additional_costs (id, project_id, label, cost_type, amount, duration_months, notes) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const ac of (snapshot.additionalCosts || [])) {
        iAC.run(ac.id, projectId, ac.label, ac.cost_type, ac.amount, ac.duration_months, ac.notes);
      }

      if (snapshot.commercialsConfig) {
        const cc = snapshot.commercialsConfig;
        db.prepare("UPDATE commercials_config SET margin_percent=?,rates_include_margin=?,show_margin_to_client=?,quote_narrative=? WHERE project_id=?")
          .run(cc.margin_percent, cc.rates_include_margin, cc.show_margin_to_client, cc.quote_narrative, projectId);
      }
    })();

    for (const seg of ["", "/estimate", "/overhead", "/resources", "/commercials", "/versions"]) {
      revalidatePath(`/projects/${projectId}${seg}`);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to restore estimate version:", error);
    throw error;
  }
}

// ── Assumptions & Risks ───────────────────────────────────────────────────────

export async function getAssumptions(projectId: string): Promise<Assumption[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM assumptions WHERE project_id = ? AND type = 'assumption' ORDER BY sort_order ASC, created_at ASC").all(projectId) as Assumption[];
  } catch (error) {
    console.error("Failed to fetch assumptions:", error);
    return [];
  }
}

export async function getRisks(projectId: string): Promise<Assumption[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM assumptions WHERE project_id = ? AND type = 'risk' ORDER BY sort_order ASC, created_at ASC").all(projectId) as Assumption[];
  } catch (error) {
    console.error("Failed to fetch risks:", error);
    return [];
  }
}

export async function getAllAssumptionsAndRisks(projectId: string): Promise<Assumption[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM assumptions WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC").all(projectId) as Assumption[];
  } catch (error) {
    console.error("Failed to fetch assumptions/risks:", error);
    return [];
  }
}

export async function upsertAssumption(projectId: string, assumption: Assumption) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO assumptions (id, project_id, type, title, description, category, likelihood, impact, risk_score, mitigation, owner, status, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type=excluded.type, title=excluded.title, description=excluded.description,
        category=excluded.category, likelihood=excluded.likelihood, impact=excluded.impact,
        risk_score=excluded.risk_score, mitigation=excluded.mitigation,
        owner=excluded.owner, status=excluded.status, sort_order=excluded.sort_order
    `).run(assumption.id, projectId, assumption.type, assumption.title, assumption.description,
      assumption.category, assumption.likelihood, assumption.impact, assumption.risk_score,
      assumption.mitigation, assumption.owner, assumption.status, assumption.sort_order);
    revalidatePath(`/projects/${projectId}/risks`);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    console.error("Failed to upsert assumption:", error);
    throw error;
  }
}

export async function deleteAssumption(projectId: string, id: string) {
  try {
    const db = getDb();
    db.prepare("DELETE FROM assumptions WHERE id = ?").run(id);
    revalidatePath(`/projects/${projectId}/risks`);
    revalidatePath(`/projects/${projectId}`);
  } catch (error) {
    console.error("Failed to delete assumption:", error);
    throw error;
  }
}

export async function getAssumptionCounts(projectId: string) {
  try {
    const db = getDb();
    const result = db.prepare(`
      SELECT
        SUM(CASE WHEN type='assumption' AND status='open' THEN 1 ELSE 0 END) as open_assumptions,
        SUM(CASE WHEN type='risk' THEN 1 ELSE 0 END) as total_risks,
        SUM(CASE WHEN type='risk' AND risk_score >= 6 THEN 1 ELSE 0 END) as high_risks,
        SUM(CASE WHEN type='risk' AND risk_score >= 3 AND risk_score < 6 THEN 1 ELSE 0 END) as med_risks,
        SUM(CASE WHEN type='risk' AND (risk_score IS NULL OR risk_score < 3) THEN 1 ELSE 0 END) as low_risks
      FROM assumptions WHERE project_id = ?
    `).get(projectId) as any;
    return {
      openAssumptions: result?.open_assumptions || 0,
      totalRisks: result?.total_risks || 0,
      highRisks: result?.high_risks || 0,
      medRisks: result?.med_risks || 0,
      lowRisks: result?.low_risks || 0,
    };
  } catch {
    return { openAssumptions: 0, totalRisks: 0, highRisks: 0, medRisks: 0, lowRisks: 0 };
  }
}

// ── Win / Loss Tracking ───────────────────────────────────────────────────────

async function buildBaselineSnapshot(projectId: string) {
  const db = getDb();
  const wbsComponents = db.prepare("SELECT * FROM wbs_components WHERE project_id = ?").all(projectId);
  const overheadConfig = db.prepare("SELECT * FROM overhead_config WHERE project_id = ?").get(projectId);
  const resources = db.prepare("SELECT * FROM resources WHERE project_id = ?").all(projectId);
  const resourceLoading = db.prepare("SELECT rl.* FROM resource_loading rl JOIN resources r ON rl.resource_id = r.id WHERE r.project_id = ?").all(projectId);
  const additionalCosts = db.prepare("SELECT * FROM additional_costs WHERE project_id = ?").all(projectId);
  const commercialsConfig = db.prepare("SELECT * FROM commercials_config WHERE project_id = ?").get(projectId);
  const totalHoursResult = db.prepare("SELECT COALESCE(SUM(base_hours),0) as total FROM wbs_components WHERE project_id = ?").get(projectId) as { total: number };
  const totalCost = await getProjectTotalCost(projectId);
  return { wbsComponents, overheadConfig, resources, resourceLoading, additionalCosts, commercialsConfig, totalCost, totalHours: totalHoursResult.total, quotedPrice: totalCost, capturedAt: new Date().toISOString() };
}

export async function updateProjectOutcome(projectId: string, status: ProjectStatus, outcomeData: Record<string, unknown> | null) {
  try {
    const db = getDb();
    db.prepare("UPDATE projects SET status=?, outcome_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .run(status, outcomeData ? JSON.stringify(outcomeData) : null, projectId);
    // Auto-version on status transition to submitted/won/lost
    if (status === 'submitted' || status === 'won' || status === 'lost') {
      const label = status === 'submitted' ? 'Auto-save: Submitted' : status === 'won' ? 'Auto-save: Won' : 'Auto-save: Lost';
      try { await createEstimateVersion(projectId, label, null); } catch {}
    }
    // Auto-create tracker_projects record when won
    if (status === 'won') {
      const existing = db.prepare("SELECT id FROM tracker_projects WHERE project_id = ?").get(projectId) as any;
      if (!existing) {
        try {
          const snapshot = await buildBaselineSnapshot(projectId);
          db.prepare("INSERT INTO tracker_projects (id, project_id, baseline_snapshot, baseline_total_cost, baseline_total_hours) VALUES (?, ?, ?, ?, ?)")
            .run(uuidv4(), projectId, JSON.stringify(snapshot), snapshot.totalCost, snapshot.totalHours);
        } catch (e) { console.warn("Failed to create tracker project:", e); }
      }
      // Link billing milestones to the tracker record
      try {
        const tp = db.prepare("SELECT id FROM tracker_projects WHERE project_id = ?").get(projectId) as any;
        if (tp) {
          db.prepare("UPDATE billing_milestones SET tracker_project_id = ? WHERE project_id = ? AND tracker_project_id IS NULL")
            .run(tp.id, projectId);
        }
      } catch {}
      revalidatePath("/tracker");
      revalidatePath("/tracker/projects");
    }
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/analytics");
  } catch (error) {
    console.error("Failed to update project outcome:", error);
    throw error;
  }
}

// ── RFP Analyzer ─────────────────────────────────────────────────────────────

export interface SuggestedWBSComponent {
  category: string
  componentName: string
  description: string
  complexity: 'simple' | 'medium' | 'complex' | 'very_complex' | 'spike'
  storyPoints: number
  baseHours: number
  confidence: 'high' | 'medium' | 'low' | 'spike'
  rationale: string
  source?: 'library' | 'custom'
  libraryComponentId?: string | null
}

export async function saveRfpAnalysis(data: {
  filename: string
  fileSize: number
  analysisJson: string
  projectId?: string
}): Promise<string> {
  try {
    const db = getDb()
    const id = uuidv4()
    db.prepare(
      "INSERT INTO rfp_analyses (id, project_id, filename, file_size, analysis_json) VALUES (?, ?, ?, ?, ?)"
    ).run(id, data.projectId || null, data.filename, data.fileSize, data.analysisJson)
    return id
  } catch (error) {
    console.error("Failed to save RFP analysis:", error)
    throw error
  }
}

export async function getRfpAnalyses(): Promise<Array<{
  id: string
  filename: string | null
  file_size: number | null
  created_at: string
  analysis_json: string
}>> {
  try {
    const db = getDb()
    return db.prepare(
      "SELECT id, filename, file_size, created_at, analysis_json FROM rfp_analyses ORDER BY created_at DESC LIMIT 20"
    ).all() as any[]
  } catch {
    return []
  }
}

export async function importWBSFromRFP(
  projectId: string,
  components: SuggestedWBSComponent[]
) {
  try {
    const db = getDb()

    const insert = db.prepare(`
      INSERT INTO wbs_components (
        id, project_id, category, component_name,
        description, complexity, story_points,
        base_hours, confidence_level, notes, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const findLibById = db.prepare(
      "SELECT id, category, component_name, description, complexity, story_points, base_hours FROM component_library WHERE id = ?"
    )
    const findLibByName = db.prepare(
      "SELECT id, category, component_name, description, complexity, story_points, base_hours FROM component_library WHERE LOWER(TRIM(component_name)) = LOWER(TRIM(?)) LIMIT 1"
    )
    const incrementLibUsage = db.prepare(
      "UPDATE component_library SET times_used = COALESCE(times_used, 0) + 1 WHERE id = ?"
    )

    const maxOrder = db.prepare(
      "SELECT COALESCE(MAX(sort_order), 0) as max FROM wbs_components WHERE project_id = ?"
    ).get(projectId) as { max: number }

    db.transaction(() => {
      components.forEach((comp, index) => {
        const matchedLib = (
          (comp.libraryComponentId ? findLibById.get(comp.libraryComponentId) : undefined) ??
          (comp.source === "library" && comp.componentName ? findLibByName.get(comp.componentName) : undefined)
        ) as
          | {
              id: string
              category: string
              component_name: string
              description: string | null
              complexity: string
              story_points: number
              base_hours: number
            }
          | undefined

        const rawComplexity = (matchedLib ? matchedLib.complexity : comp.complexity || "medium").replace("-", "_")
        const validComplexities = new Set(["simple", "medium", "complex", "very_complex", "spike"])
        const complexity = validComplexities.has(rawComplexity) ? rawComplexity : "medium"

        const rawCategory = matchedLib ? matchedLib.category : comp.category === "Data" ? "Data/Analytics" : comp.category || "Other"
        const componentName = matchedLib ? matchedLib.component_name : comp.componentName
        const description = matchedLib ? (matchedLib.description || comp.description || "") : comp.description
        const storyPoints = matchedLib ? matchedLib.story_points : comp.storyPoints
        const baseHours = matchedLib ? matchedLib.base_hours : comp.baseHours

        const validConfidences = new Set(["high", "medium", "low", "spike"])
        const confidence =
          complexity === "spike"
            ? "spike"
            : validConfidences.has(comp.confidence)
            ? comp.confidence
            : "medium"

        insert.run(
          uuidv4(),
          projectId,
          rawCategory,
          componentName,
          description,
          complexity,
          storyPoints,
          baseHours,
          confidence,
          comp.rationale,
          maxOrder.max + index + 1
        )

        if (matchedLib) {
          incrementLibUsage.run(matchedLib.id)
        }
      })
    })()

    revalidatePath(`/projects/${projectId}/estimate`)
    return { imported: components.length }
  } catch (error) {
    console.error("Failed to import WBS from RFP:", error)
    throw error
  }
}

// ── Skynet AI Feature Interest ────────────────────────────────────────────────

export async function recordFeatureInterest(feature: string, vote: "up" | "down") {
  try {
    const db = getDb();
    db.prepare(
      "INSERT INTO feature_interest (id, feature, vote) VALUES (?, ?, ?)"
    ).run(uuidv4(), feature, vote);
    return { success: true };
  } catch (error) {
    console.error("Failed to record feature interest:", error);
    return { success: false };
  }
}

export async function getAnalyticsData() {
  try {
    const db = getDb();
    const projects = db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all() as Project[];
    const won = projects.filter(p => p.status === 'won');
    const lost = projects.filter(p => p.status === 'lost');
    const submitted = projects.filter(p => p.status === 'submitted');
    const draft = projects.filter(p => p.status === 'draft');
    const winRate = (won.length + lost.length) > 0 ? (won.length / (won.length + lost.length)) * 100 : 0;

    const winFactorCounts: Record<string, number> = {};
    const lossReasonCounts: Record<string, number> = {};
    let totalContractValue = 0;
    const priceGaps: number[] = [];

    for (const p of won) {
      if (p.outcome_data) {
        try {
          const od = JSON.parse(p.outcome_data as unknown as string);
          for (const f of (od.winFactors || [])) winFactorCounts[f] = (winFactorCounts[f] || 0) + 1;
          if (od.actualContractValue) totalContractValue += Number(od.actualContractValue);
        } catch {}
      }
    }
    for (const p of lost) {
      if (p.outcome_data) {
        try {
          const od = JSON.parse(p.outcome_data as unknown as string);
          for (const r of (od.lossReasons || [])) lossReasonCounts[r] = (lossReasonCounts[r] || 0) + 1;
          if (od.finalQuotedPrice && od.estimatedCompetitorPrice && Number(od.estimatedCompetitorPrice) > 0) {
            priceGaps.push(((Number(od.finalQuotedPrice) - Number(od.estimatedCompetitorPrice)) / Number(od.estimatedCompetitorPrice)) * 100);
          }
        } catch {}
      }
    }

    return {
      projects, won, lost, submitted, draft, winRate,
      avgDealSize: won.length > 0 ? totalContractValue / won.length : 0,
      winFactorCounts, lossReasonCounts,
      avgPriceGap: priceGaps.length > 0 ? priceGaps.reduce((a, b) => a + b, 0) / priceGaps.length : null,
      totalPipeline: submitted.reduce((acc, p) => acc + (p.total_cost || 0), 0),
    };
  } catch (error) {
    console.error("Failed to get analytics data:", error);
    return { projects: [], won: [], lost: [], submitted: [], draft: [], winRate: 0, avgDealSize: 0, winFactorCounts: {}, lossReasonCounts: {}, avgPriceGap: null, totalPipeline: 0 };
  }
}

// ── Phase Planning ────────────────────────────────────────────────────────────

export async function getProjectPhases(projectId: string): Promise<Phase[]> {
  try {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM project_phases WHERE project_id = ? ORDER BY sort_order ASC, start_date ASC"
    ).all(projectId) as Phase[];
  } catch (error) {
    console.error("Failed to fetch project phases:", error);
    return [];
  }
}

export async function saveProjectPhases(
  projectId: string,
  phases: Phase[]
): Promise<void> {
  try {
    const db = getDb();
    db.transaction(() => {
      db.prepare("DELETE FROM project_phases WHERE project_id = ?").run(projectId);
      const insert = db.prepare(`
        INSERT INTO project_phases (id, project_id, name, start_date, end_date, color, sort_order, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      phases.forEach((phase, index) => {
        insert.run(
          phase.id,
          projectId,
          phase.name,
          phase.start_date,
          phase.end_date,
          phase.color ?? '#2563EB',
          index,
          phase.notes ?? null
        );
      });
    })();
    revalidatePath(`/projects/${projectId}/schedule`);
    revalidatePath(`/projects/${projectId}/summary`);
  } catch (error) {
    console.error("Failed to save project phases:", error);
    throw error;
  }
}

export async function getPhaseTemplates(): Promise<PhaseTemplate[]> {
  try {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM phase_templates ORDER BY template_name ASC"
    ).all() as PhaseTemplate[];
  } catch (error) {
    console.error("Failed to fetch phase templates:", error);
    return [];
  }
}

export async function getResourceGanttData(projectId: string): Promise<ResourceGanttData> {
  try {
    const db = getDb();
    const resources = db.prepare(
      "SELECT * FROM resources WHERE project_id = ? ORDER BY name ASC"
    ).all(projectId) as Resource[];
    const loading = db.prepare(
      "SELECT * FROM resource_loading WHERE project_id = ?"
    ).all(projectId) as ResourceLoading[];
    return { resources, loading };
  } catch (error) {
    console.error("Failed to fetch resource gantt data:", error);
    return { resources: [], loading: [] };
  }
}

export async function validatePhaseCoverage(projectId: string): Promise<CoverageWarning[]> {
  try {
    const db = getDb();
    const phases = db.prepare(
      "SELECT * FROM project_phases WHERE project_id = ? ORDER BY sort_order ASC"
    ).all(projectId) as Phase[];

    if (phases.length === 0) return [];

    const resources = db.prepare(
      "SELECT * FROM resources WHERE project_id = ?"
    ).all(projectId) as Resource[];

    if (resources.length === 0) return [];

    const loading = db.prepare(
      "SELECT * FROM resource_loading WHERE project_id = ? AND hours > 0"
    ).all(projectId) as ResourceLoading[];

    const warnings: CoverageWarning[] = [];

    for (const phase of phases) {
      const phaseStart = new Date(phase.start_date);
      const phaseEnd = new Date(phase.end_date);

      for (const resource of resources) {
        const resourceLoading = loading.filter(l => l.resource_id === resource.id);
        if (resourceLoading.length === 0) continue;

        const hasLoadingInPhase = resourceLoading.some(l => {
          const labelDate = l.period_label.length === 10
            ? new Date(l.period_label)
            : new Date(l.period_label + '-01');
          return labelDate >= phaseStart && labelDate <= phaseEnd;
        });

        if (!hasLoadingInPhase) {
          warnings.push({
            phaseId: phase.id,
            phaseName: phase.name,
            resourceId: resource.id,
            resourceName: resource.name,
            message: `${resource.name} has no hours loaded during "${phase.name}"`,
            severity: 'warning',
          });
        }
      }
    }

    return warnings;
  } catch (error) {
    console.error("Failed to validate phase coverage:", error);
    return [];
  }
}

// ── Burn Rate ─────────────────────────────────────────────────────────────────

export async function getBurnRateData(projectId: string): Promise<PeriodCost[]> {
  try {
    const db = getDb();
    const project = db.prepare("SELECT loading_period_type FROM projects WHERE id = ?").get(projectId) as any;
    const config  = db.prepare("SELECT margin_percent, rates_include_margin FROM commercials_config WHERE project_id = ?").get(projectId) as any;

    const rows = db.prepare(`
      SELECT rl.period_label, SUM(rl.hours * r.rate_per_hour) AS period_cost
      FROM resource_loading rl
      JOIN resources r ON rl.resource_id = r.id
      JOIN projects p ON r.project_id = p.id
      WHERE r.project_id = ?
        AND (
          (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(rl.period_label) = 10) OR
          (p.loading_period_type = 'monthly'                    AND length(rl.period_label) = 7)
        )
        AND rl.hours > 0
      GROUP BY rl.period_label
      ORDER BY rl.period_label ASC
    `).all(projectId) as any[];

    if (!rows.length) return [];

    const marginMult = (config && !config.rates_include_margin && config.margin_percent > 0)
      ? 1 + config.margin_percent / 100
      : 1;

    const isMonthly = project?.loading_period_type === "monthly";

    let cumulative = 0;
    return rows.map(row => {
      const cost = (row.period_cost || 0);
      const margined = cost * marginMult;
      cumulative += margined;

      // Format display label
      let label: string;
      if (isMonthly || row.period_label.length === 7) {
        // YYYY-MM → "Jan 2025"
        const [y, m] = row.period_label.split("-");
        label = new Date(+y, +m - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
      } else {
        // YYYY-MM-DD → "Jan 6"
        const d = new Date(row.period_label + "T00:00:00");
        label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }

      return {
        period: row.period_label,
        label,
        cost: Math.round(cost),
        margined_cost: Math.round(margined),
        cumulative: Math.round(cumulative),
      };
    });
  } catch (error) {
    console.error("Failed to get burn rate data:", error);
    return [];
  }
}

// ── Historical Accuracy ───────────────────────────────────────────────────────

export async function getWBSActuals(projectId: string): Promise<WBSActual[]> {
  try {
    const db = getDb();
    return db.prepare(
      "SELECT * FROM wbs_actuals WHERE project_id = ? ORDER BY wbs_component_id"
    ).all(projectId) as WBSActual[];
  } catch (error) {
    console.error("Failed to get WBS actuals:", error);
    return [];
  }
}

export async function upsertWBSActuals(
  projectId: string,
  actuals: Array<{ wbs_component_id: string; actual_hours: number; notes?: string }>
): Promise<void> {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO wbs_actuals (id, project_id, wbs_component_id, actual_hours, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(project_id, wbs_component_id)
      DO UPDATE SET actual_hours = excluded.actual_hours,
                    notes        = excluded.notes,
                    recorded_at  = CURRENT_TIMESTAMP
    `);
    db.transaction((items: typeof actuals) => {
      for (const a of items) {
        stmt.run(uuidv4(), projectId, a.wbs_component_id, a.actual_hours, a.notes ?? null);
      }
    })(actuals);
    revalidatePath(`/projects/${projectId}/estimate`);
    revalidatePath(`/projects/${projectId}/summary`);
  } catch (error) {
    console.error("Failed to upsert WBS actuals:", error);
    throw error;
  }
}

// ── Project Tracker ───────────────────────────────────────────────────────────

export async function getTrackerProject(projectId: string): Promise<TrackerProject | null> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM tracker_projects WHERE project_id = ?").get(projectId) as TrackerProject | null;
  } catch { return null; }
}

export async function getTrackerProjects(): Promise<TrackerProjectRow[]> {
  try {
    const db = getDb();
    return db.prepare(`
      SELECT tp.*, p.name as project_name, p.client_name, p.project_status,
             p.project_start_date, p.project_target_end_date
      FROM tracker_projects tp
      JOIN projects p ON tp.project_id = p.id
      ORDER BY tp.kicked_off_at DESC
    `).all() as TrackerProjectRow[];
  } catch { return []; }
}

export async function getTrackerDashboardData() {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT tp.*, p.name as project_name, p.client_name, p.project_status,
             p.project_start_date, p.project_target_end_date
      FROM tracker_projects tp
      JOIN projects p ON tp.project_id = p.id
      ORDER BY tp.kicked_off_at DESC
    `).all() as any[];

    const burnRows = db.prepare(`
      SELECT tracker_project_id, COALESCE(SUM(total_hours), 0) as total_hours
      FROM period_burns WHERE is_submitted = 1 GROUP BY tracker_project_id
    `).all() as any[];
    const burnMap: Record<string, number> = {};
    for (const b of burnRows) burnMap[b.tracker_project_id] = b.total_hours;

    // Billing alert counts per project
    const billingRows = db.prepare(`
      SELECT
        project_id,
        SUM(CASE WHEN
          invoice_status NOT IN ('invoiced','paid') AND
          planned_date IS NOT NULL AND
          (revised_date IS NULL AND planned_date < date('now')) OR
          (revised_date IS NOT NULL AND revised_date < date('now'))
        THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN
          invoice_status NOT IN ('invoiced','paid') AND
          planned_date IS NOT NULL AND
          (revised_date IS NULL AND planned_date >= date('now') AND julianday(planned_date) - julianday('now') <= 7) OR
          (revised_date IS NOT NULL AND revised_date >= date('now') AND julianday(revised_date) - julianday('now') <= 7)
        THEN 1 ELSE 0 END) as at_risk_count
      FROM billing_milestones
      GROUP BY project_id
    `).all() as any[];
    const billingMap: Record<string, { overdue: number; at_risk: number }> = {};
    for (const b of billingRows) billingMap[b.project_id] = { overdue: b.overdue_count ?? 0, at_risk: b.at_risk_count ?? 0 };

    const projects = rows.map(row => {
      const totalHours = burnMap[row.id] || 0;
      const blendedRate = (row.baseline_total_hours || 0) > 0
        ? (row.baseline_total_cost || 0) / row.baseline_total_hours : 0;
      const totalActualCost = totalHours * blendedRate;
      const billing = billingMap[row.project_id] ?? { overdue: 0, at_risk: 0 };
      return {
        ...row,
        total_actual_cost: totalActualCost,
        budget_pct: (row.baseline_total_cost || 0) > 0
          ? (totalActualCost / row.baseline_total_cost) * 100 : 0,
        billing_overdue: billing.overdue,
        billing_at_risk: billing.at_risk,
      };
    });

    return {
      total: projects.length,
      active: projects.filter(p => p.project_status === 'in_progress').length,
      onHold: projects.filter(p => p.project_status === 'on_hold').length,
      completed: projects.filter(p => p.project_status === 'completed').length,
      notStarted: projects.filter(p => !p.project_status || p.project_status === 'not_started').length,
      atRisk: projects.filter(p => p.budget_pct > 85).length,
      totalPortfolioValue: projects.reduce((s, p) => s + (p.baseline_total_cost || 0), 0),
      totalActualSpend: projects.reduce((s, p) => s + p.total_actual_cost, 0),
      projects,
    };
  } catch {
    return { total: 0, active: 0, onHold: 0, completed: 0, notStarted: 0, atRisk: 0, totalPortfolioValue: 0, totalActualSpend: 0, projects: [] };
  }
}

export async function upsertProjectActual(
  trackerProjectId: string,
  actual: { period_label: string; actual_cost: number; notes?: string }
): Promise<void> {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO project_actuals (id, tracker_project_id, period_label, actual_cost, notes)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(tracker_project_id, period_label)
      DO UPDATE SET actual_cost = excluded.actual_cost, notes = excluded.notes, recorded_at = CURRENT_TIMESTAMP
    `).run(uuidv4(), trackerProjectId, actual.period_label, actual.actual_cost, actual.notes ?? null);
    // Revalidate tracker pages
    const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(trackerProjectId) as any;
    if (tp) {
      revalidatePath(`/tracker/projects/${tp.project_id}/actuals`);
      revalidatePath(`/tracker/projects/${tp.project_id}/burn-rate`);
      revalidatePath(`/tracker/projects/${tp.project_id}/overview`);
    }
  } catch (error) {
    console.error("Failed to upsert project actual:", error);
    throw error;
  }
}

export async function getProjectActuals(trackerProjectId: string): Promise<ProjectActual[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM project_actuals WHERE tracker_project_id = ? ORDER BY period_label ASC").all(trackerProjectId) as ProjectActual[];
  } catch { return []; }
}

export async function createHealthSnapshot(data: Omit<HealthSnapshot, 'id' | 'created_at'>): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO health_snapshots (id, tracker_project_id, snapshot_date, percent_complete, schedule_status, budget_status, scope_status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.tracker_project_id, data.snapshot_date, data.percent_complete ?? null, data.schedule_status, data.budget_status, data.scope_status, data.notes ?? null);
  const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(data.tracker_project_id) as any;
  if (tp) revalidatePath(`/tracker/projects/${tp.project_id}/overview`);
  return id;
}

export async function getHealthSnapshots(trackerProjectId: string): Promise<HealthSnapshot[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM health_snapshots WHERE tracker_project_id = ? ORDER BY snapshot_date DESC").all(trackerProjectId) as HealthSnapshot[];
  } catch { return []; }
}

export async function createStatusReport(data: { tracker_project_id: string; report_date: string; content: string; generated_by: string }): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  db.prepare("INSERT INTO status_reports (id, tracker_project_id, report_date, content, generated_by) VALUES (?, ?, ?, ?, ?)")
    .run(id, data.tracker_project_id, data.report_date, data.content, data.generated_by);
  const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(data.tracker_project_id) as any;
  if (tp) revalidatePath(`/tracker/projects/${tp.project_id}/reports`);
  return id;
}

export async function getStatusReports(trackerProjectId: string): Promise<StatusReport[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM status_reports WHERE tracker_project_id = ? ORDER BY report_date DESC, created_at DESC").all(trackerProjectId) as StatusReport[];
  } catch { return []; }
}

export async function deleteStatusReport(id: string): Promise<void> {
  try {
    const db = getDb();
    const report = db.prepare("SELECT tracker_project_id FROM status_reports WHERE id = ?").get(id) as any;
    db.prepare("DELETE FROM status_reports WHERE id = ?").run(id);
    if (report) {
      const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(report.tracker_project_id) as any;
      if (tp) revalidatePath(`/tracker/projects/${tp.project_id}/reports`);
    }
  } catch (error) { console.error("Failed to delete status report:", error); throw error; }
}

export async function createChangeRequest(data: Omit<ChangeRequest, 'id' | 'created_at'>): Promise<string> {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO change_requests (id, tracker_project_id, title, description, requested_by, status, impact_hours, impact_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.tracker_project_id, data.title, data.description ?? null, data.requested_by ?? null, data.status, data.impact_hours ?? null, data.impact_cost ?? null);
  const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(data.tracker_project_id) as any;
  if (tp) revalidatePath(`/tracker/projects/${tp.project_id}/reports`);
  return id;
}

export async function updateChangeRequest(id: string, updates: Partial<ChangeRequest>): Promise<void> {
  try {
    const db = getDb();
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (updates.title !== undefined) { setClauses.push("title = ?"); values.push(updates.title); }
    if (updates.description !== undefined) { setClauses.push("description = ?"); values.push(updates.description); }
    if (updates.requested_by !== undefined) { setClauses.push("requested_by = ?"); values.push(updates.requested_by); }
    if (updates.status !== undefined) { setClauses.push("status = ?"); values.push(updates.status); }
    if (updates.impact_hours !== undefined) { setClauses.push("impact_hours = ?"); values.push(updates.impact_hours); }
    if (updates.impact_cost !== undefined) { setClauses.push("impact_cost = ?"); values.push(updates.impact_cost); }
    if (setClauses.length > 0) {
      values.push(id);
      db.prepare(`UPDATE change_requests SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);
    }
    const cr = db.prepare("SELECT tracker_project_id FROM change_requests WHERE id = ?").get(id) as any;
    if (cr) {
      const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(cr.tracker_project_id) as any;
      if (tp) revalidatePath(`/tracker/projects/${tp.project_id}/reports`);
    }
  } catch (error) { console.error("Failed to update change request:", error); throw error; }
}

export async function getChangeRequests(trackerProjectId: string): Promise<ChangeRequest[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM change_requests WHERE tracker_project_id = ? ORDER BY created_at DESC").all(trackerProjectId) as ChangeRequest[];
  } catch { return []; }
}

export async function deleteChangeRequest(id: string): Promise<void> {
  try {
    const db = getDb();
    db.prepare("DELETE FROM change_requests WHERE id = ?").run(id);
  } catch (error) { console.error("Failed to delete change request:", error); throw error; }
}

export async function getPeriodBurns(trackerProjectId: string): Promise<PeriodBurn[]> {
  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT * FROM period_burns WHERE tracker_project_id = ? ORDER BY period_start ASC"
    ).all(trackerProjectId) as any[];
    return rows.map(r => ({
      ...r,
      is_submitted: r.is_submitted === 1,
      resource_breakdown: r.resource_breakdown ? JSON.parse(r.resource_breakdown) : null,
    })) as PeriodBurn[];
  } catch { return []; }
}

export async function upsertPeriodBurn(
  trackerProjectId: string,
  data: {
    period_start: string;
    period_end: string;
    period_label: string;
    total_hours: number;
    resource_breakdown: PeriodBurnResourceEntry[] | null;
    notes: string | null;
    is_submitted: boolean;
  }
): Promise<void> {
  try {
    const db = getDb();
    const existing = db.prepare(
      "SELECT id FROM period_burns WHERE tracker_project_id = ? AND period_start = ?"
    ).get(trackerProjectId, data.period_start) as any;
    if (existing) {
      db.prepare(`
        UPDATE period_burns SET
          period_end = ?, period_label = ?, total_hours = ?,
          resource_breakdown = ?, notes = ?, is_submitted = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.period_end, data.period_label, data.total_hours,
        data.resource_breakdown ? JSON.stringify(data.resource_breakdown) : null,
        data.notes, data.is_submitted ? 1 : 0,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO period_burns
          (id, tracker_project_id, period_start, period_end, period_label, total_hours, resource_breakdown, notes, is_submitted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), trackerProjectId, data.period_start, data.period_end,
        data.period_label, data.total_hours,
        data.resource_breakdown ? JSON.stringify(data.resource_breakdown) : null,
        data.notes, data.is_submitted ? 1 : 0
      );
    }
    const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(trackerProjectId) as any;
    if (tp) {
      revalidatePath(`/tracker/projects/${tp.project_id}/actuals`);
      revalidatePath(`/tracker/projects/${tp.project_id}/burn-rate`);
      revalidatePath(`/tracker/projects/${tp.project_id}/overview`);
    }
  } catch (error) { console.error("Failed to upsert period burn:", error); throw error; }
}

export async function deletePeriodBurn(id: string): Promise<void> {
  try {
    const db = getDb();
    const burn = db.prepare("SELECT tracker_project_id FROM period_burns WHERE id = ?").get(id) as any;
    db.prepare("DELETE FROM period_burns WHERE id = ?").run(id);
    if (burn) {
      const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(burn.tracker_project_id) as any;
      if (tp) {
        revalidatePath(`/tracker/projects/${tp.project_id}/actuals`);
        revalidatePath(`/tracker/projects/${tp.project_id}/burn-rate`);
        revalidatePath(`/tracker/projects/${tp.project_id}/overview`);
      }
    }
  } catch (error) { console.error("Failed to delete period burn:", error); throw error; }
}

export async function updateTrackerCadence(trackerProjectId: string, cadence: ReportingCadence): Promise<void> {
  try {
    const db = getDb();
    db.prepare("UPDATE tracker_projects SET reporting_cadence = ? WHERE id = ?").run(cadence, trackerProjectId);
    const tp = db.prepare("SELECT project_id FROM tracker_projects WHERE id = ?").get(trackerProjectId) as any;
    if (tp) revalidatePath(`/tracker/projects/${tp.project_id}/actuals`);
  } catch (error) { console.error("Failed to update reporting cadence:", error); throw error; }
}

export type SchedulePhase = Phase & {
  status: 'complete' | 'active' | 'upcoming';
  progressPercent: number;
};

export async function getTrackerSchedule(estimatorProjectId: string): Promise<SchedulePhase[]> {
  try {
    const db = getDb();

    const phases = db.prepare(`
      SELECT * FROM project_phases
      WHERE project_id = ?
      ORDER BY sort_order ASC, start_date ASC
    `).all(estimatorProjectId) as Phase[];

    const today = new Date().toISOString().split('T')[0];

    return phases.map(phase => {
      const start = new Date(phase.start_date);
      const end = new Date(phase.end_date);
      const now = new Date(today);

      let status: 'complete' | 'active' | 'upcoming';
      let progressPercent = 0;

      if (now > end) {
        status = 'complete';
        progressPercent = 100;
      } else if (now >= start && now <= end) {
        status = 'active';
        const totalDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        const elapsedDays = (now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
        progressPercent = totalDays > 0 ? Math.round((elapsedDays / totalDays) * 100) : 0;
      } else {
        status = 'upcoming';
        progressPercent = 0;
      }

      return { ...phase, status, progressPercent };
    });
  } catch (error) {
    console.error("Failed to get tracker schedule:", error);
    return [];
  }
}

export async function generateAIStatusReport(trackerProjectId: string): Promise<{ content: string; reportId: string }> {
  const db = getDb();
  const tp = db.prepare(`
    SELECT tp.*, p.name as project_name, p.client_name, p.project_status,
           p.project_start_date, p.project_target_end_date
    FROM tracker_projects tp JOIN projects p ON tp.project_id = p.id
    WHERE tp.id = ?
  `).get(trackerProjectId) as any;
  if (!tp) throw new Error("Tracker project not found");

  const actuals = db.prepare("SELECT * FROM project_actuals WHERE tracker_project_id = ? ORDER BY period_label ASC").all(trackerProjectId) as ProjectActual[];
  const changes = db.prepare("SELECT * FROM change_requests WHERE tracker_project_id = ? ORDER BY created_at DESC LIMIT 10").all(trackerProjectId) as ChangeRequest[];
  const lastSnapshot = db.prepare("SELECT * FROM health_snapshots WHERE tracker_project_id = ? ORDER BY snapshot_date DESC LIMIT 1").get(trackerProjectId) as HealthSnapshot | undefined;

  const totalActual = actuals.reduce((s, a) => s + a.actual_cost, 0);
  const baseline = tp.baseline_total_cost || 0;
  const burnPct = baseline > 0 ? Math.round((totalActual / baseline) * 100) : 0;
  const openChanges = changes.filter(c => c.status === 'open').length;

  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are a project delivery manager writing a concise weekly status report for a client project.

Project: ${tp.project_name}
Client: ${tp.client_name}
Status: ${tp.project_status || 'In Progress'}
Report Date: ${today}

Financial Summary:
- Baseline Budget: $${Math.round(baseline).toLocaleString()}
- Actual Spend to Date: $${Math.round(totalActual).toLocaleString()}
- Budget Burned: ${burnPct}%

Schedule:
- Start Date: ${tp.project_start_date || 'Not set'}
- Target End: ${tp.project_target_end_date || 'Not set'}

Recent Health Check:
${lastSnapshot ? `- Schedule: ${lastSnapshot.schedule_status}, Budget: ${lastSnapshot.budget_status}, Scope: ${lastSnapshot.scope_status}, % Complete: ${lastSnapshot.percent_complete ?? 'N/A'}%` : '- No health check recorded yet'}

Open Change Requests: ${openChanges}
${changes.length > 0 ? changes.slice(0, 3).map(c => `- [${c.status.toUpperCase()}] ${c.title}${c.impact_cost ? ` ($${Math.round(c.impact_cost).toLocaleString()} impact)` : ''}`).join('\n') : '- None'}

Write a professional project status report in markdown format covering:
1. Executive Summary (2-3 sentences)
2. Key Accomplishments This Period
3. Financial Health
4. Schedule Status
5. Risks & Issues
6. Next Steps

Keep it concise and professional. Use bullet points.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured. Add it to your .env.local file to enable AI report generation.");

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(prompt);
  const content = result.response.text();

  const reportId = uuidv4();
  db.prepare("INSERT INTO status_reports (id, tracker_project_id, report_date, content, generated_by) VALUES (?, ?, ?, ?, 'ai')")
    .run(reportId, trackerProjectId, today, content);
  revalidatePath(`/tracker/projects/${tp.project_id}/reports`);
  return { content, reportId };
}

// ── Billing Milestones ────────────────────────────────────────────────────────

export async function getBillingMilestones(projectId: string): Promise<BillingMilestone[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM billing_milestones WHERE project_id = ? ORDER BY sort_order ASC").all(projectId) as BillingMilestone[];
  } catch { return []; }
}

export async function saveBillingMilestone(milestone: Partial<BillingMilestone>): Promise<void> {
  const db = getDb();
  const id = milestone.id || uuidv4();
  db.prepare(`
    INSERT INTO billing_milestones (
      id, project_id, tracker_project_id, title, description, deliverables,
      percentage, amount, planned_date, actual_date, invoice_number,
      invoice_status, payment_terms, trigger_type, sort_order, notes,
      revised_date, milestone_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title            = excluded.title,
      description      = excluded.description,
      deliverables     = excluded.deliverables,
      percentage       = excluded.percentage,
      amount           = excluded.amount,
      planned_date     = excluded.planned_date,
      actual_date      = excluded.actual_date,
      invoice_number   = excluded.invoice_number,
      invoice_status   = excluded.invoice_status,
      payment_terms    = excluded.payment_terms,
      trigger_type     = excluded.trigger_type,
      sort_order       = excluded.sort_order,
      notes            = excluded.notes,
      revised_date     = excluded.revised_date,
      milestone_notes  = excluded.milestone_notes,
      updated_at       = CURRENT_TIMESTAMP
  `).run(
    id, milestone.project_id, milestone.tracker_project_id ?? null,
    milestone.title, milestone.description ?? null, milestone.deliverables ?? null,
    milestone.percentage ?? 0, milestone.amount ?? 0,
    milestone.planned_date ?? null, milestone.actual_date ?? null,
    milestone.invoice_number ?? null, milestone.invoice_status ?? 'not_invoiced',
    milestone.payment_terms ?? 30, milestone.trigger_type ?? 'milestone',
    milestone.sort_order ?? 0, milestone.notes ?? null,
    milestone.revised_date ?? null, milestone.milestone_notes ?? null
  );
  if (milestone.project_id) {
    revalidatePath(`/projects/${milestone.project_id}/commercials`);
    revalidatePath(`/tracker/projects/${milestone.project_id}/billing`);
    revalidatePath(`/tracker/projects/${milestone.project_id}/overview`);
  }
}

export async function deleteBillingMilestone(id: string, projectId: string): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM billing_milestones WHERE id = ?").run(id);
  revalidatePath(`/projects/${projectId}/commercials`);
  revalidatePath(`/tracker/projects/${projectId}/billing`);
}

const INLINE_FIELD_ALLOWLIST = new Set(['revised_date', 'milestone_notes', 'actual_date', 'invoice_number'])

export async function updateBillingMilestoneField(
  id: string,
  projectId: string,
  field: 'revised_date' | 'milestone_notes' | 'actual_date' | 'invoice_number',
  value: string | null
): Promise<void> {
  if (!INLINE_FIELD_ALLOWLIST.has(field)) throw new Error('Invalid field')
  const db = getDb();
  db.prepare(`UPDATE billing_milestones SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(value, id);
  revalidatePath(`/tracker/projects/${projectId}/billing`);
  revalidatePath(`/tracker/projects/${projectId}/overview`);
  revalidatePath('/tracker');
}

export async function getMilestoneTemplates(): Promise<MilestoneTemplate[]> {
  try {
    const db = getDb();
    return db.prepare("SELECT * FROM milestone_templates ORDER BY rowid ASC").all() as MilestoneTemplate[];
  } catch { return []; }
}

export async function loadMilestoneTemplate(
  projectId: string,
  templateName: string,
  quotedPrice: number,
  projectStartDate: string,
  durationWeeks: number
): Promise<void> {
  const db = getDb();
  const template = db.prepare("SELECT * FROM milestone_templates WHERE template_name = ?").get(templateName) as MilestoneTemplate | undefined;
  if (!template) return;

  const milestones: any[] = JSON.parse(template.milestones_json);
  db.prepare("DELETE FROM billing_milestones WHERE project_id = ?").run(projectId);

  const startDate = new Date(projectStartDate + "T12:00:00");

  if (templateName === 'T&M Monthly') {
    const months = Math.max(1, Math.ceil(durationWeeks / 4));
    const monthlyAmount = Math.round(quotedPrice / months);
    const insert = db.prepare("INSERT INTO billing_milestones (id, project_id, title, percentage, amount, planned_date, trigger_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, 'date', ?)");
    db.transaction(() => {
      for (let i = 0; i < months; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i + 1);
        insert.run(uuidv4(), projectId, `Month ${i + 1} Invoice`, Math.round((100 / months) * 10) / 10, monthlyAmount, d.toISOString().split('T')[0], i);
      }
    })();
  } else {
    const insert = db.prepare("INSERT INTO billing_milestones (id, project_id, title, percentage, amount, planned_date, trigger_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    db.transaction(() => {
      milestones.forEach((m: any, i: number) => {
        const offsetWeeks = m.percentage_offset !== undefined ? m.percentage_offset : i * (durationWeeks / Math.max(milestones.length, 1));
        const d = new Date(startDate);
        d.setDate(d.getDate() + Math.round(offsetWeeks * 7));
        insert.run(uuidv4(), projectId, m.title, m.percentage, Math.round(quotedPrice * (m.percentage / 100)), d.toISOString().split('T')[0], m.trigger_type, i);
      });
    })();
  }

  // Re-link to tracker if project is already won
  try {
    const tp = db.prepare("SELECT id FROM tracker_projects WHERE project_id = ?").get(projectId) as any;
    if (tp) db.prepare("UPDATE billing_milestones SET tracker_project_id = ? WHERE project_id = ?").run(tp.id, projectId);
  } catch {}

  revalidatePath(`/projects/${projectId}/commercials`);
  revalidatePath(`/tracker/projects/${projectId}/billing`);
  revalidatePath(`/tracker/projects/${projectId}/overview`);
}

export async function updateMilestoneStatus(
  id: string,
  updates: { invoice_number?: string; actual_date?: string; invoice_status: InvoiceStatus; notes?: string }
): Promise<void> {
  const db = getDb();
  const m = db.prepare("SELECT project_id FROM billing_milestones WHERE id = ?").get(id) as any;
  db.prepare(`
    UPDATE billing_milestones
    SET invoice_number = ?, actual_date = ?, invoice_status = ?, notes = COALESCE(?, notes), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(updates.invoice_number ?? null, updates.actual_date ?? null, updates.invoice_status, updates.notes ?? null, id);
  if (m) {
    revalidatePath(`/tracker/projects/${m.project_id}/billing`);
    revalidatePath(`/tracker/projects/${m.project_id}/overview`);
  }
}

export async function getCashFlowForecast(projectId: string): Promise<(BillingMilestone & { payment_due_date: string; cumulative_invoiced: number; is_overdue: boolean })[]> {
  try {
    const db = getDb();
    const milestones = db.prepare("SELECT * FROM billing_milestones WHERE project_id = ? AND planned_date IS NOT NULL ORDER BY planned_date ASC").all(projectId) as BillingMilestone[];
    let cumulative = 0;
    const today = new Date();
    return milestones.map(m => {
      cumulative += m.amount;
      const baseDate = m.actual_date ? new Date(m.actual_date + "T12:00:00") : new Date((m.planned_date ?? today.toISOString().split('T')[0]) + "T12:00:00");
      const dueDate = new Date(baseDate);
      dueDate.setDate(dueDate.getDate() + (m.payment_terms ?? 30));
      return {
        ...m,
        payment_due_date: dueDate.toISOString().split('T')[0],
        cumulative_invoiced: cumulative,
        is_overdue: m.invoice_status === 'invoiced' && today > dueDate,
      };
    });
  } catch { return []; }
}

export async function setupTrackerProject(
  estimatorProjectId: string,
  data: {
    pmName: string;
    pmEmail: string;
    clientContact: string;
    clientEmail: string;
    actualStartDate: string;
    reportingCadence: ReportingCadence;
  }
): Promise<{ trackerId: string; baselineCost: number }> {
  const db = getDb();

  let trackerRow = db.prepare("SELECT * FROM tracker_projects WHERE project_id = ?").get(estimatorProjectId) as any;

  if (!trackerRow) {
    const snapshot = await buildBaselineSnapshot(estimatorProjectId);
    const newId = uuidv4();
    db.prepare(`
      INSERT INTO tracker_projects (id, project_id, baseline_snapshot, baseline_total_cost, baseline_total_hours)
      VALUES (?, ?, ?, ?, ?)
    `).run(newId, estimatorProjectId, JSON.stringify(snapshot), snapshot.totalCost, snapshot.totalHours);
    trackerRow = db.prepare("SELECT * FROM tracker_projects WHERE id = ?").get(newId) as any;
  }

  const notes = JSON.stringify({ pmName: data.pmName, pmEmail: data.pmEmail, clientContact: data.clientContact, clientEmail: data.clientEmail });
  db.prepare("UPDATE tracker_projects SET notes = ?, reporting_cadence = ? WHERE id = ?")
    .run(notes, data.reportingCadence, trackerRow.id);

  if (data.actualStartDate) {
    db.prepare("UPDATE projects SET project_start_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(data.actualStartDate, estimatorProjectId);
  }

  revalidatePath(`/projects/${estimatorProjectId}`);
  revalidatePath(`/tracker/projects/${estimatorProjectId}/overview`);
  revalidatePath("/tracker");

  return { trackerId: trackerRow.id, baselineCost: trackerRow.baseline_total_cost ?? 0 };
}

// ── Pipeline Revenue Forecast ─────────────────────────────────────────────────

const COST_SUBQUERY = `
  COALESCE((
    SELECT SUM(rl.hours * r.rate_per_hour)
    FROM resources r
    LEFT JOIN resource_loading rl ON r.id = rl.resource_id
    WHERE r.project_id = p.id
    AND (
      (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(rl.period_label) = 10) OR
      (p.loading_period_type = 'monthly' AND length(rl.period_label) = 7)
    )
  ), 0)
`;

function generateMonthlyForecast(pipeline: PipelineProject[]): MonthlyForecast[] {
  const months: Record<string, { total: number; weighted: number; deals: number }> = {};
  for (const p of pipeline) {
    const date = p.expected_start_date || p.updated_at;
    const key = date.slice(0, 7);
    if (!months[key]) months[key] = { total: 0, weighted: 0, deals: 0 };
    months[key].total += p.quoted_price;
    months[key].weighted += p.quoted_price * ((p.win_probability ?? 50) / 100);
    months[key].deals++;
  }
  return Object.entries(months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));
}

export async function getPipelineData(): Promise<PipelineData> {
  const db = getDb();

  const pipeline = db.prepare(`
    SELECT p.*, COALESCE(p.win_probability, 50) as win_probability,
      ${COST_SUBQUERY} as quoted_price
    FROM projects p
    WHERE p.status IN ('draft', 'submitted')
    ORDER BY p.updated_at DESC
  `).all() as PipelineProject[];

  const wonThisYear = db.prepare(`
    SELECT p.*, COALESCE(p.win_probability, 100) as win_probability,
      ${COST_SUBQUERY} as quoted_price
    FROM projects p
    WHERE p.status = 'won'
    AND strftime('%Y', p.updated_at) = strftime('%Y', 'now')
    ORDER BY p.updated_at DESC
  `).all() as PipelineProject[];

  const lostThisYear = db.prepare(`
    SELECT p.*, COALESCE(p.win_probability, 0) as win_probability,
      ${COST_SUBQUERY} as quoted_price
    FROM projects p
    WHERE p.status = 'lost'
    AND strftime('%Y', p.updated_at) = strftime('%Y', 'now')
    ORDER BY p.updated_at DESC
  `).all() as PipelineProject[];

  const allWon = db.prepare(`
    SELECT p.*, COALESCE(p.win_probability, 100) as win_probability,
      ${COST_SUBQUERY} as quoted_price
    FROM projects p WHERE p.status = 'won' ORDER BY p.updated_at DESC
  `).all() as PipelineProject[];

  const allLost = db.prepare(`
    SELECT p.*, COALESCE(p.win_probability, 0) as win_probability,
      ${COST_SUBQUERY} as quoted_price
    FROM projects p WHERE p.status = 'lost' ORDER BY p.updated_at DESC
  `).all() as PipelineProject[];

  const totalPipeline = pipeline.reduce((s, p) => s + p.quoted_price, 0);
  const weightedPipeline = pipeline.reduce((s, p) => s + p.quoted_price * ((p.win_probability ?? 50) / 100), 0);
  const wonRevenue = wonThisYear.reduce((s, p) => s + p.quoted_price, 0);
  const lostRevenue = lostThisYear.reduce((s, p) => s + p.quoted_price, 0);
  const winRate = wonThisYear.length + lostThisYear.length > 0
    ? (wonThisYear.length / (wonThisYear.length + lostThisYear.length)) * 100 : 0;

  return {
    pipeline,
    wonThisYear,
    lostThisYear,
    allWon,
    allLost,
    metrics: {
      totalPipeline,
      weightedPipeline,
      wonRevenue,
      lostRevenue,
      winRate,
      dealCount: pipeline.length,
    },
    monthlyForecast: generateMonthlyForecast(pipeline),
  };
}

export async function updateProjectPursuitData(
  projectId: string,
  data: Partial<Pick<Project, 'win_probability' | 'expected_start_date' | 'pursuit_owner' | 'vertical' | 'service_line' | 'deal_size_category' | 'outcome_data'>>
): Promise<void> {
  const db = getDb();
  const clauses: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) { clauses.push(`${k} = ?`); vals.push(v); }
  }
  if (clauses.length === 0) return;
  vals.push(projectId);
  db.prepare(`UPDATE projects SET ${clauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...vals);
  revalidatePath('/pipeline');
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/');
}

// ── Client Master List ────────────────────────────────────────────────────────

const COST_SUBQUERY_CLIENT = `
  COALESCE((
    SELECT SUM(rl.hours * r.rate_per_hour)
    FROM resources r
    LEFT JOIN resource_loading rl ON r.id = rl.resource_id
    WHERE r.project_id = p.id
    AND (
      (COALESCE(p.loading_period_type, 'weekly') = 'weekly' AND length(rl.period_label) = 10) OR
      (p.loading_period_type = 'monthly' AND length(rl.period_label) = 7)
    )
  ), 0)
`;

export async function getClients(): Promise<Client[]> {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) as project_count,
        COALESCE(SUM(CASE WHEN p.status IN ('draft','submitted') THEN ${COST_SUBQUERY_CLIENT} ELSE 0 END), 0) as total_pipeline,
        COALESCE(SUM(CASE WHEN p.status = 'won' THEN ${COST_SUBQUERY_CLIENT} ELSE 0 END), 0) as total_won,
        (SELECT cc2.name FROM client_contacts cc2 WHERE cc2.client_id = c.id AND cc2.is_primary = 1 LIMIT 1) as primary_contact_name
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id
      WHERE c.is_archived = 0
      GROUP BY c.id
      ORDER BY c.name ASC
    `).all() as any[];
    return rows.map(r => ({ ...r, is_archived: Boolean(r.is_archived) })) as Client[];
  } catch (error) {
    console.error("Failed to fetch clients:", error);
    return [];
  }
}

export async function getClient(id: string): Promise<{ client: Client; contacts: ClientContact[]; notes: ClientNote[]; projects: Project[] } | null> {
  try {
    const db = getDb();
    const clientRow = db.prepare(`
      SELECT
        c.*,
        COUNT(DISTINCT p.id) as project_count,
        COALESCE(SUM(CASE WHEN p.status IN ('draft','submitted') THEN ${COST_SUBQUERY_CLIENT} ELSE 0 END), 0) as total_pipeline,
        COALESCE(SUM(CASE WHEN p.status = 'won' THEN ${COST_SUBQUERY_CLIENT} ELSE 0 END), 0) as total_won,
        (SELECT cc2.name FROM client_contacts cc2 WHERE cc2.client_id = c.id AND cc2.is_primary = 1 LIMIT 1) as primary_contact_name
      FROM clients c
      LEFT JOIN projects p ON p.client_id = c.id
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id) as any;
    if (!clientRow) return null;
    const client: Client = { ...clientRow, is_archived: Boolean(clientRow.is_archived) };
    const contacts = db.prepare("SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, name ASC").all(id) as ClientContact[];
    const notes = db.prepare("SELECT * FROM client_notes WHERE client_id = ? ORDER BY created_at DESC").all(id) as ClientNote[];
    const projects = db.prepare(`
      SELECT p.*, ${COST_SUBQUERY_CLIENT} as total_cost
      FROM projects p
      WHERE p.client_id = ?
      ORDER BY p.updated_at DESC
    `).all(id) as Project[];
    return { client, contacts: contacts.map(c => ({ ...c, is_primary: Boolean(c.is_primary) })), notes, projects };
  } catch (error) {
    console.error("Failed to fetch client:", error);
    return null;
  }
}

export async function saveClient(data: Partial<Client> & { name: string }): Promise<{ id: string }> {
  try {
    const db = getDb();
    const id = data.id ?? uuidv4();
    const existing = db.prepare("SELECT id FROM clients WHERE id = ?").get(id);
    if (existing) {
      db.prepare(`
        UPDATE clients SET
          name = ?, industry = ?, website = ?, address = ?, city = ?, state = ?, country = ?,
          phone = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        data.name, data.industry ?? null, data.website ?? null, data.address ?? null,
        data.city ?? null, data.state ?? null, data.country ?? null,
        data.phone ?? null, data.email ?? null, data.notes ?? null, id
      );
    } else {
      db.prepare(`
        INSERT INTO clients (id, name, industry, website, address, city, state, country, phone, email, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, data.name, data.industry ?? null, data.website ?? null, data.address ?? null,
        data.city ?? null, data.state ?? null, data.country ?? 'USA',
        data.phone ?? null, data.email ?? null, data.notes ?? null
      );
    }
    revalidatePath('/clients');
    revalidatePath(`/clients/${id}`);
    return { id };
  } catch (error) {
    console.error("Failed to save client:", error);
    throw error;
  }
}

export async function archiveClient(id: string): Promise<void> {
  try {
    const db = getDb();
    db.prepare("UPDATE clients SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    revalidatePath('/clients');
  } catch (error) {
    console.error("Failed to archive client:", error);
    throw error;
  }
}

export async function deleteClient(id: string): Promise<void> {
  try {
    const db = getDb();
    db.prepare("UPDATE projects SET client_id = NULL WHERE client_id = ?").run(id);
    db.prepare("DELETE FROM clients WHERE id = ?").run(id);
    revalidatePath('/clients');
  } catch (error) {
    console.error("Failed to delete client:", error);
    throw error;
  }
}

export async function saveClientContact(data: Partial<ClientContact> & { client_id: string; name: string }): Promise<void> {
  try {
    const db = getDb();
    const id = data.id ?? uuidv4();
    const existing = db.prepare("SELECT id FROM client_contacts WHERE id = ?").get(id);
    if (data.is_primary) {
      db.prepare("UPDATE client_contacts SET is_primary = 0 WHERE client_id = ?").run(data.client_id);
    }
    if (existing) {
      db.prepare(`
        UPDATE client_contacts SET name = ?, title = ?, email = ?, phone = ?, is_primary = ?, notes = ?
        WHERE id = ?
      `).run(data.name, data.title ?? null, data.email ?? null, data.phone ?? null, data.is_primary ? 1 : 0, data.notes ?? null, id);
    } else {
      db.prepare(`
        INSERT INTO client_contacts (id, client_id, name, title, email, phone, is_primary, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, data.client_id, data.name, data.title ?? null, data.email ?? null, data.phone ?? null, data.is_primary ? 1 : 0, data.notes ?? null);
    }
    revalidatePath(`/clients/${data.client_id}`);
  } catch (error) {
    console.error("Failed to save client contact:", error);
    throw error;
  }
}

export async function deleteClientContact(id: string, clientId: string): Promise<void> {
  try {
    const db = getDb();
    db.prepare("DELETE FROM client_contacts WHERE id = ?").run(id);
    revalidatePath(`/clients/${clientId}`);
  } catch (error) {
    console.error("Failed to delete client contact:", error);
    throw error;
  }
}

export async function saveClientNote(data: { id?: string; client_id: string; content: string; category: string; created_by?: string }): Promise<void> {
  try {
    const db = getDb();
    const id = data.id ?? uuidv4();
    const existing = db.prepare("SELECT id FROM client_notes WHERE id = ?").get(id);
    if (existing) {
      db.prepare("UPDATE client_notes SET content = ?, category = ? WHERE id = ?").run(data.content, data.category, id);
    } else {
      db.prepare("INSERT INTO client_notes (id, client_id, content, category, created_by) VALUES (?, ?, ?, ?, ?)").run(
        id, data.client_id, data.content, data.category, data.created_by ?? null
      );
    }
    revalidatePath(`/clients/${data.client_id}`);
  } catch (error) {
    console.error("Failed to save client note:", error);
    throw error;
  }
}

export async function deleteClientNote(id: string, clientId: string): Promise<void> {
  try {
    const db = getDb();
    db.prepare("DELETE FROM client_notes WHERE id = ?").run(id);
    revalidatePath(`/clients/${clientId}`);
  } catch (error) {
    console.error("Failed to delete client note:", error);
    throw error;
  }
}

export async function linkProjectToClient(projectId: string, clientId: string | null): Promise<void> {
  try {
    const db = getDb();
    db.prepare("UPDATE projects SET client_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(clientId, projectId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath('/clients');
    if (clientId) revalidatePath(`/clients/${clientId}`);
  } catch (error) {
    console.error("Failed to link project to client:", error);
    throw error;
  }
}

// ── Intelligence Server Actions ────────────────────────────────────────────────

export async function getClientIntelligenceAction(clientId: string) {
  const { getClientIntelligence } = await import('./intelligence')
  return getClientIntelligence(clientId)
}

export async function getCalibrationSuggestionsAction() {
  const { getCalibrationSuggestions } = await import('./intelligence')
  return getCalibrationSuggestions()
}

export async function getSimilarProjectsAction(projectId: string) {
  const { getSimilarProjects } = await import('./intelligence')
  return getSimilarProjects(projectId)
}

export async function getCapacityAnalysisAction() {
  const { getCapacityAnalysis } = await import('./intelligence')
  return getCapacityAnalysis()
}

export async function getBidScorePredictionAction(scores: Record<string, number>) {
  const { getBidScorePrediction } = await import('./intelligence')
  return getBidScorePrediction(scores)
}

export async function applyCalibrationUpdatesAction(updates: { libraryId: string; newHours: number }[]): Promise<void> {
  const { applyCalibrationUpdates } = await import('./intelligence')
  await applyCalibrationUpdates(updates)
  revalidatePath('/analytics/calibration')
  revalidatePath('/library')
}
