require('dotenv').config({
    path: ".env.local"
});
const fetch = require('node-fetch');
const {
    createLogger,
    format,
    transports
} = require('winston');
const {
    combine,
    printf
} = format;
const moment = require('moment');
const tsFormat = () => moment().format('YYYY-MM-DD hh:mm:ss').trim();
const myFormat = printf(({
    level,
    message,
}) => {
    return `${tsFormat()} ${level}: ${message}`;
});
const logger = createLogger({
    level: 'debug',
    format: format.json(),
    // defaultMeta: {
    //   service: 'ramaris blockchain component'
    // },
    transports: [
        //
        // - Write all logs with importance level of `error` or less to `error.log`
        // - Write all logs with importance level of `info` or less to `combined.log`
        //
        new transports.File({
            filename: 'error.log',
            level: 'error'
        }),
        new transports.File({
            filename: 'combined.log'
        }),
        new transports.Console({
            timestamp: tsFormat,
            colorize: true,
            json: false,
            format: combine(
                format.colorize(),
                myFormat
            ),
        })
    ],
});

// const fs = require('fs');
const TELEGRAM_BASE_URL = `https://api.telegram.org/bot`;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_HTTP_ENDPOINT = `${TELEGRAM_BASE_URL}${TELEGRAM_BOT_TOKEN}`;
const TELEGRAM_CHAT_OWNER = process.env.TELEGRAM_CHAT_OWNER;

// coincap.io
// 500 reqs per minute
// api docs https://docs.coincap.io
const COINCAP_ENDPOINT = "https://api.coincap.io";
const ASSETS_TO_FETCH = 100;
const EMA = require('technicalindicators').EMA;
const schedule = require('node-schedule');


// ${TELEGRAM_HTTP_ENDPOINT}/sendMessage
// required params
// chat_id: Unique identifier for the target chat or username of the target channel (in the format @channelusername)
// text: Text of the message to be sent, 1-4096 characters after entities parsing
// optionally, apply markdown styling https://core.telegram.org/bots/api#markdownv2-style
async function sendTelegramMessage(chat_id, message) {

    // trim message to max of 4096 chars
    message = message.substring(0, 4095);

    const Message = {
        chat_id: chat_id,
        text: message
    }
    // send
    const response = await fetch(`${TELEGRAM_HTTP_ENDPOINT}/sendMessage`, {
        method: 'POST',
        body: JSON.stringify(Message),
        headers: {
            'Content-Type': 'application/json'
        }
    });
    const data = await response.json();

    return data;
}


// assets
// Key	Required	Value	Description
// search	optional	bitcoin	search by asset id (bitcoin) or symbol (BTC)
// ids	optional	bitcoin	query with multiple ids=bitcoin,ethereum,monero
// limit	optional	5	max limit of 2000
// offset	optional	1	offset
async function getAssets(limit) {
    try {
        const response = await fetch(`${COINCAP_ENDPOINT}/v2/assets?limit=${limit}`, {
            Headers: {
                "Authorization": `Bearer ${process.env.COINCAP_API_KEY}`
            }
        });
        const data = await response.json();

        return data.data;
    } catch (error) {
        sendTelegramMessage(TELEGRAM_CHAT_OWNER, `Error during fetch getAssets ${JSON.stringify(error)}`);
        return;
    }
}


// /candles
//     Key	Required	Value	Description
// exchange	required	poloniex	exchange id
// interval	required	m1, m5, m15, m30, h1, h2, h4, h8, h12, d1, w1	candle interval
// baseId	required	ethereum	base id
// quoteId	required	bitcoin	quote id
// start	optional	1528410925604	UNIX time in milliseconds. omiting will return the most recent candles
// end	optional	1528411045604	UNIX time in milliseconds. omiting will return the most recent candles
async function getCandles(id) {
    let exchange = "kucoin";
    let interval = "d1";
    let baseId = id;
    let quoteId = "tether";

    try {
        const response = await fetch(`${COINCAP_ENDPOINT}/v2/candles?exchange=${exchange}&interval=${interval}&baseId=${baseId}&quoteId=${quoteId}`, {
            method: 'GET',
            Headers: {
                "Authorization": `Bearer ${process.env.COINCAP_API_KEY}`
            }
        });
        const data = await response.json();

        return data.data;
    } catch (error) {
        sendTelegramMessage(TELEGRAM_CHAT_OWNER, `Error during fetch getCandles ${JSON.stringify(error)}`);
    }
    return;
}


