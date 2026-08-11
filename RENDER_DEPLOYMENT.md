# 🚀 Deploying to Render (Testing Mode with SQLite)

This repository is configured for one-click blueprint deployments on [Render](https://render.com). In this mode, we deploy:
1. **FastAPI Backend (Docker)**: Running with a local ephemeral SQLite database. Playwright and Chromium dependencies are fully configured for web crawling.
2. **Next.js Frontend (Node)**: Connected dynamically to the backend API.

> [!NOTE]
> Since we are using SQLite (`sql_app.db`) inside the container for testing, the database is ephemeral. Any projects, segments, or pages you create will be reset when the Render service restarts or goes to sleep.

---

## 📋 Prerequisites
- A **GitHub / GitLab** repository with your code pushed.
- A **Render account** (free tier is fully supported).
- A **Google Gemini API Key** (from [Google AI Studio](https://aistudio.google.com/)).

---

## 🛠️ Step-by-Step Deployment Guide

### Step 1: Push Changes to your Git Repository
Ensure all newly created/modified configuration files are pushed to your repository:
```bash
git add .
git commit -m "Configure project for Render SQLite deployment"
git push origin main
```

### Step 2: Deploy using Blueprints on Render
1. Go to the [Render Dashboard](https://dashboard.render.com).
2. Click **New +** in the top right, and select **Blueprint**.
3. Connect your Git repository.
4. Render will automatically read the [render.yaml](./render.yaml) file and detect:
   - `localization-backend` (Web Service)
   - `localization-frontend` (Web Service)
5. You will be prompted to enter:
   - **`GEMINI_API_KEY`**: Paste your Google Gemini API Key.
6. Click **Apply**.

Render will now build and deploy the backend and frontend concurrently. 
- *Note: The backend may take 3-5 minutes to build on the first run because it compiles and installs the Playwright Chromium system dependencies.*

---

## ⚙️ How it Works under the Hood

- **Playwright on Render**: The backend is deployed using a custom `backend/Dockerfile` that starts from a `python:3.10-slim` base and installs all necessary Linux system-level libraries for Chromium via `playwright install-deps`.
- **Dynamic Frontend-Backend Link**: The frontend is dynamically configured with the backend's URL via the `NEXT_PUBLIC_API_URL` environment variable using Render's Blueprint relations.
- **Dynamic Script Generation**: When you request the embeddable script snippet for a project, the backend dynamically resolves your Render domain host on-the-fly and generates the correct `<script>` tag.
