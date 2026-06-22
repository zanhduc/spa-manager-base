import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearFormDraft,
  readFormDraft,
  writeFormDraft,
} from "../utils/formDraftCache.js";

export function useFormDraft(draftKey, initialValue, options = {}) {
  const enabled = options.enabled !== false;
  const debounceMs = Math.max(Number(options.debounceMs ?? 400), 0);
  const serialize =
    typeof options.serialize === "function" ? options.serialize : (value) => value;
  const deserialize =
    typeof options.deserialize === "function" ? options.deserialize : (value) => value;

  const [value, setValue] = useState(() => {
    if (!enabled || !draftKey) {
      return typeof initialValue === "function" ? initialValue() : initialValue;
    }
    const saved = readFormDraft(draftKey);
    if (saved !== null && saved !== undefined) {
      return deserialize(saved);
    }
    return typeof initialValue === "function" ? initialValue() : initialValue;
  });

  const timerRef = useRef(null);
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    if (!enabled || !draftKey) return undefined;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return undefined;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writeFormDraft(draftKey, serialize(value), { page: options.page });
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, draftKey, enabled, debounceMs, serialize, options.page]);

  const clearDraft = useCallback(() => {
    skipNextPersistRef.current = true;
    if (draftKey) clearFormDraft(draftKey);
  }, [draftKey]);

  const resetValue = useCallback(
    (nextValue) => {
      skipNextPersistRef.current = true;
      const resolved =
        typeof nextValue === "function"
          ? nextValue(value)
          : nextValue !== undefined
            ? nextValue
            : typeof initialValue === "function"
              ? initialValue()
              : initialValue;
      setValue(resolved);
    },
    [initialValue, value],
  );

  return { value, setValue, clearDraft, resetValue };
}
