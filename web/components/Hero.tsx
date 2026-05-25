export function Hero() {
  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        What r/WallStreetBets is buzzing about — rated by AI
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-400">
        Tickers pulled from r/WallStreetBets, scored on sentiment and rated by Claude.
        Updated daily · last 90 days.
      </p>
      <p className="mt-2 text-[0.65rem] uppercase tracking-wider text-neutral-600">
        Sources: Reddit · Finnhub · Claude
      </p>
    </section>
  );
}
