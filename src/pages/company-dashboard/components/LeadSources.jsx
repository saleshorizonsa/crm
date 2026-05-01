import React from "react";
import Icon from "../../../components/AppIcon";
import { useCurrency } from "../../../contexts/CurrencyContext";

const LeadSources = ({ deals = [], contacts = [], isLoading = false }) => {
  const { formatCurrency } = useCurrency();

  const analyzeLeadSources = () => {
    // Analyze actual lead sources from deals and contacts
    const sources = {
      Website: {
        deals: 0,
        contacts: 0,
        value: 0,
        color: "text-blue-500",
        icon: "Globe",
      },
      Referral: {
        deals: 0,
        contacts: 0,
        value: 0,
        color: "text-green-500",
        icon: "UserPlus",
      },
      "Cold Outreach": {
        deals: 0,
        contacts: 0,
        value: 0,
        color: "text-orange-500",
        icon: "Mail",
      },
      "Social Media": {
        deals: 0,
        contacts: 0,
        value: 0,
        color: "text-purple-500",
        icon: "Share2",
      },
      Events: {
        deals: 0,
        contacts: 0,
        value: 0,
        color: "text-yellow-500",
        icon: "Calendar",
      },
      Other: {
        deals: 0,
        contacts: 0,
        value: 0,
        color: "text-gray-500",
        icon: "MoreHorizontal",
      },
    };

    // Analyze actual lead sources from deals and contacts
    deals.forEach((deal) => {
      const leadSource = deal.lead_source || "Other";
      if (sources[leadSource]) {
        sources[leadSource].deals++;
        sources[leadSource].value += deal.amount || 0;
      } else {
        sources.Other.deals++;
        sources.Other.value += deal.amount || 0;
      }
    });

    contacts.forEach((contact) => {
      const leadSource = contact.lead_source || "Other";
      if (sources[leadSource]) {
        sources[leadSource].contacts++;
      } else {
        sources.Other.contacts++;
      }
    });

    // Calculate total for percentages
    const totalDeals = deals.length;
    const totalValue = deals.reduce((sum, deal) => sum + (deal.amount || 0), 0);

    // Convert to array and add percentages
    return Object.entries(sources)
      .map(([name, data]) => ({
        name,
        ...data,
        dealPercentage:
          totalDeals > 0 ? Math.round((data.deals / totalDeals) * 100) : 0,
        valuePercentage:
          totalValue > 0 ? Math.round((data.value / totalValue) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  };

  const leadSources = analyzeLeadSources();
  const totalValue = leadSources.reduce((sum, source) => sum + source.value, 0);
  const totalDeals = leadSources.reduce((sum, source) => sum + source.deals, 0);

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
        <div className="w-32 h-6 bg-muted rounded skeleton mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-full h-14 bg-muted rounded skeleton"
            ></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-6 enterprise-shadow">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-card-foreground">
          Lead Sources
        </h3>
        <Icon name="PieChart" size={20} className="text-accent" />
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="text-center p-3 bg-primary/10 rounded-lg">
          <div className="text-xl font-bold text-primary">{totalDeals}</div>
          <div className="text-xs text-muted-foreground">Total Deals</div>
        </div>
        <div className="text-center p-3 bg-success/10 rounded-lg">
          <div className="text-xl font-bold text-success">
            {formatCurrency(totalValue)}
          </div>
          <div className="text-xs text-muted-foreground">Total Value</div>
        </div>
      </div>

      {/* Lead Sources Breakdown */}
      <div className="space-y-3">
        {leadSources.map((source) => (
          <div key={source.name} className="p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-3">
                <Icon name={source.icon} size={16} className={source.color} />
                <span className="text-sm font-medium text-card-foreground">
                  {source.name}
                </span>
              </div>

              <div className="text-right">
                <div className="text-sm font-semibold text-card-foreground">
                  {formatCurrency(source.value)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {source.deals} deals
                </div>
              </div>
            </div>

            {/* Progress Bars */}
            <div className="space-y-2">
              {/* Deals Progress */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Deals</span>
                  <span>{source.dealPercentage}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={`${source.color.replace(
                      "text-",
                      "bg-"
                    )} rounded-full h-1.5 transition-all`}
                    style={{ width: `${source.dealPercentage}%` }}
                  ></div>
                </div>
              </div>

              {/* Value Progress */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Value</span>
                  <span>{source.valuePercentage}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={`${source.color.replace(
                      "text-",
                      "bg-"
                    )} rounded-full h-1.5 transition-all opacity-70`}
                    style={{ width: `${source.valuePercentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Performer */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Top Performer</span>
          <div className="flex items-center space-x-2">
            <Icon
              name={leadSources[0]?.icon}
              size={14}
              className={leadSources[0]?.color}
            />
            <span className="font-medium text-card-foreground">
              {leadSources[0]?.name}
            </span>
            <span className="text-muted-foreground">
              ({leadSources[0]?.valuePercentage}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeadSources;
