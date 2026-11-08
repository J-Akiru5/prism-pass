"use client";
import { useEffect, useRef, useState } from "react";

export function ScannerViewport({ onDecode }: { onDecode?: (decoded: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "success" | "error" | "duplicate">("idle");
  const [last, setLast] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const seen = useRef<Set<string>>(new Set());
  const cb = useRef(onDecode);
  cb.current = onDecode;
  useEffect(() => {
    const fn = () => setOnline(navigator.onLine);
    window.addEventListener("online", fn);
    window.addEventListener("offline", fn);
    return () => { window.removeEventListener("online", fn); window.removeEventListener("offline", fn); };
  }, []);
  useEffect(() => {
    let scanner: { stop: () => Promise<void> } | null = null;
    let cancelled = false;
    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !ref.current) return;
        const s = new Html5Qrcode("prism-scan-region");
        scanner = s;
        setStatus("scanning");
        await s.start({ facingMode: "environment" }, { fps: 10, qrbox: 250 }, (decoded: string) => {
          if (seen.current.has(decoded)) { setStatus("duplicate"); return; }
          seen.current.add(decoded);
          setLast(decoded);
          setStatus("success");
          cb.current?.(decoded);
          setTimeout(() => setStatus("scanning"), 1500);
        }, () => {});
      } catch { setStatus("error"); }
    }
    start();
    return () => { cancelled = true; scanner?.stop().catch(() => {}); };
  }, []);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">Camera</p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
          <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
          {online ? "Online" : "Offline"}
        </span>
      </div>
      <div className="relative bg-slate-950">
        <div id="prism-scan-region" ref={ref} className="min-h-56 overflow-hidden" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-4">
          <span className="absolute left-0 top-0 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-white" />
          <span className="absolute right-0 top-0 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-white" />
          <span className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-white" />
          <span className="absolute bottom-0 right-0 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-white" />
        </div>
      </div>
      <div className="px-4 py-3 text-sm" role="status">
        {status === "scanning" && <p className="text-slate-500">Point the camera at the pass QR — hold steady inside the frame.</p>}
        {status === "success" && <p className="font-medium text-emerald-700">Scanned: <span className="break-all font-mono text-xs">{last}</span></p>}
        {status === "duplicate" && <p className="font-medium text-amber-700">Duplicate scan ignored.</p>}
        {status === "error" && <p className="font-medium text-slate-600">Camera unavailable. Use manual entry below.</p>}
        {status === "idle" && <p className="text-slate-500">Starting camera…</p>}
      </div>
    </div>
  );
}
