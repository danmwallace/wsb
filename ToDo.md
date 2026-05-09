# ToDo

## Before/after going public

- [ ] **Replace lab n8n credential IDs in `workflows/Wallstreet Bets v4.json`** with `REPLACE_WITH_*_CREDENTIAL_ID` placeholders, like `Research and Rate v1.json` already does. Currently embeds:
  - `33cQ5QztjkS2hIrE` — Reddit account
  - `Tn04tSTifMdSaHfz` — Anthropic account
  - `EZmw8OBhPFYy3HjE` — Discord Webhook account

  These are internal n8n DB references (not API keys), so not a security risk. Cleaning them up is just a usability improvement for anyone forking the repo: they'd otherwise see "credential not found" errors on import and have to rewire each node anyway.
