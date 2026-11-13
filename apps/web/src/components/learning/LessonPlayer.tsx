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
import { Maximize, Minimize } from "lucide-react";
import { PlayPauseIcon, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { HEARTBEAT } from "@upskill/core/heartbeat";
import { REPORTABLE_PLAYER_ERRORS } from "@upskill/core/youtube";
import { loadYouTubeIframeApi, YT_STATE, type YTPlayer } from "./youtube-iframe-api";

type Status =
  | { kind: "idle" }
  | { kind: "recording"; watchedPercent: number; minPercent: number }
  | { kind: "paused" }
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

export function LessonPlayer({ lessonId, videoId, durationSec, initialMaxWatchedSec, minWatchPercentage, initiallyCompleted }: Props) {
  const router = useRouter();
  const completedRef = useRef(initiallyCompleted);
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const tokenRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const maxWatchedRef = useRef(initialMaxWatchedSec);

  const [status, setStatus] = useState<Status>(initiallyCompleted ? { kind: "completed" } : { kind: "idle" });
  const [position, setPosition] = useState(0);
  const [maxWatched, setMaxWatched] = useState(initialMaxWatchedSec);
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [ready, setReady] = useState(false);

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
              setStatus({ kind: "paused" });
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
      if (p) setPosition(p.getCurrentTime());
    }, 500);
    return () => {
      clearInterval(hb);
      clearInterval(ui);
    };
  }, [sendHeartbeat]);

  // Spec 3.1 #3: use visibilityState (not blur) so iPad Split View keeps playing
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") playerRef.current?.pauseVideo();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const seek = (targetSec: number) => {
    const p = playerRef.current;
    if (!p) return;
    if (targetSec > maxWatchedRef.current + HEARTBEAT.POSITION_TOLERANCE_SEC) {
      toast({ title: "ไม่สามารถกรอข้ามเนื้อหาที่ยังไม่เคยรับชมได้", description: "กรอย้อนกลับไปดูส่วนที่ดูแล้วได้ตามต้องการ" });
      return;
    }
    p.seekTo(targetSec, true);
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

  const pct = (s: number) => `${Math.min(100, (s / durationSec) * 100)}%`;
  const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  return (
    <div className="bg-black">
      <div ref={containerRef} className={pseudoFullscreen ? "fixed inset-0 z-50 flex flex-col justify-center bg-black" : "relative"}>
        <div className="relative aspect-video w-full">
          <div ref={hostRef} className="absolute inset-0 h-full w-full" />
        </div>

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

          <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-white/70 sm:block">{clock(position)}</span>
          <div
            role="slider"
            aria-label="ตำแหน่งวิดีโอ"
            aria-valuemin={0}
            aria-valuemax={durationSec}
            aria-valuenow={Math.floor(position)}
            tabIndex={0}
            className="group relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20 transition-[height] hover:h-2.5"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * durationSec);
            }}
          >
            {/* lighter band = how far you may seek (already watched) */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/35" style={{ width: pct(maxWatched) }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: pct(position) }} />
          </div>
          <span className="hidden w-12 shrink-0 text-xs tabular-nums text-white/70 sm:block">{clock(durationSec)}</span>

          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-[background-color,scale] hover:bg-white/10 active:scale-90"
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
  superseded: "bg-destructive",
  offline: "bg-warning",
  broken: "bg-destructive",
  completed: "bg-success",
} as const;

function StatusBar({ status }: { status: Status }) {
  const text: Record<Status["kind"], string> = {
    idle: "กดเล่นเพื่อเริ่มบันทึกเวลาเรียน",
    recording: status.kind === "recording" ? `กำลังบันทึกเวลาเรียน · ดูแล้ว ${status.watchedPercent}% (เกณฑ์ผ่าน ${status.minPercent}%)` : "",
    paused: "หยุดเล่นชั่วคราว — กดเล่นต่อเพื่อเก็บเวลาเรียน",
    superseded: "ตรวจพบการเปิดเรียนในหน้าต่างอื่น — หน้าต่างนี้หยุดนับเวลาแล้ว",
    offline: "การเชื่อมต่อขาดหาย — ระบบจะบันทึกต่อเมื่อกลับมาออนไลน์",
    broken: "วิดีโอนี้ไม่พร้อมใช้งาน ระบบแจ้งผู้สอนแล้ว",
    completed: "เรียนบทนี้ครบตามเกณฑ์แล้ว",
  };
  return (
    <p aria-live="polite" className="flex items-center gap-2.5 border-b bg-background px-4 py-2.5 text-sm text-foreground lg:border-b-0 lg:border-t">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        {status.kind === "recording" && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-60" />}
        <span className={cn("relative h-2.5 w-2.5 rounded-full", STATUS_TONE[status.kind])} />
      </span>
      {text[status.kind]}
    </p>
  );
}
