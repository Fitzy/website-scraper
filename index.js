const chromium = require('chrome-aws-lambda');
const AWS = require('aws-sdk');
const crypto = require('crypto');
const uuidv1 = require('uuid/v1');
const TelegramBot = require('node-telegram-bot-api');

startBrowserAsync = async () => {
  let browser = await chromium.puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });

  return browser;
};

exports.handler = async (event, context) => {
  AWS.config.update({
    region: process.env.REGION
  });

  var dynamodb = new AWS.DynamoDB.DocumentClient();

  var params = {
    TableName: "WebsiteConfig"
  };

  var results = await dynamodb.scan(params).promise();

  var websiteContent = [];

  for (var i = 0; i < results.Items.length; i++) {
    var websiteConfig = results.Items[i];

    //ignore disabled configs - should be done in search
    if (websiteConfig.enabled !== 'true') {
      console.log(`skipping ${websiteConfig.name} as it's not enabled`);
      continue;
    }

    var browser = await startBrowserAsync();

    let page = await browser.newPage();

    page.setViewport({
      width: 1920,
      height: 1080
    });

    await page.setCacheEnabled(false);

    await page.goto(websiteConfig.url, {waitUntil: 'networkidle0'});

    var elementId = websiteConfig.elementId;

    await page.waitForSelector(elementId, {visible: true});

    // screenshots are taken and uploaded regardless of whether the page has changed
    const screenshot = await page.screenshot({fullPage: true, type: "png"});

    var s3 = new AWS.S3();

    var screenshotFilename = uuidv1() + ".png";

    // group screenshots of the same website in the same folder
    var screenshotKey = `${websiteConfig.id}/${screenshotFilename}`;

    var screenshotUrl = `https://${process.env.SCREENSHOT_UPLOADS_S3_BUCKET_NAME}.s3.${process.env.REGION}.amazonaws.com/${screenshotKey}`;

    var s3Params = {
      ACL: "public-read", 
      Body: screenshot, 
      Bucket: process.env.SCREENSHOT_UPLOADS_S3_BUCKET_NAME, 
      Key: screenshotKey,
      ContentType: "image/png"
    };

    await s3.putObject(s3Params).promise();

    let capturedHtml = await page.evaluate((elementId) => {
      return document.querySelector(elementId).innerHTML;
    }, elementId);

    if (browser != null) {
      await browser.close();
    }

    //remove line breaks
    var result = capturedHtml.replace(/(\r\n|\n|\r)/gm, "");

    result = result.replace(/ls-is-cached /g, "");

    result = result.trim();

    const hash = crypto.createHash('sha256');

    hash.update(result);

    const hashHex = hash.digest('hex');

    websiteContent.push({
      websiteConfigId: websiteConfig.id,
      sha256Hash: hashHex,
      name: websiteConfig.name,
      url: websiteConfig.url,
      html: result,
      screenshotUrl: screenshotUrl
    });
  }

  for (var i = 0; i < websiteContent.length; i++) {
    // Check to see if it exists
    var content = websiteContent[i];

    var params = {
      TableName: "WebsiteCapture",
      IndexName: "myGSI",
      KeyConditionExpression: "websiteConfigId = :websiteConfigId and contentHash = :contentHash",
      ExpressionAttributeValues: {
        ":websiteConfigId": content.websiteConfigId,
        ":contentHash": content.sha256Hash
      }
    };
  
    var results = await dynamodb.query(params).promise();

    if (results.Items.length == 0) {
      var dateNow = new Date().toISOString();

      var params = {
        TableName: "WebsiteCapture",
        Item: {
          id: uuidv1(),
          websiteConfigId: content.websiteConfigId,
          contentHash: content.sha256Hash,
          content: content.html,
          dateCreated: dateNow,
          screenshotUrl: content.screenshotUrl
        }
      };

      await dynamodb.put(params).promise();

      const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: false});

      await bot.sendMessage(process.env.TELEGRAM_CHAT_ID, `Website update detected for ${content.name}. Website - ${content.url}, Screenshot - ${content.screenshotUrl}`);
    }
  }

  return context.succeed("process ran successfully");
};