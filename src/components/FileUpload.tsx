import React, { useCallback, useState } from "react";
import { Upload, FileText, AlertCircle, Search } from "lucide-react";
import { Transaction } from "../types";
import { SAMPLE_DATA } from "../constants";
import WalletScanner from "./WalletScanner";

interface FileUploadProps {
  onDataLoaded: (data: Transaction[]) => void;
}

type InputMode = "upload" | "scan";

export const parseCSV = (csvText: string): Transaction[] => {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim());

  const getIndex = (keys: string[]) =>
    headers.findIndex((h) => keys.some((k) => h.includes(k)));

  const idxDate = getIndex(["date", "time", "timestamp"]);
  const idxFrom = getIndex(["from", "sender", "source"]);
  const idxTo = getIndex(["to", "receiver", "destination"]);
  const idxAmount = getIndex(["amount", "value", "qty"]);
  const idxCurrency = getIndex(["currency", "coin", "symbol", "asset"]);
  const idxHash = getIndex(["hash", "id", "tx"]);

  if (idxDate === -1 || idxAmount === -1) {
    throw new Error("CSV must contain at least Date and Amount columns.");
  }

  return lines
    .slice(1)
    .map((line, index): Transaction | null => {
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < headers.length) return null;

      const dateStr = cols[idxDate];
      const amountStr = cols[idxAmount];

      // Attempt parsing
      const date = new Date(dateStr);
      const amount = parseFloat(amountStr.replace(/[^0-9.-]/g, ""));

      if (isNaN(date.getTime()) || isNaN(amount)) return null;

      return {
        id: idxHash !== -1 ? cols[idxHash] : `tx_${index}`,
        date,
        from: idxFrom !== -1 ? cols[idxFrom] : "Unknown",
        to: idxTo !== -1 ? cols[idxTo] : "Unknown",
        amount: Math.abs(amount),
        currency: idxCurrency !== -1 ? cols[idxCurrency] : "UNK",
        type: "transfer" as const,
      };
    })
    .filter((t): t is Transaction => t !== null);
};

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [mode, setMode] = useState<InputMode>("scan");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = parseCSV(text);
        if (data.length === 0) throw new Error("No valid transactions found.");
        onDataLoaded(data);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === "text/csv") {
      processFile(file);
    } else {
      setError("Please upload a valid CSV file.");
    }
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 p-6">
      {/* Mode Tabs */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex rounded-xl bg-slate-800/50 p-1 border border-slate-700">
          <button
            onClick={() => setMode("scan")}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              mode === "scan"
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Search className="w-4 h-4" />
            Scan Wallets
          </button>
          <button
            onClick={() => setMode("upload")}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-all ${
              mode === "upload"
                ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload CSV
          </button>
        </div>
      </div>

      {/* Mode Content */}
      {mode === "scan" ? (
        <WalletScanner onDataLoaded={onDataLoaded} />
      ) : (
        <div className="max-w-2xl mx-auto">
          <div
            className={`
              relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300
              ${
                isDragging
                  ? "border-indigo-400 bg-indigo-900/20"
                  : "border-slate-700 hover:border-slate-500 bg-slate-800/50"
              }
            `}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 bg-slate-800 rounded-full ring-4 ring-slate-700/50">
                <Upload className="w-8 h-8 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Upload Transaction History
                </h3>
                <p className="text-slate-400 mt-2 text-sm">
                  Drag & drop your CSV file here, or click to browse
                </p>
              </div>

              <input
                type="file"
                accept=".csv"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => {
                  if (e.target.files?.[0]) processFile(e.target.files[0]);
                }}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="text-sm text-slate-500 uppercase tracking-widest font-medium">
              Or
            </div>
            <button
              onClick={() => onDataLoaded(SAMPLE_DATA)}
              className="flex items-center gap-2 px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg border border-slate-700 transition-colors font-medium text-sm"
            >
              <FileText className="w-4 h-4" />
              Load Sample Data
            </button>
          </div>

          {error && (
            <div className="mt-6 p-4 bg-red-900/20 border border-red-800/50 rounded-lg flex items-center gap-3 text-red-200">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="mt-8 p-4 bg-slate-900/50 rounded-lg border border-slate-800 text-left">
            <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Expected CSV Format
            </h4>
            <code className="block text-xs text-slate-400 font-mono p-2 bg-slate-950 rounded border border-slate-800">
              Date, From, To, Amount, Currency
              <br />
              2023-10-01, 0xWalletA, 0xWalletB, 150.00, USDT
            </code>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
