import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const r = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : null);
const pct = (v) => (typeof v === "number" ? Math.round(v * 10000) / 100 : null);

async function getMetrics(ticker) {
  const q = await yahooFinance.quoteSummary(
    ticker,
    { modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"] },
    { validateResult: false }
  );
  const p = q.price || {};
  const sd = q.summaryDetail || {};
  const ks = q.defaultKeyStatistics || {};
  const fd = q.financialData || {};

  let peg = r(ks.pegRatio);
  const fwdPe = r(ks.forwardPE ?? sd.forwardPE);
  const growth = fd.earningsGrowth;
  if (peg == null && fwdPe && growth > 0) peg = r(fwdPe / (growth * 100));

  return {
    ticker: ticker.toUpperCase(),
    name: p.shortName || ticker.toUpperCase(),
    sector: (q.assetProfile && q.assetProfile.sector) || "—",
    price: r(p.regularMarketPrice),
    currency: p.currency || "",
    marketCap: p.marketCap ?? sd.marketCap ?? null,
    pe: r(sd.trailingPE),
    fwdPe,
    peg,
    pb: r(ks.priceToBook),
    ps: r(sd.priceToSalesTrailing12Months),
    roe: pct(fd.returnOnEquity),
    netMargin: pct(fd.profitMargins),
    revGrowth: pct(fd.revenueGrowth),
    divYield: sd.dividendYield != null ? pct(sd.dividendYield) : null,
    debtEq: r(fd.debtToEquity),
  };
}

export default async function handler(req, res) {
  try {
    const tickers = String(req.query.tickers || "")
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 8);

    if (!tickers.length) {
      return res.status(400).json({ error: "Zadej alespoň jeden ticker." });
    }

    const results = [];
    const errors = [];
    for (const tk of tickers) {
      try {
        results.push(await getMetrics(tk));
      } catch (e) {
        errors.push(`${tk}: ${e.message || "ticker nenalezen"}`);
      }
    }

    if (!results.length) {
      return res.status(404).json({ error: errors.join("; ") || "Žádná data." });
    }
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ main: results[0], peers: results.slice(1), errors });
  } catch (e) {
    return res.status(500).json({ error: `Serverová chyba: ${e.message || String(e)}` });
  }
}

