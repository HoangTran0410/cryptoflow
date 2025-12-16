import React, { useMemo, useCallback } from "react";
import { TracerConnection, CombinedConnection } from "../../types";
import { formatAmount } from "@/src/utils/helpers";

type ConnectionStyle = "curve" | "straight" | "step";

interface ConnectionRendererProps {
  connections: TracerConnection[];
  walletPositions: Map<
    string,
    { x: number; y: number; leftEdge: number; rightEdge: number }
  >;
  transform: { x: number; y: number; k: number };
  connectionStyle: ConnectionStyle;
  selectedConnection?: { from: string; to: string } | null;
  onConnectionClick?: (connection: CombinedConnection) => void;
}

// Performance thresholds
const HIGH_CONNECTION_THRESHOLD = 100; // Reduce particles above this
const VERY_HIGH_CONNECTION_THRESHOLD = 500; // Minimal particles above this
const EXTREME_CONNECTION_THRESHOLD = 1000; // No particles above this

const ConnectionRenderer: React.FC<ConnectionRendererProps> = ({
  connections,
  walletPositions,
  transform,
  connectionStyle,
  selectedConnection,
  onConnectionClick,
}) => {
  // Viewport culling - check if connection is visible
  const isConnectionVisible = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      if (typeof window === "undefined") return true;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Transform coordinates to screen space
      const screenX1 = x1 * transform.k + transform.x;
      const screenY1 = y1 * transform.k + transform.y;
      const screenX2 = x2 * transform.k + transform.x;
      const screenY2 = y2 * transform.k + transform.y;

      // Bounding box check with margin
      const margin = 100;
      const minX = Math.min(screenX1, screenX2);
      const maxX = Math.max(screenX1, screenX2);
      const minY = Math.min(screenY1, screenY2);
      const maxY = Math.max(screenY1, screenY2);

      return !(
        maxX < -margin ||
        minX > viewportWidth + margin ||
        maxY < -margin ||
        minY > viewportHeight + margin
      );
    },
    [transform]
  );

  // Combine bidirectional connections
  const combinedConnections = useMemo(() => {
    const connectionMap = new Map<string, CombinedConnection>();

    connections.forEach((conn) => {
      // Create a consistent key (alphabetically sorted)
      const [addrA, addrB] =
        conn.fromAddress < conn.toAddress
          ? [conn.fromAddress, conn.toAddress]
          : [conn.toAddress, conn.fromAddress];
      const key = `${addrA}<->${addrB}`;

      const existing = connectionMap.get(key) || {
        addressA: addrA,
        addressB: addrB,
        aToB: null,
        bToA: null,
        totalAmount: 0,
      };

      if (conn.fromAddress === addrA) {
        existing.aToB = conn;
      } else {
        existing.bToA = conn;
      }
      existing.totalAmount += conn.totalAmount;

      connectionMap.set(key, existing);
    });

    return Array.from(connectionMap.values());
  }, [connections]);

  const maxAmount = Math.max(
    ...combinedConnections.map((c) => c.totalAmount),
    1
  );
  const hasSelection = !!selectedConnection;

  // Get particle configuration based on total connection count
  const particleConfig = getParticleConfig(combinedConnections.length);

  return (
    <g className="connections-group">
      {combinedConnections.map((combined) => {
        const posA = walletPositions.get(combined.addressA);
        const posB = walletPositions.get(combined.addressB);

        if (!posA || !posB) return null;

        // Check if wallets are in the same column (same x position)
        const isSameColumn = Math.abs(posA.x - posB.x) < 1;

        let fromX, fromY, toX, toY, isALeft, leftAddr, rightAddr;

        if (isSameColumn) {
          // Same column: use center positions and draw straight line
          fromX = posA.y < posB.y ? posA.x : posB.x;
          fromY = posA.y < posB.y ? posA.y : posB.y;
          toX = posA.y < posB.y ? posB.x : posA.x;
          toY = posA.y < posB.y ? posB.y : posA.y;
          isALeft = posA.y < posB.y;
          leftAddr = combined.addressA;
          rightAddr = combined.addressB;
        } else {
          // Different columns: use edge attachment points
          isALeft = posA.x <= posB.x;
          fromX = isALeft ? posA.rightEdge : posA.leftEdge;
          fromY = posA.y;
          toX = isALeft ? posB.leftEdge : posB.rightEdge;
          toY = posB.y;
          leftAddr = isALeft ? combined.addressA : combined.addressB;
          rightAddr = isALeft ? combined.addressB : combined.addressA;
        }

        // Viewport culling - skip rendering if connection is not visible
        if (!isConnectionVisible(fromX, fromY, toX, toY)) {
          return null;
        }

        // Create paths - use straight line for same column, otherwise use selected style
        const path = isSameColumn
          ? createStraightPath(fromX, fromY, toX, toY)
          : createPath(connectionStyle, fromX, fromY, toX, toY);
        const reversePath = isSameColumn
          ? createStraightPath(toX, toY, fromX, fromY)
          : createPath(connectionStyle, toX, toY, fromX, fromY);

        // For 1-way transactions: determine particle direction based on actual transaction
        // Key insight:
        // - 'path' always represents the visual path from addressA to addressB
        // - 'reversePath' always represents the visual path from addressB to addressA
        // - We just need to match the transaction direction to the visual path!
        let particlePath = null;
        let particleConnection = null;

        if (combined.aToB && !combined.bToA) {
          // Only forward transaction exists
          particleConnection = combined.aToB;

          // If transaction flows from A to B, use path (A -> B)
          // If transaction flows from B to A, use reversePath (B -> A)
          if (combined.aToB.fromAddress === combined.addressA) {
            particlePath = path; // A -> B
          } else {
            particlePath = reversePath; // B -> A
          }
        } else if (combined.bToA && !combined.aToB) {
          // Only reverse transaction exists
          particleConnection = combined.bToA;

          // If transaction flows from A to B, use path (A -> B)
          // If transaction flows from B to A, use reversePath (B -> A)
          if (combined.bToA.fromAddress === combined.addressA) {
            particlePath = path; // A -> B
          } else {
            particlePath = reversePath; // B -> A
          }
        }

        // Stroke width based on combined amount (minimum 2px for visibility)
        const strokeWidth = Math.max(
          2,
          Math.min(8, (combined.totalAmount / maxAmount) * 8)
        );

        // Check directions
        const hasForward = combined.aToB !== null;
        const hasReverse = combined.bToA !== null;
        const isBidirectional = hasForward && hasReverse;

        // Colors: green for 1-way, purple for 2-way
        const oneWayColor = "#10b981"; // green
        const twoWayColor = "#a855f7"; // purple
        const oneWayParticleColor = "#55ee44";
        const twoWayParticleColor = "#ee5544";

        // Determine which connection to pass on click
        const primaryConnection = combined.aToB || combined.bToA;
        if (!primaryConnection) return null;

        // Label position
        const labelX = (fromX + toX) / 2;
        const labelY = (fromY + toY) / 2 - 10;

        const key = `${combined.addressA}<->${combined.addressB}`;

        // Calculate path length for animation
        const pathLength =
          Math.sqrt(Math.pow(toX - fromX, 2) + Math.pow(toY - fromY, 2)) * 1.5;

        // Check if this connection is selected
        const isSelected =
          selectedConnection &&
          ((selectedConnection.from === combined.addressA &&
            selectedConnection.to === combined.addressB) ||
            (selectedConnection.from === combined.addressB &&
              selectedConnection.to === combined.addressA));

        // Dim non-selected connections when there is a selection
        const opacity = hasSelection ? (isSelected ? 1 : 0.3) : 0.6;

        return (
          <g
            key={key}
            className="connection"
            style={{ cursor: onConnectionClick ? "pointer" : "default" }}
            onClick={(e) => {
              e.stopPropagation();
              onConnectionClick?.(combined);
            }}
          >
            {/* Main line - purple for 2-way, green for 1-way */}
            <path
              d={path}
              fill="none"
              stroke={isBidirectional ? twoWayColor : oneWayColor}
              strokeWidth={isSelected ? strokeWidth + 2 : strokeWidth}
              strokeLinecap="round"
              strokeOpacity={opacity}
            />

            {/* Green particles for 1-way transactions only */}
            {particlePath && particleConfig.enabled && (
              <g>
                {Array.from(
                  { length: particleConfig.count },
                  (_, i) => i / particleConfig.count
                ).map((offset, i) => (
                  <circle
                    key={`particle-${i}`}
                    r={3}
                    fill={oneWayParticleColor}
                    opacity={1}
                  >
                    <animateMotion
                      dur={`${2 + pathLength / 200}s`}
                      repeatCount="indefinite"
                      begin={`${offset * (2 + pathLength / 200)}s`}
                      path={particlePath}
                    />
                  </circle>
                ))}
              </g>
            )}

            {/* Purple particles for 2-way transactions - both directions */}
            {/* {isBidirectional && particleConfig.enabled && (
              <>

                <g>
                  {Array.from(
                    { length: particleConfig.count },
                    (_, i) => i / particleConfig.count
                  ).map((offset, i) => (
                    <circle
                      key={`bidirectional-ltr-${i}`}
                      r={3}
                      fill={twoWayParticleColor}
                      opacity={1}
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
                <g>
                  {Array.from(
                    { length: particleConfig.count },
                    (_, i) => (i + 0.5) / particleConfig.count
                  ).map((offset, i) => (
                    <circle
                      key={`bidirectional-rtl-${i}`}
                      r={3}
                      fill={twoWayParticleColor}
                      opacity={0.9}
                    >
                      <animateMotion
                        dur={`${2 + pathLength / 200}s`}
                        repeatCount="indefinite"
                        begin={`${offset * (2 + pathLength / 200)}s`}
                        path={reversePath}
                      />
                    </circle>
                  ))}
                </g>
              </>
            )} */}

            {/* Amount label */}
            {transform.k > 0.5 && (
              <g transform={`translate(${labelX}, ${labelY})`}>
                <rect
                  x={-45}
                  y={-9}
                  width={90}
                  height={18}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.95)"
                  stroke={isBidirectional ? twoWayColor : oneWayColor}
                  strokeWidth={1}
                />
                {isBidirectional ? (
                  // Show both amounts for bidirectional
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize={9}
                    fontWeight={500}
                  >
                    <tspan fill={oneWayColor}>
                      {formatAmount(combined.aToB?.totalAmount || 0)}
                    </tspan>
                    <tspan fill="#64748b"> / </tspan>
                    <tspan fill={oneWayColor}>
                      {formatAmount(combined.bToA?.totalAmount || 0)}
                    </tspan>
                  </text>
                ) : (
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize={10}
                    fontWeight={500}
                  >
                    {formatAmount(combined.totalAmount)}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
};

const createPath = (
  connectionStyle: ConnectionStyle,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
) => {
  switch (connectionStyle) {
    case "straight":
      return createStraightPath(fromX, fromY, toX, toY);
    case "step":
      return createStepPath(fromX, fromY, toX, toY);
    case "curve":
    default:
      return createCurvePath(fromX, fromY, toX, toY);
  }
};

// Adaptive particle configuration based on connection count
const getParticleConfig = (totalConnections: number) => {
  if (totalConnections > EXTREME_CONNECTION_THRESHOLD) {
    return { enabled: false, count: 0 };
  } else if (totalConnections > VERY_HIGH_CONNECTION_THRESHOLD) {
    return { enabled: true, count: 1 }; // 1 particle per direction
  } else if (totalConnections > HIGH_CONNECTION_THRESHOLD) {
    return { enabled: true, count: 2 }; // 2 particles per direction
  }
  return { enabled: true, count: 2 }; // Full particles for normal loads
};

// Path generation functions
const createCurvePath = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
) => {
  const dx = toX - fromX; // Signed distance
  const absDx = Math.abs(dx);
  const controlOffset = Math.min(absDx * 0.5, 150);

  // Control points move in the direction of travel
  const sign = dx >= 0 ? 1 : -1;
  const c1x = fromX + controlOffset * sign;
  const c2x = toX - controlOffset * sign;

  return `M ${fromX} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${toX} ${toY}`;
};

const createStraightPath = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
) => {
  return `M ${fromX} ${fromY} L ${toX} ${toY}`;
};

const createStepPath = (
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
) => {
  const midX = (fromX + toX) / 2;
  return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
};

export default ConnectionRenderer;