// joining in late
// weekly trend is up 20% week 10 - week 14 in the past (lagging..)
// daily EMA10 is above daily EMA50, shorter time frame above the longer
// price, daily, dipped 10%
// object.state 101 = conds met
// object.state 100 = conds not met
// error handling in return function
async function calculateDipBuyer(asset, candles) {
    try {
        // All of the following:
        // W Change% (10, 14, 14, close), Chg% > 20
        // D Change% (10, 14, 14, close), Chg% < -10
        // D Exponential Moving Average (10, 0, close) > D Exponential Moving Average (50, 0, close)
        const closeprices = candles.map(candle => parseFloat(candle.close));

        if (!closeprices) {
            return {
                state: "closeprices empty"
            };
        }

        // W Change
        // gained over 20%
        const WChangePrice1 = parseFloat(closeprices[closeprices.length - (10 * 7)]);
        const WChangePrice2 = parseFloat(closeprices[closeprices.length - (14 * 7)]);
        const WChangeValue = (WChangePrice2 / WChangePrice1 * 100) - 100;

        // D Change
        // meaning
        // D Change% (10, 14, 14, close), Chg% < -10
        // -10 = daily % move
        // 10= now
        // 14 = prev
        // 2nd 14 = period
        const DChangePrice1 = parseFloat(closeprices[closeprices.length - 10]);
        const DChangePrice2 = parseFloat(closeprices[closeprices.length - 14]);
        // DChangeValue % diff
        // lost more than 10%
        const DChangeValue = (DChangePrice2 / DChangePrice1 * 100) - 100;

        // EMA 10
        let periodEMA10 = 10;
        let valuesEMA10 = closeprices.slice(-10);

        const EMA10 = EMA.calculate({
            period: periodEMA10,
            values: valuesEMA10
        })[0];

        // EMA 50
        let periodEMA50 = 50;
        let valuesEMA50 = closeprices.slice(-50);
        const EMA50 = EMA.calculate({
            period: periodEMA50,
            values: valuesEMA50
        })[0];

        // check conds are met
        if (WChangeValue > 20 && DChangeValue < -10 && EMA10 > EMA50) {
            // conds met
            return {
                symbol: asset.id,
                WChangeValue: WChangeValue,
                DChangeValue: DChangeValue,
                EMA10: EMA10,
                EMA50: EMA50,
                state: 101
            };
        }
        // conds not met
        return {
            symbol: asset.id,
            WChangeValue: WChangeValue,
            DChangeValue: DChangeValue,
            EMA10: EMA10,
            EMA50: EMA50,
            state: 100
        };
    } catch (error) {
        sendTelegramMessage(TELEGRAM_CHAT_OWNER, `Error during dipBuyerCheck ${JSON.stringify(error)}`);
        return;
    }
}


// weekly trend is up 20% week 10 - week 14 in the past (lagging..)
// daily EMA10 is BELOW daily EMA50, shorter time frame BELOW the longer
// object.state 101 = conds met
// object.state 100 = conds not met
// error handling in return function
async function calculateDipShorter(asset, candles) {
    try {
        // All of the following:
        // W Change% (10, 14, 14, close), Chg% > 20
        // D Exponential Moving Average (10, 0, close) < D Exponential Moving Average (50, 0, close)
        const closeprices = candles.map(candle => parseFloat(candle.close));

        if (!closeprices) {
            return {
                state: "closeprices empty"
            };
        }

        // W Change
        // gained over 20%
        const WChangePrice1 = parseFloat(closeprices[closeprices.length - (10 * 7)]);
        const WChangePrice2 = parseFloat(closeprices[closeprices.length - (14 * 7)]);
        const WChangeValue = (WChangePrice2 / WChangePrice1 * 100) - 100;

        // EMA 10
        let periodEMA10 = 10;
        let valuesEMA10 = closeprices.slice(-10);

        const EMA10 = EMA.calculate({
            period: periodEMA10,
            values: valuesEMA10
        })[0];

        // EMA 50
        let periodEMA50 = 50;
        let valuesEMA50 = closeprices.slice(-50);
        const EMA50 = EMA.calculate({
            period: periodEMA50,
            values: valuesEMA50
        })[0];

        // check conds are met
        if (WChangeValue > 20 && EMA10 < EMA50) {
            // conds met
            return {
                symbol: asset.id,
                WChangeValue: WChangeValue,
                EMA10: EMA10,
                EMA50: EMA50,
                state: 101
            };
        }
        // conds not met
        return {
            symbol: asset.id,
            WChangeValue: WChangeValue,
            EMA10: EMA10,
            EMA50: EMA50,
            state: 100
        };
    } catch (error) {
        sendTelegramMessage(TELEGRAM_CHAT_OWNER, `Error during dipShorterCheck ${JSON.stringify(error)}`);
        return;
    }
}


