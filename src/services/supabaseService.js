import { supabase } from "../lib/supabase";
import { calculateLeadScore } from "../utils/leadScoring";

// ========================================
// AUTH SERVICES
// ========================================

export const authService = {
  // Get current session
  async getSession() {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      return { session, error };
    } catch (error) {
      return { session: null, error };
    }
  },

  // Sign in with email
  async signInWithEmail(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Sign out
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      console.log("user", user);
      return { user, error };
    } catch (error) {
      return { user: null, error };
    }
  },
};

// ========================================
// COMPANY SERVICES
// ========================================

export const companyService = {
  // Get user's company
  async getUserCompany() {
    console.log("Hello");
    try {
      const { user, error: userError } = await authService.getCurrentUser();
      if (userError || !user) return { data: null, error: userError };

      const { data, error } = await supabase
        .from("users")
        .select("company:companies(*)")
        .eq("id", user.id)
        .single();

      console.log("User", user.id);
      console.log("Company", data);
      return { data: data?.company, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get company metrics
  async getCompanyMetrics(companyId) {
    try {
      const metricsPromises = [
        // Get total contacts (filter by owner's company)
        supabase
          .from("contacts")
          .select(
            `
            id,
            owner:users!owner_id(company_id)
          `,
          )
          .then(({ data, error }) => {
            if (error) return { count: 0, error };
            const filtered =
              data?.filter(
                (contact) => contact.owner?.company_id === companyId,
              ) || [];
            return { count: filtered.length, error: null };
          }),
        // Get deals metrics and pipeline stages
        supabase
          .from("deals")
          .select("stage, amount, currency")
          .eq("company_id", companyId),
        // Get active tasks count
        supabase
          .from("tasks")
          .select("id", { count: "exact" })
          .eq("company_id", companyId)
          .neq("status", "completed"),
      ];

      const [
        { count: totalContacts, error: contactsError },
        { data: dealsData, error: pipelineError },
        { count: activeTasks, error: tasksError },
      ] = await Promise.all(metricsPromises);

      if (contactsError || pipelineError || tasksError) {
        return {
          data: null,
          error: contactsError || pipelineError || tasksError,
        };
      }

      // Calculate pipeline value and stages from deals data
      const pipelineValue =
        dealsData?.reduce((acc, deal) => acc + (deal.amount || 0), 0) || 0;

      // Group deals by stage
      const stageGroups = dealsData?.reduce((acc, deal) => {
        const stage = deal.stage || "lead";
        acc[stage] = acc[stage] || { stage, count: 0, total_value: 0 };
        acc[stage].count += 1;
        acc[stage].total_value += deal.amount || 0;
        return acc;
      }, {});

      const pipelineStages = Object.values(stageGroups || {});

      const metrics = {
        totalContacts: totalContacts || 0,
        pipelineValue,
        activeTasks: activeTasks || 0,
        pipelineStages,
        totalDeals: dealsData?.length || 0,
      };

      return { data: metrics, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get sales data for charts (generate from deals data)
  async getSalesData(companyId, periodType = "monthly") {
    try {
      // Get deals data and generate sales chart data
      const { data: deals, error } = await supabase
        ?.from("deals")
        ?.select("stage, amount, created_at, closed_at")
        ?.eq("company_id", companyId)
        ?.order("created_at");

      if (error) return { data: [], error };

      // Group deals by pipeline stage for chart
      const pipelineData =
        deals?.reduce((acc, deal) => {
          const stage = deal.stage || "unknown";
          const existingStage = acc.find((item) => item.name === stage);

          if (existingStage) {
            existingStage.value += deal.amount || 0;
            existingStage.count += 1;
          } else {
            acc.push({
              name: stage,
              value: deal.amount || 0,
              count: 1,
            });
          }
          return acc;
        }, []) || [];

      return { data: pipelineData, error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get all companies (for directors)
  async getAllCompanies(activeOnly = true) {
    try {
      let query = supabase.from("companies").select("*");

      // Filter by active status unless explicitly requesting all
      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      query = query.order("name", { ascending: true });

      const { data, error } = await query;

      return { data, error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Update company active status (admin only)
  async updateCompanyStatus(companyId, isActive) {
    try {
      const { data, error } = await supabase
        .from("companies")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", companyId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get team metrics for specific user IDs
  async getTeamMetrics(companyId, userIds = []) {
    try {
      const results = await Promise.all([
        // Team deals
        supabase
          .from("deals")
          .select("amount, stage")
          .eq("company_id", companyId)
          .in("owner_id", userIds),
        // Team contacts
        supabase
          .from("contacts")
          .select("id, owner_id")
          .in("owner_id", userIds),
        // Team tasks
        supabase
          .from("tasks")
          .select("id")
          .eq("company_id", companyId)
          .or(
            `assigned_to.in.(${userIds.join(
              ",",
            )}),created_by.in.(${userIds.join(",")})`,
          ),
      ]);

      const [dealsResult, contactsResult, tasksResult] = results;

      const deals = dealsResult.data || [];
      const contacts = contactsResult.data || [];
      const tasks = tasksResult.data || [];

      const wonDeals = deals.filter((deal) => deal.stage === "won");
      const teamRevenue = wonDeals.reduce(
        (sum, deal) => sum + (parseFloat(deal.amount) || 0),
        0,
      );

      return {
        data: {
          teamRevenue,
          teamDeals: deals.length,
          teamContacts: contacts.length,
          teamTasks: tasks.length,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get team sales data for chart
  async getTeamSalesData(companyId, userIds = []) {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select("amount, created_at, stage")
        .eq("company_id", companyId)
        .in("owner_id", userIds)
        .order("created_at", { ascending: true });

      if (error) return { data: [], error };

      // Group by month for chart data
      const salesData = (data || []).reduce((acc, deal) => {
        const date = new Date(deal.created_at);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;

        if (!acc[monthKey]) {
          acc[monthKey] = { period: monthKey, revenue: 0, deals: 0 };
        }

        if (deal.stage === "won") {
          acc[monthKey].revenue += parseFloat(deal.amount) || 0;
        }
        acc[monthKey].deals += 1;

        return acc;
      }, {});

      return { data: Object.values(salesData), error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get user-specific metrics
  async getUserMetrics(companyId, userId) {
    try {
      const results = await Promise.all([
        // User deals
        supabase
          .from("deals")
          .select("amount, stage")
          .eq("company_id", companyId)
          .eq("owner_id", userId),
        // User contacts
        supabase.from("contacts").select("id").eq("owner_id", userId),
        // User tasks
        supabase
          .from("tasks")
          .select("id")
          .eq("company_id", companyId)
          .or(`assigned_to.eq.${userId},created_by.eq.${userId}`),
      ]);

      const [dealsResult, contactsResult, tasksResult] = results;

      const deals = dealsResult.data || [];
      const contacts = contactsResult.data || [];
      const tasks = tasksResult.data || [];

      const wonDeals = deals.filter((deal) => deal.stage === "won");
      const myRevenue = wonDeals.reduce(
        (sum, deal) => sum + (parseFloat(deal.amount) || 0),
        0,
      );

      return {
        data: {
          myRevenue,
          myDeals: deals.length,
          myContacts: contacts.length,
          myTasks: tasks.length,
        },
        error: null,
      };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get user sales data for chart
  async getUserSalesData(companyId, userId) {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select("amount, created_at, stage")
        .eq("company_id", companyId)
        .eq("owner_id", userId)
        .order("created_at", { ascending: true });

      if (error) return { data: [], error };

      // Group by month for chart data
      const salesData = (data || []).reduce((acc, deal) => {
        const date = new Date(deal.created_at);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;

        if (!acc[monthKey]) {
          acc[monthKey] = { period: monthKey, revenue: 0, deals: 0 };
        }

        if (deal.stage === "won") {
          acc[monthKey].revenue += parseFloat(deal.amount) || 0;
        }
        acc[monthKey].deals += 1;

        return acc;
      }, {});

      return { data: Object.values(salesData), error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Calculate percentage change between current and previous period
  async calculateTrendChange(
    companyId,
    userId,
    metric = "revenue",
    periodDays = 30,
    viewAll = false,
  ) {
    try {
      // Guard: Return early if companyId is not provided
      if (!companyId) {
        return { change: 0, currentValue: 0, previousValue: 0, error: null };
      }

      const now = new Date();
      const currentPeriodStart = new Date(
        now.getTime() - periodDays * 24 * 60 * 60 * 1000,
      );
      const previousPeriodStart = new Date(
        currentPeriodStart.getTime() - periodDays * 24 * 60 * 60 * 1000,
      );

      let query = supabase
        .from("deals")
        .select("amount, created_at, stage, closed_at")
        .eq("company_id", companyId);

      // Owner-level visibility unless viewAll is explicitly true
      if (userId && !viewAll) {
        query = query.eq("owner_id", userId);
      }

      const { data, error } = await query;
      if (error) return { change: 0, error };

      const currentPeriodData =
        data?.filter((deal) => {
          const dealDate = new Date(deal.created_at);
          return dealDate >= currentPeriodStart && dealDate <= now;
        }) || [];

      const previousPeriodData =
        data?.filter((deal) => {
          const dealDate = new Date(deal.created_at);
          return (
            dealDate >= previousPeriodStart && dealDate < currentPeriodStart
          );
        }) || [];

      let currentValue = 0;
      let previousValue = 0;

      if (metric === "revenue") {
        currentValue = currentPeriodData
          .filter((d) => d.stage === "won")
          .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
        previousValue = previousPeriodData
          .filter((d) => d.stage === "won")
          .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
      } else if (metric === "deals") {
        currentValue = currentPeriodData.filter(
          (d) => d.stage === "won",
        ).length;
        previousValue = previousPeriodData.filter(
          (d) => d.stage === "won",
        ).length;
      } else if (metric === "winRate") {
        const currentWon = currentPeriodData.filter(
          (d) => d.stage === "won",
        ).length;
        const currentTotal =
          currentPeriodData.filter((d) => d.closed_at).length || 1;
        const previousWon = previousPeriodData.filter(
          (d) => d.stage === "won",
        ).length;
        const previousTotal =
          previousPeriodData.filter((d) => d.closed_at).length || 1;
        currentValue = (currentWon / currentTotal) * 100;
        previousValue = (previousWon / previousTotal) * 100;
      }

      const change =
        previousValue === 0
          ? currentValue > 0
            ? 100
            : 0
          : ((currentValue - previousValue) / previousValue) * 100;

      return {
        change: parseFloat(change.toFixed(1)),
        currentValue,
        previousValue,
        error: null,
      };
    } catch (error) {
      return { change: 0, currentValue: 0, previousValue: 0, error };
    }
  },

  // Calculate sales velocity (average days to close)
  async calculateSalesVelocity(companyId, userId = null) {
    try {
      // Guard: Return early if companyId is not provided
      if (!companyId) {
        return { velocityDays: 0, error: null };
      }

      let query = supabase
        .from("deals")
        .select("created_at, closed_at, stage")
        .eq("company_id", companyId)
        .in("stage", ["won", "lost"])
        .not("closed_at", "is", null);

      if (userId) {
        query = query.eq("owner_id", userId);
      }

      const { data, error } = await query;
      if (error || !data || data.length === 0) {
        return { velocityDays: 0, error };
      }

      const totalDays = data.reduce((sum, deal) => {
        const created = new Date(deal.created_at);
        const closed = new Date(deal.closed_at);
        const days = Math.floor((closed - created) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0);

      const velocityDays = Math.floor(totalDays / data.length);
      return { velocityDays, error: null };
    } catch (error) {
      return { velocityDays: 0, error };
    }
  },

  // Calculate forecast data based on historical trends
  async calculateForecast(
    companyId,
    userId = null,
    monthsAhead = 6,
    viewAll = false,
  ) {
    try {
      let query = supabase
        .from("deals")
        .select("amount, created_at, closed_at, stage")
        .eq("company_id", companyId)
        .eq("stage", "won");

      // Owner-level visibility unless viewAll is explicitly true
      if (userId && !viewAll) {
        query = query.eq("owner_id", userId);
      }

      const { data, error } = await query;
      if (error) return { data: [], error };

      // Group by month
      const monthlyData = {};
      data?.forEach((deal) => {
        const date = new Date(deal.closed_at || deal.created_at);
        const monthKey = `${date.getFullYear()}-${String(
          date.getMonth() + 1,
        ).padStart(2, "0")}`;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = 0;
        }
        monthlyData[monthKey] += parseFloat(deal.amount || 0);
      });

      // Calculate average growth rate
      const sortedMonths = Object.keys(monthlyData).sort();
      let growthRates = [];
      for (let i = 1; i < sortedMonths.length; i++) {
        const current = monthlyData[sortedMonths[i]];
        const previous = monthlyData[sortedMonths[i - 1]];
        if (previous > 0) {
          growthRates.push((current - previous) / previous);
        }
      }

      const avgGrowthRate =
        growthRates.length > 0
          ? growthRates.reduce((sum, rate) => sum + rate, 0) /
            growthRates.length
          : 0.05; // Default 5% growth if no historical data

      // Generate forecast
      const now = new Date();
      const forecastData = [];
      const lastActualMonth = sortedMonths[sortedMonths.length - 1];
      let lastValue = monthlyData[lastActualMonth] || 50000;

      for (let i = 0; i < monthsAhead; i++) {
        const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthKey = `${forecastDate.getFullYear()}-${String(
          forecastDate.getMonth() + 1,
        ).padStart(2, "0")}`;
        const monthName = forecastDate.toLocaleString("default", {
          month: "short",
        });

        const actual = monthlyData[monthKey] || 0;
        const forecast = actual || lastValue * (1 + avgGrowthRate);

        forecastData.push({
          month: monthName,
          actual: actual,
          forecast: Math.round(forecast),
        });

        if (forecast > 0) lastValue = forecast;
      }

      return { data: forecastData, error: null };
    } catch (error) {
      return { data: [], error };
    }
  },
};

// ========================================
// DEALS SERVICES
// ========================================

export const dealService = {
  // Get all deals for a company
  async getDeals(companyId, filters = {}, userId = null) {
    try {
      let query = supabase
        .from("deals")
        .select(
          `
          *,
          contact:contacts!contact_id(id, first_name, last_name, email, phone, company_name),
          owner:users!owner_id(id, full_name, email, avatar_url),
          deal_products(
            id,
            product_id,
            quantity,
            sqm,
            ton,
            unit_price,
            line_total,
            notes,
            uom_type,
            uom_value,
            product:products!product_id(id, material, description, material_group, base_unit_of_measure, unit_price)
          )
        `,
        )
        .order("created_at", { ascending: false });

      // Only filter by company if companyId is provided
      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      // Owner-level visibility: Only show deals owned by the user
      // Unless explicitly requesting all deals (userId = null and filters.viewAll = true)
      if (userId && filters.viewAll !== true) {
        query = query.eq("owner_id", userId);
      }

      // Apply filters
      if (filters.stage) {
        query = query.eq("stage", filters.stage);
      }
      if (filters.search) {
        query = query.ilike("title", `%${filters.search}%`);
      }

      // Date range filter: won deals use closed_at, all others use created_at.
      // Only applied when at least one date boundary is supplied.
      const df = filters.dateFrom;
      const dt = filters.dateTo;
      if (df || dt) {
        const wonCond = ["stage.eq.won", df && `closed_at.gte.${df}`, dt && `closed_at.lte.${dt}`]
          .filter(Boolean).join(",");
        const otherCond = ["stage.neq.won", df && `created_at.gte.${df}`, dt && `created_at.lte.${dt}`]
          .filter(Boolean).join(",");
        query = query.or(`and(${wonCond}),and(${otherCond})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error in getDeals:", error);
      return { data: null, error };
    }
  },

  // Create new deal
  async createDeal(dealData) {
    try {
      const { data, error } = await supabase
        ?.from("deals")
        ?.insert(dealData)
        ?.select(
          `
          *,
          owner:owner_id(id, full_name, email)
        `,
        )
        ?.single();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update deal
  async updateDeal(dealId, updates) {
    try {
      // Get the deal before update to check stage changes
      const { data: oldDeal } = await supabase
        .from("deals")
        .select("stage, owner_id, company_id, title, amount, currency")
        .eq("id", dealId)
        .single();

      const { data, error } = await supabase
        .from("deals")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId)
        .select(
          `
          *,
          contact:contacts!contact_id(id, first_name, last_name, email, phone, company_name),
          owner:users!owner_id(id, full_name, email, avatar_url)
        `,
        )
        .single();

      if (error) return { data: null, error };

      // Create notifications for pipeline updates
      if (data && oldDeal) {
        const ownerId = data.owner_id || oldDeal.owner_id;
        const companyId = data.company_id || oldDeal.company_id;
        const ownerName = data.owner?.full_name || data.owner?.email || "User";
        const dealTitle = data.title || oldDeal.title || "Deal";
        const dealAmount = parseFloat(data.amount || oldDeal.amount || 0);
        const currency = data.currency || oldDeal.currency || "USD";

        // Format currency
        const formattedAmount = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(dealAmount);

        // Check if stage changed
        if (updates.stage && updates.stage !== oldDeal.stage) {
          let eventType = "pipeline_update";
          let title = "Deal Stage Updated";
          let message = `${ownerName} moved "${dealTitle}" to ${updates.stage.replace("_", " ")} stage.`;

          if (updates.stage === "won") {
            eventType = "deal_won";
            title = "Deal Won! 🎉";
            message = `${ownerName} won the deal "${dealTitle}" worth ${formattedAmount}.`;
          } else if (updates.stage === "lost") {
            eventType = "deal_lost";
            title = "Deal Lost";
            message = `${ownerName} lost the deal "${dealTitle}" worth ${formattedAmount}.`;
          }

          // Notify supervisors/managers/directors
          await notificationService.notifyRoleBasedEvent(eventType, {
            userId: ownerId,
            companyId,
            title,
            message,
            metadata: {
              deal_id: dealId,
              deal_title: dealTitle,
              deal_amount: dealAmount,
              currency: currency,
              old_stage: oldDeal.stage,
              new_stage: updates.stage,
            },
          });
        }
      }

      if (data?.contact_id) {
        contactService._refreshScoreForContact(data.contact_id).catch(() => {});
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Check deal references before deletion
  async checkDealReferences(dealId) {
    try {
      const references = {
        tasks: 0,
        activities: 0,
        deal_products: 0,
      };

      // Check tasks
      const { count: tasksCount } = await supabase
        ?.from("tasks")
        ?.select("*", { count: "exact", head: true })
        ?.eq("deal_id", dealId);
      references.tasks = tasksCount || 0;

      // Check activities
      const { count: activitiesCount } = await supabase
        ?.from("activities")
        ?.select("*", { count: "exact", head: true })
        ?.eq("deal_id", dealId);
      references.activities = activitiesCount || 0;

      // Check deal_products
      const { count: productsCount } = await supabase
        ?.from("deal_products")
        ?.select("*", { count: "exact", head: true })
        ?.eq("deal_id", dealId);
      references.deal_products = productsCount || 0;

      const totalReferences =
        references.tasks + references.activities + references.deal_products;

      return { data: { references, totalReferences }, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Delete deal with cascade (deletes related records first)
  async deleteDealWithCascade(dealId) {
    try {
      // Delete deal_products first
      await supabase?.from("deal_products")?.delete()?.eq("deal_id", dealId);

      // Delete activities related to deal
      await supabase?.from("activities")?.delete()?.eq("deal_id", dealId);

      // Update tasks to remove deal reference (don't delete tasks, just unlink)
      await supabase
        ?.from("tasks")
        ?.update({ deal_id: null })
        ?.eq("deal_id", dealId);

      // Now delete the deal
      const { error } = await supabase
        ?.from("deals")
        ?.delete()
        ?.eq("id", dealId);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Delete deal
  async deleteDeal(dealId) {
    try {
      const { error } = await supabase
        ?.from("deals")
        ?.delete()
        ?.eq("id", dealId);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Get deal totals
  async getDealTotals(companyId) {
    try {
      const { data, error } = await supabase?.rpc("calculate_deal_totals", {
        comp_id: companyId,
      });
      return { data: data?.[0] || {}, error };
    } catch (error) {
      return { data: {}, error };
    }
  },

  // Upsert deal (create or update)
  async upsertDeal(dealData) {
    try {
      const payload = {
        ...dealData,
        updated_at: new Date().toISOString(),
      };

      // If it's a new deal (no id), set created_at
      if (!dealData.id) {
        payload.created_at = new Date().toISOString();
      }

      // If stage is won or lost, set closed_at timestamp
      if (dealData.stage === "won" || dealData.stage === "lost") {
        payload.closed_at = new Date().toISOString();
      } else {
        // If moving from won/lost to another stage, clear closed_at
        payload.closed_at = null;
      }

      const { data, error } = await supabase
        .from("deals")
        .upsert(payload)
        .select(
          `
          *,
          contact:contacts!contact_id(id, first_name, last_name, email, phone, company_name),
          owner:users!owner_id(id, full_name, email, avatar_url),
          deal_products(
            id,
            product_id,
            quantity,
            sqm,
            ton,
            unit_price,
            line_total,
            notes,
            uom_type,
            uom_value,
            product:products!product_id(id, material, description, material_group, base_unit_of_measure, unit_price)
          )
        `,
        )
        .single();

      if (error) throw error;

      // Create notification for new deal creation (pipeline update)
      if (data && !dealData.id) {
        // New deal created
        const ownerId = data.owner_id;
        const companyId = data.company_id;
        const ownerName = data.owner?.full_name || data.owner?.email || "User";
        const dealTitle = data.title || "New Deal";
        const dealAmount = parseFloat(data.amount || 0);
        const currency = data.currency || "USD";

        const formattedAmount = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(dealAmount);

        await notificationService.notifyRoleBasedEvent("pipeline_update", {
          userId: ownerId,
          companyId,
          title: "New Deal Created",
          message: `${ownerName} created a new deal "${dealTitle}" worth ${formattedAmount} in ${data.stage || "lead"} stage.`,
          metadata: {
            deal_id: data.id,
            deal_title: dealTitle,
            deal_amount: dealAmount,
            currency: currency,
            stage: data.stage,
          },
        });
      } else if (data && dealData.id && dealData.stage) {
        // Deal updated - check if stage changed
        const ownerId = data.owner_id;
        const companyId = data.company_id;
        const ownerName = data.owner?.full_name || data.owner?.email || "User";
        const dealTitle = data.title || "Deal";
        const dealAmount = parseFloat(data.amount || 0);
        const currency = data.currency || "USD";

        const formattedAmount = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(dealAmount);

        let eventType = "pipeline_update";
        let title = "Deal Updated";
        let message = `${ownerName} updated the deal "${dealTitle}".`;

        if (data.stage === "won") {
          eventType = "deal_won";
          title = "Deal Won! 🎉";
          message = `${ownerName} won the deal "${dealTitle}" worth ${formattedAmount}.`;
        } else if (data.stage === "lost") {
          eventType = "deal_lost";
          title = "Deal Lost";
          message = `${ownerName} lost the deal "${dealTitle}" worth ${formattedAmount}.`;
        }

        await notificationService.notifyRoleBasedEvent(eventType, {
          userId: ownerId,
          companyId,
          title,
          message,
          metadata: {
            deal_id: data.id,
            deal_title: dealTitle,
            deal_amount: dealAmount,
            currency: currency,
            stage: data.stage,
          },
        });
      }

      return { data, error: null };
    } catch (error) {
      console.error("Error in upsertDeal:", error);
      return { data: null, error };
    }
  },

  // Get team deals for specific users
  async getTeamDeals(companyId, userIds = []) {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select(
          `
          *,
          contact:contacts!contact_id(id, first_name, last_name, email, phone, company_name),
          owner:users!owner_id(id, full_name, email, avatar_url),
          deal_products(
            id,
            product_id,
            quantity,
            sqm,
            ton,
            unit_price,
            line_total,
            notes,
            product:products!product_id(id, material, description, material_group, base_unit_of_measure, unit_price)
          )
        `,
        )
        .eq("company_id", companyId)
        .in("owner_id", userIds)
        .order("created_at", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get user-specific deals
  async getUserDeals(companyId, userId) {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select(
          `
          *,
          contact:contacts!contact_id(id, first_name, last_name, email, phone, company_name),
          owner:users!owner_id(id, full_name, email, avatar_url),
          deal_products(
            id,
            product_id,
            quantity,
            sqm,
            ton,
            unit_price,
            line_total,
            notes,
            product:products!product_id(id, material, description, material_group, base_unit_of_measure, unit_price)
          )
        `,
        )
        .eq("company_id", companyId)
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },
};

// ========================================
// CONTACTS SERVICES
// ========================================

export const contactService = {
  // Get all contacts for current user (owner-only visibility)
  async getContacts(companyId, filters = {}, userId = null) {
    try {
      // Get current user if not provided
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserId = userId || user?.id;

      if (!currentUserId) {
        return { data: [], error: new Error("User not authenticated") };
      }

      // Build query with owner_id filter for security
      let query = supabase
        .from("contacts")
        .select(
          `
          *,
          owner:users!owner_id(id, full_name, email, avatar_url, company_id)
        `,
        )
        .eq("owner_id", currentUserId) // Owner-only visibility
        .order("created_at", { ascending: false });

      // Apply additional filters to query
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`,
        );
      }

      const { data, error: queryError } = await query;

      if (queryError) return { data: [], error: queryError };

      return { data: data || [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Create new contact
  async createContact(contactData) {
    try {
      const { data, error } = await supabase
        ?.from("contacts")
        ?.insert(contactData)
        ?.select(
          `
          *,
          owner:owner_id(id, full_name, email)
        `,
        )
        ?.single();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update contact
  async updateContact(contactId, updates) {
    try {
      const { data, error } = await supabase
        ?.from("contacts")
        ?.update(updates)
        ?.eq("id", contactId)
        ?.select(
          `
          *,
          owner:owner_id(id, full_name, email)
        `,
        )
        ?.single();
      if (!error && data) {
        this._refreshScoreForContact(contactId).catch(() => {});
      }
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Check contact references before deletion
  async checkContactReferences(contactId) {
    try {
      const references = {
        deals: 0,
        tasks: 0,
        activities: 0,
        contact_tags: 0,
      };

      // Check deals
      const { count: dealsCount } = await supabase
        ?.from("deals")
        ?.select("*", { count: "exact", head: true })
        ?.eq("contact_id", contactId);
      references.deals = dealsCount || 0;

      // Check tasks
      const { count: tasksCount } = await supabase
        ?.from("tasks")
        ?.select("*", { count: "exact", head: true })
        ?.eq("contact_id", contactId);
      references.tasks = tasksCount || 0;

      // Check activities
      const { count: activitiesCount } = await supabase
        ?.from("activities")
        ?.select("*", { count: "exact", head: true })
        ?.eq("contact_id", contactId);
      references.activities = activitiesCount || 0;

      // Check contact_tags
      const { count: tagsCount } = await supabase
        ?.from("contact_tags")
        ?.select("*", { count: "exact", head: true })
        ?.eq("contact_id", contactId);
      references.contact_tags = tagsCount || 0;

      const totalReferences =
        references.deals +
        references.tasks +
        references.activities +
        references.contact_tags;

      return { data: { references, totalReferences }, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Delete contact with cascade (deletes/updates related records first)
  async deleteContactWithCascade(contactId) {
    try {
      // Delete contact_tags first
      await supabase
        ?.from("contact_tags")
        ?.delete()
        ?.eq("contact_id", contactId);

      // Delete activities related to contact
      await supabase?.from("activities")?.delete()?.eq("contact_id", contactId);

      // Update tasks to remove contact reference (don't delete tasks, just unlink)
      await supabase
        ?.from("tasks")
        ?.update({ contact_id: null })
        ?.eq("contact_id", contactId);

      // Update deals to remove contact reference (don't delete deals, just unlink)
      await supabase
        ?.from("deals")
        ?.update({ contact_id: null })
        ?.eq("contact_id", contactId);

      // Now delete the contact
      const { error } = await supabase
        ?.from("contacts")
        ?.delete()
        ?.eq("id", contactId);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Delete contact
  async deleteContact(contactId) {
    try {
      const { error } = await supabase
        ?.from("contacts")
        ?.delete()
        ?.eq("id", contactId);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Delete multiple contacts
  async deleteContacts(contactIds) {
    try {
      const { error } = await supabase
        ?.from("contacts")
        ?.delete()
        ?.in("id", contactIds);
      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Upsert contact (create or update)
  async upsertContact(contactData) {
    try {
      let result;
      if (contactData.id) {
        // Update existing contact
        result = await this.updateContact(contactData.id, contactData);
      } else {
        // Create new contact
        result = await this.createContact(contactData);
      }

      // Create notification for client updates
      if (result.data && !result.error) {
        const contact = result.data;
        const ownerId = contact.owner_id || contactData.owner_id;
        const companyId = contact.company_id || contactData.company_id;
        const ownerName =
          contact.owner?.full_name || contact.owner?.email || "User";
        const contactName =
          `${contact.first_name || ""} ${contact.last_name || ""}`.trim() ||
          "Contact";

        await notificationService.notifyRoleBasedEvent(
          contactData.id ? "client_update" : "contact_created",
          {
            userId: ownerId,
            companyId,
            title: contactData.id ? "Client Updated" : "New Client Added",
            message: contactData.id
              ? `${ownerName} updated client "${contactName}".`
              : `${ownerName} added a new client "${contactName}".`,
            metadata: {
              contact_id: contact.id,
              contact_name: contactName,
              company_name: contact.company_name,
            },
          },
        );
      }

      return result;
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get contact statistics
  async getContactStats(companyId) {
    console.log(companyId);
    try {
      const { data: contacts, error } = await this.getContacts(companyId);

      if (error) return { data: null, error };

      const stats = {
        total: contacts.length,
        byStatus: {},
        recentActivity: 0,
      };

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      contacts.forEach((contact) => {
        // Count by status
        const status = contact.status || "active";
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

        // Count recent activity
        if (contact.last_contacted_at) {
          const lastContact = new Date(contact.last_contacted_at);
          if (lastContact >= sevenDaysAgo) {
            stats.recentActivity++;
          }
        }
      });

      return { data: stats, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get activities for a specific contact
  async getContactActivities(contactId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from("activities")
        .select(
          `
          *,
          owner:users!owner_id(id, full_name, email, avatar_url)
        `,
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(limit);

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get deals for a specific contact
  async getContactDeals(contactId) {
    try {
      const { data, error } = await supabase
        .from("deals")
        .select(
          `
          *,
          owner:users!owner_id(id, full_name, email, avatar_url)
        `,
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get tasks for a specific contact
  async getContactTasks(contactId) {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          `
          *,
          assigned_to:users!assigned_to(id, full_name, email, avatar_url),
          created_by:users!created_by(id, full_name, email, avatar_url)
        `,
        )
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Bulk update contacts
  async bulkUpdateContacts(contactIds, updates) {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .update(updates)
        .in("id", contactIds)
        .select();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get user-specific contacts
  async getUserContacts(companyId, userId) {
    try {
      const { data: rawData, error: queryError } = await supabase
        .from("contacts")
        .select(
          `
          *,
          owner:users!owner_id(id, full_name, email, avatar_url, company_id)
        `,
        )
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      if (queryError) return { data: [], error: queryError };

      // Filter by company - contacts belong to users who belong to companies
      const filteredData =
        rawData?.filter((contact) => contact.owner?.company_id === companyId) ||
        [];

      return { data: filteredData, error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Update lead_score, lead_grade, score_updated_at for a single contact
  async updateLeadScore(contactId, { score, grade }) {
    try {
      const { data, error } = await supabase
        .from("contacts")
        .update({
          lead_score: score,
          lead_grade: grade,
          score_updated_at: new Date().toISOString(),
        })
        .eq("id", contactId)
        .select("id, lead_score, lead_grade, score_updated_at")
        .single();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Fetch deals + activities for one contact, score it, persist the result.
  // Called fire-and-forget from mutation methods — never surfaces errors to callers.
  async _refreshScoreForContact(contactId) {
    const [{ data: contact }, { data: deals }, { data: activities }] =
      await Promise.all([
        supabase.from("contacts").select("*").eq("id", contactId).single(),
        supabase.from("deals").select("*").eq("contact_id", contactId),
        supabase.from("activities").select("*").eq("contact_id", contactId),
      ]);
    if (!contact) return;
    const { score, grade } = calculateLeadScore(
      contact,
      deals || [],
      activities || [],
    );
    await this.updateLeadScore(contactId, { score, grade });
  },

  // Recalculate and persist lead scores for every contact belonging to a company.
  // Fetches deals and activities in two bulk queries to avoid N+1.
  async recalculateAllScores(companyId) {
    try {
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("*, owner:users!owner_id(company_id)");
      if (contactsError) return { data: null, error: contactsError };

      const companyContacts = (contacts || []).filter(
        (c) => c.owner?.company_id === companyId,
      );
      if (companyContacts.length === 0) return { data: { updated: 0, failed: 0 }, error: null };

      const contactIds = companyContacts.map((c) => c.id);

      const [{ data: allDeals }, { data: allActivities }] = await Promise.all([
        supabase.from("deals").select("*").in("contact_id", contactIds),
        supabase.from("activities").select("*").in("contact_id", contactIds),
      ]);

      const dealsByContact = (allDeals || []).reduce((acc, d) => {
        if (d.contact_id) {
          (acc[d.contact_id] ??= []).push(d);
        }
        return acc;
      }, {});

      const activitiesByContact = (allActivities || []).reduce((acc, a) => {
        if (a.contact_id) {
          (acc[a.contact_id] ??= []).push(a);
        }
        return acc;
      }, {});

      const results = await Promise.all(
        companyContacts.map((contact) => {
          const { score, grade } = calculateLeadScore(
            contact,
            dealsByContact[contact.id] || [],
            activitiesByContact[contact.id] || [],
          );
          return this.updateLeadScore(contact.id, { score, grade });
        }),
      );

      const failed = results.filter((r) => r.error).length;
      return {
        data: { updated: results.length - failed, failed },
        error: failed ? results.find((r) => r.error).error : null,
      };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// ========================================
// TAGS SERVICES
// ========================================

export const tagService = {
  // Get all tags
  async getTags() {
    try {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .order("name");

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Create new tag
  async createTag(tagData) {
    try {
      const { data, error } = await supabase
        .from("tags")
        .insert(tagData)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// ========================================
// USER SETTINGS SERVICES
// ========================================

export const settingsService = {
  // Get user settings
  async getUserSettings(userId) {
    if (!userId) return { data: null, error: null };

    try {
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return { data: null, error };

      // If no settings exist, create default settings
      if (!data) {
        return await this.createDefaultSettings(userId);
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Create default settings for a user
  async createDefaultSettings(userId) {
    try {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", userId)
        .single();

      if (userError) throw userError;

      const defaultSettings = {
        user_id: userId,
        company_id: userData.company_id,
        preferred_currency: "USD",
        date_format: "MM/DD/YYYY",
        timezone: "UTC",
        language: "en",
        notifications_enabled: true,
        email_notifications: true,
      };

      const { data, error } = await supabase
        .from("user_settings")
        .insert(defaultSettings)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update user settings
  async updateUserSettings(userId, updates) {
    try {
      const { data, error } = await supabase
        .from("user_settings")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update user profile
  async updateUserProfile(userId, updates) {
    try {
      const { data, error } = await supabase
        .from("users")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// ========================================
// CURRENCY SERVICES
// ========================================

export const currencyService = {
  // Common currencies with their symbols
  currencies: [
    { code: "USD", symbol: "$", name: "US Dollar" },
    { code: "EUR", symbol: "€", name: "Euro" },
    { code: "GBP", symbol: "£", name: "British Pound" },
    { code: "SAR", symbol: "﷼", name: "Saudi Riyal" },
    { code: "AED", symbol: "د.إ", name: "Emirati Dirham" },
  ],

  // Exchange rates relative to USD (updated periodically)
  exchangeRates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    SAR: 3.75,
    AED: 3.67,
  },

  // Get currency symbol by code
  getSymbol(currencyCode) {
    const currency = this.currencies.find((c) => c.code === currencyCode);
    return currency?.symbol || currencyCode;
  },

  // Get currency name by code
  getName(currencyCode) {
    const currency = this.currencies.find((c) => c.code === currencyCode);
    return currency?.name || currencyCode;
  },

  // Format amount with currency (NO conversion, just formatting)
  format(amount, currencyCode = "USD", showSymbol = true) {
    const symbol = this.getSymbol(currencyCode);
    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

    return showSymbol ? `${symbol}${formatted}` : formatted;
  },

  // Convert amount from one currency to another (SYNCHRONOUS)
  convert(amount, fromCurrency = "USD", toCurrency = "USD") {
    if (!amount) return 0;
    if (fromCurrency === toCurrency) return amount;

    const fromRate = this.exchangeRates[fromCurrency] || 1;
    const toRate = this.exchangeRates[toCurrency] || 1;

    // Convert to USD first, then to target currency
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
  },

  // Format AND convert in one step
  formatAndConvert(amount, fromCurrency = "USD", toCurrency = "USD") {
    const convertedAmount = this.convert(amount, fromCurrency, toCurrency);
    return this.format(convertedAmount, toCurrency);
  },
};

// ========================================
// USER SERVICES
// ========================================

export const userService = {
  // Get all users for a company (with filtering options)
  async getCompanyUsers(companyId, options = {}) {
    try {
      let query = supabase
        .from("users")
        .select(
          "id, full_name, email, avatar_url, role, is_active, supervisor_id, created_at, updated_at",
        )
        .eq("company_id", companyId)
        .order("full_name");

      // Apply status filter if provided
      if (options.status !== undefined) {
        query = query.eq("is_active", options.status === "active");
      }

      // Apply role filter if provided
      if (options.role) {
        query = query.eq("role", options.role);
      }

      // Apply search filter if provided
      if (options.search) {
        query = query.or(
          `full_name.ilike.%${options.search}%,email.ilike.%${options.search}%`,
        );
      }

      // Apply pagination if provided
      if (options.page && options.limit) {
        const from = (options.page - 1) * options.limit;
        const to = from + options.limit - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      return { data: data || [], error, count };
    } catch (error) {
      return { data: [], error, count: 0 };
    }
  },

  // Get user profile
  async getUserProfile(userId) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          *,
          company:companies(*)
        `,
        )
        .eq("id", userId)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Create new user with Supabase Auth invitation
  async createUser(userData, sendInvitation = true) {
    try {
      console.log(
        "Creating user:",
        userData,
        "Send invitation:",
        sendInvitation,
      );

      let authUser = null;
      let authError = null;

      // Create user in Supabase Auth if sending invitation
      if (sendInvitation) {
        console.log(userData);
        const { data: authData, error: inviteError } =
          await supabase.auth.admin.inviteUserByEmail(userData.email, {
            data: {
              full_name: userData.full_name,
            },
          });

        if (inviteError) {
          console.error("Error sending invitation:", inviteError);
          return { data: null, error: inviteError };
        }

        authUser = authData.user;
      } else {
        // Create user without invitation (they'll need to sign up manually)
        const { data: authData, error: createError } =
          await supabase.auth.admin.createUser({
            email: userData.email,
            email_confirm: true,
            user_metadata: {
              full_name: userData.full_name,
              role: userData.role,
            },
          });

        if (createError) {
          console.error("Error creating auth user:", createError);
          return { data: null, error: createError };
        }

        authUser = authData.user;
      }

      // Insert user into our users table
      const { data, error } = await supabase
        .from("users")
        .insert({
          id: authUser.id,
          email: userData.email,
          full_name: userData.full_name,
          role: userData.role,
          is_active:
            userData.is_active !== undefined ? userData.is_active : true,
          company_id: userData.company_id,
          avatar_url: null,
        })
        .select()
        .single();

      if (error) {
        console.error("Error inserting user into database:", error);
        // If database insert fails, we should clean up the auth user
        try {
          await supabase.auth.admin.deleteUser(authUser.id);
        } catch (cleanupError) {
          console.error("Error cleaning up auth user:", cleanupError);
        }
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error("Error in createUser:", error);
      return { data: null, error };
    }
  },

  // Update user
  async updateUser(userId, userData) {
    try {
      console.log("Updating user:", userId, userData);

      // Update user in our database
      const { data, error } = await supabase
        .from("users")
        .update({
          full_name: userData.full_name,
          role: userData.role,
          is_active: userData.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        console.error("Error updating user in database:", error);
        return { data: null, error };
      }

      // Update user metadata in Supabase Auth if needed
      try {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: {
            full_name: userData.full_name,
            role: userData.role,
          },
        });
      } catch (authError) {
        console.warn("Error updating auth metadata:", authError);
        // Continue even if auth update fails since database update succeeded
      }

      return { data, error: null };
    } catch (error) {
      console.error("Error in updateUser:", error);
      return { data: null, error };
    }
  },

  // Update user status (activate/deactivate)
  async updateUserStatus(userId, isActive) {
    try {
      console.log("Updating user status:", userId, isActive);

      const { data, error } = await supabase
        .from("users")
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      console.error("Error updating user status:", error);
      return { data: null, error };
    }
  },

  // Delete user
  async deleteUser(userId) {
    try {
      console.log("Deleting user:", userId);

      // First, deactivate the user in our database
      const { error: deactivateError } = await supabase
        .from("users")
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      if (deactivateError) {
        console.error("Error deactivating user:", deactivateError);
        return { error: deactivateError };
      }

      // Then delete from Supabase Auth
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);

      if (authError) {
        console.error("Error deleting user from auth:", authError);
        // Continue even if auth deletion fails since user is deactivated
      }

      // Finally, delete from our database
      const { error } = await supabase.from("users").delete().eq("id", userId);

      return { error };
    } catch (error) {
      console.error("Error in deleteUser:", error);
      return { error };
    }
  },

  // Get user statistics
  async getUserStats(companyId) {
    try {
      console.log("Getting user stats for company:", companyId);

      const [totalUsersResult, activeUsersResult, roleStatsResult] =
        await Promise.all([
          // Total users
          supabase
            .from("users")
            .select("id", { count: "exact" })
            .eq("company_id", companyId),

          // Active users
          supabase
            .from("users")
            .select("id", { count: "exact" })
            .eq("company_id", companyId)
            .eq("is_active", true),

          // Role distribution
          supabase.from("users").select("role").eq("company_id", companyId),
        ]);

      const totalUsers = totalUsersResult.count || 0;
      const activeUsers = activeUsersResult.count || 0;
      const inactiveUsers = totalUsers - activeUsers;

      // Count by role
      const roleData = roleStatsResult.data || [];
      const roleCounts = roleData.reduce((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {});

      const stats = {
        totalUsers,
        activeUsers,
        inactiveUsers,
        adminUsers: roleCounts.admin || 0,
        managerUsers: roleCounts.manager || 0,
        agentUsers: roleCounts.agent || 0,
      };

      console.log("User stats:", stats);
      return { data: stats, error: null };
    } catch (error) {
      console.error("Error getting user stats:", error);
      return { data: null, error };
    }
  },

  // Check if user has permission to manage other user
  canManageUser(currentUser, targetUser) {
    if (currentUser.role === "admin") {
      return true; // Admins can manage all users
    }

    if (currentUser.role === "manager") {
      // Managers can only manage agents
      return targetUser.role === "agent";
    }

    return false; // Agents cannot manage other users
  },

  // Get available roles for current user
  getAvailableRoles(currentUserRole) {
    const allRoles = [
      { value: "agent", label: "Agent" },
      { value: "manager", label: "Manager" },
      { value: "admin", label: "Admin" },
    ];

    if (currentUserRole === "admin") {
      return allRoles; // Admins can assign any role
    }

    if (currentUserRole === "manager") {
      return allRoles.filter((role) => role.value === "agent"); // Managers can only create agents
    }

    return []; // Agents cannot create users
  },

  // Get user subordinates (recursive hierarchy)
  async getUserSubordinates(userId) {
    try {
      console.log("getUserSubordinates - Manager ID:", userId);

      // First, let's see what users exist in the table
      const { data: allUsers, error: allUsersError } = await supabase
        .from("users")
        .select(
          "id, full_name, email, role, is_active, supervisor_id, company_id",
        )
        .eq("is_active", true)
        .limit(10);

      console.log("Sample users in database:", allUsers);

      // Use direct query instead of RPC for better reliability
      const { data: directSubordinates, error: directError } = await supabase
        .from("users")
        .select(
          "id, full_name, email, role, is_active, supervisor_id, company_id",
        )
        .eq("supervisor_id", userId)
        .eq("is_active", true);

      if (directError) {
        console.log("Direct subordinates query failed:", directError);
        return { data: [], error: directError };
      }

      console.log("Direct subordinates found:", directSubordinates);

      // Also get second level subordinates (subordinates of subordinates)
      if (directSubordinates && directSubordinates.length > 0) {
        const subordinateIds = directSubordinates.map((s) => s.id);
        const { data: secondLevelSubs, error: secondLevelError } =
          await supabase
            .from("users")
            .select(
              "id, full_name, email, role, is_active, supervisor_id, company_id",
            )
            .in("supervisor_id", subordinateIds)
            .eq("is_active", true);

        if (!secondLevelError && secondLevelSubs) {
          console.log("Second level subordinates found:", secondLevelSubs);
          const allSubordinates = [...directSubordinates, ...secondLevelSubs];
          return { data: allSubordinates, error: null };
        }
      }

      return { data: directSubordinates || [], error: null };
    } catch (error) {
      console.log("getUserSubordinates error:", error);
      return { data: [], error };
    }
  },

  // Update user hierarchy
  async updateUserHierarchy(userId, supervisorId) {
    try {
      const { data, error } = await supabase
        .from("users")
        .update({
          supervisor_id: supervisorId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get user's accessible companies (for directors)
  async getUserAccessibleCompanies(userId) {
    try {
      const { data, error } = await supabase.rpc("get_accessible_companies", {
        user_id: userId,
      });

      if (error) {
        // Fallback: check if user is director
        const { data: userData } = await supabase
          .from("users")
          .select("role, company_id")
          .eq("id", userId)
          .single();

        if (userData?.role === "director") {
          const { data: allCompanies } = await supabase
            .from("companies")
            .select("*")
            .eq("is_active", true);
          return { data: allCompanies || [], error: null };
        } else {
          const { data: userCompany } = await supabase
            .from("companies")
            .select("*")
            .eq("id", userData?.company_id)
            .eq("is_active", true)
            .single();
          return { data: userCompany ? [userCompany] : [], error: null };
        }
      }

      return { data: data || [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  },
};

// ========================================
// ACTIVITIES SERVICES
// ========================================

export const activityService = {
  // Get activities for a company
  async getActivities(companyId, limit = 10) {
    try {
      const { data, error } = await supabase
        ?.from("activities")
        ?.select(
          `
          *,
          user:owner_id(id, full_name, email)
        `,
        )
        ?.eq("company_id", companyId)
        ?.order("created_at", { ascending: false })
        ?.limit(limit);
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Create new activity
  async createActivity(activityData) {
    try {
      // Map user_id to owner_id for database compatibility
      const dbData = {
        ...activityData,
        owner_id: activityData.user_id || activityData.owner_id,
      };
      delete dbData.user_id; // Remove user_id as it's not in the table

      const { data, error } = await supabase
        ?.from("activities")
        ?.insert(dbData)
        ?.select(
          `
          *,
          user:owner_id(id, full_name, email)
        `,
        )
        ?.single();
      if (!error && data?.contact_id) {
        contactService._refreshScoreForContact(data.contact_id).catch(() => {});
      }
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get team activities for specific users
  async getTeamActivities(companyId, userIds = [], limit = 15) {
    try {
      const { data, error } = await supabase
        .from("activities")
        .select(
          `
          *,
          contact:contacts(id, first_name, last_name, company_name),
          deal:deals(id, title),
          owner:users!owner_id(id, full_name, email),
          user:users!user_id(id, full_name, email)
        `,
        )
        .eq("company_id", companyId)
        .or(
          `owner_id.in.(${userIds.join(",")}),user_id.in.(${userIds.join(",")})`,
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get user-specific activities
  async getUserActivities(companyId, userId, limit = 10) {
    try {
      const { data, error } = await supabase
        .from("activities")
        .select(
          `
          *,
          contact:contacts(id, first_name, last_name, company_name),
          deal:deals(id, title),
          owner:users!owner_id(id, full_name, email),
          user:users!user_id(id, full_name, email)
        `,
        )
        .eq("company_id", companyId)
        .or(`owner_id.eq.${userId},user_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(limit);

      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },

  // Get all activities with filters and pagination
  async getAllActivities(companyId, options = {}) {
    try {
      const {
        type = null,
        userId = null,
        dateFrom = null,
        dateTo = null,
        searchQuery = null,
        page = 1,
        pageSize = 20,
      } = options;

      let query = supabase
        .from("activities")
        .select(
          `
          *,
          contact:contacts(id, first_name, last_name, company_name),
          deal:deals(id, title),
          owner:users!activities_owner_id_fkey(id, full_name, email)
        `,
          { count: "exact" },
        )
        .eq("company_id", companyId);

      // Apply filters
      if (type) {
        query = query.eq("type", type);
      }

      if (userId) {
        query = query.or(`owner_id.eq.${userId},user_id.eq.${userId}`);
      }

      if (dateFrom) {
        query = query.gte("created_at", dateFrom);
      }

      if (dateTo) {
        // Add 1 day to include the entire end date
        const endDate = new Date(dateTo);
        endDate.setDate(endDate.getDate() + 1);
        query = query.lt("created_at", endDate.toISOString());
      }

      if (searchQuery) {
        query = query.ilike("description", `%${searchQuery}%`);
      }

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, error, count } = await query;

      return {
        data: data || [],
        count: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
        error,
      };
    } catch (error) {
      return { data: [], count: 0, totalPages: 0, error };
    }
  },
};

// ========================================
// TASKS SERVICES
// ========================================

export const taskService = {
  // Get tasks for the current user or company
  async getMyTasks(userId, companyId, filters = {}) {
    try {
      // Guard: Return early if companyId is not provided
      if (!companyId) {
        return { data: [], error: null };
      }

      let query = supabase
        .from("tasks")
        .select(
          `
          *,
          contact:contacts(id, first_name, last_name),
          deal:deals(id, title),
          assigned_user:users!tasks_assigned_to_fkey(id, full_name, email),
          created_user:users!tasks_created_by_fkey(id, full_name, email)
        `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      // If userId is provided, filter by user, otherwise get all company tasks
      // For security: show tasks assigned to the user OR created by the user
      if (userId && filters.userOnly !== false) {
        query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`);
      }

      // Apply filters
      if (filters.search) {
        query = query.or(
          `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`,
        );
      }

      if (filters.priority) {
        query = query.eq("priority", filters.priority);
      }

      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      if (filters.assignedTo) {
        query = query.eq("assigned_to", filters.assignedTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to flatten relationships
      const transformedData = data?.map((task) => ({
        ...task,
        contact_name: task.contact
          ? `${task.contact.first_name} ${task.contact.last_name}`
          : null,
        deal_title: task.deal?.title || null,
        assigned_to_name:
          task.assigned_user?.full_name || task.assigned_user?.email || null,
        created_by_name:
          task.created_user?.full_name || task.created_user?.email || null,
      }));

      return { data: transformedData, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get task statistics
  async getTaskStats(companyId, userId = null) {
    try {
      let query = supabase
        .from("tasks")
        .select("status")
        .eq("company_id", companyId);

      // For security: show tasks assigned to the user OR created by the user
      if (userId) {
        query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`);
      }

      const { data, error } = await query;

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        byStatus: {
          pending: data?.filter((t) => t.status === "pending").length || 0,
          in_progress:
            data?.filter((t) => t.status === "in_progress").length || 0,
          completed: data?.filter((t) => t.status === "completed").length || 0,
        },
      };

      return { data: stats, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Create or update task
  async upsertTask(taskData, userId, companyId) {
    try {
      // Remove computed fields that don't exist in the database
      const {
        contact_name,
        deal_title,
        assigned_to_name,
        created_by_name,
        contact,
        deal,
        assigned_user,
        created_user,
        ...dbFields
      } = taskData;

      const payload = {
        ...dbFields,
        company_id: companyId,
        created_by: dbFields.id ? undefined : userId, // Only set on create
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("tasks")
        .upsert(payload)
        .select()
        .single();

      if (error) throw error;

      // Create notification for task assignment
      if (data) {
        const taskTitle = data.title || "Task";
        const assignedTo = data.assigned_to;
        const createdBy = userId;

        // Get user info
        const { data: assignedUser } = assignedTo
          ? await supabase
              .from("users")
              .select("id, full_name, email")
              .eq("id", assignedTo)
              .single()
          : { data: null };
        const { data: creatorUser } = createdBy
          ? await supabase
              .from("users")
              .select("id, full_name, email")
              .eq("id", createdBy)
              .single()
          : { data: null };

        const creatorName =
          creatorUser?.full_name || creatorUser?.email || "User";

        // Notify assigned user if task is assigned to someone else
        if (assignedTo && assignedTo !== createdBy) {
          await notificationService.createNotification({
            user_id: assignedTo,
            company_id: companyId,
            type: "task_assigned",
            title: "New Task Assigned",
            message: `${creatorName} assigned you a task: "${taskTitle}".`,
            metadata: {
              task_id: data.id,
              task_title: taskTitle,
              priority: data.priority,
              created_by: createdBy,
            },
            is_read: false,
          });
        }

        // Notify supervisors/managers about task creation
        if (assignedTo) {
          await notificationService.notifyRoleBasedEvent("task_assigned", {
            userId: assignedTo,
            companyId,
            title: "Task Created",
            message: `${creatorName} created a new task "${taskTitle}".`,
            metadata: {
              task_id: data.id,
              task_title: taskTitle,
              priority: data.priority,
              assigned_to: assignedTo,
            },
          });
        }
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update task
  async updateTask(taskId, updates) {
    try {
      // Get the task before update to check status changes
      const { data: oldTask } = await supabase
        .from("tasks")
        .select("status, priority, assigned_to, created_by, company_id, title")
        .eq("id", taskId)
        .single();

      const { data, error } = await supabase
        .from("tasks")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", taskId)
        .select()
        .single();

      if (error) throw error;

      // Create notifications for task updates
      if (data && oldTask) {
        const companyId = data.company_id || oldTask.company_id;
        const taskTitle = data.title || oldTask.title || "Task";
        const assignedTo = data.assigned_to || oldTask.assigned_to;
        const createdBy = data.created_by || oldTask.created_by;

        // Get user info
        const { data: assignedUser } = assignedTo
          ? await supabase
              .from("users")
              .select("id, full_name, email, role")
              .eq("id", assignedTo)
              .single()
          : { data: null };
        const assignedUserName =
          assignedUser?.full_name || assignedUser?.email || "User";

        // Check if status changed to completed
        if (updates.status === "completed" && oldTask.status !== "completed") {
          await notificationService.notifyRoleBasedEvent("task_completed", {
            userId: assignedTo || createdBy,
            companyId,
            title: "Task Completed ✅",
            message: `${assignedUserName} completed the task "${taskTitle}".`,
            metadata: {
              task_id: taskId,
              task_title: taskTitle,
              priority: data.priority || oldTask.priority,
            },
          });
        }

        // Check if task is critical (high priority)
        if (data.priority === "high" && updates.priority === "high") {
          await notificationService.notifyRoleBasedEvent("task_critical", {
            userId: assignedTo || createdBy,
            companyId,
            title: "Critical Task Alert",
            message: `High priority task "${taskTitle}" requires attention.`,
            metadata: {
              task_id: taskId,
              task_title: taskTitle,
              priority: "high",
            },
          });
        }
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Delete task
  async deleteTask(taskId) {
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);

      if (error) throw error;

      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  // Delete multiple tasks
  async deleteTasks(taskIds) {
    try {
      const { error } = await supabase.from("tasks").delete().in("id", taskIds);

      if (error) throw error;

      return { error: null };
    } catch (error) {
      return { error };
    }
  },

  // Bulk update tasks
  async bulkUpdateTasks(taskIds, updates) {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .in("id", taskIds)
        .select();

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get team tasks for specific users
  async getTeamTasks(companyId, userIds = [], filters = {}) {
    try {
      let query = supabase
        .from("tasks")
        .select(
          `
          *,
          contact:contacts(id, first_name, last_name),
          deal:deals(id, title),
          assigned_user:users!tasks_assigned_to_fkey(id, full_name, email),
          created_user:users!tasks_created_by_fkey(id, full_name, email)
        `,
        )
        .eq("company_id", companyId)
        .in("created_by", userIds)
        .order("created_at", { ascending: false });

      // Apply filters
      if (filters.status) {
        query = query.eq("status", filters.status);
      }

      if (filters.priority) {
        query = query.eq("priority", filters.priority);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to flatten relationships
      const transformedData = data?.map((task) => ({
        ...task,
        contact_name: task.contact
          ? `${task.contact.first_name} ${task.contact.last_name}`
          : null,
        deal_title: task.deal?.title || null,
        assigned_to_name:
          task.assigned_user?.full_name || task.assigned_user?.email || null,
        created_by_name:
          task.created_user?.full_name || task.created_user?.email || null,
      }));

      return { data: transformedData || [], error: null };
    } catch (error) {
      return { data: [], error };
    }
  },
};

// ========================================
// TEAM PERFORMANCE SERVICES
// ========================================

export const teamService = {
  // Get team performance data
  async getTeamPerformance(companyId) {
    try {
      const { data, error } = await supabase
        ?.from("team_performance")
        ?.select(
          `
          *,
          user:user_id(id, full_name, email, avatar_url)
        `,
        )
        ?.eq("company_id", companyId)
        ?.order("performance_score", { ascending: false });
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error };
    }
  },
};

// ========================================
// EXCHANGE RATES SERVICES
// ========================================

export const exchangeService = {
  // Get all exchange rates
  async getExchangeRates() {
    try {
      const { data, error } = await supabase
        ?.from("exchange_rates")
        ?.select("*")
        ?.order("currency_code");

      // Convert to object for easier access
      const rates = {};
      data?.forEach((rate) => {
        rates[rate?.currency_code] = rate?.rate_to_usd;
      });

      return { data: rates, error };
    } catch (error) {
      return { data: {}, error };
    }
  },

  // Convert currency
  convertCurrency(
    amount,
    fromCurrency = "USD",
    toCurrency = "USD",
    exchangeRates = {},
  ) {
    if (fromCurrency === toCurrency) return amount;

    const fromRate = exchangeRates?.[fromCurrency] || 1;
    const toRate = exchangeRates?.[toCurrency] || 1;

    // Convert to USD first, then to target currency
    const usdAmount = amount / fromRate;
    return usdAmount * toRate;
  },

  // Format currency
  formatCurrency(amount, currency = "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })?.format(amount);
  },
};

// ========================================
// SALES TARGETS SERVICES
// ========================================

export const salesTargetService = {
  // Get all targets assigned by the current user
  async getAssignedTargets(companyId = null) {
    try {
      let query = supabase
        .from("sales_targets")
        .select(
          `
          *,
          assignee:assigned_to(id, email, full_name, role),
          assigner:assigned_by(id, email, full_name, role),
          company:companies(id, name)
        `,
        )
        .order("created_at", { ascending: false });

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching assigned targets:", error);
      return { data: [], error };
    }
  },

  // Get all targets assigned to the current user
  async getMyTargets(companyId = null, userId = null) {
    try {
      let currentUserId = userId;

      // If userId not provided, get from auth
      if (!currentUserId) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("User not authenticated");
        currentUserId = user.id;
      }

      console.log("getMyTargets - Current user ID:", currentUserId);
      console.log("getMyTargets - Company ID:", companyId);

      let query = supabase
        .from("sales_targets")
        .select(
          `
          *,
          assigner:assigned_by(id, email, full_name, role),
          company:companies(id, name)
        `,
        )
        .eq("assigned_to", currentUserId)
        .order("period_start", { ascending: false });

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      console.log("getMyTargets - Query result:", { data, error });
      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching my targets:", error);
      return { data: [], error };
    }
  },

  // Get targets for subordinates (team overview)
  async getTeamTargets(companyId = null) {
    try {
      let query = supabase
        .from("sales_targets")
        .select(
          `
          *,
          assignee:assigned_to(id, email, full_name, role, department, territory),
          assigner:assigned_by(id, email, full_name, role),
          company:companies(id, name)
        `,
        )
        .order("period_start", { ascending: false });

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data, error } = await query;
      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching team targets:", error);
      return { data: [], error };
    }
  },

  // Create a new sales target
  async createTarget(targetData) {
    try {
      console.log("createTarget called with:", targetData);

      // Always get current authenticated user - RLS policies require auth.uid() to match assigned_by
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("Authentication error:", userError);
        throw new Error("User not authenticated");
      }

      console.log("=== AUTHENTICATION DEBUG ===");
      console.log("Authenticated user ID:", user.id);
      console.log("Authenticated user email:", user.email);
      console.log("Requested assignedBy:", targetData.assignedBy);

      // Get user profile to cross-check
      const { data: profile } = await supabase
        .from("users")
        .select("id, full_name, email, role")
        .eq("id", user.id)
        .single();

      console.log("User profile from database:", profile);

      // Verify the authenticated user matches the intended assigner
      if (targetData.assignedBy && targetData.assignedBy !== user.id) {
        console.error("=== AUTHENTICATION MISMATCH ===");
        console.error("Authenticated user:", user.id, user.email);
        console.error("Requested assignedBy:", targetData.assignedBy);

        // Try to get the requested user's details for debugging
        const { data: requestedUser } = await supabase
          .from("users")
          .select("id, full_name, email, role")
          .eq("id", targetData.assignedBy)
          .single();

        console.error("Requested user profile:", requestedUser);

        throw new Error(
          `Authentication mismatch: You are logged in as ${user.email} (${
            user.id
          }) but trying to assign as ${requestedUser?.email || "unknown"} (${
            targetData.assignedBy
          })`,
        );
      }

      // Guard against duplicate: one target per (assigned_to, period_start, period_end, company_id, target_type)
      // A salesman can have separate By Value, By Clients, and By Product targets for the same period
      const resolvedTargetType = targetData.targetType || targetData.target_type || "total_value";
      const { data: existingTarget } = await supabase
        .from("sales_targets")
        .select("id")
        .eq("assigned_to", targetData.assignedTo)
        .eq("period_start", targetData.periodStart)
        .eq("period_end", targetData.periodEnd)
        .eq("company_id", targetData.companyId)
        .eq("target_type", resolvedTargetType)
        .maybeSingle();

      if (existingTarget) {
        const typeLabel =
          resolvedTargetType === "total_value" ? "By Value"
          : resolvedTargetType === "by_clients" ? "By Clients"
          : resolvedTargetType === "by_products" ? "By Product"
          : resolvedTargetType;
        return {
          data: null,
          error: {
            message: `A "${typeLabel}" target already exists for this team member in the selected period. Please edit the existing target instead.`,
          },
        };
      }

      const insertData = {
        assigned_by: user.id, // Always use the authenticated user ID
        assigned_to: targetData.assignedTo,
        company_id: targetData.companyId,
        target_amount: targetData.targetAmount,
        currency: targetData.currency || "USD",
        period_type: targetData.periodType,
        period_start: targetData.periodStart,
        period_end: targetData.periodEnd,
        target_type: targetData.targetType || targetData.target_type || "total_value",
        notes: targetData.notes || "",
        status: targetData.status || "active",
        progress_amount: 0,
      };

      console.log("Inserting sales target:", insertData);

      const { data, error } = await supabase
        .from("sales_targets")
        .insert([insertData])
        .select(
          `
          *,
          assignee:assigned_to(id, email, full_name, role),
          company:companies(id, name)
        `,
        )
        .single();

      if (error) {
        console.error("Database error creating target:", error);
        console.error("Error details:", JSON.stringify(error, null, 2));
        return { data: null, error };
      }

      console.log("Target created successfully:", data);

      // Create notification for the assignee
      try {
        const { data: assignerProfile } = await supabase
          .from("users")
          .select("full_name, email")
          .eq("id", user.id)
          .single();

        const assignerName =
          assignerProfile?.full_name ||
          assignerProfile?.email ||
          "Your superior";
        const targetAmount = parseFloat(targetData.targetAmount || 0);
        const currency = targetData.currency || "USD";

        // Format currency for notification
        const formattedAmount = new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: currency,
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(targetAmount);

        // Create notification directly using supabase
        // (notificationService is defined later in this file, so we use supabase directly)
        await supabase.from("notifications").insert([
          {
            user_id: targetData.assignedTo,
            company_id: targetData.companyId,
            type: "target_assigned",
            title: "New Sales Target Assigned",
            message: `${assignerName} has assigned you a ${targetData.periodType} target of ${formattedAmount} for the period ${new Date(targetData.periodStart).toLocaleDateString()} - ${new Date(targetData.periodEnd).toLocaleDateString()}.`,
            metadata: {
              target_id: data.id,
              assigned_by: user.id,
              target_amount: targetAmount,
              currency: currency,
              period_type: targetData.periodType,
              period_start: targetData.periodStart,
              period_end: targetData.periodEnd,
            },
            is_read: false,
          },
        ]);
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
        // Don't fail the target creation if notification fails
      }

      return { data, error: null };
    } catch (error) {
      console.error("Error creating target:", error);
      return { data: null, error };
    }
  },

  // Update an existing sales target
  async updateTarget(targetId, updateData) {
    try {
      const { error } = await supabase
        .from("sales_targets")
        .update({
          target_amount: updateData.targetAmount,
          currency: updateData.currency,
          period_start: updateData.periodStart,
          period_end: updateData.periodEnd,
          target_type: updateData.targetType || updateData.target_type,
          status: updateData.status,
          progress_amount: updateData.progressAmount,
          notes: updateData.notes,
        })
        .eq("id", targetId);

      if (error) {
        return { data: null, error };
      }

      return { data: { id: targetId }, error: null };
    } catch (error) {
      console.error("Error updating target:", error);
      return { data: null, error };
    }
  },

  // Delete a sales target
  async deleteTarget(targetId) {
    try {
      const { error } = await supabase
        .from("sales_targets")
        .delete()
        .eq("id", targetId);

      return { data: null, error };
    } catch (error) {
      console.error("Error deleting target:", error);
      return { data: null, error };
    }
  },

  // Get user's available target amount for assignment
  async getUserAvailableTarget(userId, companyId, periodStart, periodEnd) {
    try {
      const { data, error } = await supabase.rpc("get_user_allocated_target", {
        user_id: userId,
        company_id: companyId,
        period_start_date: periodStart,
        period_end_date: periodEnd,
      });

      if (error) throw error;

      const { data: assignedData, error: assignedError } = await supabase.rpc(
        "get_user_assigned_target",
        {
          user_id: userId,
          company_id: companyId,
          period_start_date: periodStart,
          period_end_date: periodEnd,
        },
      );

      if (assignedError) throw assignedError;

      const allocated = parseFloat(data || 0);
      const assigned = parseFloat(assignedData || 0);
      const available = allocated - assigned;

      return {
        data: {
          allocated: allocated,
          assigned: assigned,
          available: Math.max(0, available),
        },
        error: null,
      };
    } catch (error) {
      console.error("Error getting available target:", error);
      return {
        data: { allocated: 0, assigned: 0, available: 0 },
        error,
      };
    }
  },

  // Check if user can assign target to another user
  async canAssignTargetToUser(assigneeId) {
    try {
      const { data, error } = await supabase.rpc("can_assign_target_to_user", {
        assigner_id: (await supabase.auth.getUser()).data.user?.id,
        assignee_id: assigneeId,
      });

      return { data: data || false, error };
    } catch (error) {
      console.error("Error checking target assignment permission:", error);
      return { data: false, error };
    }
  },

  // Get target performance summary
  async getTargetPerformance(
    userId = null,
    companyId = null,
    periodStart = null,
    periodEnd = null,
  ) {
    try {
      let query = supabase.from("sales_targets").select(`
          *,
          assignee:assigned_to(id, email, full_name, role)
        `);

      if (userId) {
        query = query.eq("assigned_to", userId);
      }
      if (companyId) {
        query = query.eq("company_id", companyId);
      }
      if (periodStart) {
        query = query.gte("period_start", periodStart);
      }
      if (periodEnd) {
        query = query.lte("period_end", periodEnd);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Calculate performance metrics
      const summary = {
        totalTargets: data?.length || 0,
        totalAmount:
          data?.reduce(
            (sum, target) => sum + parseFloat(target.target_amount || 0),
            0,
          ) || 0,
        totalProgress:
          data?.reduce(
            (sum, target) => sum + parseFloat(target.progress_amount || 0),
            0,
          ) || 0,
        activeTargets:
          data?.filter((target) => target.status === "active")?.length || 0,
        completedTargets:
          data?.filter((target) => target.status === "completed")?.length || 0,
        overduTargets:
          data?.filter((target) => target.status === "overdue")?.length || 0,
        avgProgress: 0,
      };

      if (summary.totalAmount > 0) {
        summary.avgProgress =
          (summary.totalProgress / summary.totalAmount) * 100;
      }

      return { data: summary, error: null };
    } catch (error) {
      console.error("Error getting target performance:", error);
      return { data: null, error };
    }
  },

  // Get targets by multiple assignees
  async getTargetsByAssignees(userIds) {
    try {
      const { data, error } = await supabase
        .from("sales_targets")
        .select(
          `
          *,
          assignee:assigned_to(id, email, full_name, role),
          assigner:assigned_by(id, email, full_name, role),
          company:companies(id, name)
        `,
        )
        .in("assigned_to", userIds)
        .order("period_start", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching targets by assignees:", error);
      return { data: [], error };
    }
  },

  // Get targets by single assignee
  async getTargetsByAssignee(userId) {
    try {
      const { data, error } = await supabase
        .from("sales_targets")
        .select(
          `
          *,
          assignee:assigned_to(id, email, full_name, role),
          assigner:assigned_by(id, email, full_name, role),
          company:companies(id, name)
        `,
        )
        .eq("assigned_to", userId)
        .order("period_start", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching targets by assignee:", error);
      return { data: [], error };
    }
  },

  // Create product-level target rows for a parent sales target
  async createProductTargets(salesTargetId, productTargets = [], currency = "USD") {
    try {
      const rows = productTargets
        .filter((target) => {
          const productId = target.product_id || target.productId || target.id;
          const quantity = parseFloat(target.target_quantity);
          const value = parseFloat(target.target_value);
          return productId && (quantity > 0 || value > 0);
        })
        .map((target) => ({
          sales_target_id: salesTargetId,
          product_id: target.product_id || target.productId || target.id,
          target_quantity:
            parseFloat(target.target_quantity) > 0
              ? parseFloat(target.target_quantity)
              : null,
          target_value:
            parseFloat(target.target_value) > 0
              ? parseFloat(target.target_value)
              : null,
          unit_price:
            parseFloat(target.unit_price) > 0 ? parseFloat(target.unit_price) : null,
          currency: target.currency || currency,
        }));

      if (rows.length === 0) {
        return { data: [], error: null };
      }

      const { data, error } = await supabase
        .from("product_targets")
        .insert(rows)
        .select(
          `
          *,
          product:products!product_id(id, material, description, material_group, base_unit_of_measure, unit_price)
        `,
        );

      return { data: data || [], error };
    } catch (error) {
      console.error("Error creating product targets:", error);
      return { data: [], error };
    }
  },

  // Fetch product-level targets for one or more parent sales targets
  async getProductTargetsBySalesTargetIds(salesTargetIds = []) {
    try {
      const ids = Array.isArray(salesTargetIds)
        ? salesTargetIds.filter(Boolean)
        : [salesTargetIds].filter(Boolean);

      if (ids.length === 0) {
        return { data: [], error: null };
      }

      const { data, error } = await supabase
        .from("product_targets")
        .select(
          `
          *,
          product:products!product_id(id, material, description, material_group, base_unit_of_measure, unit_price),
          sales_target:sales_targets(id, assigned_to, assigned_by, company_id, period_start, period_end, target_type)
        `,
        )
        .in("sales_target_id", ids);

      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching product targets:", error);
      return { data: [], error };
    }
  },

  calculateProductTargetProgress(productTargets = [], deals = [], ownerIds = null) {
    const ownerSet = ownerIds?.length ? new Set(ownerIds) : null;

    const getDealDate = (deal) =>
      deal.closed_at || deal.expected_close_date || deal.updated_at || deal.created_at;

    return (productTargets || []).map((target) => {
      const parentTarget = target.sales_target || {};
      const periodStart = parentTarget.period_start
        ? new Date(parentTarget.period_start)
        : null;
      const periodEnd = parentTarget.period_end ? new Date(parentTarget.period_end) : null;
      if (periodEnd) {
        periodEnd.setHours(23, 59, 59, 999);
      }

      let achievedQuantity = 0;
      let achievedValue = 0;

      (deals || [])
        .filter((deal) => {
          if (deal.stage !== "won") return false;
          if (ownerSet && !ownerSet.has(deal.owner_id)) return false;

          const dealDateValue = getDealDate(deal);
          if (periodStart && periodEnd && dealDateValue) {
            const dealDate = new Date(dealDateValue);
            return dealDate >= periodStart && dealDate <= periodEnd;
          }

          return true;
        })
        .forEach((deal) => {
          (deal.deal_products || []).forEach((item) => {
            if (item.product_id !== target.product_id) return;

            const quantity = parseFloat(item.quantity || item.uom_value || 0);
            const lineValue =
              parseFloat(item.line_total) ||
              quantity * parseFloat(item.unit_price || target.unit_price || 0);

            achievedQuantity += quantity;
            achievedValue += lineValue;
          });
        });

      const targetQuantity = parseFloat(target.target_quantity || 0);
      const targetValue = parseFloat(target.target_value || 0);

      return {
        ...target,
        achieved_quantity: achievedQuantity,
        achieved_value: achievedValue,
        quantity_progress:
          targetQuantity > 0 ? (achievedQuantity / targetQuantity) * 100 : null,
        value_progress: targetValue > 0 ? (achievedValue / targetValue) * 100 : null,
      };
    });
  },
};

// ========================================
// PRODUCTS SERVICES
// ========================================

export const productService = {
  // Get all products
  async getProducts() {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("material", { ascending: true });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error("Error in getProducts:", error);
      return { data: [], error };
    }
  },

  // Get product by ID
  async getProduct(productId) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .single();

      if (error) throw error;
      return { data, error: null };
    } catch (error) {
      console.error("Error in getProduct:", error);
      return { data: null, error };
    }
  },

  // Search products by material or description
  async searchProducts(searchTerm) {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .or(`material.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`)
        .order("material", { ascending: true });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error("Error in searchProducts:", error);
      return { data: [], error };
    }
  },
};

// ========================================
// DEAL PRODUCTS SERVICES
// ========================================

export const dealProductService = {
  // Get all products for a deal
  async getDealProducts(dealId) {
    try {
      const { data, error } = await supabase
        .from("deal_products")
        .select(
          `
          *,
          product:products!product_id(*)
        `,
        )
        .eq("deal_id", dealId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return { data: data || [], error: null };
    } catch (error) {
      console.error("Error in getDealProducts:", error);
      return { data: [], error };
    }
  },

  // Add product to deal
  async addProductToDeal(
    dealId,
    productId,
    quantity,
    sqm = null,
    ton = null,
    unitPrice = null,
    notes = null,
    uomType = null,
    uomValue = null,
  ) {
    try {
      console.log("💾 dealProductService.addProductToDeal called with:", {
        dealId,
        productId,
        quantity,
        sqm,
        ton,
        unitPrice,
        notes,
        uomType,
        uomValue,
      });

      const { data, error } = await supabase
        .from("deal_products")
        .insert({
          deal_id: dealId,
          product_id: productId,
          quantity,
          sqm,
          ton,
          unit_price: unitPrice,
          notes,
          uom_type: uomType,
          uom_value: uomValue,
        })
        .select("*, product:products!product_id(*)");

      console.log("💾 addProductToDeal result:", { data, error });

      if (error) throw error;
      return { data: data?.[0] || null, error: null };
    } catch (error) {
      console.error("❌ Error in addProductToDeal:", error);
      return { data: null, error };
    }
  },

  // Remove product from deal
  async removeProductFromDeal(dealProductId) {
    try {
      const { error } = await supabase
        .from("deal_products")
        .delete()
        .eq("id", dealProductId);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      console.error("Error in removeProductFromDeal:", error);
      return { error };
    }
  },

  // Update deal product (quantity, unit price, notes)
  async updateDealProduct(dealProductId, updates) {
    try {
      const { data, error } = await supabase
        .from("deal_products")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealProductId)
        .select("*, product:products!product_id(*)");

      if (error) throw error;
      return { data: data?.[0] || null, error: null };
    } catch (error) {
      console.error("Error in updateDealProduct:", error);
      return { data: null, error };
    }
  },

  // Get total value of deal products
  async getDealProductsTotal(dealId) {
    try {
      const { data, error } = await supabase
        .from("deal_products")
        .select("line_total")
        .eq("deal_id", dealId);

      if (error) throw error;

      const total =
        data?.reduce(
          (sum, item) => sum + (parseFloat(item.line_total) || 0),
          0,
        ) || 0;
      return { data: total, error: null };
    } catch (error) {
      console.error("Error in getDealProductsTotal:", error);
      return { data: 0, error };
    }
  },
};

// ========================================
// ERROR HANDLING
// ========================================

export const handleSupabaseError = (
  error,
  defaultMessage = "An error occurred",
) => {
  if (!error) return null;

  // Network/Infrastructure errors - don't use console.error
  if (
    error?.message?.includes("Failed to fetch") ||
    error?.message?.includes("NetworkError") ||
    (error?.name === "TypeError" && error?.message?.includes("fetch"))
  ) {
    return "Cannot connect to database. Please check your internet connection and try again.";
  }

  // Supabase handled errors - show to user only
  if (error?.message) {
    return error?.message;
  }

  return defaultMessage;
};

// ========================================
// ADMIN SERVICES
// ========================================

export const adminService = {
  // Invite a new user via Edge Function
  async inviteUser(invitationData) {
    try {
      const { email, full_name, role, company_id, supervisor_id } =
        invitationData;

      // Get the current session for authentication
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return { data: null, error: { message: "Not authenticated" } };
      }

      // Call the Edge Function to send invitation
      const { data, error } = await supabase.functions.invoke(
        "send-invitation-email",
        {
          body: {
            email,
            full_name,
            role,
            company_id,
            supervisor_id: supervisor_id || null,
          },
        },
      );

      if (error) {
        console.error("Error calling send-invitation-email:", error);
        return { data: null, error };
      }

      // Handle edge function response
      if (data?.error) {
        return { data: null, error: { message: data.error } };
      }

      console.log("📧 User Invitation Created:");
      console.log("Email:", email);
      console.log("Invitation URL:", data.invitation_url);
      console.log("Email sent:", data.email_sent);

      return {
        data: {
          ...data,
          invitation_url: data.invitation_url,
          email_sent: data.email_sent,
        },
        error: null,
      };
    } catch (error) {
      console.error("Invite user error:", error);
      return { data: null, error };
    }
  },

  // Get all users with hierarchy
  async getAllUsers() {
    try {
      // First, get all users with company data
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id,
          email,
          full_name,
          role,
          company_id,
          supervisor_id,
          is_active,
          department,
          territory,
          hire_date,
          created_at,
          company:companies!company_id (
            id,
            name,
            industry
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (error) return { data: null, error };

      // Manually join supervisor data
      const usersMap = new Map(data.map((u) => [u.id, u]));
      const enrichedData = data.map((user) => ({
        ...user,
        supervisor:
          user.supervisor_id && usersMap.has(user.supervisor_id)
            ? {
                id: usersMap.get(user.supervisor_id).id,
                full_name: usersMap.get(user.supervisor_id).full_name,
                role: usersMap.get(user.supervisor_id).role,
              }
            : null,
      }));

      console.log("getAllUsers result:", enrichedData);
      return { data: enrichedData, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get user hierarchy tree
  async getUserHierarchy() {
    try {
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id,
          email,
          full_name,
          role,
          company_id,
          supervisor_id,
          is_active,
          department,
          company:companies!company_id (
            id,
            name
          )
        `,
        )
        .eq("is_active", true)
        .order("company_id", { ascending: true });

      if (error) return { data: null, error };

      // Manually add supervisor data
      const usersMap = new Map(data.map((u) => [u.id, u]));
      const enrichedData = data.map((user) => ({
        ...user,
        supervisor:
          user.supervisor_id && usersMap.has(user.supervisor_id)
            ? {
                id: usersMap.get(user.supervisor_id).id,
                full_name: usersMap.get(user.supervisor_id).full_name,
                role: usersMap.get(user.supervisor_id).role,
              }
            : null,
      }));

      console.log("getUserHierarchy result:", enrichedData);

      // Build hierarchy tree
      const buildTree = (users) => {
        const userMap = new Map();
        const rootUsers = [];

        // Create user nodes
        users.forEach((user) => {
          userMap.set(user.id, { ...user, subordinates: [] });
        });

        // Build relationships
        users.forEach((user) => {
          const node = userMap.get(user.id);
          if (user.supervisor_id && userMap.has(user.supervisor_id)) {
            const supervisor = userMap.get(user.supervisor_id);
            supervisor.subordinates.push(node);
          } else {
            rootUsers.push(node);
          }
        });

        return rootUsers;
      };

      const tree = buildTree(enrichedData);
      return { data: tree, error: null };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get pending invitations
  async getPendingInvitations() {
    try {
      const { data, error } = await supabase
        .from("user_invitations")
        .select(
          `
          id,
          email,
          full_name,
          role,
          status,
          created_at,
          expires_at,
          company_id,
          company:companies!company_id (
            id,
            name
          )
        `,
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Cancel/delete invitation
  async cancelInvitation(invitationId) {
    try {
      const { error } = await supabase
        .from("user_invitations")
        .delete()
        .eq("id", invitationId);

      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Update user
  async updateUser(userId, updates) {
    try {
      const { data, error } = await supabase
        .from("users")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Deactivate user
  async deactivateUser(userId) {
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", userId);

      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Reactivate user
  async reactivateUser(userId) {
    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", userId);

      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Get all products (for product master)
  async getAllProducts() {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("material", { ascending: true });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Create product
  async createProduct(productData) {
    try {
      const { data, error } = await supabase
        .from("products")
        .insert(productData)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update product
  async updateProduct(productId, updates) {
    try {
      const { data, error } = await supabase
        .from("products")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", productId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Delete product
  async deleteProduct(productId) {
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Bulk upsert products (for CSV upload)
  async bulkUpsertProducts(products) {
    try {
      const { data, error } = await supabase
        .from("products")
        .upsert(products, {
          onConflict: "material,company_id",
          ignoreDuplicates: false,
        })
        .select();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Get users by company
  async getUsersByCompany(companyId) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id,
          full_name,
          role,
          supervisor_id
        `,
        )
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("full_name", { ascending: true });

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};

// ========================================
// UOM (Unit of Measure) SERVICES
// ========================================

export const uomService = {
  // Get all UOM types
  async getUomTypes(activeOnly = false) {
    try {
      let query = supabase
        .from("uom_types")
        .select("*")
        .order("sort_order", { ascending: true });

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Create UOM type
  async createUomType(uomData) {
    try {
      const { data, error } = await supabase
        .from("uom_types")
        .insert([uomData])
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Update UOM type
  async updateUomType(id, updates) {
    try {
      const { data, error } = await supabase
        .from("uom_types")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Delete UOM type
  async deleteUomType(id) {
    try {
      const { error } = await supabase.from("uom_types").delete().eq("id", id);

      return { error };
    } catch (error) {
      return { error };
    }
  },

  // Check if UOM is in use
  async checkUomUsage(value) {
    try {
      const { count, error } = await supabase
        .from("deal_products")
        .select("*", { count: "exact", head: true })
        .eq("uom_type", value);

      return { count: count || 0, error };
    } catch (error) {
      return { count: 0, error };
    }
  },
};

// ========================================
// NOTIFICATIONS SERVICES
// ========================================

export const notificationService = {
  // Get all notifications for the current user
  async getNotifications(userId = null, options = {}) {
    try {
      let currentUserId = userId;

      // If userId not provided, get from auth
      if (!currentUserId) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("User not authenticated");
        currentUserId = user.id;
      }

      const { limit = 50, unreadOnly = false, type = null } = options;

      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false });

      if (unreadOnly) {
        query = query.eq("is_read", false);
      }

      if (type) {
        query = query.eq("type", type);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      return { data: data || [], error };
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return { data: [], error };
    }
  },

  // Get unread notification count
  async getUnreadCount(userId = null) {
    try {
      let currentUserId = userId;

      if (!currentUserId) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("User not authenticated");
        currentUserId = user.id;
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", currentUserId)
        .eq("is_read", false);

      return { count: count || 0, error };
    } catch (error) {
      console.error("Error fetching unread count:", error);
      return { count: 0, error };
    }
  },

  // Mark notification as read
  async markAsRead(notificationId) {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", notificationId)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      console.error("Error marking notification as read:", error);
      return { data: null, error };
    }
  },

  // Mark all notifications as read
  async markAllAsRead(userId = null) {
    try {
      let currentUserId = userId;

      if (!currentUserId) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("User not authenticated");
        currentUserId = user.id;
      }

      const { data, error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("user_id", currentUserId)
        .eq("is_read", false)
        .select();

      return { data, error };
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
      return { data: null, error };
    }
  },

  // Create a notification
  async createNotification(notificationData) {
    try {
      const { data, error } = await supabase
        .from("notifications")
        .insert([notificationData])
        .select()
        .single();

      return { data, error };
    } catch (error) {
      console.error("Error creating notification:", error);
      return { data: null, error };
    }
  },

  // Delete a notification
  async deleteNotification(notificationId) {
    try {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      return { error };
    } catch (error) {
      console.error("Error deleting notification:", error);
      return { error };
    }
  },

  // Helper: Get user's supervisor chain (supervisor -> manager -> head -> director)
  async getUserSupervisorChain(userId) {
    try {
      const chain = {
        supervisor: null,
        manager: null,
        head: null,
        director: null,
      };

      // Get user's profile
      const { data: user } = await supabase
        .from("users")
        .select("id, role, supervisor_id, company_id")
        .eq("id", userId)
        .single();

      if (!user) return chain;

      // Get supervisor
      if (user.supervisor_id) {
        const { data: supervisor } = await supabase
          .from("users")
          .select("id, role, supervisor_id")
          .eq("id", user.supervisor_id)
          .single();

        if (supervisor) {
          if (supervisor.role === "supervisor") {
            chain.supervisor = supervisor;
          } else if (supervisor.role === "manager") {
            chain.manager = supervisor;
          } else if (supervisor.role === "head") {
            chain.head = supervisor;
          } else if (supervisor.role === "director") {
            chain.director = supervisor;
          }

          // Get manager/head/director (supervisor's supervisor)
          if (supervisor.supervisor_id) {
            const { data: manager } = await supabase
              .from("users")
              .select("id, role, supervisor_id")
              .eq("id", supervisor.supervisor_id)
              .single();

            if (manager) {
              if (manager.role === "manager") {
                chain.manager = manager;
              } else if (manager.role === "head") {
                chain.head = manager;
              } else if (manager.role === "director") {
                chain.director = manager;
              }

              // Get head/director (manager's supervisor)
              if (manager.supervisor_id) {
                const { data: head } = await supabase
                  .from("users")
                  .select("id, role, supervisor_id")
                  .eq("id", manager.supervisor_id)
                  .single();

                if (head) {
                  if (head.role === "head") {
                    chain.head = head;
                  } else if (head.role === "director") {
                    chain.director = head;
                  }

                  // Get director (head's supervisor)
                  if (head.supervisor_id) {
                    const { data: director } = await supabase
                      .from("users")
                      .select("id, role")
                      .eq("id", head.supervisor_id)
                      .single();

                    if (director && director.role === "director") {
                      chain.director = director;
                    }
                  }
                }
              }
            }
          }
        }
      }

      return chain;
    } catch (error) {
      console.error("Error getting supervisor chain:", error);
      return { supervisor: null, manager: null, head: null, director: null };
    }
  },

  // Helper: Get all users who should be notified based on role and event
  async getNotificationRecipients(userId, eventType, companyId) {
    try {
      const recipients = [];
      const chain = await this.getUserSupervisorChain(userId);

      // Get user's role
      const { data: user } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (!user) return recipients;

      // Based on event type and user role, determine who should be notified
      switch (eventType) {
        case "pipeline_update":
        case "deal_won":
        case "deal_lost":
          // Notify: user's supervisor, manager, and director
          if (chain.supervisor) recipients.push(chain.supervisor.id);
          if (chain.manager) recipients.push(chain.manager.id);
          if (chain.director) recipients.push(chain.director.id);
          break;

        case "task_assigned":
        case "task_completed":
        case "task_critical":
          // Notify: assigned user, their supervisor, manager
          if (chain.supervisor) recipients.push(chain.supervisor.id);
          if (chain.manager) recipients.push(chain.manager.id);
          break;

        case "client_update":
        case "contact_created":
          // Notify: supervisor and manager
          if (chain.supervisor) recipients.push(chain.supervisor.id);
          if (chain.manager) recipients.push(chain.manager.id);
          break;

        case "performance_update":
          // Notify: supervisor, manager, director (based on level)
          if (chain.supervisor) recipients.push(chain.supervisor.id);
          if (chain.manager) recipients.push(chain.manager.id);
          if (chain.director) recipients.push(chain.director.id);
          break;

        case "target_achieved":
          // Notify: supervisor, manager, director
          if (chain.supervisor) recipients.push(chain.supervisor.id);
          if (chain.manager) recipients.push(chain.manager.id);
          if (chain.director) recipients.push(chain.director.id);
          break;
      }

      return [...new Set(recipients)]; // Remove duplicates
    } catch (error) {
      console.error("Error getting notification recipients:", error);
      return [];
    }
  },

  // Create notifications for role-based events
  async notifyRoleBasedEvent(eventType, eventData) {
    try {
      const {
        userId, // User who triggered the event
        companyId,
        title,
        message,
        metadata = {},
      } = eventData;

      // Get recipients based on role and event type
      const recipientIds = await this.getNotificationRecipients(
        userId,
        eventType,
        companyId,
      );

      // Also notify the user themselves for certain events
      const allRecipients = [...new Set([userId, ...recipientIds])];

      // Create notifications for all recipients
      const notifications = allRecipients.map((recipientId) => ({
        user_id: recipientId,
        company_id: companyId,
        type: eventType,
        title,
        message,
        metadata,
        is_read: false,
      }));

      if (notifications.length > 0) {
        const { error } = await supabase
          .from("notifications")
          .insert(notifications);

        if (error) {
          console.error("Error creating notifications:", error);
        }
      }

      return { success: true, recipients: allRecipients.length };
    } catch (error) {
      console.error("Error in notifyRoleBasedEvent:", error);
      return { success: false, error };
    }
  },
};

export const leadService = {
  async getLeads() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: null };

    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("owner_id", user.id)
      .not("lead_status", "is", null)
      .order("lead_score", { ascending: false });

    return { data: data || [], error };
  },

  async createLead(leadData) {
    const { data, error } = await supabase
      .from("contacts")
      .insert({ ...leadData, lead_status: leadData.lead_status || "new" })
      .select()
      .single();
    return { data, error };
  },

  async updateLead(contactId, updates) {
    const { data, error } = await supabase
      .from("contacts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", contactId)
      .select()
      .single();

    if (!error && data) {
      contactService._refreshScoreForContact(contactId).catch(() => {});
    }

    return { data, error };
  },

  async updateLeadStatus(contactId, status) {
    const updates = { lead_status: status };
    if (status === "converted") updates.status = "active";
    return this.updateLead(contactId, updates);
  },

  async deleteLead(contactId) {
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", contactId);
    return { error };
  },
};

export const forecastService = {
  /**
   * getForecastData({ companyId, userId, role, periodStart, periodEnd })
   *
   * Role scoping:
   *   salesman   → own deals only          (owner_id = userId)
   *   supervisor → own + direct reports    (owner_id IN [userId, ...reportIds])
   *   manager / director / admin / head → all company deals (no owner filter)
   *
   * Deals returned: non-lost deals whose expected_close_date falls within
   * [periodStart, periodEnd], PLUS open (non-won) deals with no close date
   * so unscheduled pipeline is never silently dropped.
   *
   * Target returned: the single active sales_target assigned to userId
   * whose period overlaps [periodStart, periodEnd], or null when none exists.
   *
   * @returns {{ deals: Array, target: Object|null, error: Error|null }}
   */
  async getForecastData({ companyId, userId, role, periodStart, periodEnd }) {
    try {
      // ── 1. Resolve owner scope ─────────────────────────────────────────
      let ownerIds = null; // null → no owner filter (manager+ sees all company deals)

      if (role === "salesman") {
        ownerIds = [userId];
      } else if (role === "supervisor") {
        const { data: reports, error: reportsError } = await supabase
          .from("users")
          .select("id")
          .eq("supervisor_id", userId)
          .eq("is_active", true);

        if (reportsError) throw reportsError;

        ownerIds = [userId, ...(reports || []).map((u) => u.id)];
      }
      // manager, director, admin, head → ownerIds stays null

      // ── 2. Build deals query ───────────────────────────────────────────
      let dealsQuery = supabase
        .from("deals")
        .select(
          `id, title, stage, amount, expected_close_date, owner_id, company_id,
           contact:contacts!contact_id(id, first_name, last_name, company_name),
           owner:users!owner_id(id, full_name)`,
        )
        .neq("stage", "lost")
        // Deals closing within the period, OR open deals with no date yet
        .or(
          `and(expected_close_date.gte.${periodStart},expected_close_date.lte.${periodEnd}),` +
            `and(stage.neq.won,expected_close_date.is.null)`,
        );

      if (companyId) dealsQuery = dealsQuery.eq("company_id", companyId);
      if (ownerIds)  dealsQuery = dealsQuery.in("owner_id", ownerIds);

      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // ── 3. Fetch active sales target overlapping this period ───────────
      // Overlap condition: target.period_start <= periodEnd
      //               AND target.period_end   >= periodStart
      let targetQuery = supabase
        .from("sales_targets")
        .select(
          "id, target_amount, currency, period_start, period_end, period_type, target_type, status",
        )
        .eq("assigned_to", userId)
        .eq("status", "active")
        .lte("period_start", periodEnd)
        .gte("period_end", periodStart)
        .order("period_start", { ascending: false })
        .limit(1);

      if (companyId) targetQuery = targetQuery.eq("company_id", companyId);

      const { data: targets, error: targetError } = await targetQuery;
      if (targetError) throw targetError;

      return {
        deals:  deals        || [],
        target: targets?.[0] ?? null,
        error:  null,
      };
    } catch (error) {
      console.error("Error in getForecastData:", error);
      return { deals: [], target: null, error };
    }
  },
};

// ============================================================
// REPORT SERVICE
// ============================================================

export const reportService = {
  async getReportData({ companyId, userId, role, periodStart, periodEnd }) {
    try {
      // ── Owner scope ──────────────────────────────────────────────────────
      let ownerIds    = null;
      let teamMembers = [];

      if (role === "salesman") {
        ownerIds = [userId];
      } else if (role === "supervisor") {
        const { data: reports, error: re } = await supabase
          .from("users")
          .select("id, full_name, email")
          .eq("supervisor_id", userId)
          .eq("is_active", true);
        if (re) throw re;
        teamMembers = reports || [];
        ownerIds    = [userId, ...teamMembers.map((u) => u.id)];
      } else {
        const { data: members, error: me } = await supabase
          .from("users")
          .select("id, full_name, email")
          .eq("company_id", companyId)
          .eq("is_active", true);
        if (!me) teamMembers = members || [];
      }

      // ── Current period deals ─────────────────────────────────────────────
      let dealsQ = supabase
        .from("deals")
        .select(
          `id, title, stage, amount, priority, expected_close_date, created_at,
           owner_id, company_id,
           contact:contacts!contact_id(id, first_name, last_name, company_name, lead_source),
           owner:users!owner_id(id, full_name)`,
        );
      if (periodStart) dealsQ = dealsQ.gte("created_at", `${periodStart}T00:00:00`);
      if (periodEnd)   dealsQ = dealsQ.lte("created_at", `${periodEnd}T23:59:59`);

      if (companyId) dealsQ = dealsQ.eq("company_id", companyId);
      if (ownerIds)  dealsQ = dealsQ.in("owner_id", ownerIds);

      const { data: deals, error: dealsError } = await dealsQ;
      if (dealsError) throw dealsError;

      // ── Previous period deals (same length, shifted back) ────────────────
      let prevDeals = [];
      if (periodStart && periodEnd) {
        const start = new Date(periodStart);
        const end   = new Date(periodEnd);
        const days  = Math.round((end - start) / 86400000) + 1;
        const prevEnd   = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
        const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - days + 1);
        const fmt = (d) => d.toISOString().split("T")[0];

        let prevQ = supabase
          .from("deals")
          .select("id, stage, amount, owner_id")
          .gte("created_at", `${fmt(prevStart)}T00:00:00`)
          .lte("created_at", `${fmt(prevEnd)}T23:59:59`);
        if (companyId) prevQ = prevQ.eq("company_id", companyId);
        if (ownerIds)  prevQ = prevQ.in("owner_id", ownerIds);
        const { data: pd } = await prevQ;
        prevDeals = pd || [];
      }

      // ── Contacts for lead source analysis ────────────────────────────────
      let contactsQ = supabase
        .from("contacts")
        .select("id, lead_source, created_at, owner_id");
      if (periodStart) contactsQ = contactsQ.gte("created_at", `${periodStart}T00:00:00`);
      if (periodEnd)   contactsQ = contactsQ.lte("created_at", `${periodEnd}T23:59:59`);
      if (companyId) contactsQ = contactsQ.eq("company_id", companyId);
      if (ownerIds)  contactsQ = contactsQ.in("owner_id", ownerIds);
      const { data: contacts } = await contactsQ;

      return {
        deals:       deals       || [],
        prevDeals:   prevDeals   || [],
        contacts:    contacts    || [],
        teamMembers,
        error: null,
      };
    } catch (error) {
      console.error("Error in getReportData:", error);
      return { deals: [], prevDeals: [], contacts: [], teamMembers: [], error };
    }
  },
};

// ========================================
// PERMISSIONS SERVICE
// ========================================
// Required Supabase table (run once in SQL editor):
//
//   CREATE TABLE user_page_permissions (
//     id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//     user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
//     company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
//     page        TEXT NOT NULL,
//     can_view    BOOLEAN NOT NULL DEFAULT TRUE,
//     can_create  BOOLEAN NOT NULL DEFAULT FALSE,
//     can_edit    BOOLEAN NOT NULL DEFAULT FALSE,
//     updated_at  TIMESTAMPTZ DEFAULT NOW(),
//     UNIQUE(user_id, company_id, page)
//   );
//   ALTER TABLE user_page_permissions ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Admins manage permissions" ON user_page_permissions
//     USING (true) WITH CHECK (true);

export const permissionsService = {
  async getUserPermissions(userId, companyId) {
    try {
      const { data, error } = await supabase
        .from("user_page_permissions")
        .select("*")
        .eq("user_id", userId)
        .eq("company_id", companyId);
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  async getCompanyPermissions(companyId) {
    try {
      const { data, error } = await supabase
        .from("user_page_permissions")
        .select("*, user:user_id(id, full_name, email, role)")
        .eq("company_id", companyId);
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },

  // Replaces all page permissions for a user in one atomic operation
  async saveUserPermissions(userId, companyId, permissions) {
    try {
      const { error: deleteError } = await supabase
        .from("user_page_permissions")
        .delete()
        .eq("user_id", userId)
        .eq("company_id", companyId);
      if (deleteError) return { error: deleteError };

      if (!permissions.length) return { data: [], error: null };

      const rows = permissions.map((p) => ({
        user_id: userId,
        company_id: companyId,
        page: p.page,
        can_view: p.can_view,
        can_create: p.can_create,
        can_edit: p.can_edit,
        updated_at: new Date().toISOString(),
      }));

      const { data, error } = await supabase
        .from("user_page_permissions")
        .insert(rows)
        .select();
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  },
};
