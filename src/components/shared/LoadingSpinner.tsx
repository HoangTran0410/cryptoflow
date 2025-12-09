import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  message?: string;
  progress?: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Processing...',
  progress,
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-indigo-500`} />
      <div className="text-center">
        <p className="text-slate-300 text-sm">{message}</p>
        {typeof progress === 'number' && (
          <div className="mt-2 w-48">
            <div className="bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="text-slate-500 text-xs mt-1">{progress.toFixed(0)}%</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingSpinner;
