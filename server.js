const http = require('http');
const express = require('express');
const app = express();

const dayjs = require('dayjs');
var utc = require('dayjs/plugin/utc');
var timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault("America/New_York");

const auth = require('basic-auth');
require('dotenv').config();
const admin = { name: process.env.USERNAME, password: process.env.PASSWORD };

app.get('/', async (req, res) => {
    const user = auth(req);
    if (!user || !admin.name || admin.password !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="Punchclock Bot"');
        return res.status(401).send();
    }
    return res.status(200);
});

const puppeteer = require('puppeteer');
let browser = null;
(async () => {
    browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const httpServer = http.createServer(app);
    httpServer.listen(8080);
    const minutes = dayjs().minute();
    const seconds = dayjs().second();
    const secondsTillNextHour = ((60 - minutes) * 60) - seconds;
    setTimeout(check, secondsTillNextHour);
})();

async function punchIn(){

}

function check(){
    const dayOfWeek = dayjs().day();
    // If not weekend
    if (dayOfWeek !== 0 && dayOfWeek !== 6){
        const hour = dayjs().hour();
        if (hour === 8){
            punchIn();
        } else if (hour === 4){
            // Do punch out logic
        }
    }
    setTimeout(check, 3600);
}