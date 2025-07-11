// In production environments like Render, environment variables are injected directly.
// We only need to load the .env file when running locally for development.
// We can check for the presence of a Render-specific environment variable to determine this.
if (!process.env.RENDER) {
  require('dotenv').config();
}
const puppeteer = require('puppeteer');
const cron = require('node-cron');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');

// Load content from content.json
const content = JSON.parse(fs.readFileSync('content.json', 'utf8'));
// Use the Render Disk mou nt path if available, otherwise use the local directory.
const HISTORY_FILE = path.join(process.env.RENDER_DISK_MOUNT_PATH || '.', 'posted_history.json');

/**
 * Reads the history of posted messages from a file.
 * @returns {string[]} An array of posted messages.
 */
function getPostedHistory() {
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            const historyData = fs.readFileSync(HISTORY_FILE, 'utf8');
            return JSON.parse(historyData);
        }
    } catch (error) {
        console.error('❌ Error reading history file:', error);
    }
    return []; // Return empty array if file doesn't exist or is invalid
}

/**
 * Selects a post message from the content.json file.
 * Can be driven by the POST_TOPIC environment variable or select a random topic.
 * It avoids selecting a message that has been posted before.
 * @returns {string|null} The post message or null if no content is found.
 */
function selectPostContent() {
    const postedHistory = getPostedHistory();
    let topicsToTry = [];

    if (process.env.POST_TOPIC) {
        const specifiedTopic = process.env.POST_TOPIC;
        if (!content.topics[specifiedTopic]) {
            console.error(`❌ The topic "${specifiedTopic}" specified in POST_TOPIC was not found in content.json.`);
            console.error(`Available topics are: ${Object.keys(content.topics).join(', ')}`);
            return null;
        }
        topicsToTry = [specifiedTopic];
    } else {
        // Shuffle topics to ensure variety if the first choice is exhausted
        topicsToTry = Object.keys(content.topics).sort(() => 0.5 - Math.random());
    }

    if (topicsToTry.length === 0) {
        console.error('❌ No topics found in content.json');
        return null;
    }

    for (const topic of topicsToTry) {
        console.log(`Trying to find an unposted message in topic: ${topic}`);
        const topicContent = content.topics[topic];
        const unpostedMessages = topicContent.filter(post => !postedHistory.includes(post.message));

        if (unpostedMessages.length > 0) {
            const randomIndex = Math.floor(Math.random() * unpostedMessages.length);
            return unpostedMessages[randomIndex].message;
        }
        console.warn(`⚠️ No unposted messages left in topic: ${topic}`);
    }

    console.error('❌ All available messages from all topics have been posted.');
    return null;
}

/**
 * Logs into LinkedIn using credentials from environment variables.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 */
async function loginToLinkedIn(page) {
    try {
        await page.goto('https://www.linkedin.com/login');
        await page.type('#username', process.env.LINKEDIN_EMAIL, { delay: 50 });
        await page.type('#password', process.env.LINKEDIN_PASSWORD, { delay: 50 });

        const submitButtonSelector = 'button[type="submit"]';
        await page.waitForSelector(submitButtonSelector, { visible: true, timeout: 10000 });
        await page.click(submitButtonSelector);

        // After clicking login, we wait for the "Start a post" button to appear on the feed.
        // This is a more reliable indicator of a successful login and feed load than a generic layout selector,
        // which can change frequently with LinkedIn UI updates.
        const feedConfirmationSelector = '.share-box-feed-entry__trigger';
        // We give this a generous timeout to account for slow network or a CAPTCHA challenge.
        await page.waitForSelector(feedConfirmationSelector, { visible: true, timeout: 45000 });

        console.log('✅ Login successful and feed loaded.');
    } catch (loginError) {
        console.error('❌ Login failed. Could not verify the feed page after login attempt.', loginError);
        const screenshotPath = path.join(process.env.RENDER_DISK_MOUNT_PATH || '.', 'login-failure-screenshot.png');
        try {
            await page.screenshot({ path: screenshotPath, fullPage: true });
            console.log(`📸 Screenshot of the failure saved to ${screenshotPath}`);
            await sendNotification('LinkedIn Bot - Login Failed', `Login failed. The script could not find the main feed element after attempting to log in. A screenshot was saved to the server. Error: ${loginError}`);
        } catch (screenshotError) {
            console.error('❌ Failed to take screenshot:', screenshotError);
            // Fallback to original notification if screenshot fails
            await sendNotification('LinkedIn Bot - Login Failed', `Login failed. The script could not find the main feed element after attempting to log in. Error: ${loginError}`);
        }
        throw loginError; // Re-throw to stop the execution flow
    }
}

/**
 * Navigates to the feed, opens the post composer, types the message, and submits.
 * @param {import('puppeteer').Page} page The Puppeteer page object.
 * @param {string} postContent The message to be posted.
 */
