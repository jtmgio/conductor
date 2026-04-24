"use client";

import { useState, useCallback } from "react";
import { isSoundsEnabled, setSoundsEnabled } from "@/lib/sounds";

export function useSoundPreference() {
  const [soundsEnabled, _setSoundsEnabled] = useState(() => isSoundsEnabled());

  const toggleSounds = useCallback(() => {
    const next = !soundsEnabled;
    setSoundsEnabled(next);
    _setSoundsEnabled(next);
  }, [soundsEnabled]);

  return { soundsEnabled, toggleSounds };
}
