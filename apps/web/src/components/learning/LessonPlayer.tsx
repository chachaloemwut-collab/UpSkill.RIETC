"use client";
/**
 * Custom YouTube player (spec 5.2 frontend)
 *
 * Important: everything here is "UX guidance", not "security". Users can open DevTools and bypass it all.
 * The real security lives in the server's evaluateHeartbeat(), which bounds credit by wall-clock time.
 * - linear mode: credit only content contiguous with the furthest point watched (no skipping ahead)
 * - free_complete mode: seek anywhere; every part must still be watched in real time to complete
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, CheckCircle2, Circle, CircleHelp, ClipboardCopy, FastForward, Flag, HelpCircle, Lock, Maximize, Minimize, RotateCcw, Share2, Snail, Tv, Volume2, VolumeX, X,
} from "lucide-react";
import { PlayPauseIcon, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { HEARTBEAT, nextUnwatchedSec, totalChunksFor, unwatchedRanges, watchedRanges, type NavigationMode } from "@upskill/core/heartbeat";
import { REPORTABLE_PLAYER_ERRORS } from "@upskill/core/youtube";
import { loadYouTubeIframeApi, YT_STATE, type YTPlayer } from "./youtube-iframe-api";

type Status =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "buffering" }
  | { kind: "paused" }
  | { kind: "focus-paused" }
  | { kind: "superseded" }
  | { kind: "offline" }
  | { kind: "broken" }
  | { kind: "completed" };

interface CheckpointState {
  passed: boolean;
  locked: boolean;
  score: number | null;
  attemptsUsed: number;
  attemptsLeft: number;
}

export interface PlayerAction {
  href: string;
  label: string;
}

interface Props {
  lessonId: string;
  videoId: string;
  durationSec: number;
  initialMaxWatchedSec: number;
  initialWatchedChunks: number[];
  /** Where the learner stopped last time (resume point). */
  initialPositionSec: number;
  minWatchPercentage: number;
  navigationMode: NavigationMode;
  initiallyCompleted: boolean;
  checkpoint: { question: string; options: string[]; atSec: number } | null;
  checkpointState?: CheckpointState | null;
  /** End-of-lesson test status for the checklist (null = this lesson has no test). */
  lessonTest: { done: boolean; bestScore: number | null; href: string; available: boolean } | null;
  /** What to do next once the video is complete (shown over the player at the end). */
  nextAction: PlayerAction | null;
  isPublic?: boolean;
}

async function postJson(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
    credentials: "same-origin",
    cache: "no-store",
  });
}

const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

