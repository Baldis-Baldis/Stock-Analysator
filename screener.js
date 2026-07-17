import yahooFinance from "yahoo-finance2";

const r = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : null);

export default async function handler(req, res) {
  // Oficiální Yahoo screenery: undervalued_large_caps | undervalued_growth_stocks
  const scrId = req.query.type === "growth" ? "undervalued_growth_stocks" : "undervalued_large_caps";

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
        changePct: r(q.regularMarketChangePercent),
      }))
      // řazení: nejnižší forward P/E (fallback P/E) = nejpodhodnocenější
      .sort((a, b) => (a.fwdPe ?? a.pe ?? 999) - (b.fwdPe ?? b.pe ?? 999))
      .slice(0, 10);

    if (!quotes.length) {
      return res.status(404).json({ error: "Screener nevrátil žádná data, zkus to za chvíli." });
    }

    res.setHeader("Cache-Control", "s-maxage=900");
    return res.status(200).json({
      title: scrId === "undervalued_growth_stocks" ? "Podhodnocené růstové akcie" : "Podhodnocené velké firmy",
      source: "Yahoo Finance screener",
      stocks: quotes,
    });
  } catch (e) {
    return res.status(500).json({ error: `Screener selhal: ${e.message}` });
  }
}