async function createLinkedInPost(page, postContent) {
    try {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'networkidle2' });

        const startPostSelector = '.share-box-feed-entry__trigger';
        await page.waitForSelector(startPostSelector, { visible: true, timeout: 10000 });
        await page.click(startPostSelector);

        const textBoxSelector = 'div[role="textbox"]';
        await page.waitForSelector(textBoxSelector, { visible: true, timeout: 10000 });
        await page.type(textBoxSelector, postContent, { delay: 10 });

        const postButtonSelector = 'button[data-control-name="share.post"]';
        await page.waitForSelector(postButtonSelector, { visible: true, timeout: 10000 });
        // It's better to wait for navigation or a confirmation signal after a click.
        // Here, we'll click and then wait for the "Post successful" toast message.
        await Promise.all([
            page.click(postButtonSelector),
            page.waitForSelector('.artdeco-toast-item--success', { visible: true, timeout: 15000 })
        ]);
        console.log('✅ Post submitted and success notification confirmed.');
    } catch (postError) {
        console.error('❌ Failed during post creation. Could not confirm post success toast.', postError);
        await sendNotification('LinkedIn Bot - Post Creation Failed', `Failed to create post. The script did not detect the 'Post successful' confirmation. Error: ${postError}`);
        throw postError;
    }
}

/**
 * Appends a successfully posted message to the history file.
 * @param {string} message The message that was posted.
 */
function updateHistory(message) {
    const history = getPostedHistory();
    history.push(message);
    try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
        console.log('📝 History file updated.');
    } catch (error) {
        console.error('❌ Failed to write to history file:', error);
    }
}

/**
 * Main orchestrator function to run the entire posting process.
 */
async function postToLinkedIn() {
    let browser;
    try {
        const postContent = selectPostContent();
        if (!postContent) {
            // Send notification and throw an error to be caught by the retry handler
            await sendNotification('LinkedIn Bot - Content Error', 'Failed to select content. Check content.json and topic configuration.');
            throw new Error("Failed to select content. Halting execution.");
        }

        // Add args for compatibility with cloud/container environments
        browser = await puppeteer.launch({
            headless: "new",
            // When running in a container, we should be explicit about the executable path.
            // The official Puppeteer image sets this environment variable for us.
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        await loginToLinkedIn(page);
        await createLinkedInPost(page, postContent);

        console.log('✅ Post submitted successfully!');
        await sendNotification('LinkedIn Bot - Post Success', `Successfully posted: "${postContent}"`);
        updateHistory(postContent);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Sends an email notification if credentials are provided in the .env file.
 * @param {string} subject The subject of the email.
 * @param {string} message The body of the email.
 */
async function sendNotification(subject, message) {
    if (!process.env.NOTIFICATION_EMAIL || !process.env.NOTIFICATION_PASSWORD || !process.env.RECIPIENT_EMAIL) {
        console.warn("⚠️ Notification settings not configured in .env. Skipping notification.");
        return;
    }

    let transporter = nodemailer.createTransport({
        service: 'gmail',  // Or your email provider
        auth: {
            user: process.env.NOTIFICATION_EMAIL,
            pass: process.env.NOTIFICATION_PASSWORD,
        },
    });

    let mailOptions = {
        from: process.env.NOTIFICATION_EMAIL,
        to: process.env.RECIPIENT_EMAIL,
        subject: subject,
        text: message,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('📧 Notification email sent.');
    } catch (error) {
        console.error('❌ Failed to send notification:', error);
    }
}

/**
 * A simple delay helper function.
 * @param {number} ms Milliseconds to wait.
 */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps the main posting logic with a retry mechanism to handle transient errors.
 */
async function runWithRetries() {
    const MAX_RETRIES = 3;
    const INITIAL_DELAY_MINUTES = 1;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            console.log(`🚀 Starting LinkedIn post attempt ${attempt} of ${MAX_RETRIES}...`);
            await postToLinkedIn();
            console.log('✅✅ Process completed successfully in this attempt.');
            return; // Success, so we exit the function.
        } catch (error) {
            console.error(`❌ Attempt ${attempt} failed: ${error.message}`);
            if (attempt < MAX_RETRIES) {
                // Exponential backoff: wait 1 min, then 5 mins.
                const delayMinutes = INITIAL_DELAY_MINUTES * Math.pow(5, attempt - 1);
                const delayMs = delayMinutes * 60 * 1000;
                console.log(`🕒 Waiting ${delayMinutes} minutes before next attempt...`);
                await delay(delayMs);
            } else {
                console.error('❌❌ All retry attempts have failed. The bot will not try again until the next scheduled run.');
                await sendNotification('LinkedIn Bot - All Retries Failed', `The bot failed to post after ${MAX_RETRIES} attempts. Please check the logs. Last error: ${error.message}`);
            }
        }
    }
}

const shouldPostNow = process.argv.includes('--now');

if (shouldPostNow) {
    console.log('🚀 --now flag detected. Posting immediately for a single run...');
    runWithRetries(); // This will run once (with retries) and then the script will exit.
} else {
    // Schedule to run at a random minute between 9:00 and 9:59 AM on Tuesday and Thursday.
    // This makes the posting time less predictable and more human-like.
    const randomMinute = Math.floor(Math.random() * 60);
    const hour = 9; // 9 AM
    const cronExpression = `${randomMinute} ${hour} * * 2,4`; // Tuesday=2, Thursday=4

    console.log(`⏰ Script started. LinkedIn post is scheduled to run at ${hour}:${String(randomMinute).padStart(2, '0')} on the next upcoming Tuesday or Thursday.`);
    console.log('This process will keep running in the foreground. Press Ctrl+C to stop or run with a process manager like pm2.');
    cron.schedule(cronExpression, runWithRetries);
}