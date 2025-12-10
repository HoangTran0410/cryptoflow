import React, { useEffect, useRef } from "react";
import { TracerConnection } from "../../types";

interface ConnectionRendererProps {
  connections: TracerConnection[];
  walletPositions: Map<string, { x: number; y: number }>;
  transform: { x: number; y: number; k: number };
}

const ConnectionRenderer: React.FC<ConnectionRendererProps> = ({
  connections,
  walletPositions,
  transform,
}) => {
  const maxAmount = Math.max(...connections.map((c) => c.totalAmount), 1);

  return (
    <g className="connections-group">
      {/* Define animated gradient for flow */}
      <defs>
        <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="40%" stopColor="white" stopOpacity="0.8" />
          <stop offset="60%" stopColor="white" stopOpacity="0.8" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>

      {connections.map((conn) => {
        const from = walletPositions.get(conn.fromAddress);
        const to = walletPositions.get(conn.toAddress);

        if (!from || !to) return null;

        // Calculate control points for bezier curve
        const midX = (from.x + to.x) / 2;
        const dx = Math.abs(to.x - from.x);
        const controlOffset = Math.min(dx * 0.5, 150);

        // Create curved path
        const path = `M ${from.x} ${from.y} C ${from.x + controlOffset} ${
          from.y
        }, ${to.x - controlOffset} ${to.y}, ${to.x} ${to.y}`;

        // Stroke width based on amount
        const strokeWidth = Math.max(
          1.5,
          Math.min(8, (conn.totalAmount / maxAmount) * 8)
        );

        // Color based on direction
        const isForward = from.x < to.x;
        const strokeColor = isForward ? "#f59e0b" : "#10b981";

        // Label position
        const labelX = midX;
        const labelY = (from.y + to.y) / 2 - 10;

        const key = `${conn.fromAddress}-${conn.toAddress}`;

        // Calculate path length for animation
        const pathLength =
          Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.y - from.y, 2)) *
          1.5;

        return (
          <g key={key} className="connection">
            {/* Shadow for depth */}
            <path
              d={path}
              fill="none"
              stroke="rgba(0,0,0,0.3)"
              strokeWidth={strokeWidth + 2}
              strokeLinecap="round"
            />

            {/* Main line */}
            <path
              d={path}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeOpacity={0.6}
              style={{ filter: "drop-shadow(0 0 4px rgba(0,0,0,0.3))" }}
            />

            {/* Animated flow particles */}
            <g>
              {[0, 0.33, 0.66].map((offset, i) => (
                <circle
                  key={i}
                  r={strokeWidth * 0.6}
                  fill={strokeColor}
                  opacity={0.9}
                  style={{
                    filter: `drop-shadow(0 0 ${strokeWidth}px ${strokeColor})`,
                  }}
                >
                  <animateMotion
                    dur={`${2 + pathLength / 200}s`}
                    repeatCount="indefinite"
                    begin={`${offset * (2 + pathLength / 200)}s`}
                    path={path}
                  />
                </circle>
              ))}
            </g>

            {/* Amount label */}
            {transform.k > 0.5 && (
              <g transform={`translate(${labelX}, ${labelY})`}>
                <rect
                  x={-35}
                  y={-10}
                  width={70}
                  height={18}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.95)"
                  stroke={strokeColor}
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={500}
                >
                  $
                  {conn.totalAmount.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

export default ConnectionRenderer;
