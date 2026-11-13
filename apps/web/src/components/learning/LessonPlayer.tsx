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
  const [toast, setToast] = useState<string | null>(null);
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
            if (e.data === YT_STATE.PLAYING) {
              if (!tokenRef.current) {
                try {
                  await startSession();
                } catch {
                  e.target.pauseVideo();
                  setToast("ไม่สามารถเริ่มบันทึกเวลาเรียนได้");
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
  }, [videoId, lessonId, startSession, sendHeartbeat, minWatchPercentage]);

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
      setToast("ไม่สามารถกรอข้ามเนื้อหาที่ยังไม่เคยรับชมได้");
      setTimeout(() => setToast(null), 2500);
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

  return (
    <div className="bg-black">
      <div
        ref={containerRef}
        className={pseudoFullscreen ? "fixed inset-0 z-50 flex flex-col bg-black" : "relative"}
      >
        <div className="relative aspect-video w-full">
          <div ref={hostRef} className="absolute inset-0 h-full w-full" />
        </div>

        <div className="flex items-center gap-3 bg-neutral-900 px-3 py-2 text-white">
          <button
            type="button"
            disabled={!ready}
            aria-label={ready ? "เล่น/หยุด" : "กำลังโหลดวิดีโอ"}
            className="rounded px-2 py-1 hover:bg-white/10 disabled:opacity-40"
            onClick={() => {
              const p = playerRef.current;
              if (!p) return;
              if (p.getPlayerState() === YT_STATE.PLAYING) p.pauseVideo();
              else p.playVideo();
            }}
          >
            ⏯
          </button>

          <div
            role="slider"
            aria-label="ตำแหน่งวิดีโอ"
            aria-valuemin={0}
            aria-valuemax={durationSec}
            aria-valuenow={Math.floor(position)}
            tabIndex={0}
            className="relative h-2 flex-1 cursor-pointer rounded bg-white/20"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              seek(((e.clientX - r.left) / r.width) * durationSec);
            }}
          >
            <div className="absolute inset-y-0 left-0 rounded bg-green-500/60" style={{ width: pct(maxWatched) }} />
            <div className="absolute inset-y-0 left-0 rounded bg-white" style={{ width: pct(position) }} />
          </div>

          <button type="button" className="rounded px-2 py-1 hover:bg-white/10" onClick={toggleFullscreen} aria-label="เต็มจอ">
            ⛶
          </button>
        </div>
      </div>

      <StatusBar status={status} />
      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-4 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-center text-sm text-white">
          {toast}
        </div>
      )}
    </div>
  );
}

function StatusBar({ status }: { status: Status }) {
  const map: Record<Status["kind"], [string, string]> = {
    idle: ["⚪", "กดเล่นเพื่อเริ่มบันทึกเวลาเรียน"],
    recording: ["🟢", status.kind === "recording" ? `กำลังบันทึกเวลาเรียนปกติ (ดูแล้ว ${status.watchedPercent}% / เกณฑ์ผ่าน ${status.minPercent}%)` : ""],
    paused: ["🟡", "หยุดเล่นชั่วคราว — กรุณากดเล่นต่อเพื่อเก็บเวลาเรียน"],
    superseded: ["🔴", "ตรวจพบการเปิดเรียนในหน้าต่างอื่น — หน้าต่างนี้ถูกหยุดการนับเวลา"],
    offline: ["🟠", "การเชื่อมต่อขาดหาย — ระบบจะบันทึกต่อเมื่อกลับมาออนไลน์"],
    broken: ["🔴", "วิดีโอนี้ไม่พร้อมใช้งาน ระบบแจ้งผู้สอนแล้ว"],
    completed: ["✅", "เรียนบทนี้ครบตามเกณฑ์แล้ว"],
  };
  const [icon, text] = map[status.kind];
  return (
    <p aria-live="polite" className="border-b bg-white px-3 py-2 text-sm text-neutral-700">
      {icon} {text}
    </p>
  );
}
