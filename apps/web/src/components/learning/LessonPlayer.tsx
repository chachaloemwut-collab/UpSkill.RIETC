"use client";
/**
 * Custom YouTube player (spec 5.2 frontend)
 *
 * Important: everything here is "UX guidance", not "security". Users can open DevTools and bypass it all.
 * The real security lives in the server's evaluateHeartbeat(), which bounds credit by wall-clock time
 * and credits only content contiguous with the frontier.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize, Minimize, CircleHelp, HelpCircle, Tv } from "lucide-react";
import { PlayPauseIcon, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { HEARTBEAT } from "@upskill/core/heartbeat";
import { REPORTABLE_PLAYER_ERRORS } from "@upskill/core/youtube";
import { loadYouTubeIframeApi, YT_STATE, type YTPlayer } from "./youtube-iframe-api";

type Status =
  | { kind: "idle" }
  | { kind: "recording"; watchedPercent: number; minPercent: number }
  | { kind: "paused" }
  | { kind: "focus-paused" }
  | { kind: "superseded" }
  | { kind: "offline" }
  | { kind: "broken" }
  | { kind: "completed" };

interface Props {
  lessonId: string;
  videoId: string;
  durationSec: number;
  initialMaxWatchedSec: number;
  minWatchPercentage: number;
  initiallyCompleted: boolean;
  checkpoint: { question: string; options: string[]; atSec: number } | null;
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

export function LessonPlayer({ lessonId, videoId, durationSec, initialMaxWatchedSec, minWatchPercentage, initiallyCompleted, checkpoint }: Props) {
  const router = useRouter();
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
  const checkpointPassedRef = useRef(false);
  const checkpointOpenRef = useRef(false);

  const [status, setStatus] = useState<Status>(initiallyCompleted ? { kind: "completed" } : { kind: "idle" });
  const [position, setPosition] = useState(0);
  const [maxWatched, setMaxWatched] = useState(initialMaxWatchedSec);
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [ready, setReady] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);
  const [checkpointBusy, setCheckpointBusy] = useState(false);

  const startSession = useCallback(async () => {
    const res = await postJson(`/api/learning/lessons/${lessonId}/start-session`);
    if (!res.ok) throw new Error(`start-session ${res.status}`);
    const data = (await res.json()) as { streamToken: string; maxWatchedSec: number };
    tokenRef.current = data.streamToken;
    seqRef.current = 0;
    maxWatchedRef.current = Math.max(maxWatchedRef.current, data.maxWatchedSec);
    setMaxWatched(maxWatchedRef.current);
  }, [lessonId]);

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
      const data = (await res.json()) as { maxWatchedSec?: number; watchedPercent?: number; isCompleted?: boolean };
      if (typeof data.maxWatchedSec === "number") {
        maxWatchedRef.current = data.maxWatchedSec;
        setMaxWatched(data.maxWatchedSec);
      }
      setStatus(
        data.isCompleted
          ? { kind: "completed" }
          : { kind: "recording", watchedPercent: data.watchedPercent ?? 0, minPercent: minWatchPercentage },
      );
      if (data.isCompleted && !completedRef.current) {
        completedRef.current = true;
        router.refresh(); // re-render the server parts (lesson list, "next lesson" button)
      }
    } catch {
      setStatus({ kind: "offline" }); // network dropped: the next ping catches up within GRACE_SEC
    }
  }, [lessonId, minWatchPercentage, router]);

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
        playerVars: { controls: 0, disablekb: 1, rel: 0, playsinline: 1, fs: 0, iv_load_policy: 3, origin: window.location.origin },
        events: {
          onReady: (e) => {
            if (disposed) return;
            playerRef.current = e.target;
            setReady(true);
          },
          onStateChange: async (e) => {
            setPlaying(e.data === YT_STATE.PLAYING);
            if (e.data === YT_STATE.PLAYING) {
              focusPauseRef.current = false;
              if (!tokenRef.current) {
                try {
                  await startSession();
                } catch {
                  e.target.pauseVideo();
                  toast({ title: "ไม่สามารถเริ่มบันทึกเวลาเรียนได้", description: "กรุณาลองใหม่อีกครั้ง", variant: "destructive" });
                  return;
                }
              }
              setStatus((s) => (s.kind === "recording" ? s : { kind: "recording", watchedPercent: 0, minPercent: minWatchPercentage }));
            } else if (e.data === YT_STATE.PAUSED) {
              setStatus({ kind: focusPauseRef.current ? "focus-paused" : "paused" });
              void sendHeartbeat();
            } else if (e.data === YT_STATE.ENDED) {
              // Wait past MIN_INTERVAL so the final ping isn't ignored as TOO_FREQUENT
              setTimeout(() => void sendHeartbeat(), HEARTBEAT.MIN_INTERVAL_SEC * 1000 + 100);
            }
          },
          onPlaybackRateChange: (e) => {
            if (e.data !== 1) e.target.setPlaybackRate(1);
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
      created?.destroy();
      playerRef.current = null;
    };
  }, [videoId, lessonId, startSession, sendHeartbeat, minWatchPercentage, toast]);

  // Heartbeat every 10s while PLAYING + update the progress bar
  useEffect(() => {
    const hb = setInterval(() => {
      if (playerRef.current?.getPlayerState() === YT_STATE.PLAYING) void sendHeartbeat();
    }, HEARTBEAT.INTERVAL_SEC * 1000);
    const ui = setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      const t = p.getCurrentTime();
      setPosition(t);
      // In-video checkpoint: pause and ask once the playhead reaches it (until answered correctly).
      if (checkpoint && !checkpointPassedRef.current && !checkpointOpenRef.current && t >= checkpoint.atSec) {
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

  const seek = useCallback((targetSec: number) => {
    const p = playerRef.current;
    if (!p) return;
    if (targetSec > maxWatchedRef.current + HEARTBEAT.POSITION_TOLERANCE_SEC) {
      toast({ title: "ไม่สามารถกรอข้ามเนื้อหาที่ยังไม่เคยรับชมได้", description: "กรอย้อนกลับไปดูส่วนที่ดูแล้วได้ตามต้องการ" });
      return;
    }
    p.seekTo(targetSec, true);
  }, [toast]);

  const submitCheckpoint = async (optionIndex: number) => {
    setCheckpointBusy(true);
    setCheckpointError(null);
    try {
      const res = await postJson(`/api/learning/lessons/${lessonId}/checkpoint`, { option_index: optionIndex });
      const data = (await res.json()) as { correct?: boolean };
      if (data.correct) {
        checkpointPassedRef.current = true;
        checkpointOpenRef.current = false;
        setCheckpointOpen(false);
        playerRef.current?.playVideo();
        setPlaying(true);
      } else {
        setCheckpointError("คำตอบไม่ถูกต้อง ลองอีกครั้ง");
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
    if (root) {
      root.dataset.theater = next ? "true" : "false";
    }
  };

  // Keyboard Shortcuts HUD (UI-only, routing through existing seek and player methods)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;
      const p = playerRef.current;
      if (!p || !ready) return;

      if (e.code === "Space" || e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (p.getPlayerState() === YT_STATE.PLAYING) p.pauseVideo();
        else p.playVideo();
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggleFullscreen();
      } else if (e.key.toLowerCase() === "j" || e.key === "ArrowLeft") {
        e.preventDefault();
        seek(Math.max(0, p.getCurrentTime() - 10));
      } else if (e.key.toLowerCase() === "l" || e.key === "ArrowRight") {
        e.preventDefault();
        seek(Math.min(durationSec, p.getCurrentTime() + 10));
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ready, durationSec, seek]);

  const pct = (s: number) => `${Math.min(100, (s / durationSec) * 100)}%`;
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  return (
    <div className="bg-black">
      <div ref={containerRef} className={pseudoFullscreen ? "fixed inset-0 z-50 flex flex-col justify-center bg-black" : "relative"}>
        <div className="relative aspect-video w-full">
          <div ref={hostRef} className="absolute inset-0 h-full w-full" />
          
          {/* Glassmorphic Checkpoint Modal */}
          {checkpointOpen && checkpoint && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-fade-in">
              <div className="w-full max-w-md rounded-2xl border border-white/20 bg-background/95 p-6 text-foreground shadow-2xl backdrop-blur-xl animate-zoom-in">
                <div className="flex items-center gap-2 text-primary font-semibold text-base mb-1">
                  <CircleHelp className="h-5 w-5" /> คำถามวัดความเข้าใจระหว่างเรียน
                </div>
                <p className="mt-2 mb-4 text-sm font-medium leading-relaxed">{checkpoint.question}</p>
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
                {checkpointError && <p className="mt-3 text-xs font-medium text-destructive">{checkpointError}</p>}
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts Popover Modal */}
          {shortcutsOpen && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in" onClick={() => setShortcutsOpen(false)}>
              <div className="w-full max-w-sm rounded-xl border border-white/20 bg-zinc-950/95 p-5 text-white shadow-2xl backdrop-blur-md animate-zoom-in" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4 text-primary" /> คีย์ลัดเครื่องเล่นวิดีโอ
                  </p>
                  <button type="button" onClick={() => setShortcutsOpen(false)} className="text-xs text-white/60 hover:text-white">✕</button>
                </div>
                <div className="grid gap-2.5 pt-3 text-xs">
                  <div className="flex justify-between items-center"><span className="text-white/70">เล่น / หยุดชั่วคราว</span><span className="font-mono bg-white/10 px-2 py-0.5 rounded">Space / K</span></div>
                  <div className="flex justify-between items-center"><span className="text-white/70">เต็มจอ</span><span className="font-mono bg-white/10 px-2 py-0.5 rounded">F</span></div>
                  <div className="flex justify-between items-center"><span className="text-white/70">ถอยหลัง 10 วินาที</span><span className="font-mono bg-white/10 px-2 py-0.5 rounded">J / ←</span></div>
                  <div className="flex justify-between items-center"><span className="text-white/70">เดินหน้า 10 วินาที</span><span className="font-mono bg-white/10 px-2 py-0.5 rounded">L / →</span></div>
                  <div className="flex justify-between items-center"><span className="text-white/70">เปิด/ปิด คู่มือคีย์ลัด</span><span className="font-mono bg-white/10 px-2 py-0.5 rounded">?</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Player Controls Bar */}
        <div className="flex items-center gap-3 bg-zinc-950 px-3 py-2 text-white">
          <button
            type="button"
            disabled={!ready}
            aria-label={!ready ? "กำลังโหลดวิดีโอ" : playing ? "หยุดชั่วคราว" : "เล่น"}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] hover:bg-white/10 active:scale-90 disabled:opacity-40"
            onClick={() => {
              const p = playerRef.current;
              if (!p) return;
              if (p.getPlayerState() === YT_STATE.PLAYING) p.pauseVideo();
              else p.playVideo();
            }}
          >
            <PlayPauseIcon playing={playing} className="h-5 w-5" />
          </button>

          <span className="hidden w-12 shrink-0 text-right font-mono text-xs tabular-nums text-white/80 sm:block">{clock(position)}</span>

          {/* 3-Layer Interactive Scrubber with Checkpoint Markers and Hover Tooltip */}
          <div
            role="slider"
            aria-label="ตำแหน่งวิดีโอ"
            aria-valuemin={0}
            aria-valuemax={durationSec}
            aria-valuenow={Math.floor(position)}
            tabIndex={0}
            className="group relative h-2 flex-1 cursor-pointer rounded-full bg-white/20 transition-[height] hover:h-3"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * durationSec);
            }}
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const sec = Math.max(0, Math.min(durationSec, ((e.clientX - r.left) / r.width) * durationSec));
              setHoverTime(sec);
              setHoverX(e.clientX - r.left);
            }}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Layer 1: Allowed seek frontier band (maxWatched) */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/40 transition-[width] duration-300" style={{ width: pct(maxWatched) }} />
            {/* Layer 2: Current playback head bar */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: pct(position) }} />
            
            {/* Layer 3: Interactive Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 -ml-1.75 rounded-full bg-primary border-2 border-white shadow-md transition-transform scale-0 group-hover:scale-100"
              style={{ left: pct(position) }}
            />

            {/* Checkpoint pin marker on timeline */}
            {checkpoint && (
              <div
                title={`คำถามระหว่างเรียน ณ นาทีที่ ${clock(checkpoint.atSec)}`}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 flex items-center justify-center"
                style={{ left: pct(checkpoint.atSec) }}
              >
                <span className="h-3 w-3 rounded-full bg-amber-400 border-2 border-zinc-950 shadow-xs transition-transform hover:scale-125" />
              </div>
            )}

            {/* Floating time tooltip on hover */}
            {hoverTime !== null && (
              <div
                className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded bg-zinc-900 border border-white/20 px-1.5 py-0.5 font-mono text-[10px] text-white shadow-md tabular-nums backdrop-blur"
                style={{ left: hoverX }}
              >
                {clock(hoverTime)}
              </div>
            )}
          </div>

          <span className="hidden w-12 shrink-0 font-mono text-xs tabular-nums text-white/80 sm:block">{clock(durationSec)}</span>

          {/* Keyboard HUD Button */}
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] hover:bg-white/10 active:scale-90 text-white/80 hover:text-white"
            onClick={() => setShortcutsOpen((v) => !v)}
            aria-label="คู่มือคีย์ลัด (?)"
            title="คู่มือคีย์ลัด (?)"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Theater Mode Button */}
          <button
            type="button"
            className={cn(
              "hidden lg:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] hover:bg-white/10 active:scale-90 text-white/80 hover:text-white",
              theaterMode && "text-primary"
            )}
            onClick={toggleTheater}
            aria-label={theaterMode ? "ออกจากโหมดโรงภาพยนตร์" : "โหมดโรงภาพยนตร์ (Theater Mode)"}
            title={theaterMode ? "ขนาดปกติ" : "โหมดโรงภาพยนตร์"}
          >
            <Tv className="h-4 w-4" />
          </button>

          {/* Fullscreen Button */}
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] hover:bg-white/10 active:scale-90 text-white/80 hover:text-white"
            onClick={toggleFullscreen}
            aria-label="เต็มจอ"
          >
            {pseudoFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <StatusBar status={status} />
    </div>
  );
}

