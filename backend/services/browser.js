const puppeteer = require('puppeteer');

let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }

  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--no-first-run',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list'
    ],
    defaultViewport: { width: 1366, height: 768 }
  });

  browserInstance.on('disconnected', () => {
    console.log('[Browser] Disconnected');
    browserInstance = null;
  });

  console.log('[Browser] Launched OK');
  return browserInstance;
}

async function newPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  page.on('console', (msg) => {
    if (msg.type() !== 'verbose') {
      console.log(`[Browser:console] ${msg.text().slice(0, 200)}`);
    }
  });

  page.on('pageerror', (err) => {
    console.warn(`[Browser:error] ${err.message}`);
  });

  return page;
}

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (e) {
      // ignore
    }
    browserInstance = null;
    console.log('[Browser] Closed');
  }
}

module.exports = { getBrowser, newPage, closeBrowser };
