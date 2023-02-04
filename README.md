# What is scannerbot?
There are many SaaS solutions that allow monitoring cryptocurrency prices, allow creating your own rule set, and be notified once conditions are met.

I could not find any solution that was doing what I needed and cheap enough.

This is why scannerbot was created. Scannerbot is a free alternative to many SaaS solutions.

Scannerbot is a signal provider app for trading cryptocurrencies. It checks prices from [Coincap](https://coincap.io/) for the top 100 cryptocurrencies, applies technical analysis, and generates signals on a pre-defined ruleset.


# Rule set
The following rule set is based on scanners from trendspider authored by [@AltcoinPsycho](https://twitter.com/altcoinpsycho?lang=en)

## Dip Buyer - [Original Ruleset](https://charts.trendspider.com/shared/6383ad6f207eac0015778dc3?t=4)
`
All of the following conditions are met:
W Change% (10, 14, 14, close), Chg% > 20
D Change% (10, 14, 14, close), Chg% < -10
D Exponential Moving Average (10, 0, close) > D Exponential Moving Average (50, 0, close)
`

## Dip Shorter
`
All of the following conditions are met:
W Change% (10, 14, 14, close), Chg% > 20
D Exponential Moving Average (10, 0, close) < D Exponential Moving Average (50, 0, close)
`


# How to start
- Clone this repository
- get an api key on coincap.io
- create a new telegram bot, get the token for the bot
- chat with the bot, and extract your id (TELEGRAM_CHAT_OWNER)
- create the `.env.local` file and store the api key, token, and the chat owner id in it
`
COINCAP_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_OWNER=...
`

- run the application
`npm install`
`npm start`

> Note: scannerbot per default only runs once a day 5 minutes after midnight. You can adjust it to your own needs.