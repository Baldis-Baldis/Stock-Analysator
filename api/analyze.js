import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const r = (v) => (typeof v === "number" ? Math.round(v * 100) / 100 : null);
const pct = (v) => (typeof v === "number" ? Math.round(v * 10000) / 100 : null);

async function getMetrics(ticker) {
  const q = await yahooFinance.quoteSummary(
    ticker,
    { modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile", "summaryProfile"] },
    { validateResult: false }
  );
  const p = q.price || {};
  const sd = q.summaryDetail || {};
  const ks = q.defaultKeyStatistics || {};
  const fd = q.financialData || {};
  const ap = q.assetProfile || q.summaryProfile || {};

  // vezmi první ne-null hodnotu z více možných umístění
  const pick = (...vals) => {
    for (const v of vals) if (v !== null && v !== undefined && v !== "") return v;
    return null;
  };

  const pe = r(pick(sd.trailingPE, ks.trailingPE, p.trailingPE,
    fd.currentPrice && fd.epsTrailingTwelveMonths ? fd.currentPrice / fd.epsTrailingTwelveMonths : null));
  const fwdPe = r(pick(ks.forwardPE, sd.forwardPE, p.forwardPE));
  const price = r(pick(fd.currentPrice, p.regularMarketPrice, sd.previousClose));
  const growth = pick(fd.earningsGrowth, ks.earningsQuarterlyGrowth);

  let peg = r(pick(ks.pegRatio, ks.trailingPegRatio));
  if (peg == null && fwdPe && growth > 0) peg = r(fwdPe / (growth * 100));

  const industry = pick(ap.industry, "");
  const isReit = /reit/i.test(industry) || /REIT/i.test(pick(p.quoteType, "") || "");

  const targetMean = r(pick(fd.targetMeanPrice));
  const upside = targetMean && price ? r(((targetMean - price) / price) * 100) : null;

  return {
    ticker: ticker.toUpperCase(),
    name: pick(p.longName, p.shortName, ticker.toUpperCase()),
    sector: pick(ap.sector, "—"),
    industry,
    isReit,
    price,
    currency: pick(p.currency, fd.financialCurrency, ""),
    marketCap: pick(p.marketCap, sd.marketCap),
    pe,
    fwdPe,
    peg,
    pb: r(pick(ks.priceToBook, sd.priceToBook)),
    ps: r(pick(sd.priceToSalesTrailing12Months, ks.priceToSalesTrailing12Months)),
    roe: pct(pick(fd.returnOnEquity, ks.returnOnEquity)),
    netMargin: pct(pick(fd.profitMargins, ks.profitMargins)),
    revGrowth: pct(pick(fd.revenueGrowth, sd.revenueGrowth)),
    earningsGrowth: pct(growth),
    divYield: (() => {
      const dy = pick(sd.dividendYield, sd.trailingAnnualDividendYield, ks.dividendYield);
      if (dy == null) return null;
      // Yahoo vrací dividendYield jako desetinné číslo (0.025) i jako procenta (2.5) podle verze
      return dy > 1 ? r(dy) : pct(dy);
    })(),
    debtEq: r(pick(fd.debtToEquity, ks.debtToEquity)),
    // nové metriky
    evEbitda: r(pick(ks.enterpriseToEbitda, fd.enterpriseToEbitda)),
    freeCashflow: pick(fd.freeCashflow),
    currentRatio: r(pick(fd.currentRatio)),
    targetMean,
    upside,
    recommendation: pick(fd.recommendationKey, ""),
    payoutRatio: (() => {
      const pr = pick(sd.payoutRatio, ks.payoutRatio);
      if (pr == null) return null;
      return pr > 1.5 ? r(pr) : pct(pr);
    })(),
    fiveYearAvgDivYield: r(pick(sd.fiveYearAvgDividendYield)),
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

    let autoPeers = false;
    // Pokud uživatel zadal jen jeden ticker, dotáhni konkurenty ze stejného sektoru automaticky
    if (results.length === 1) {
      try {
        const rec = await yahooFinance.recommendationsBySymbol(results[0].ticker);
        const symbols = (rec?.recommendedSymbols || [])
          .map((s) => s.symbol)
          .filter((s) => s && s !== results[0].ticker)
          .slice(0, 4);
        for (const sym of symbols) {
          try {
            results.push(await getMetrics(sym));
          } catch { /* konkurenta prostě přeskoč */ }
        }
        if (results.length > 1) autoPeers = true;
      } catch { /* když se nepodaří, nevadí – vrátíme aspoň hlavní akcii */ }
    }

    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ main: results[0], peers: results.slice(1), errors, autoPeers });
  } catch (e) {
    // Pojistka: i neočekávaná chyba se vrátí jako JSON, ne jako HTML error stránka
    return res.status(500).json({ error: `Serverová chyba: ${e.message || String(e)}` });
  }
}
