import React, { useState } from "react";
import { Download, ChevronDown } from "lucide-react";

interface ExportButtonProps {
  onExport: (format: string) => void;
  formats?: string[];
  label?: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  onExport,
  formats = ["csv", "json"],
  label = "Export",
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatLabels = {
    csv: "CSV",
    json: "JSON",
    svg: "SVG Image",
    png: "PNG Image",
  };

  const handleExport = (format: string) => {
    onExport(format);
    setIsOpen(false);
  };

  if (formats.length === 1) {
    // Single format - simple button
    return (
      <button
        onClick={() => handleExport(formats[0])}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Download className="w-4 h-4" />
        {label}
      </button>
    );
  }

  // Multiple formats - dropdown
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        <Download className="w-4 h-4" />
        {label}
        <ChevronDown className="w-3 h-3" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-40 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 overflow-hidden">
            {formats.map((format) => (
              <button
                key={format}
                onClick={() => handleExport(format)}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                {formatLabels[format]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ExportButton;