export function LessonPlayer({
  lessonId, videoId, durationSec, initialMaxWatchedSec, initialWatchedChunks, initialPositionSec, minWatchPercentage, navigationMode,
  initiallyCompleted, checkpoint, checkpointState, lessonTest, nextAction, isPublic = true,
}: Props) {
  const router = useRouter();
  const free = navigationMode === "free_complete";
  const completedRef = useRef(initiallyCompleted);
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const tokenRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const maxWatchedRef = useRef(initialMaxWatchedSec);
  const focusPauseRef = useRef(false);
  const lastFocusEventAtRef = useRef(0);
  const checkpointPassedRef = useRef(checkpointState?.passed ?? false);
  const checkpointOpenRef = useRef(false);
  const prevTimeRef = useRef(0);
  // Resume where the learner stopped (unless the lesson is done or they were at the very start/end)
  const resumeAt = !initiallyCompleted && initialPositionSec > 5 && initialPositionSec < durationSec - 5 ? Math.floor(initialPositionSec) : 0;

  const [status, setStatus] = useState<Status>(initiallyCompleted ? { kind: "completed" } : { kind: "idle" });
  const [completed, setCompleted] = useState(initiallyCompleted);
  const [position, setPosition] = useState(resumeAt);
  const [maxWatched, setMaxWatched] = useState(initialMaxWatchedSec);
  const [watchedChunks, setWatchedChunks] = useState<number[]>(initialWatchedChunks);
  const [showResume, setShowResume] = useState(resumeAt > 0);
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [slow, setSlow] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [ready, setReady] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointPassed, setCheckpointPassed] = useState(checkpointState?.passed ?? false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);
  const [checkpointScore, setCheckpointScore] = useState<number | null>(checkpointState?.score ?? null);
  const [checkpointAttemptsLeft, setCheckpointAttemptsLeft] = useState(checkpointState?.attemptsLeft ?? 3);
  const [checkpointLocked, setCheckpointLocked] = useState(checkpointState?.locked ?? false);
  const [rewatch, setRewatch] = useState<{ fromSec: number; toSec: number } | null>(null);
  /** True while the ENDED finalization heartbeat is in-flight (prevents premature "ยังดูไม่ครบ" flash). */
  const [confirming, setConfirming] = useState(false);
  /** Ref to the finalization setTimeout so we can cancel it on cleanup / lesson change. */
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // H04: autoplay next lesson with countdown
  const [autoplayNext, setAutoplayNext] = useState(() => {
    try { return localStorage.getItem("lp_autoplay") !== "off"; } catch { return true; }
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  // H08: report problem dialog
  const [reportOpen, setReportOpen] = useState(false);

  const totalChunks = totalChunksFor(durationSec);
  const watchedCount = Math.min(totalChunks, watchedChunks.length);
  const watchedPercent = totalChunks ? Math.floor((watchedCount / totalChunks) * 100) : 0;
  const gaps = useMemo(() => unwatchedRanges(watchedChunks, durationSec), [watchedChunks, durationSec]);
  const seen = useMemo(() => watchedRanges(watchedChunks, durationSec), [watchedChunks, durationSec]);

  const applyCoverage = useCallback((chunks: number[] | undefined, max: number | undefined) => {
    if (Array.isArray(chunks)) setWatchedChunks(chunks);
    if (typeof max === "number") {
      maxWatchedRef.current = Math.max(maxWatchedRef.current, max);
      setMaxWatched(maxWatchedRef.current);
    }
  }, []);

  const startSession = useCallback(async () => {
    const res = await postJson(`/api/learning/lessons/${lessonId}/start-session`);
    if (!res.ok) throw new Error(`start-session ${res.status}`);
    const data = (await res.json()) as { streamToken: string; maxWatchedSec: number; watchedChunks?: number[] };
    tokenRef.current = data.streamToken;
    seqRef.current = 0;
    applyCoverage(data.watchedChunks, data.maxWatchedSec);
  }, [lessonId, applyCoverage]);

  const markCompleted = useCallback(() => {
    setStatus({ kind: "completed" });
    setCompleted(true);
    setConfirming(false); // finalization resolved — clear the "กำลังยืนยัน" overlay
    if (!completedRef.current) {
      completedRef.current = true;
      router.refresh(); // re-render the server parts (lesson list, next step)
    }
  }, [router]);

  /** Sends the latest position only (no backlog queue needed: the server credits by range, bounded by the grace window) */
  const sendHeartbeat = useCallback(async () => {
    const p = playerRef.current;
    const token = tokenRef.current;
    if (!p || !token) return;
    if (Date.now() - lastSentAtRef.current < HEARTBEAT.MIN_INTERVAL_SEC * 1000) return;
    lastSentAtRef.current = Date.now();
    seqRef.current += 1;

    try {
      const res = await postJson(`/api/learning/lessons/${lessonId}/heartbeat`, {
        stream_token: token,
        seq: seqRef.current,
        current_second: Math.floor(p.getCurrentTime()),
      });
      if (res.status === 409) {
        p.pauseVideo();
        tokenRef.current = null;
        setStatus({ kind: "superseded" });
        return;
      }
      if (!res.ok) return; // 429 etc. -> the next tick carries the latest state
      const data = (await res.json()) as { maxWatchedSec?: number; watchedChunks?: number[]; isCompleted?: boolean };
      applyCoverage(data.watchedChunks, data.maxWatchedSec);
      if (data.isCompleted) markCompleted();
      else setStatus((s) => (s.kind === "offline" || s.kind === "idle" ? { kind: p.getPlayerState() === YT_STATE.PLAYING ? "recording" : "paused" } : s));
    } catch {
      setStatus({ kind: "offline" }); // network dropped: the next ping catches up within GRACE_SEC
    }
  }, [lessonId, applyCoverage, markCompleted]);

  const reportFocusLoss = useCallback((eventType: "hidden" | "pagehide") => {
    const player = playerRef.current;
    const token = tokenRef.current;
    if (!player || player.getPlayerState() !== YT_STATE.PLAYING) return;
    const currentSecond = player.getCurrentTime();
    focusPauseRef.current = true;
    player.pauseVideo();
    setPlaying(false);
    setStatus({ kind: "focus-paused" });
    void sendHeartbeat();

    const now = Date.now();
    if (!token || now - lastFocusEventAtRef.current < 1_000) return;
    lastFocusEventAtRef.current = now;
    void fetch(`/api/learning/lessons/${lessonId}/focus-event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stream_token: token, event_type: eventType, current_second: currentSecond }),
      credentials: "same-origin",
      cache: "no-store",
      keepalive: true,
    });
  }, [lessonId, sendHeartbeat]);

  // Create the player
  useEffect(() => {
    let disposed = false;
    let created: YTPlayer | null = null;
    loadYouTubeIframeApi().then((YT) => {
      if (disposed || !hostRef.current) return;
      // The player's methods only exist after onReady: expose it to the timers/controls from there
      created = new YT.Player(hostRef.current, {
        host: "https://www.youtube-nocookie.com",
        videoId,
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, origin: window.location.origin, ...(resumeAt > 0 ? { start: resumeAt } : {}) },
        events: {
          onReady: (e) => {
            if (disposed) return;
            playerRef.current = e.target;
            prevTimeRef.current = resumeAt;
            setReady(true);
          },
          onStateChange: async (e) => {
            setPlaying(e.data === YT_STATE.PLAYING);
            if (e.data === YT_STATE.PLAYING) {
              focusPauseRef.current = false;
              setEnded(false);
              setShowResume(false);
              if (!tokenRef.current) {
                try {
                  await startSession();
                  // H05-1: anchor the opening position immediately so the first chunk is credited
                  // (without this, the server emits FIRST_PING and credits nothing until the second heartbeat)
                  lastSentAtRef.current = 0; // bypass MIN_INTERVAL rate-limit for this one anchor ping
                  void sendHeartbeat();
                } catch {
                  e.target.pauseVideo();
                  toast({ title: "ไม่สามารถเริ่มบันทึกเวลาเรียนได้", description: "กรุณาลองใหม่อีกครั้ง", variant: "destructive" });
                  return;
                }
              }
              setStatus((s) => (s.kind === "completed" ? s : { kind: "recording" }));
            } else if (e.data === YT_STATE.BUFFERING) {
              setStatus((s) => (s.kind === "completed" || s.kind === "superseded" ? s : { kind: "buffering" }));
            } else if (e.data === YT_STATE.PAUSED) {
              setStatus((s) => (s.kind === "completed" || s.kind === "superseded" ? s : { kind: focusPauseRef.current ? "focus-paused" : "paused" }));
              void sendHeartbeat();
            } else if (e.data === YT_STATE.ENDED) {
              setEnded(true);
              // H05-3: show "กำลังยืนยันผล…" immediately while finalization is in-flight
              setConfirming(true);
              if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
              // After MIN_INTERVAL, bypass the rate-limit and send the final heartbeat
              finalizeTimerRef.current = setTimeout(async () => {
                if (disposed) return;
                lastSentAtRef.current = 0; // bypass rate-limit for this finalization ping
                await sendHeartbeat();
                // sendHeartbeat calls markCompleted() if isCompleted; otherwise clear confirming
                if (!disposed) setConfirming(false);
              }, HEARTBEAT.MIN_INTERVAL_SEC * 1000 + 100);
            }
          },
          onPlaybackRateChange: (e) => {
            // Slower than normal is fine (time still counts); faster is not
            if (e.data > 1) e.target.setPlaybackRate(1);
          },
          onError: (e) => {
            if (REPORTABLE_PLAYER_ERRORS.has(e.data)) {
              setStatus({ kind: "broken" });
              void postJson(`/api/learning/lessons/${lessonId}/report-video`, { error_code: e.data });
            }
          },
        },
      });
    });
    return () => {
      disposed = true;
      // H05-4: cancel any pending finalization timer so it doesn't fire after lesson change/unmount
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
      created?.destroy();
      playerRef.current = null;
    };
    // resumeAt is fixed for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, lessonId, startSession, sendHeartbeat, toast]);

  // Heartbeat every 10s while PLAYING + update the progress bar
  useEffect(() => {
    const hb = setInterval(() => {
      if (playerRef.current?.getPlayerState() === YT_STATE.PLAYING) void sendHeartbeat();
    }, HEARTBEAT.INTERVAL_SEC * 1000);
    const ui = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      const prev = prevTimeRef.current;
      prevTimeRef.current = t;
      setPosition(t);
      // In-video checkpoint: ask when playback runs through its position (a seek past it doesn't count —
      // that part stays unwatched, so the learner meets the question when they come back to watch it).
      const crossed = prev < (checkpoint?.atSec ?? 0) && t >= (checkpoint?.atSec ?? 0) && t - prev < 3;
      if (checkpoint && !checkpointPassedRef.current && !checkpointOpenRef.current && crossed && p.getPlayerState() === YT_STATE.PLAYING) {
        checkpointOpenRef.current = true;
        p.pauseVideo();
        setPlaying(false);
        setCheckpointOpen(true);
      }
    }, 500);
    return () => {
      clearInterval(hb);
      clearInterval(ui);
    };
  }, [sendHeartbeat, checkpoint]);

  // Pause immediately when the page is hidden/minimized. Do not use window.blur:
  // focusing the YouTube iframe itself can emit blur and would make playback unusable.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") reportFocusLoss("hidden");
    };
    const onPageHide = () => reportFocusLoss("pagehide");
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [reportFocusLoss]);

  const seek = useCallback((targetSec: number, play = false) => {
    const p = playerRef.current;
    if (!p) return;
    const target = Math.max(0, Math.min(durationSec - 1, targetSec));
    if (!free && target > maxWatchedRef.current + HEARTBEAT.POSITION_TOLERANCE_SEC) {
      toast({ title: "หลักสูตรนี้ต้องเรียนต่อเนื่องตามลำดับ", description: "กรอย้อนกลับไปดูส่วนที่ดูแล้วได้ตามต้องการ" });
      return;
    }
    prevTimeRef.current = target;
    p.seekTo(target, true);
    setPosition(target);
    setEnded(false);
    if (play) p.playVideo();
  }, [toast, free, durationSec]);

  const jumpToUnwatched = useCallback(() => {
    const target = nextUnwatchedSec(watchedChunks, durationSec, playerRef.current?.getCurrentTime() ?? position);
    if (target === null) {
      toast({ title: "ดูครบทุกช่วงแล้ว", variant: "success" });
      return;
    }
    seek(target, true);
  }, [watchedChunks, durationSec, position, seek, toast]);

  const takeOver = () => {
    tokenRef.current = null;
    setStatus({ kind: "idle" });
    playerRef.current?.playVideo(); // PLAYING starts a fresh session, which supersedes the other window
  };

  const submitCheckpoint = async (optionIndex: number) => {
    setCheckpointBusy(true);
    setCheckpointError(null);
    try {
      const res = await postJson(`/api/learning/lessons/${lessonId}/checkpoint`, { option_index: optionIndex });
      const data = (await res.json()) as {
        correct?: boolean; alreadyPassed?: boolean; score?: number | null; attemptsLeft?: number; locked?: boolean;
        rewatch?: { fromSec: number; toSec: number }; lessonCompleted?: boolean;
      };
      if (data.correct) {
        if (data.score !== null && data.score !== undefined) setCheckpointScore(data.score);
        checkpointPassedRef.current = true;
        checkpointOpenRef.current = false;
        setCheckpointPassed(true);
        setCheckpointOpen(false);
        toast({ title: data.alreadyPassed ? "ผ่านคำถามนี้แล้ว" : `ตอบถูก! ได้ ${data.score ?? 10} คะแนน`, variant: "success" });
        if (data.lessonCompleted) markCompleted();
        playerRef.current?.playVideo();
        setPlaying(true);
      } else if (data.locked) {
        setCheckpointScore(0);
        setCheckpointAttemptsLeft(0);
        setCheckpointLocked(true);
        setRewatch(data.rewatch ?? null);
        setCheckpointError(null);
      } else {
        if (data.score !== null && data.score !== undefined) setCheckpointScore(data.score);
        if (data.attemptsLeft !== undefined) setCheckpointAttemptsLeft(data.attemptsLeft);
        setCheckpointError(`คำตอบยังไม่ถูก — คะแนนเหลือ ${data.score ?? 0} (ตอบได้อีก ${data.attemptsLeft ?? 0} ครั้ง)`);
      }
    } catch {
      setCheckpointError("ไม่สามารถตรวจคำตอบได้ กรุณาลองใหม่");
    } finally {
      setCheckpointBusy(false);
    }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) return void document.exitFullscreen();
    // iPhone Safari doesn't support element fullscreen -> fall back to CSS fullscreen
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* fall through */
      }
    }
    setPseudoFullscreen((v) => !v);
  };

  const toggleTheater = () => {
    const next = !theaterMode;
    setTheaterMode(next);
    const root = document.getElementById("lesson-layout-container");
    if (root) root.dataset.theater = next ? "true" : "false";
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) p.unMute();
    else p.mute();
    setMuted(!muted);
  };

  const toggleSpeed = () => {
    const p = playerRef.current;
    if (!p) return;
    const next = !slow;
    p.setPlaybackRate(next ? 0.75 : 1);
    setSlow(next);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p || !ready) return;
    if (p.getPlayerState() === YT_STATE.PLAYING) p.pauseVideo();
    else p.playVideo();
  };

  // Keyboard shortcuts (UI-only, routed through the same seek/player methods)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (e.target as HTMLElement)?.isContentEditable) return;
      const p = playerRef.current;
      if (!p || !ready || checkpointOpenRef.current) return;
      const key = e.key.toLowerCase();
      if (e.code === "Space" || key === "k") {
        e.preventDefault();
        togglePlay();
      } else if (key === "f") {
        e.preventDefault();
        void toggleFullscreen();
      } else if (key === "m") {
        e.preventDefault();
        toggleMute();
      } else if (key === "j" || e.key === "ArrowLeft") {
        e.preventDefault();
        seek(p.getCurrentTime() - 10);
      } else if (key === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(p.getCurrentTime() + 10);
      } else if (key === "n" && free) {
        e.preventDefault();
        jumpToUnwatched();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / durationSec) * 100))}%`;

  // H04: start countdown when completed + nextAction arrive and autoplay is on
  useEffect(() => {
    if (completed && nextAction && autoplayNext && ended) setCountdown(5);
  }, [completed, nextAction, autoplayNext, ended]);

  // H04: decrement countdown each second
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => (c !== null && c > 1 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // H04: navigate when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && nextAction) router.push(nextAction.href);
  }, [countdown, nextAction, router]);

  const handleCopyVideoLink = () => {
    if (!isPublic) {
      toast({ title: "ไม่อนุญาตให้คัดลอกลิงก์", description: "วิดีโอนี้เป็นแบบไม่สาธารณะเพื่อการเรียนรู้เฉพาะในระบบ", variant: "destructive" });
      return;
    }
    void navigator.clipboard.writeText(`https://www.youtube.com/watch?v=${videoId}`);
    toast({ title: "คัดลอกลิงก์วิดีโอแล้ว", description: "คัดลอกลิงก์ YouTube ไปยังคลิปบอร์ดแล้ว", variant: "success" });
  };

  const iconButton = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white/80 transition-[background-color,scale] hover:bg-white/10 hover:text-white active:scale-90";
  const checkpointPending = !!checkpoint && !checkpointPassed;
  const watchedEnough = free ? gaps.length === 0 : watchedPercent >= minWatchPercentage;

  return (
    <div className="bg-black select-none">
      <div ref={containerRef} className={pseudoFullscreen ? "fixed inset-0 z-50 flex flex-col justify-center bg-black" : "relative"}>
        <div className="relative aspect-video w-full">
          <div ref={hostRef} className="absolute inset-0 h-full w-full" />

          {/* Click to play/pause; guards the context menu for non-public videos */}
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={togglePlay}
            onContextMenu={(e) => {
              if (!isPublic) {
                e.preventDefault();
                e.stopPropagation();
                toast({ title: "ไม่อนุญาตให้คัดลอกลิงก์", description: "วิดีโอนี้เป็นแบบไม่สาธารณะเพื่อการเรียนรู้เฉพาะในระบบ", variant: "destructive" });
              }
            }}
          />

          {/* Resume prompt */}
          {showResume && !playing && (
            <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-white/15 bg-zinc-950/90 px-4 py-2 text-xs text-white shadow-lg backdrop-blur">
                <span>เรียนต่อจาก <strong className="font-mono tabular-nums">{clock(resumeAt)}</strong></span>
                <button type="button" onClick={() => playerRef.current?.playVideo()} className="rounded-full bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90">
                  เล่นต่อ
                </button>
                <button type="button" onClick={() => { seek(0, true); setShowResume(false); }} className="rounded-full px-3 py-1 text-white/80 hover:bg-white/10 hover:text-white">
                  เริ่มใหม่ตั้งแต่ต้น
                </button>
              </div>
            </div>
          )}

          {/* End of video: next step, or what is still missing */}
          {ended && !checkpointOpen && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
              <div className="grid w-full max-w-sm gap-3 rounded-2xl border border-white/15 bg-background/95 p-6 text-center text-foreground shadow-2xl">
                {completed ? (
                  <>
                    <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
                    <p className="font-semibold">ดูคลิปนี้ครบแล้ว</p>
                    {nextAction ? (
                      <>
                        <Link href={nextAction.href} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                          {nextAction.label} <ArrowRight className="h-4 w-4" />
                          {countdown !== null && countdown > 0 && <span className="ml-1 tabular-nums text-xs opacity-80">({countdown})</span>}
                        </Link>
                        {countdown !== null && countdown > 0 && (
                          <button type="button" className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setCountdown(null)}>
                            ยกเลิกเล่นอัตโนมัติ
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">กำลังอัปเดตขั้นตอนถัดไป…</p>
                    )}
                  </>
                ) : confirming ? (
                  /* H05-3: waiting for the finalization heartbeat — do NOT prematurely tell the learner they failed */
                  <>
                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                    <p className="font-semibold">กำลังยืนยันผล…</p>
                    <p className="text-sm text-muted-foreground">รอสักครู่</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold">ยังดูไม่ครบ</p>
                    <p className="text-sm text-muted-foreground">
                      {checkpointPending && watchedEnough
                        ? "ยังไม่ได้ตอบคำถามระหว่างคลิป"
                        : free
                          ? `ยังเหลือ ${gaps.length} ช่วงที่ยังไม่ได้ดู`
                          : `ดูแล้ว ${watchedPercent}% (ต้องดูอย่างน้อย ${minWatchPercentage}%)`}
                    </p>
                    {checkpointPending && watchedEnough && checkpoint ? (
                      <button type="button" onClick={() => seek(Math.max(0, checkpoint.atSec - 5), true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                        <CircleHelp className="h-4 w-4" /> ไปที่คำถาม ({clock(checkpoint.atSec)})
                      </button>
                    ) : (
                      /* H03: guide learner to the specific missing section, not "ดูอีกครั้ง" from start */
                      <button type="button" onClick={jumpToUnwatched} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                        <FastForward className="h-4 w-4" /> ไปยังช่วงที่ยังไม่ได้ดู
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Checkpoint question */}
          {checkpointOpen && checkpoint && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
              <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-white/20 bg-background/95 p-6 text-foreground shadow-2xl backdrop-blur-xl animate-zoom-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="mb-1 flex items-center gap-2 text-base font-semibold text-primary">
                    <CircleHelp className="h-5 w-5" /> คำถามระหว่างคลิป
                  </div>
                  {!checkpointLocked && (
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">คะแนน {checkpointScore ?? 10}/10</span>
                      <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">ตอบได้อีก {checkpointAttemptsLeft} ครั้ง</span>
                    </div>
                  )}
                </div>
                <p className="mb-4 mt-2 text-sm font-medium leading-relaxed">{checkpoint.question}</p>
                {checkpointLocked ? (
                  <div className="grid gap-3">
                    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
                      <p className="font-semibold text-destructive">ตอบไม่ถูกครบ 3 ครั้ง</p>
                      <p className="mt-1 text-muted-foreground">
                        {rewatch
                          ? `ลองดูช่วง ${clock(rewatch.fromSec)}–${clock(rewatch.toSec)} อีกครั้ง แล้วตอบใหม่ได้ ส่วนอื่นที่ดูแล้วยังนับอยู่ครบ`
                          : "ลองดูช่วงก่อนคำถามอีกครั้ง แล้วตอบใหม่ได้ ส่วนอื่นที่ดูแล้วยังนับอยู่ครบ"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.98]"
                    >
                      <RotateCcw className="h-4 w-4" /> ดูช่วงนี้อีกครั้ง
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {checkpoint.options.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={checkpointBusy}
                        onClick={() => void submitCheckpoint(i)}
                        className="group flex items-start gap-3 rounded-xl border border-border/80 bg-card p-3 text-left text-sm transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.99] disabled:opacity-50"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 text-xs font-semibold group-hover:border-primary group-hover:text-primary">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
                {checkpointError && <p className="mt-3 text-xs font-medium text-destructive">{checkpointError}</p>}
              </div>
            </div>
          )}

          {/* Keyboard shortcuts */}
          {shortcutsOpen && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in" onClick={() => setShortcutsOpen(false)}>
              <div className="w-full max-w-sm rounded-xl border border-white/20 bg-zinc-950/95 p-5 text-white shadow-2xl backdrop-blur-md animate-zoom-in" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <HelpCircle className="h-4 w-4 text-primary" /> คีย์ลัดเครื่องเล่นวิดีโอ
                  </p>
                  <button type="button" onClick={() => setShortcutsOpen(false)} className="text-xs text-white/60 hover:text-white" aria-label="ปิด">✕</button>
                </div>
                <div className="grid gap-2.5 pt-3 text-xs">
                  {[
                    ["เล่น / หยุดชั่วคราว", "Space / K"],
                    ["ถอยหลัง 10 วินาที", "J / ←"],
                    ["เดินหน้า 10 วินาที", "L / →"],
                    ...(free ? [["ไปยังช่วงที่ยังไม่ได้ดู", "N"]] : []),
                    ["ปิด/เปิดเสียง", "M"],
                    ["เต็มจอ", "F"],
                    ["เปิด/ปิด คู่มือคีย์ลัด", "?"],
                  ].map(([label, keys]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-white/70">{label}</span>
                      <span className="rounded bg-white/10 px-2 py-0.5 font-mono">{keys}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1.5 bg-zinc-950 px-2 py-2 text-white sm:gap-3 sm:px-3">
          <button type="button" disabled={!ready} aria-label={!ready ? "กำลังโหลดวิดีโอ" : playing ? "หยุดชั่วคราว" : "เล่น"} className={cn(iconButton, "disabled:opacity-40")} onClick={togglePlay}>
            <PlayPauseIcon playing={playing} className="h-5 w-5" />
          </button>

          <span className="hidden w-14 shrink-0 text-right font-mono text-xs tabular-nums text-white/80 sm:block">{clock(position)}</span>

          {/* Scrubber: watched parts, playhead, checkpoint marker */}
          <div
            role="slider"
            aria-label="ตำแหน่งวิดีโอ"
            aria-valuemin={0}
            aria-valuemax={durationSec}
            aria-valuenow={Math.floor(position)}
            aria-valuetext={`${clock(position)} จาก ${clock(durationSec)} · ดูแล้ว ${watchedPercent}%`}
            tabIndex={0}
            className="group relative h-2 flex-1 cursor-pointer rounded-full bg-white/15 transition-[height] hover:h-3"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * durationSec);
            }}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setHoverTime(Math.max(0, Math.min(durationSec, ((e.clientX - r.left) / r.width) * durationSec)));
              setHoverX(e.clientX - r.left);
            }}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Parts already watched (free mode: any order) */}
            {seen.map((r) => (
              <div key={r.fromSec} className="absolute inset-y-0 bg-white/45" style={{ left: pct(r.fromSec), width: pct(r.toSec - r.fromSec) }} />
            ))}
            {!free && <div className="absolute inset-y-0 left-0 rounded-full border-r border-white/60" style={{ width: pct(maxWatched) }} />}
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary/90" style={{ width: pct(position) }} />
            <div className="absolute top-1/2 -ml-1.75 h-3.5 w-3.5 -translate-y-1/2 scale-0 rounded-full border-2 border-white bg-primary shadow-md transition-transform group-hover:scale-100" style={{ left: pct(position) }} />
            {checkpoint && (
              <div title={`คำถามระหว่างคลิป นาทีที่ ${clock(checkpoint.atSec)}`} className="absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center" style={{ left: pct(checkpoint.atSec) }}>
                <span className={cn("h-3 w-3 rounded-full border-2 border-zinc-950 shadow-xs", checkpointPassed ? "bg-success" : "bg-amber-400")} />
              </div>
            )}
            {hoverTime !== null && (
              <div className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded border border-white/20 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white shadow-md" style={{ left: hoverX }}>
                {clock(hoverTime)}
              </div>
            )}
          </div>

          <span className="hidden w-14 shrink-0 font-mono text-xs tabular-nums text-white/80 sm:block">{clock(durationSec)}</span>

          {free && gaps.length > 0 && (
            <button type="button" className={cn(iconButton, "w-auto gap-1 px-2 text-xs")} onClick={jumpToUnwatched} title="ไปยังช่วงที่ยังไม่ได้ดู (N)" aria-label="ไปยังช่วงที่ยังไม่ได้ดู">
              <FastForward className="h-4 w-4" /> <span className="hidden md:inline">ช่วงที่ยังไม่ดู</span>
            </button>
          )}
          <button type="button" className={iconButton} onClick={toggleMute} aria-label={muted ? "เปิดเสียง" : "ปิดเสียง"} title={muted ? "เปิดเสียง (M)" : "ปิดเสียง (M)"}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button type="button" className={cn(iconButton, "hidden sm:inline-flex", slow && "text-primary")} onClick={toggleSpeed} aria-label={slow ? "ความเร็วปกติ" : "เล่นช้าลง 0.75 เท่า"} title={slow ? "ความเร็ว 0.75x (กดเพื่อกลับเป็นปกติ)" : "เล่นช้าลง 0.75x"}>
            <Snail className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(iconButton, "hidden sm:inline-flex", !isPublic && "cursor-not-allowed opacity-60")}
            onClick={handleCopyVideoLink}
            aria-label={isPublic ? "คัดลอกลิงก์วิดีโอ" : "วิดีโอไม่สาธารณะ ไม่อนุญาตให้คัดลอกลิงก์"}
            title={isPublic ? "คัดลอกลิงก์วิดีโอ" : "วิดีโอไม่สาธารณะ (ไม่อนุญาตให้คัดลอกลิงก์)"}
          >
            {isPublic ? <Share2 className="h-4 w-4" /> : <Lock className="h-4 w-4 text-amber-400/80" />}
          </button>
          <button type="button" className={cn(iconButton, "hidden sm:inline-flex")} onClick={() => setShortcutsOpen((v) => !v)} aria-label="คู่มือคีย์ลัด (?)" title="คู่มือคีย์ลัด (?)">
            <HelpCircle className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(iconButton, "hidden sm:inline-flex", autoplayNext && "text-primary")}
            title={autoplayNext ? "เล่นต่อต้นอัตโนมัติ: เปิด (คลิกเพื่อปิด)" : "เล่นต่อต้นอัตโนมัติ: ปิด"}
            aria-label="เล่นคลิปถัดไปอัตโนมัติ"
            onClick={() => {
              const next = !autoplayNext;
              setAutoplayNext(next);
              if (!next) setCountdown(null);
              try { localStorage.setItem("lp_autoplay", next ? "on" : "off"); } catch { /* ignore */ }
            }}
          >
            <ArrowRight className="h-4 w-4" />
            <span className="sr-only">เล่นอัตโนมัติ</span>
          </button>
          <button type="button" className={cn(iconButton, "hidden sm:inline-flex")} onClick={() => setReportOpen(true)} title="แจ้งปัญหาคลิปนี้" aria-label="แจ้งปัญหาคลิปนี้">
            <Flag className="h-4 w-4" />
          </button>
          <button type="button" className={cn(iconButton, "hidden lg:inline-flex", theaterMode && "text-primary")} onClick={toggleTheater} aria-label={theaterMode ? "ขนาดปกติ" : "โหมดจอกว้าง"} title={theaterMode ? "ขนาดปกติ" : "โหมดจอกว้าง"}>
            <Tv className="h-4 w-4" />
          </button>
          <button type="button" className={iconButton} onClick={toggleFullscreen} aria-label="เต็มจอ">
            {pseudoFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <StatusBar status={status} confirming={confirming} free={free} watchedCount={watchedCount} totalChunks={totalChunks} watchedPercent={watchedPercent} minPercent={minWatchPercentage} onTakeOver={takeOver} />

      <LessonChecklist
        free={free}
        completed={completed}
        watchedPercent={watchedPercent}
        minPercent={minWatchPercentage}
        gapsLeft={gaps.length}
        watchedEnough={watchedEnough}
        onJump={jumpToUnwatched}
        checkpoint={checkpoint ? { atSec: checkpoint.atSec, passed: checkpointPassed } : null}
        onGoToCheckpoint={() => checkpoint && seek(Math.max(0, checkpoint.atSec - 5), true)}
        lessonTest={lessonTest}
      />

      {/* H08: report problem dialog */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4" onClick={(e) => e.target === e.currentTarget && setReportOpen(false)}>
          <div className="w-full max-w-md rounded-xl border bg-background p-5 shadow-2xl grid gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">แจ้งปัญหาคลิปนี้</h3>
              <button type="button" onClick={() => setReportOpen(false)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground">ข้อมูลนี้จะช่วยให้ผู้ดูแลระบบแก้ไขปัญหาได้เร็วขึ้น กด "คัดลอก" แล้วส่งให้ผู้ดูแล</p>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs font-mono select-all whitespace-pre-wrap break-all">
              {[
                `lessonId: ${lessonId}`,
                `videoId: ${videoId}`,
                `position: ${Math.floor(position)}s / ${durationSec}s`,
                `watched: ${watchedPercent}%`,
                `status: ${status.kind}`,
                `completed: ${completed}`,
                `autoplay: ${autoplayNext}`,
                `ua: ${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "?"}`,
              ].join("\n")}
            </pre>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 justify-center"
              onClick={() => {
                void navigator.clipboard.writeText(`ปัญหาคลิป:\nlessonId: ${lessonId}\nvideoId: ${videoId}\nposition: ${Math.floor(position)}s/${durationSec}s\nwatched: ${watchedPercent}%\nstatus: ${status.kind}\n`);
                toast({ title: "คัดลอกรายงานแล้ว", description: "กรุณาส่งข้อมูลนี้ให้ผู้ดูแลระบบ" });
                setReportOpen(false);
              }}
            >
              <ClipboardCopy className="h-4 w-4" /> คัดลอกรายงาน
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_TONE = {
  idle: "bg-muted-foreground/50",
  buffering: "bg-blue-400 animate-pulse",
  recording: "bg-success",
  paused: "bg-warning",
  "focus-paused": "bg-warning",
  superseded: "bg-destructive",
  offline: "bg-warning",
  broken: "bg-destructive",
  completed: "bg-success",
} as const;

function StatusBar({
  status, confirming, free, watchedCount, totalChunks, watchedPercent, minPercent, onTakeOver,
}: {
  status: Status; confirming: boolean; free: boolean; watchedCount: number; totalChunks: number; watchedPercent: number; minPercent: number; onTakeOver: () => void;
}) {
  const progress = free ? `ดูแล้ว ${watchedCount}/${totalChunks} ช่วง` : `ดูแล้ว ${watchedPercent}% (เกณฑ์ ${minPercent}%)`;
  const text: Record<Status["kind"], string> = {
    idle: "กดเล่นเพื่อเริ่มนับเวลาเรียน",
    buffering: `กำลังโหลดวิดีโอ · ${progress}`,
    recording: `กำลังนับเวลาเรียน · ${progress}`,
    paused: `หยุดชั่วคราว · ${progress}`,
    "focus-paused": "หยุดให้อัตโนมัติเพราะสลับไปหน้าอื่น — กดเล่นเพื่อเรียนต่อ",
    superseded: "มีการเปิดบทเรียนในหน้าต่างอื่น หน้านี้จึงหยุดนับเวลา",
    offline: "การเชื่อมต่อขาดหาย — ระบบจะนับต่อให้เมื่อกลับมาออนไลน์",
    broken: "วิดีโอนี้ไม่พร้อมใช้งาน ระบบแจ้งผู้สอนแล้ว",
    completed: confirming ? "กำลังยืนยันผลการดู…" : "ดูคลิปนี้ครบตามเกณฑ์แล้ว",
  };
  return (
    <div aria-live="polite" className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2.5 text-xs text-foreground lg:border-b-0 lg:border-t">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {status.kind === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-75" />}
          <span className={cn("relative h-2.5 w-2.5 rounded-full", STATUS_TONE[status.kind])} />
        </span>
        <span className="truncate font-medium">{text[status.kind]}</span>
      </div>
      {status.kind === "superseded" && (
        <button type="button" onClick={onTakeOver} className="shrink-0 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          เรียนต่อที่หน้าต่างนี้
        </button>
      )}
    </div>
  );
}

function LessonChecklist({
  free, completed, watchedPercent, minPercent, gapsLeft, watchedEnough, onJump, checkpoint, onGoToCheckpoint, lessonTest,
}: {
  free: boolean;
  completed: boolean;
  watchedPercent: number;
  minPercent: number;
  gapsLeft: number;
  watchedEnough: boolean;
  onJump: () => void;
  checkpoint: { atSec: number; passed: boolean } | null;
  onGoToCheckpoint: () => void;
  lessonTest: Props["lessonTest"];
}) {
  const videoDone = completed || watchedEnough;
  const items: Array<{ done: boolean; label: string; detail: string; action?: React.ReactNode }> = [
    {
      done: videoDone,
      label: free ? "ดูคลิปให้ครบทุกช่วง" : `ดูคลิปอย่างน้อย ${minPercent}%`,
      detail: videoDone ? "ครบแล้ว" : free ? `ดูแล้ว ${watchedPercent}% · เหลือ ${gapsLeft} ช่วง` : `ดูแล้ว ${watchedPercent}%`,
      action: free && !videoDone ? (
        <button type="button" onClick={onJump} className="text-xs font-medium text-primary hover:underline">ไปยังช่วงที่ยังไม่ได้ดู</button>
      ) : undefined,
    },
  ];
  if (checkpoint) {
    items.push({
      done: checkpoint.passed,
      label: "ตอบคำถามระหว่างคลิป",
      detail: checkpoint.passed ? "ตอบถูกแล้ว" : `อยู่ที่นาที ${clock(checkpoint.atSec)}`,
      action: !checkpoint.passed ? (
        <button type="button" onClick={onGoToCheckpoint} className="text-xs font-medium text-primary hover:underline">ไปที่คำถาม</button>
      ) : undefined,
    });
  }
  if (lessonTest) {
    items.push({
      done: lessonTest.done,
      label: "ทำแบบทดสอบท้ายคลิป",
      detail: lessonTest.done
        ? lessonTest.bestScore !== null ? `ทำแล้ว · คะแนน ${Math.round(lessonTest.bestScore)}%` : "ทำแล้ว"
        : lessonTest.available ? "พร้อมให้ทำ" : "เปิดเมื่อดูคลิปครบ",
      action: lessonTest.available && !lessonTest.done ? (
        <Link href={lessonTest.href} className="text-xs font-medium text-primary hover:underline">ทำแบบทดสอบ</Link>
      ) : undefined,
    });
  }
  return (
    <div className="border-b bg-card px-4 py-3 lg:border-b-0 lg:border-t">
      <p className="mb-2 text-xs font-semibold text-muted-foreground">สิ่งที่ต้องทำในคลิปนี้</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-sm">
            {item.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0">
              <span className={cn("block font-medium", item.done && "text-muted-foreground")}>{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.detail}</span>
              {item.action}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