async function main() {

    // const assets = await getAssets(1);
    const assets = await getAssets(ASSETS_TO_FETCH);
    assets.forEach(async (asset) => {
        const candles = await getCandles(asset.id);

        if (candles) {
            asset.dipBuyerCheck = await calculateDipBuyer(asset, candles);
            asset.dipShorterCheck = await calculateDipShorter(asset, candles);
            
            // destruct asset, picks properties
            const { symbol, dipBuyerCheck, dipShorterCheck } = asset;
            logger.log("info", `${symbol} buyer state ${dipBuyerCheck.state} wchg ${dipBuyerCheck.WChangeValue} dchg ${dipBuyerCheck.DChangeValue} EMA10 ${dipBuyerCheck.EMA10} EMA50 ${dipBuyerCheck.EMA50}`)
            logger.log("info", `${symbol} shorter state ${dipShorterCheck.state} wchg ${dipShorterCheck.WChangeValue} EMA10 ${dipShorterCheck.EMA10} EMA50 ${dipShorterCheck.EMA50}`)
            
            // checks any asset got a hit on any scanner
            // sends a message using telegram
            if (dipBuyerCheck && dipBuyerCheck.state == 101) {
                logger.log("info", `${symbol} buyer state ${dipBuyerCheck.state} wchg ${dipBuyerCheck.WChangeValue} dchg ${dipBuyerCheck.DChangeValue} EMA10 ${dipBuyerCheck.EMA10} EMA50 ${dipBuyerCheck.EMA50}`)
                sendTelegramMessage(TELEGRAM_CHAT_OWNER, `dipBuyer triggered ${symbol} buyer state ${dipBuyerCheck.state} wchg ${dipBuyerCheck.WChangeValue} dchg ${dipBuyerCheck.DChangeValue} EMA10 ${dipBuyerCheck.EMA10} EMA50 ${dipBuyerCheck.EMA50}`);
            }
            if (dipShorterCheck && dipShorterCheck.state == 101) {
                logger.log("info", `${symbol} shorter state ${dipShorterCheck.state} wchg ${dipShorterCheck.WChangeValue} EMA10 ${dipShorterCheck.EMA10} EMA50 ${dipShorterCheck.EMA50}`)
                sendTelegramMessage(TELEGRAM_CHAT_OWNER, `dipShorter triggered ${symbol} shorter state ${dipShorterCheck.state} wchg ${dipShorterCheck.WChangeValue} EMA10 ${dipShorterCheck.EMA10} EMA50 ${dipShorterCheck.EMA50}`);
            }
        } else {
            console.log(`candles not defined ${asset.id}`)
        }
    });

    // fs.writeFileSync(`coincap.candles.${asset.id}.json`, JSON.stringify(candles));
}
// main();


// *    *    *    *    *    *
// ┬    ┬    ┬    ┬    ┬    ┬
// │    │    │    │    │    │
// │    │    │    │    │    └ day of week (0 - 7) (0 or 7 is Sun)
// │    │    │    │    └───── month (1 - 12)
// │    │    │    └────────── day of month (1 - 31)
// │    │    └─────────────── hour (0 - 23)
// │    └──────────────────── minute (0 - 59)
// └───────────────────────── second (0 - 59, OPTIONAL)
// runs function at 00:05 every day
const job = schedule.scheduleJob('0 5 0 * * *', function () {
    main();
});

logger.log('info', 'Running 🚀');
sendTelegramMessage(TELEGRAM_CHAT_OWNER, `Running 🚀`);