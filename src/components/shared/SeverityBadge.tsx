import React from 'react';
import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';

interface SeverityBadgeProps {
  severity: 'low' | 'medium' | 'high' | 'critical';
  score?: number;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

const SeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  score,
  showIcon = true,
  size = 'md',
}) => {
  const config = {
    low: {
      bg: 'bg-green-900/30',
      border: 'border-green-500/50',
      text: 'text-green-400',
      icon: Info,
      label: 'LOW',
    },
    medium: {
      bg: 'bg-yellow-900/30',
      border: 'border-yellow-500/50',
      text: 'text-yellow-400',
      icon: AlertCircle,
      label: 'MEDIUM',
    },
    high: {
      bg: 'bg-orange-900/30',
      border: 'border-orange-500/50',
      text: 'text-orange-400',
      icon: AlertTriangle,
      label: 'HIGH',
    },
    critical: {
      bg: 'bg-red-900/30',
      border: 'border-red-500/50',
      text: 'text-red-400',
      icon: XCircle,
      label: 'CRITICAL',
    },
  };

  const { bg, border, text, icon: Icon, label } = config[severity];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

  return (
    <div
      className={`inline-flex items-center gap-1.5 ${bg} ${border} ${text} border rounded-full ${sizeClasses} font-semibold`}
    >
      {showIcon && <Icon className={iconSize} />}
      <span>{label}</span>
      {typeof score === 'number' && (
        <span className="opacity-75">({score})</span>
      )}
    </div>
  );
};

export default SeverityBadge;
