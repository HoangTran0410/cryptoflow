import React from "react";
import { Transaction, DailyVolume } from "../types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

interface ChartsSectionProps {
  dailyData: DailyVolume[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded shadow-xl">
        <p className="text-slate-300 text-sm mb-1">{label}</p>
        <p className="text-emerald-400 text-sm font-bold">
          Vol: {Number(payload[0].value).toLocaleString()}
        </p>
        {payload[1] && (
          <p className="text-blue-400 text-sm font-bold">
            Count: {payload[1].value}
          </p>
        )}
      </div>
    );
  }
  return null;
};

const ChartsSection: React.FC<ChartsSectionProps> = ({ dailyData }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      {/* Volume Chart */}
      <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <span className="w-2 h-6 bg-emerald-500 rounded-full"></span>
          Transaction Volume Over Time
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickMargin={10}
                tickFormatter={(val) => val.slice(5)} // Show MM-DD
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="volume"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorVolume)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Count Chart */}
      <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
          Daily Transaction Count
        </h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1e293b"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="#64748b"
                fontSize={12}
                tickMargin={10}
                tickFormatter={(val) => val.slice(5)}
              />
              <YAxis stroke="#64748b" fontSize={12} />
              <Tooltip
                cursor={{ fill: "#1e293b", opacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-2 rounded shadow-xl">
                        <p className="text-slate-300 text-xs mb-1">{label}</p>
                        <p className="text-blue-400 text-sm font-bold">
                          {payload[0].value} txns
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default ChartsSection;
