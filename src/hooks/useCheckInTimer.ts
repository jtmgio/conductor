"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

function getStorageKey(roleId: string) {
  return `conductor-checkin-${roleId}`;
}

export function useCheckInTimer(roleId: string | null | undefined) {
  const [secondsRemaining, setSecondsRemaining] = useState(CHECK_INTERVAL_MS / 1000);
  const [isExpired, setIsExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const prevRoleIdRef = useRef<string | null>(null);

  // Initialize or restore timer when roleId changes
  useEffect(() => {
    if (!roleId) {
      setIsExpired(false);
      setSecondsRemaining(CHECK_INTERVAL_MS / 1000);
      return;
    }

    // Reset timer on role change
    if (roleId !== prevRoleIdRef.current) {
      prevRoleIdRef.current = roleId;
      const stored = localStorage.getItem(getStorageKey(roleId));
      if (stored) {
        try {
          const { lastCheckTime } = JSON.parse(stored);
          const elapsed = Date.now() - new Date(lastCheckTime).getTime();
          const remaining = Math.max(0, CHECK_INTERVAL_MS - elapsed);
          const secs = Math.ceil(remaining / 1000);
          setSecondsRemaining(secs);
          setIsExpired(secs <= 0);
        } catch {
          setSecondsRemaining(CHECK_INTERVAL_MS / 1000);
          setIsExpired(false);
        }
      } else {
        // First time for this role — start fresh
        localStorage.setItem(getStorageKey(roleId), JSON.stringify({ lastCheckTime: new Date().toISOString() }));
        setSecondsRemaining(CHECK_INTERVAL_MS / 1000);
        setIsExpired(false);
      }
    }
  }, [roleId]);

  // Countdown interval
  useEffect(() => {
    if (!roleId) return;

    intervalRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          setIsExpired(true);
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [roleId]);

  const markChecked = useCallback(() => {
    if (!roleId) return;
    const now = new Date().toISOString();
    localStorage.setItem(getStorageKey(roleId), JSON.stringify({ lastCheckTime: now }));
    setSecondsRemaining(CHECK_INTERVAL_MS / 1000);
    setIsExpired(false);
  }, [roleId]);

  const snooze = useCallback((minutes: number) => {
    if (!roleId) return;
    // Set lastCheckTime so that the timer expires in `minutes` from now
    const fakeLastCheck = new Date(Date.now() - CHECK_INTERVAL_MS + minutes * 60 * 1000).toISOString();
    localStorage.setItem(getStorageKey(roleId), JSON.stringify({ lastCheckTime: fakeLastCheck }));
    setSecondsRemaining(minutes * 60);
    setIsExpired(false);
  }, [roleId]);

  // Format time for display
  const totalMinutes = Math.ceil(secondsRemaining / 60);
  let formattedTime: string;
  if (secondsRemaining <= 0) {
    formattedTime = "now";
  } else if (secondsRemaining < 60) {
    formattedTime = "< 1 min";
  } else {
    formattedTime = `${totalMinutes} min`;
  }

  return { secondsRemaining, isExpired, markChecked, snooze, formattedTime };
}
