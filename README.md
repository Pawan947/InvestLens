# InvestLens // Investment Intelligence Agent

InvestLens is an AI-powered due-diligence platform that automates company research. It uses an autonomous browser to search the web, scrape key metrics, and synthesize findings into structured, interactive investment reports.

---

## 1. Overview — What It Does

InvestLens automates comprehensive company due diligence in under two minutes:
*   **Web Research:** Crawls target company websites, news outlets, and review platforms (G2, Glassdoor, Trustpilot, Reddit).
*   **AI Synthesis:** Process and clean the scraped research, then utilize Gemini to synthesize findings into a structured investment report.
*   **Interactive Dashboard:** Displays founder backgrounds, key financials, cap tables, competitors, and reputation metrics in a sleek UI.
*   **PDF Export:** Dedicated styling allows users to instantly save/print reports as clean PDFs directly from the browser.
*   **Rate Limiting & Auth:** Authenticates users via Firebase and limits runs to 10 queries/user/day to control API costs.

---

## 2. How to Run It — Setup & Run Steps

### Prerequisites
*   Node.js (v18+)
*   API keys for Google Gemini and Browser-Use Cloud

### Setup
1.  **Configure Environment:** Create a `.env` file in the root directory:
    ```env
    GOOGLE_API_KEY="your-gemini-key"
    BROWSER_USE_API_KEY="your-browser-use-key"
    
    # Firebase configuration details
    FIREBASE_API_KEY="..."
    FIREBASE_AUTH_DOMAIN="..."
    FIREBASE_DATABASE_URL="..."
    FIREBASE_PROJECT_ID="..."
    FIREBASE_STORAGE_BUCKET="..."
    FIREBASE_MESSAGING_SENDER_ID="..."
    FIREBASE_APP_ID="..."
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Start the Server:**
    ```bash
    npm start
    ```
4.  **Access Dashboard:** Go to `http://localhost:3000` and sign in with your credentials.

---

## 3. How It Works — Architecture

InvestLens uses a clean client-server setup:
*   **Frontend SPA:** A vanilla HTML/CSS/JS interface that uses Firebase Web SDK for login and rate limit checking.
*   **Backend Server:** An Express app that manages API routes, coordinates the pipeline execution, and caches reports locally.
*   **Autonomous Research:** Deploys a headless browser agent via the Browser-Use cloud SDK to search and collect raw text across various resources in a single session.
*   **Data Synthesis:** Structured parsing with Gemini maps the unstructured text into a clean, typed JSON due-diligence report.
*   **Progress Streaming:** Uses Server-Sent Events (SSE) to update the frontend stepper with real-time logs and stage progress.

---

## 4. Key Decisions & Trade-offs

*   **Single-Session Scraping:** We run the entire research checklist in a single browser run rather than launching multiple parallel agents. This is cost-efficient and avoids rate-limit locks, though it requires a 1-2 minute wait time.
*   **Flexible Browser Deployment (Cloud vs. Local):** The implementation uses the Browser-Use SDK. In production, we can easily switch from the cloud API to a local headless browser-use execution runner (e.g., via Playwright/Puppeteer) to eliminate cloud subscription fees and drastically reduce ongoing operational costs.
*   **Gemini 2.5 Flash:** Selected for fast synthesis and robust JSON schema generation. Flash provides the best balance of speed, cost, and output consistency.
*   **Stateless Server Integration:** Enforcing daily limits directly on the client through Firebase Realtime Database database rules means the server stays database-free and can be easily hosted on serverless platforms.
*   **Print-Friendly CSS:** We skipped heavy PDF generation libraries on the backend and instead used standard print-based styling. The user can export pristine PDFs natively via the browser printing engine.

---

## 5. Example Runs

### Stripe
*   **Verdict:** `Invest` | **Rating:** `9/10`
*   **Thesis:** Stripe remains the dominant e-commerce payment infrastructure, processing $1.9T in TPV. High switching costs and growing SaaS revenue outweigh enterprise margin compression risks.
*   **Valuation:** $159B (Feb 2026 secondary buyout).
*   **Key Strengths:** Strong EBITDA profitability ($1B+), Tier-1 backing (Sequoia, Accel).
*   **Key Risks:** High exposure to startup volumes, enterprise pricing competition.

### Linear
*   **Verdict:** `Invest` | **Rating:** `9/10`
*   **Thesis:** Linear is a highly efficient developer tool with 180%+ Net Revenue Retention (NRR) and a rare negative lifetime burn (operating cash flow positive since 2021).
*   **Valuation:** $1.25B (Series C, June 2025).
*   **Key Strengths:** Strong product alignment, highly capital-efficient growth.
*   **Key Risks:** Platform risk if GitHub native projects significantly improve.

### Sonalika
*   **Verdict:** `Invest` | **Rating:** `7/10`
*   **Thesis:** Sonalika is a highly profitable tractor manufacturer and India's No. 1 exporter. Strong operating cash flows and partnership with Yanmar hedge against domestic regulatory and monsoon risks.
*   **Valuation:** ~$3.2B - $4.3B (2025 estimate).
*   **Key Strengths:** 18-19% EBITDA margins, 30.4% export market share.
*   **Key Risks:** Volatile raw material prices, regulatory compliance costs (TREM IV/BS-IV emission norms).
