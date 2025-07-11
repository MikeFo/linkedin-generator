// /Users/michaelfodera/LinkedIn Generator/config.js

/**
 * Centralized configuration for selectors, timeouts, and other constants.
 * This makes the script easier to maintain if LinkedIn changes its UI.
 */
module.exports = {
    // CSS selectors used to find elements on LinkedIn pages.
    selectors: {
        // Selector to confirm the main feed has loaded.
        feedConfirmation: '.share-box-feed-entry__trigger',
        // Selectors for various security challenge forms (CAPTCHA, PIN, etc.).
        securityCheck: '#challenge-form, #captcha-internal, [data-id="challenge-form"]',
        // Login form fields.
        loginUsername: '#username',
        loginPassword: '#password',
        loginSubmit: 'button[type="submit"]',
        // Post creation elements.
        postStart: '.share-box-feed-entry__trigger',
        postTextBox: '.ql-editor[role="textbox"]',
        postSubmitEnabled: '.share-actions__primary-action:not([disabled])',
        // Confirmation toast after a successful post.
        postSuccessToast: '.artdeco-toast-item--success',
    },

    // Timeouts in milliseconds for various Puppeteer operations.
    timeouts: {
        navigation: 60000, // General navigation timeout.
        element: 10000,    // Timeout for elements to appear during the login/post flow.
        verification: 45000, // Longer timeout for waiting for the page to load after login/post submission.
        postSuccess: 15000, // Timeout for the success toast to appear after posting.
    },

    // URLs and URL patterns.
    urls: {
        feed: 'https://www.linkedin.com/feed/',
        securityChallenge: /(checkpoint|challenge)/, // A regex to detect if the page is a security checkpoint.
    },

    // File paths
    paths: {
        loginScreenshot: 'login-failure-screenshot.png',
        postScreenshot: 'post-failure-screenshot.png',
    }
};