import { Loader2 } from "lucide-react";

export const LoadingFallback = (
  <div className="flex items-center justify-center w-full h-full min-h-[100px]">
    <Loader2 className="w-6 h-6 text-white/50 animate-spin" />
  </div>
);
