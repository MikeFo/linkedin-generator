# LinkedIn Post Scheduler

A Node.js script that automatically posts pre-defined content to a LinkedIn profile. It can be run on a schedule or on-demand, uses Puppeteer for browser automation, and can send email notifications on success or failure.

## Features

- **Automated Posting**: Logs into LinkedIn and posts content automatically.
- **Scheduled & On-Demand**: Posts can be scheduled using a cron job or triggered immediately with a command-line flag.
- **Content Management**: Easily manage post topics and messages in the `content.json` file.
- **Post History**: Avoids re-posting the same content by tracking previously posted messages in `posted_history.json`.
- **Email Notifications**: Sends status updates via email (powered by Nodemailer).
- **Human-like Scheduling**: By default, posts at a random minute within a set hour to avoid detection.

## Setup

1.  **Clone the repository** (if applicable) or ensure you have the project files.

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Create an environment file**:
    Create a `.env` file in the root of the project and add the following variables.

    ```env
    # LinkedIn Credentials
    LINKEDIN_EMAIL="your-linkedin-email@example.com"
    LINKEDIN_PASSWORD="your-linkedin-password"

    # Optional: Specify a topic from content.json to post from.
    # If omitted, a random topic will be chosen.
    # POST_TOPIC=learningAndDevelopment

    # Optional: Email Notification Settings (using Gmail as an example)
    # The sender's email address. For Gmail, you may need to use an "App Password".
    NOTIFICATION_EMAIL="your-email@gmail.com"
    # The password for the sender's email account.
    NOTIFICATION_PASSWORD="your-email-password-or-app-password"
    # The email address to receive the notifications.
RECIPIENT_EMAIL="recipient-email@example.com"
    ```

4.  **Configure Content**:
    Open `content.json` and add your desired topics and post messages. Each topic is an array of message objects.

    ```json
    {
      "topics": {
        "yourTopicName": [
          { "message": "This is the first post. #Hashtag" },
          { "message": "This is the second post. #AnotherHashtag" }
        ]
      }
    }
    ```

## Usage

### Scheduled Posting

To start the script in its default scheduled mode, simply run:

```bash
node index.js
```

By default, the script is scheduled to post at a random minute between 9:00 and 9:59 AM on every Tuesday and Thursday. You can see the exact scheduled time in the console when you start the script.

### Immediate Posting

To run the script once immediately and bypass the schedule, use the `--now` flag:

```bash
node index.js --now
```

The script will execute the posting logic one time and then exit.