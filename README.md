# Analyzátor akcií

Fundamentální analýza akcií s živými daty z Yahoo Finance.
Dva režimy: TOP 10 podhodnocených akcií (Yahoo screener) a detailní analýza jedné akcie s porovnáním konkurence.

## Nasazení (GitHub + Vercel)

1. Vytvoř nový repozitář na GitHubu a nahraj do něj obsah této složky
2. Na vercel.com → Add New → Project → Import z GitHubu → vyber repozitář
3. Žádné nastavení neměň, klikni Deploy
4. Hotovo — appka běží na https://nazev-projektu.vercel.app

## Struktura

- `public/index.html` — frontend (tmavé UI, mobilní)
- `api/analyze.js` — analýza akcií: /api/analyze?tickers=AAPL,MSFT,GOOGL
- `api/screener.js` — TOP 10 podhodnocených: /api/screener?type=large|growth
