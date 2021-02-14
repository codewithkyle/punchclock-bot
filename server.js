const http = require('http');

const express = require('express');
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const fs = require("fs");
const path = require("path");
const cwd = process.cwd();

const dayjs = require('dayjs');
const customParseFormat = require('dayjs/plugin/customParseFormat')
dayjs.extend(customParseFormat);

const auth = require('basic-auth');
require('dotenv').config();
const admin = { name: process.env.USERNAME, password: process.env.PASSWORD };

const mailgun = require("mailgun-js");
const mg = mailgun({apiKey: process.env.MAILGUN_API_KEY, domain: process.env.DOMAIN});

app.get('/', async (req, res) => {
    const user = auth(req);
    if (!user || !admin.name || admin.password !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="Punchclock Bot"');
        return res.status(401).send();
    }
    return res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/blacklist.json', async (req, res) => {
    const user = auth(req);
    if (!user || !admin.name || admin.password !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="Punchclock Bot"');
        return res.status(401).send();
    }
    const blacklistedDates = JSON.parse(fs.readFileSync(path.join(cwd, "blacklist.json")).toString());
    return res.status(200).json(blacklistedDates);
});

app.post("/update-blacklist", async (req, res) => {
    const user = auth(req);
    if (!user || !admin.name || admin.password !== user.pass) {
        res.set('WWW-Authenticate', 'Basic realm="Punchclock Bot"');
        return res.status(401).send();
    }
    fs.unlinkSync(path.join(cwd, "blacklist.json"));
    fs.writeFileSync(path.join(cwd, "blacklist.json"), JSON.stringify(req.body.dates));
    return res.status(200).json({ success: true });
});

const puppeteer = require('puppeteer');
(async () => {
    const httpServer = http.createServer(app);
    httpServer.listen(process.env.PORT);
    const minutes = dayjs().minute();
    const seconds = dayjs().second();
    const millisecondsTillNextHour = (((60 - minutes) * 60) - seconds) * 1000;
    setTimeout(check, millisecondsTillNextHour);
})();

async function handleLogin(page){
    const loginForm = await page.$('form[action="do-login"]');
    if (loginForm){
        await page.type('input[name="j_username"]', process.env.LOGIN_USERNAME);
        await page.type('input[name="j_password"]', process.env.LOGIN_PASSWORD);
        await Promise.all([
            page.click('input[type="submit"][name="Login"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
        ]);
    }
    return;
}

async function handleUserOverload(page){
    const tooManyUsers = await page.$('input[type="submit"][value="Add Another Instance"]');
    if (tooManyUsers){
        await Promise.all([
            page.click('input[type="submit"][value="Add Another Instance"]'),
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
        ]);
    }
    return;
}

async function goToSite(){
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();
    await page.goto(`https://mis.page.works/epace/company:public/object/Employee/dcActions/${process.env.EMPLOYEE_ID}`, { waitUntil: 'networkidle0' });
    return {
        page: page,
        browser: browser
    };
}

async function punchIn(){
    try{
        const { page, browser } = await goToSite();
        await handleLogin(page);
        await handleUserOverload(page);
        await page.goto(`https://mis.page.works/epace/company:public/object/Employee/dcActions/${process.env.EMPLOYEE_ID}`, { waitUntil: 'networkidle0' });
        // await page.click('input[type="submit"][value="Sign In"]');
        await browser.close();
        const data = {
            from: 'Punchclock Bot <noreply@example.com>',
            to: process.env.EMAIL_ADDRESS,
            subject: "Punch In Successful!",
            text: `You were punched in at ${dayjs().format("h:mma")} today. I'll contact you again in 8 hours after you've been punched out.`,
        };
        mg.messages().send(data);
        console.log("All done!");
    } catch (e){
        const data = {
            from: 'Punchclock Bot <noreply@example.com>',
            to: process.env.EMAIL_ADDRESS,
            subject: "Oh dear, oh my. Something has gone terribly wrong!",
            text: e.toString(),
        };
        mg.messages().send(data, function (error, body) {
            console.log(body);
        });
    }
}

async function punchOut(){
    try {
        const { page, browser } = await goToSite();
        await handleLogin(page);
        await handleUserOverload(page);
        await page.goto(`https://mis.page.works/epace/company:public/object/Employee/dcActions/${process.env.EMPLOYEE_ID}`, { waitUntil: 'networkidle0' });
        // await page.click('input[type="submit"][value="Sign Out"]');
        await browser.close();
        const data = {
            from: 'Punchclock Bot <noreply@example.com>',
            to: process.env.EMAIL_ADDRESS,
            subject: "Punch Out Successful!",
            text: `You were punched out at ${dayjs().format("h:mma")}! Enjoy the rest of your day.`,
        };
        mg.messages().send(data);
    } catch (e){
        const data = {
            from: 'Punchclock Bot <noreply@example.com>',
            to: process.env.EMAIL_ADDRESS,
            subject: "Oh dear, oh my. Something has gone terribly wrong!",
            text: e.toString(),
        };
        mg.messages().send(data);
    }
}

function holiday(){
    const day = dayjs().date();
    const month = dayjs().month();
    const blacklistedDates = JSON.parse(fs.readFileSync(path.join(cwd, "blacklist.json")).toString());
    let isHoliday = false;
    for (let i = 0; i < blacklistedDates.length; i++){
        const formatted = dayjs(blacklistedDates[i].date, 'MM/DD/YYYY');
        if (month === formatted.month() && day === formatted.date()){
            isHoliday = true;
            const data = {
                from: 'Punchclock Bot <noreply@example.com>',
                to: process.env.EMAIL_ADDRESS,
                subject: `Enjoy Your ${blacklistedDates[i].label}`,
                text: "Hooray! You don't have to work today!",
            };
            mg.messages().send(data);
            break;
        }
    }
    return isHoliday;
}

function check(){
    const dayOfWeek = dayjs().day();
    // If not weekend
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holiday()){
        const hour = dayjs().hour();
        if (hour === 8){
            punchIn();
        } else if (hour === 4){
            punchOut();
        }
    } else {
        const data = {
            from: 'Punchclock Bot <noreply@example.com>',
            to: process.env.EMAIL_ADDRESS,
            subject: `Enjoy Weekend`,
            text: `Hooray! You don't have to work today! This email was generated at ${dayjs().format("h:mma")}`,
        };
        mg.messages().send(data);
    }
    setTimeout(check, 3600000);
}