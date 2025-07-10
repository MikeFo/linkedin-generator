# Use the official Puppeteer image which comes with Node.js and a compatible version of Chrome pre-installed.
# This is the most reliable way to run Puppeteer in a container.
# See: https://github.com/puppeteer/puppeteer/blob/main/docker/README.md
# Using a specific version tag like 24.12.0 ensures reproducible builds.
FROM ghcr.io/puppeteer/puppeteer:24.12.0

# The base image runs as a non-root user 'pptruser' for better security.
# The default working directory is /home/pptruser. We'll create our app dir inside it.
WORKDIR /home/pptruser/app

# Copy package.json and package-lock.json to leverage Docker's layer caching.
# This step will only be re-run if these files change.
COPY package*.json ./

# Install project dependencies.
# We use 'npm ci' for faster, more reliable builds in CI/CD environments
# as it installs dependencies exactly as defined in package-lock.json.
RUN npm ci

# Copy the rest of your application's code into the container.
# The .dockerignore file will prevent copying unnecessary files.
COPY . .

# This is the command for our "Background Worker" service.
# It starts the script with its internal node-cron scheduler, which keeps the process running.
CMD [ "npm", "start" ]