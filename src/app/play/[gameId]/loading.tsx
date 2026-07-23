export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-900">
      <div className="fair-spinner" />
      <p className="text-xs font-bold tracking-[0.3em] text-muted uppercase">
        Warming up the booth…
      </p>
    </div>
  );
}
