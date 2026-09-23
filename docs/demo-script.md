# Demo script

Three minutes. Use the Active trader ledger for the walk through and the Long term holder for the income slide.

## 0:00 The problem

"Tokenized stocks trade like tokens but they are securities. Anyone holding xStocks or Ondo tokens has no brokerage statement, no cost basis and no record of the dividends that arrive as multiplier changes. Clearbook is the post trade accounting layer that gives them one."

Open the home page. Scroll through the landing story: a public mainnet wallet as columns of lots, the relief order changing the gain on the same sale, the marks and the statement hash. When a connected wallet holds tokenized stocks the story reads that wallet instead.

## 0:20 Portfolio

Click Connect wallet and choose Open the demo ledger, or paste `demo-trader` into the address field.

- Five summary figures: net value, cost basis, unrealized P/L, realized P/L and income estimate.
- Each position carries an issuer badge, the mark with its source and age, plus the raw token quantity next to the shares of exposure when a multiplier is in force.
- Switch the method from FIFO to HIFO in the header. Cost basis and realized P/L change immediately. Switch back to FIFO.

## 0:50 Tax lots and activity

Open Tax lots.

- Every open lot with acquisition date, cost per share and holding period.
- Lots opened by a transfer show an estimated or unknown basis rather than a guess.
- Switch to Closed. The Tax years table sums realized gains per year and the CSV button downloads that year in the Form 1099-B column layout, one row per lot relieved.

Open Activity.

- Buys, sells, wrapper swaps and transfers with fees and counter asset.
- Realized P/L per sell.

## 1:20 Corporate actions

Open the Long term holder ledger and then Corporate actions.

- Multiplier increases read from the Token-2022 mint, classified as dividend reinvestment, split or reverse split, with the quantity and value effect.
- Say that this is read from the token itself rather than from an issuer announcement and that it is labeled best effort.

## 1:45 Statement

Open Statements and generate one for this year.

- Opening and closing value, holdings, activity, closed lots, corporate actions, disclosures and data sources on one document.
- Download the PDF. Show the hash on the first page.
- Click the proof button. On a demo ledger the app records a simulated proof and says so. On a real wallet the button reads Sign on chain: the owning wallet signs one memo transaction that carries the hash and the proof confirms within a few seconds.

## 2:20 Trade

Open Trade. Sell one share of NVDAx.

- The quote shows expected proceeds, price impact, the reference price and the realized P/L the sale would create under the selected method.
- Execute. With a wallet this is a Jupiter swap. Here it is a simulated sale and Activity shows the new sell with a simulated label. Simulated sales are private to the browser that made them, so a second visitor to the same demo ledger starts clean.

## 2:45 Live wallets and close

Paste a real address from the clipboard or connect the presenter's own wallet. The page opens at once and the status line counts signatures read and events found while indexing runs in the background. A typical wallet is ready in about ten seconds on the hosted site. When it finishes the pages fill in with either a ready or a partial ledger and the exact warnings about what could not be reconstructed.

If the presenter's wallet holds a position, this is the moment to generate a statement for it and click Sign on chain, so the video ends on a real proof confirmed on mainnet.

"Everything you saw is the same code path for demo and live data. The hosted site reads the chain through Helius and marks positions through Jupiter and PreStocks. A Pyth Pro key makes Pyth the primary mark. The statement is honest about what it knows and what it does not."

## Addresses used in rehearsal

- `89eKgf8u2B5yjU46N1gNQnE4a6Zu7PTCyWBoxZmYghw3` holds six xStocks positions built from 42 transactions. On the hosted site it indexes to a complete ledger in about ten seconds, on the public RPC in about 90 seconds, and its events and lots match the independent indexer and replay exactly
- `m7VmSjdSN6isudY6PVRa7GuZbG8rPBpB2X2DGHR5awz` holds about ten xStocks positions. On the hosted site it indexes to a partial ledger in about 90 seconds, with cost basis read from swaps for some positions and opening balances for the rest
- `2Cq2RNFFxxPXL7teNQAji1beA2vFbBDYW5BGPBFvoN9m` holds hundreds of Ondo accounts and indexes to a partial ledger with warnings. The band draws its 12 largest positions and says so in the caption; the tables list all of them

Both are market making wallets. Their ledgers demonstrate indexing and warnings rather than a retail trading history. Balances on live wallets change, so check them the day before the demo.
