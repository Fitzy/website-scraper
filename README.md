# Webpage scraper

A Node.js Lambda function that scrapes HTML content from websites, and stores the content in a DynamoDB table. When changes are detected to the website, a Telegram notification is sent to a chat.

## Prerequisites
1. [AWS CLI](https://aws.amazon.com/cli/)
2. [serverless](https://serverless.com/framework/)
3. [Node.js v8.10.0 ](https://nodejs.org/en/)
4. Telegram account with a personal bot:

In order to receive Telegram notifications, a personal bot must be created - as this will be used to send notification automatically to your personal account, see  https://core.telegram.org/bots. 

During the creation of the bot the bot token will be displayed - take note of this as this will needed later on for the `TELEGRAM_BOT_TOKEN` environment variable.

Once the bot has been setup - create a private group, and invite the bot. To allow the bot to message your personal account directly, it's important to sent a message directly to your bot in a direct message - this mechanism proves that you want to receive messages from the bot, and stops other people's bots from sending you spam messages.

The chat id will also be needed for the `TELEGRAM_CHAT_ID` environment variable, see https://stackoverflow.com/questions/33858927/how-to-obtain-the-chat-id-of-a-private-telegram-channel for details of how to get this. 

## Setup

1. Run `npm install`
2. Update the `region` in `serverless.yml` and `index.js` - this is the AWS region to create the Lambda function and resources in
3. Set `memorySize` / `timeout` in `serverless.yml`
4. Set `schedule` to scrape the website at, current set to once an hour using `rate(1 hour)`
5. Run `serverless deploy`
6. Create item in `WebsiteConfig` table , e.g:
```
{
  "id": "186e7ecf-d049-4f0e-a8be-ebf5ef5a29b2",
  "name": "Goole homepage",
  "url": "https://www.google.co.uk",
  "elementId": "#main",
  "enabled": "true"
}
```
7. Multiple websites can be added using `WebsiteConfig` - but first check that a single website scrape works.
8. Create `secrets.yml` - use `secrets-template.yml` as the template.
9. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` - see prerequisites section for details of how to get these.
10. Set `SCREENSHOT_UPLOADS_S3_BUCKET_NAME` to be a unique s3 bucket name
11. Run the Lambda function manually to check it's working as expected. In the future it be triggered based on the schedule provided to CloudWatch rules.

## Database Structure
### WebsiteConfig
Contains the definition of which websites to scrape. `elementId` can be used to focus on a particular HTML element - rather than capture the HTML of the entire website.
- id (guid)
- name
- url
- elementId 
- enabled (boolean)

### WebsiteCapture
Contains a version of the website content that has been scraped.
- id (guid)
- websiteConfigId (references the websiteConfig)
- content (raw html content of what has been captured)
- contentHash (SHA-256 hash of the content - used to check whether the content has changed)
- dateCreated

## Future improvements
- Compare current website scrape to the most recent one, as currently it's comparing the current website scrape to any of the previous ones (won't detect if the webpage changes back to a previous version)
- Improve the DynamoDB structure - probably doesn't need a GSI on the WebsiteCapture table
- Save a screenshot of the website using Puppeteer - and send through to Telegram. (easier to quickly glance at a image to see what's changed than having to go through WebsiteCapture table)
- Refactor index.js