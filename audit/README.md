# Clearbook cross check

This directory contains an independent Python replay of the Clearbook lot engine. It checks lot selection, basis, proceeds, gains, holding terms and current exposure quantities with decimal arithmetic. It uses only the Python standard library and requires Python 3.11 or later.

Run the unit tests:

```text
python3 -m unittest discover -s audit
```

Run against a local API:

```text
python3 audit/audit.py --api http://localhost:8080/api --wallet demo-trader
python3 audit/audit.py --api http://localhost:8080/api --wallet demo-trader --method hifo --tax-year 2026
```

The API check reads ledger activity, corporate action events, lots and tax lot CSV exports. No request headers are required.

Run against saved JSON:

```text
python3 audit/audit.py --events activity.json --lots lots.json --method fifo
python3 audit/audit.py --events activity.json --tax-lots tax-rows.json --method fifo
```

Events may be an activity page or its item array. Lots use the API lot array. Tax lot JSON may be a row array or an object with a `rows` array.

Exit code 0 means every comparison matched. Exit code 1 means at least one value differed. Exit code 2 means the input was invalid or unavailable.