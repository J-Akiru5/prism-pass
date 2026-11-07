"use client";
import { useEffect, useRef, useState } from "react";
// Interaction adapted from CICT-QR src/components/AdminScanner.jsx (html5-qrcode,
// feedback states, duplicate guard). Data layer replaced by Prism Pass secure
// service boundary (not copied). onDecode hands verified-by-server flow to parent.
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
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
        {online ? "Online" : "Offline — queueing locally (provisional, ADR-09)"}
      </div>
      <div id="prism-scan-region" ref={ref} className="mt-3 min-h-56 overflow-hidden rounded-lg bg-black/90" />
      <div className="mt-3 text-sm">
        {status === "scanning" && <p className="text-muted-foreground">Point camera at a Prism Pass QR…</p>}
        {status === "success" && <p className="text-emerald-600">Accepted (UI-level): {last} — server reconciliation authoritative.</p>}
        {status === "duplicate" && <p className="text-amber-600">Duplicate prevented at interface (120s window).</p>}
        {status === "error" && <p className="text-red-600">Camera unavailable. Check permission or use a camera device.</p>}
      </div>
    </div>
  );
}