const STATUS_TONE = {
  idle: "bg-muted-foreground/50",
  recording: "bg-success",
  paused: "bg-warning",
  "focus-paused": "bg-destructive",
  superseded: "bg-destructive",
  offline: "bg-warning",
  broken: "bg-destructive",
  completed: "bg-success",
} as const;

function StatusBar({ status }: { status: Status }) {
  const text: Record<Status["kind"], string> = {
    idle: "กดเล่นเพื่อเริ่มบันทึกเวลาเรียนแบบเรียลไทม์",
    recording: status.kind === "recording" ? `กำลังบันทึกเวลาเรียนจริง · ดูแล้ว ${status.watchedPercent}% (เกณฑ์ผ่าน ${status.minPercent}%)` : "",
    paused: "หยุดเล่นชั่วคราว — กดเล่นต่อเพื่อสะสมเวลาเรียน",
    "focus-paused": "ระบบหยุดชั่วคราวเนื่องจากสลับแท็บหรือลดขนาดหน้าต่าง — กลับมาที่หน้านี้แล้วกดเล่นต่อ",
    superseded: "ตรวจพบการเปิดเรียนในหน้าต่างอื่น — หน้าต่างนี้หยุดนับเวลาแล้ว",
    offline: "การเชื่อมต่อขาดหาย — ระบบจะกลับมาบันทึกต่อเมื่อออนไลน์",
    broken: "วิดีโอนี้ไม่พร้อมใช้งาน ระบบแจ้งผู้สอนแล้ว",
    completed: "เรียนบทนี้ครบตามเกณฑ์มาตรฐานแล้ว",
  };
  return (
    <div aria-live="polite" className="flex items-center justify-between border-b bg-card px-4 py-2.5 text-xs text-foreground lg:border-b-0 lg:border-t">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {status.kind === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-75" />}
          <span className={cn("relative h-2.5 w-2.5 rounded-full", STATUS_TONE[status.kind])} />
        </span>
        <span className="truncate font-medium">{text[status.kind]}</span>
      </div>
      {status.kind === "recording" && (
        <span className="hidden sm:inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success font-mono tabular-nums shrink-0">
          ● Live Telemetry
        </span>
      )}
    </div>
  );
}
