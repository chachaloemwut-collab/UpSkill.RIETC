"use client";

import { useState } from "react";
import { ImageDown, Printer } from "lucide-react";
import { Button, useToast } from "@/components/ui";

const MAX_ROWS = 300; // keeps the canvas under mobile Safari's size limits

/**
 * Draws the report table onto a canvas and downloads it as a PNG (no library, nothing leaves the browser).
 * Uses the page's own Thai font so the image matches the screen.
 */
export function ReportImageButton({ title, subtitle, columns, rows, fileName }: { title: string; subtitle: string; columns: readonly string[]; rows: string[][]; fileName: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      await document.fonts?.ready;
      const family = getComputedStyle(document.body).fontFamily || "sans-serif";
      const data = rows.slice(0, MAX_ROWS);
      const scale = 2;
      const pad = 12;
      const rowH = 30;
      const headH = 34;
      const canvas = document.createElement("canvas");
      const g = canvas.getContext("2d");
      if (!g) throw new Error("canvas unavailable");

      // Column widths from the widest cell (capped), measured with the real font
      g.font = `600 13px ${family}`;
      const widths = columns.map((c) => g.measureText(c).width);
      g.font = `13px ${family}`;
      for (const r of data) r.forEach((cell, i) => (widths[i] = Math.min(Math.max(widths[i] ?? 0, g.measureText(cell).width), 280)));
      const colW = widths.map((w) => Math.ceil(w) + pad * 2);
      const width = Math.max(colW.reduce((a, b) => a + b, 0), 600);
      const top = 76;
      const height = top + headH + data.length * rowH + (rows.length > MAX_ROWS ? 40 : 16);

      canvas.width = width * scale;
      canvas.height = height * scale;
      g.scale(scale, scale);
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, width, height);
      g.fillStyle = "#111827";
      g.font = `600 18px ${family}`;
      g.fillText(title, pad, 30);
      g.fillStyle = "#6b7280";
      g.font = `13px ${family}`;
      g.fillText(subtitle, pad, 54);

      const cellText = (text: string, x: number, y: number, w: number) => {
        let t = text;
        while (t.length > 1 && g.measureText(t).width > w - pad * 2) t = t.slice(0, -2) + "…";
        g.fillText(t, x + pad, y);
      };
      // Header
      g.fillStyle = "#1e3a8a";
      g.fillRect(0, top, width, headH);
      g.fillStyle = "#ffffff";
      g.font = `600 13px ${family}`;
      let x = 0;
      columns.forEach((c, i) => { cellText(c, x, top + 22, colW[i]!); x += colW[i]!; });
      // Rows
      g.font = `13px ${family}`;
      data.forEach((r, ri) => {
        const y = top + headH + ri * rowH;
        g.fillStyle = ri % 2 ? "#f3f4f6" : "#ffffff";
        g.fillRect(0, y, width, rowH);
        g.fillStyle = "#111827";
        let cx = 0;
        r.forEach((cell, i) => { cellText(cell, cx, y + 20, colW[i]!); cx += colW[i]!; });
      });
      g.strokeStyle = "#e5e7eb";
      g.strokeRect(0.5, top + 0.5, width - 1, headH + data.length * rowH - 1);
      if (rows.length > MAX_ROWS) {
        g.fillStyle = "#b45309";
        g.fillText(`แสดง ${MAX_ROWS} จาก ${rows.length} รายการ — ดาวน์โหลด Excel (CSV) เพื่อดูทั้งหมด`, pad, height - 14);
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("png failed");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      toast({ title: "สร้างภาพไม่สำเร็จ", description: "ลองใช้การพิมพ์ / บันทึกเป็น PDF แทน", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" loading={busy} onClick={() => void download()} disabled={rows.length === 0}>
      <ImageDown className="h-4 w-4" /> ดาวน์โหลดเป็นภาพ (PNG)
    </Button>
  );
}

/** Browser print dialog (choose "Save as PDF" to keep a file); print CSS hides the app chrome. */
export function PrintReportButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> พิมพ์ / บันทึกเป็น PDF
    </Button>
  );
}
