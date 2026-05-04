import React from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "../../../contexts/CurrencyContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const ManagerPipelineChart = ({
  teamData,
  deals,
  salesTargets,
  subordinates,
}) => {
  const { formatCurrency, preferredCurrency } = useCurrency();
  const navigate = useNavigate();

  // Pipeline stage distribution - matching Director Dashboard
  const getPipelineData = () => {
    const stages = [
      "lead",
      "contact_made",
      "proposal_sent",
      "negotiation",
      "won",
      "lost",
    ];
    const stageColors = [
      "#8B5CF6",
      "#06B6D4",
      "#F59E0B",
      "#EF4444",
      "#10B981",
      "#6B7280",
    ];

    return stages.map((stage, index) => {
      const stageDeals = deals?.filter((deal) => deal.stage === stage) || [];
      return {
        stageKey: stage,
        stage: stage.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        count: stageDeals.length,
        value: stageDeals.reduce(
          (sum, deal) => sum + parseFloat(deal.amount || 0),
          0
        ),
        color: stageColors[index],
      };
    });
  };

  const pipelineData = getPipelineData();

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}:{" "}
              {entry.name.includes("Value")
                ? formatCurrency(entry.value)
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Pipeline Distribution
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={pipelineData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="stage"
            angle={-45}
            textAnchor="end"
            height={80}
            fontSize={12}
          />
          <YAxis tickFormatter={(value) => formatCurrency(value)} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="value"
            name="Pipeline Value"
            onClick={(data) => navigate(`/sales-pipeline?stage=${data.stageKey}`, { state: { activeStage: data.stageKey } })}
            style={{ cursor: "pointer" }}
          >
            {pipelineData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Pipeline stats */}
      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-900">
            {pipelineData.reduce((sum, stage) => sum + stage.count, 0)}
          </p>
          <p className="text-sm text-gray-600">Total Deals</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">
            {pipelineData.find((stage) => stage.stage === "Won")?.count || 0}
          </p>
          <p className="text-sm text-gray-600">Won Deals</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">
            {formatCurrency(
              pipelineData
                .filter((stage) => !["Won", "Lost"].includes(stage.stage))
                .reduce((sum, stage) => sum + stage.value, 0),
              preferredCurrency
            )}
          </p>
          <p className="text-sm text-gray-600">Active Pipeline</p>
        </div>
      </div>
    </div>
  );
};

export default ManagerPipelineChart;
