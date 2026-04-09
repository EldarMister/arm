# Telegram Fresh Bot

Standalone Telegram bot for Encar fresh listings.

## Run

1. `cd telegram-fresh-bot`
2. `npm install`
3. Copy `.env.example` to `.env`
4. Set `TELEGRAM_BOT_TOKEN`
5. `npm start`

## Notes

- No Postgres is required.
- State is stored locally in `./data/state.json`.
- Fresh parsing runs continuously while at least one chat has parsing enabled.
- If `ENCAR_PROXY_URL` is set, the bot uses the same direct/proxy failover approach as the main project for list and detail requests.
- Fresh rules are fixed to:
  - views `<= 6`
  - calls `= 0`
  - subscriptions `= 0`
