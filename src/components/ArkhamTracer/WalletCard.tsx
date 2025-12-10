import React, { useRef } from "react";
import { TracerWallet } from "../../types";
import { ArrowDownLeft, ArrowUpRight, GripVertical } from "lucide-react";

interface WalletCardProps {
  wallet: TracerWallet;
  isSelected: boolean;
  isDragging?: boolean;
  position: { x: number; y: number };
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}

const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  isSelected,
  isDragging = false,
  position,
  onSelect,
  onDragStart,
}) => {
  const dragStarted = useRef(false);

  const formatAddress = (addr: string) => {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatAmount = (amount: number) => {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragStarted.current = true;
    onDragStart(e);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Only trigger select if we didn't just finish dragging
    if (!isDragging) {
      onSelect();
    }
  };

  return (
    <g
      transform={`translate(${position.x - 90}, ${position.y - 35})`}
      className="wallet-card"
      style={{
        opacity: isDragging ? 0.9 : 1,
        cursor: isDragging ? "grabbing" : "grab",
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      {/* Card background */}
      <rect
        width={180}
        height={70}
        rx={8}
        fill={"rgba(30, 41, 59, 0.95)"}
        stroke={isSelected ? "#818cf8" : isDragging ? "#6366f1" : "#475569"}
        strokeWidth={isSelected || isDragging ? 2 : 1}
        className="wallet-card"
        style={{
          filter: isDragging
            ? "drop-shadow(0 8px 20px rgba(0,0,0,0.5))"
            : "drop-shadow(0 4px 12px rgba(0,0,0,0.4))",
        }}
      />

      {/* Drag handle indicator */}
      <g className="wallet-card">
        <rect
          x={2}
          y={25}
          width={20}
          height={20}
          fill="transparent"
          className="wallet-card"
        />
        <foreignObject
          x={4}
          y={27}
          width={16}
          height={16}
          className="wallet-card"
        >
          <GripVertical className="w-4 h-4 text-slate-500 hover:text-slate-300" />
        </foreignObject>
      </g>

      {/* Wallet icon/avatar */}
      <circle cx={40} cy={35} r={14} fill="#6366f1" className="wallet-card" />
      <text
        x={40}
        y={39}
        textAnchor="middle"
        fill="white"
        fontSize={10}
        fontWeight={600}
        className="wallet-card"
        style={{ pointerEvents: "none" }}
      >
        {wallet.address.slice(0, 2).toUpperCase()}
      </text>

      {/* Address */}
      <text
        x={62}
        y={24}
        fill="#f1f5f9"
        fontSize={11}
        fontWeight={600}
        className="wallet-card"
        style={{ pointerEvents: "none" }}
      >
        {formatAddress(wallet.address)}
      </text>

      {/* Transaction count */}
      <text
        x={62}
        y={38}
        fill="#94a3b8"
        fontSize={9}
        className="wallet-card"
        style={{ pointerEvents: "none" }}
      >
        {wallet.txCount} transaction{wallet.txCount !== 1 ? "s" : ""}
      </text>

      {/* Inflow/Outflow */}
      <g transform="translate(62, 46)" className="wallet-card">
        <foreignObject width={14} height={14} y={-2} className="wallet-card">
          <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
        </foreignObject>
        <text
          x={16}
          y={9}
          fill="#34d399"
          fontSize={9}
          fontWeight={500}
          className="wallet-card"
          style={{ pointerEvents: "none" }}
        >
          {formatAmount(wallet.totalInflow)}
        </text>

        <foreignObject
          x={65}
          width={14}
          height={14}
          y={-2}
          className="wallet-card"
        >
          <ArrowUpRight className="w-3 h-3 text-orange-400" />
        </foreignObject>
        <text
          x={81}
          y={9}
          fill="#fb923c"
          fontSize={9}
          fontWeight={500}
          className="wallet-card"
          style={{ pointerEvents: "none" }}
        >
          {formatAmount(wallet.totalOutflow)}
        </text>
      </g>
    </g>
  );
};

export default WalletCard;
