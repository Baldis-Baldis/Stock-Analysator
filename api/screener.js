import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const r = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : null);

export default async function handler(req, res) {
  const type = req.query.type === "growth" ? "growth" : "large";
  const scrId = type === "growth" ? "undervalued_growth_stocks" : "undervalued_large_caps";

  let lastErr = "";
  // 2 pokusy – Yahoo screener občas selže jednorázově
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await yahooFinance.screener(
        { scrIds: scrId, count: 25 },
        { validateResult: false }
      );
      const quotes = (result.quotes || [])
        .filter((q) => q.trailingPE || q.forwardPE)
        .map((q) => ({
          ticker: q.symbol,
          name: q.shortName || q.longName || q.symbol,
          price: r(q.regularMarketPrice),
          currency: q.currency || "",
          marketCap: q.marketCap ?? null,
          pe: r(q.trailingPE),
          fwdPe: r(q.forwardPE),
          pb: r(q.priceToBook),
          divYield: r(q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : null),
        }))
        .sort((a, b) => (a.fwdPe ?? a.pe ?? 999) - (b.fwdPe ?? b.pe ?? 999))
        .slice(0, 10);

      if (quotes.length) {
        res.setHeader("Cache-Control", "s-maxage=900");
        return res.status(200).json({
          title: type === "growth" ? "Podhodnocené růstové akcie" : "Podhodnocené velké firmy",
          source: "Yahoo Finance screener (živá data)",
          stocks: quotes,
        });
      }
      lastErr = "Yahoo screener vrátil prázdný seznam";
    } catch (e) {
      lastErr = e.message || String(e);
    }
  }

  // Žádný fallback – radši jasně řekni, že aktuální data nejsou k dispozici
  return res.status(503).json({
    error: `Aktuální data z Yahoo screeneru se teď nepodařilo načíst (${lastErr}). ` +
      `Yahoo screener bývá nedostupný hlavně mimo obchodní hodiny amerických burz — zkus to prosím během jejich otevírací doby (cca 15:30–22:00 SEČ) nebo za chvíli znovu.`,
  });
}
