import { useEffect, useCallback } from "react";

/**
 * Custom hook that enables copy-to-clipboard functionality for any element
 * with the `.copyable` class and `data-copy` attribute.
 *
 * Usage:
 * 1. Call useCopyable() in App.tsx
 * 2. Add `.copyable` class and `data-copy="value"` to any element
 *
 * Example:
 * <span className="copyable" data-copy={walletAddress}>
 *   {formatAddress(walletAddress)}
 * </span>
 */
export const useCopyable = () => {
  const handleClick = useCallback(async (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const copyableElement = target?.closest?.(
      ".copyable"
    ) as HTMLElement | null;

    if (!copyableElement) return;

    const textToCopy = copyableElement.dataset.copy;
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);

      // Add visual feedback
      copyableElement.classList.add("copied");

      // Remove the copied class after animation
      setTimeout(() => {
        copyableElement.classList.remove("copied");
      }, 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [handleClick]);
};
