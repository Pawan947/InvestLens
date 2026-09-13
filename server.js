import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { BrowserUse } from 'browser-use-sdk/v3';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure API keys
let GOOGLE_API_KEY = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
if (!GOOGLE_API_KEY) {
  // Hardcoded fallback matching Python code
  GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
}
process.env.GOOGLE_API_KEY = GOOGLE_API_KEY;
process.env.GEMINI_API_KEY = GOOGLE_API_KEY;

const BROWSER_USE_API_KEY = (
  process.env.BROWSER_USE_API_KEY || process.env.browser_use || ''
).trim();
if (BROWSER_USE_API_KEY) {
  process.env.BROWSER_USE_API_KEY = BROWSER_USE_API_KEY;
}

const BROWSER_USE_CLOUD_MODEL = "gemini-3-flash";
const SYNTHESIS_MODEL = "gemini-2.5-flash";

// Initialize Gemini client
const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// Job tracking state
const jobs = new Map();

// Helper functions for file naming
function getRawResearchPath(companyName) {
  const slug = companyName.toLowerCase().replace(/\s+/g, '_').replace(/\./g, '');
  const filename = `${slug}_raw_research.json`;
  const dir = process.env.VERCEL ? '/tmp' : process.cwd();
  return path.join(dir, filename);
}

function getReportPath(companyName) {
  const slug = companyName.toLowerCase().replace(/\s+/g, '_').replace(/\./g, '');
  const filename = `${slug}_investment_report.json`;
  const dir = process.env.VERCEL ? '/tmp' : process.cwd();
  return path.join(dir, filename);
}

// Replicate Python's research prompt builder
function buildDeepResearchTask(companyName) {
  return `
You are a senior due-diligence research analyst at a top-tier venture capital fund. Your task is to perform an EXHAUSTIVE, deep-dive research session on the company: "${companyName}".

IMPORTANT: The research output must be extremely detailed, factual, and data-rich. Do not write high-level summaries or single-paragraph overviews. For each step, write multi-paragraph, raw notes containing names, dates, exact numbers, dollar figures, tables of funding rounds, and direct quotes from employee/customer reviews.

CRITICAL FORMATTING RULES:
1. All findings for a step MUST be written inside the exact sentinel tags specified for that step.
2. DO NOT write your research notes outside the tags. Anything written outside the tags will be discarded.
3. Be as verbose and complete as possible. Aim for at least 1,000 to 2,000 characters of detailed raw notes for each section.

Complete the following 8 research steps in order:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — COMPANY OVERVIEW & PRODUCT DETAIL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Go to the official website of "${companyName}".
Find and document:
• Exact official name, parent entity, primary office address/headquarters location.
• Stated founding year and company mission statement.
• Detailed description of the product or service, core technology, and target user personas.
• Value proposition: what problem do they solve, and what is their unique angle?
• Complete business model: how do they monetize? List pricing plans, contract sizes, SaaS tiers, transaction fees, or other revenue streams.
• Self-reported metrics: user counts, active customer figures, revenue/ARR claims, transaction volumes. Document the exact page URLs or context where these claims are made.

###COMPANY_START###
[Detailed findings, pricing structures, product features, and self-reported metrics]
###COMPANY_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — FOUNDERS, CEO & LEADERSHIP DEEP DIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For EACH founder, the current CEO, and other C-level executives (CTO, COO):
1. Find and visit their LinkedIn profiles, Crunchbase pages, or executive bios.
2. Document: full name, exact current title, education history (schools, degrees, years), and complete career history (prior companies, roles, tenure).
3. Research previous companies they founded or ran: Were they acquired? Did they IPO? Did they go bankrupt or shut down? List dates and exit values if public.
4. Document domain expertise: Do they have deep technical/business experience in this specific industry?
5. Search for controversies: Check Google News and public records for any lawsuits, fraud allegations, regulatory warnings, or severe criticisms naming the founders or executives personally.
6. Detail their advisory board roles, board seats, or notable investor/founder connections.

###FOUNDERS_START###
[Separate detailed dossiers for each founder and key executive]
###FOUNDERS_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — FUNDING HISTORY & INVESTOR ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Go to Crunchbase, PitchBook references, or news articles to map the company's capitalization table.
2. Reconstruct the funding history round-by-round. For EACH round (Pre-seed, Seed, Series A, B, C, D, etc.), document:
   • Round date (month and year)
   • Amount raised (in USD)
   • Lead investor name
   • Participant investor names
3. Classify and evaluate the lead investors: Are they Tier-1 (e.g. Sequoia, Accel, Benchmark, a16z), Tier-2, corporate strategics, or unknown angels? What is their reputation and notable portfolio?
4. Look for signals of secondary sales, early investor exit, or shares being liquidated.
5. Check for unusual funding structures (e.g., venture debt, convertible notes, heavily structured terms, down-rounds, or bridge rounds).

###INVESTORS_START###
[Round-by-round funding history list/table and analysis of investor quality and signals]
###INVESTORS_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — FINANCIAL CONDITION & METRICS ASSESSMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Search TechCrunch, Forbes, Business Insider, and other business news for any leaked or disclosed financial metrics of "${companyName}". Document:
1. Total funding raised to date.
2. Most recent post-money valuation and the date/round it was set.
3. Estimated annual revenue or ARR (Annual Recurring Revenue) run rate.
4. YoY (Year-over-Year) growth rate or growth trajectory.
5. Gross margins or net margins (if SaaS, are they in the standard 70-80%+ range?).
6. Burn rate and runway: Find any indications of monthly cash burn. Calculate or estimate how many months of runway they have left based on their last funding round.
7. Unit economics: Document CAC (Customer Acquisition Cost), LTV (Lifetime Value), LTV:CAC ratio, or payback period.
8. Profitability: Are they profitable, cash-flow positive, EBITDA positive, or burning cash? Note any cost-cutting measures or layoffs.

###FINANCIAL_START###
[Exhaustive breakdown of valuations, ARR, margins, burn, runway, and growth metrics]
###FINANCIAL_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — MARKET OPPORTUNITY & REGULATORY TAILWINDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Find the market size (TAM - Total Addressable Market, and SAM - Serviceable Addressable Market) for their industry.
2. What is the projected CAGR (Compound Annual Growth Rate) of the market segment?
3. Calculate the company's estimated market share (revenue divided by TAM/SAM).
4. List key structural tailwinds (technological shifts, customer demand) and headwinds (macro factors, supply chain, interest rates).
5. Document the regulatory environment: What compliance standards (GDPR, SOC2, HIPAA, PCI) must they meet? Are there impending regulations that threaten their business model?

###MARKET_START###
[TAM/SAM sizes, growth rates, market share calculations, and regulatory risks]
###MARKET_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — COMPETITORS & DEFENSIVE MOAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Identify 6 to 8 direct and indirect competitors of "${companyName}".
2. For each competitor, document: funding status, estimated scale/revenue, and how their product features differ.
3. Critically analyze the company's moat:
   • Do they have high switching costs?
   • Are there strong network effects?
   • Do they own proprietary IP/technology/patents?
   • Is their brand/distribution a defensible advantage?
4. Are legacy incumbents (e.g. Microsoft, Google, Salesforce) actively building competing features?

###COMPETITOR_START###
[List of competitors with size/features and a critical analysis of moats and defensibility]
###COMPETITOR_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7 — LINKEDIN company SIGNALS & EMPLOYEE GROWTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Search for the LinkedIn company profile of "${companyName}".
1. Document exact employee headcount listed.
2. Look for employee growth trends: 6-month, 1-year, and 2-year headcount growth percentages.
3. Check their open job listings: What departments are they hiring in most? (Engineering vs. Sales/Marketing).
4. Evaluate employee tenure: Is there high turnover? Check if there has been a recent wave of departures.
5. Identify any notable executive or VP-level hires or departures in the past 12 months.

###LINKEDIN_START###
[Headcount figures, growth curves, hiring focus departments, and tenure/departure signals]
###LINKEDIN_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8 — PUBLIC REPUTATION, GLASSDOOR & REVIEWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Find out what customers and employees say about "${companyName}":
1. Trustpilot / G2 / Capterra: Document overall score, review count, and paste 3-4 specific bulleted summaries of customer praise and customer complaints.
2. Glassdoor: Overall company score, CEO approval rating (%), recommend-to-friend rating. Note the most common pros and cons cited by employees.
3. Reddit & Developer Forums: Search for public sentiment on subreddits like r/startups, Hacker News, or r/programming. What is the developer community's consensus?
4. Public red flags: Detail any lawsuits, trademark disputes, data breaches, system outages, FTC complaints, or PR controversies.

###REPUTATION_START###
[Scores, ratings, G2 pros/cons, Glassdoor employee feedback, and any public legal/PR red flags]
###REPUTATION_END###

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMINDER: Complete all steps, visit the actual web sources, and ensure all raw, verbose findings are wrapped inside their designated sentinel tags.
`;
}

const SECTION_TAGS = {
  company:    ["###COMPANY_START###",   "###COMPANY_END###"],
  founders:   ["###FOUNDERS_START###",  "###FOUNDERS_END###"],
  investors:  ["###INVESTORS_START###", "###INVESTORS_END###"],
  financial:  ["###FINANCIAL_START###", "###FINANCIAL_END###"],
  market:     ["###MARKET_START###",    "###MARKET_END###"],
  competitor: ["###COMPETITOR_START###", "###COMPETITOR_END###"],
  linkedin:   ["###LINKEDIN_START###",  "###LINKEDIN_END###"],
  reputation: ["###REPUTATION_START###", "###REPUTATION_END###"],
};

function parseResearchSections(raw) {
  const sections = {};
  for (const [key, [startTag, endTag]] of Object.entries(SECTION_TAGS)) {
    const s = raw.indexOf(startTag);
    const e = raw.indexOf(endTag);
    if (s !== -1 && e !== -1 && e > s) {
      sections[key] = raw.substring(s + startTag.length, e).trim();
    } else {
      sections[key] = raw.trim(); // fallback: full output
    }
  }
  return sections;
}

function extractRetryDelay(errStr) {
  const patterns = [
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i,
    /Please retry in (\d+(?:\.\d+)?)s/i,
    /retry in (\d+(?:\.\d+)?)s/i
  ];
  for (const pat of patterns) {
    const m = errStr.match(pat);
    if (m) {
      return Math.min(parseFloat(m[1]) + 3, 120);
    }
  }
  return 10;
}

// Generate synthesis prompt template
function buildSynthesisPrompt(companyName, sections) {
  const companyData   = sections.company || "No data";
  const foundersData  = sections.founders || "No data";
  const investorsData = sections.investors || "No data";
  const financialData = sections.financial || "No data";
  const marketData    = sections.market || "No data";
  const competitorData= sections.competitor || "No data";
  const linkedinData  = sections.linkedin || "No data";
  const reputationData= sections.reputation || "No data";

  return `
You are a senior venture capital analyst at a Tier-1 fund. You have just received deep due-diligence research on the company "${companyName}". 

Synthesize ALL research into a comprehensive, structured investment analysis. Be rigorous, skeptical, and data-driven.

━━━ RESEARCH DATA ━━━

[COMPANY OVERVIEW]
${companyData.substring(0, 3000)}

[FOUNDERS & LEADERSHIP]
${foundersData.substring(0, 4000)}

[INVESTOR HISTORY]
${investorsData.substring(0, 3000)}

[FINANCIAL CONDITION]
${financialData.substring(0, 3000)}

[MARKET ANALYSIS]
${marketData.substring(0, 2500)}

[COMPETITORS]
${competitorData.substring(0, 2000)}

[LINKEDIN SIGNALS]
${linkedinData.substring(0, 1500)}

[REPUTATION & RED FLAGS]
${reputationData.substring(0, 2500)}

━━━ ANALYSIS INSTRUCTIONS ━━━

    9. **Reality Check & Critical Analysis**: Provide a critical verification section comparing the company's self-reported success or product capability against objective industry signals (e.g. employee count vs revenue, web traffic vs user claims).
    10. **Defamations, Criticisms & Controversies**: List any public pushback, criticisms, Glassdoor employee complaints, lawsuit details, or negative developer feedback discovered.
    11. **Score & Recommendation**: Score 1–10 and choose: Invest | Watchlist | Pass.

━━━ OUTPUT FORMAT ━━━

Return ONLY a valid JSON object matching this EXACT schema. No markdown, no explanation — raw JSON only:

{
  "company_name": "string",
  "website": "string (official URL)",
  "industry": "string",
  "founded_year": "string or null",
  "business_model": "string (SaaS/Marketplace/Transactional/Hardware+SW/etc.) or null",
  "value_proposition": "string (one sentence) or null",
  "founders": [
    {
      "name": "string",
      "role": "string (CEO/CTO/Co-founder/etc.)",
      "background": "string — career history, education, domain expertise",
      "previous_ventures": ["list of prior companies/exits"],
      "notable_connections": "string — key investors, advisors, networks they have access to",
      "linkedin_url": "string or null",
      "red_flags": "string or null — controversies, failures, fraud concerns"
    }
  ],
  "financials": {
    "total_funding": "string or null",
    "funding_stage": "string (Seed/Series A/B/C/D/Growth/Public/Bootstrapped) or null",
    "last_valuation": "string or null",
    "estimated_arr": "string or null",
    "estimated_revenue": "string or null",
    "burn_rate": "string or null",
    "runway_estimate": "string or null",
    "gross_margin": "string or null",
    "revenue_growth": "string or null",
    "profitability": "string (Profitable/Near break-even/Burning cash/Unknown) or null",
    "unit_economics": "string or null"
  },
  "notable_investors": [
    {
      "name": "string",
      "type": "string (VC/Angel/Corporate/Family Office)",
      "round": "string or null",
      "reputation": "string — tier, notable portfolio, track record",
      "exit_signals": "string or null — any secondary sales or position reductions"
    }
  ],
  "competitors": ["list of competitor names"],
  "growth_traction": "string — key growth metrics and signals or null",
  "market": {
    "tam": "string or null",
    "sam": "string or null",
    "market_growth_rate": "string or null",
    "market_share": "string or null",
    "regulatory_environment": "string or null",
    "market_trends": "string or null"
  },
  "claims_verification": [
    {
      "claim": "string",
      "source": "string (Homepage/About page/Press release)",
      "verification_source": "string (Crunchbase/LinkedIn/G2/News)",
      "status": "Verified | Partially Verified | Unverified | Disputed",
      "notes": "string"
    }
  ],
  "reputation": {
    "linkedin_insights": "string or null",
    "customer_reviews": "string — Trustpilot/G2 summary or null",
    "employee_reviews": "string — Glassdoor/Reddit summary or null",
    "red_flags": ["list of red flag strings"]
  },
  "reality_check": "string — a critical reality check of the company's claims vs objective external signals",
  "criticisms_controversies": ["list of criticisms, controversies, community backlash, Glassdoor complaints, or defamations/legal issues discovered"],
  "investment_thesis": "string — 3-5 sentence balanced investment thesis",
  "key_risks": ["list of key risks, ordered by severity"],
  "key_strengths": ["list of key strengths, ordered by importance"],
  "recommendation": "Invest | Watchlist | Pass",
  "score": 7
}
`;
}

async function synthesizeWithGemini(companyName, sections, updateLog, jobId, maxRetries = 4) {
  const prompt = buildSynthesisPrompt(companyName, sections);
  updateLog(jobId, "[Synthesis] Calling Gemini (" + SYNTHESIS_MODEL + ") to synthesize research...", null, 80);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: SYNTHESIS_MODEL,
        contents: prompt,
        config: {
          temperature: 0.2,
          maxOutputTokens: 8192
        }
      });

      let raw = (response.text || '').trim();
      
      // Strip markdown fences
      if (raw.includes("```json")) {
        raw = raw.split("```json")[1].split("```")[0].trim();
      } else if (raw.includes("```")) {
        raw = raw.split("```")[1].split("```")[0].trim();
      }

      const data = JSON.parse(raw);
      updateLog(jobId, `  [Synthesis] Success — ${raw.length.toLocaleString()} chars of JSON received.`, null, 90);
      return data;
    } catch (err) {
      const errStr = err.message || String(err);
      const isRateLimit = /429|RESOURCE_EXHAUSTED|quota|RateLimitError/i.test(errStr);
      
      if (isRateLimit) {
        const wait = extractRetryDelay(errStr);
        if (attempt < maxRetries) {
          updateLog(jobId, `  [Rate Limit] Quota hit (attempt ${attempt}/${maxRetries}). Waiting ${wait}s before retry...`, null, 85);
          await new Promise(resolve => setTimeout(resolve, wait * 1000));
        } else {
          updateLog(jobId, `  [Rate Limit] All ${maxRetries} retries exhausted. Free-tier limit reached.`, null, 88);
          return null;
        }
      } else {
        updateLog(jobId, `  [Warning] Synthesis parse failure (attempt ${attempt}): ${errStr}`, null, 85);
        if (attempt === maxRetries) return null;
      }
    }
  }
  return null;
}

// Generates a fallback structured dossier if Gemini synthesis is failed or skipped
function buildFallbackAnalysis(companyName, sections) {
  return {
    company_name: companyName,
    website: "",
    industry: "Unknown Sector (Fallback)",
    founded_year: "Unknown",
    business_model: "Unknown (Fallback)",
    value_proposition: "Dossier constructed directly from raw research sections. Gemini synthesis was skipped/failed.",
    founders: [],
    financials: {
      total_funding: "N/A",
      funding_stage: "Unknown",
      last_valuation: "N/A",
      estimated_arr: "N/A",
      estimated_revenue: "N/A",
      burn_rate: "N/A",
      runway_estimate: "N/A",
      gross_margin: "N/A",
      revenue_growth: "N/A",
      profitability: "Unknown",
      unit_economics: "N/A"
    },
    notable_investors: [],
    competitors: [],
    growth_traction: "Refer to raw research details.",
    market: {
      tam: "N/A",
      sam: "N/A",
      market_growth_rate: "N/A",
      market_share: "N/A",
      regulatory_environment: "N/A",
      market_trends: "N/A"
    },
    claims_verification: [],
    reputation: {
      linkedin_insights: "See raw research",
      customer_reviews: "See raw research",
      employee_reviews: "See raw research",
      red_flags: []
    },
    reality_check: "Gemini synthesis unavailable. Raw research is attached in the raw JSON file.",
    criticisms_controversies: [],
    investment_thesis: "Gemini synthesis failed. A fallback dossier has been generated to preserve the collected raw research.",
    key_risks: ["Gemini synthesis failed. Key risks were not extracted automatically."],
    key_strengths: ["Gemini synthesis failed. Key strengths were not extracted automatically."],
    recommendation: "Watchlist",
    score: 5,
    raw_research: sections
  };
}

// Maps raw JSON output to validated Pydantic-like object structure
function buildInvestmentAnalysis(companyName, data, rawResearch = null) {
  if (!data) return null;

  const result = {
    company_name: data.company_name || companyName,
    website: data.website || "",
    industry: data.industry || "",
    founded_year: data.founded_year || null,
    business_model: data.business_model || null,
    value_proposition: data.value_proposition || null,
    founders: [],
    financials: {
      total_funding: null,
      funding_stage: null,
      last_valuation: null,
      estimated_arr: null,
      estimated_revenue: null,
      burn_rate: null,
      runway_estimate: null,
      gross_margin: null,
      revenue_growth: null,
      profitability: null,
      unit_economics: null
    },
    notable_investors: [],
    competitors: Array.isArray(data.competitors) ? data.competitors : [],
    growth_traction: data.growth_traction || null,
    market: {
      tam: null,
      sam: null,
      market_growth_rate: null,
      market_share: null,
      regulatory_environment: null,
      market_trends: null
    },
    claims_verification: [],
    reputation: {
      linkedin_insights: null,
      customer_reviews: null,
      employee_reviews: null,
      red_flags: []
    },
    reality_check: data.reality_check || null,
    criticisms_controversies: Array.isArray(data.criticisms_controversies) ? data.criticisms_controversies : [],
    investment_thesis: data.investment_thesis || "No thesis generated.",
    key_risks: Array.isArray(data.key_risks) ? data.key_risks : [],
    key_strengths: Array.isArray(data.key_strengths) ? data.key_strengths : [],
    recommendation: data.recommendation || "Watchlist",
    score: typeof data.score === 'number' ? data.score : parseInt(data.score) || 5,
    raw_research: rawResearch
  };

  // Map founders
  if (Array.isArray(data.founders)) {
    result.founders = data.founders.map(f => ({
      name: f.name || "",
      role: f.role || "",
      background: f.background || null,
      previous_ventures: Array.isArray(f.previous_ventures) ? f.previous_ventures : [],
      notable_connections: f.notable_connections || null,
      linkedin_url: f.linkedin_url || null,
      red_flags: f.red_flags || null
    }));
  }

  // Map financials
  if (data.financials) {
    const fin = data.financials;
    result.financials = {
      total_funding: fin.total_funding || null,
      funding_stage: fin.funding_stage || null,
      last_valuation: fin.last_valuation || null,
      estimated_arr: fin.estimated_arr || null,
      estimated_revenue: fin.estimated_revenue || null,
      burn_rate: fin.burn_rate || null,
      runway_estimate: fin.runway_estimate || null,
      gross_margin: fin.gross_margin || null,
      revenue_growth: fin.revenue_growth || null,
      profitability: fin.profitability || null,
      unit_economics: fin.unit_economics || null
    };
  }

  // Map investors
  if (Array.isArray(data.notable_investors)) {
    result.notable_investors = data.notable_investors.map(inv => ({
      name: inv.name || "",
      type: inv.type || "Unknown",
      round: inv.round || null,
      reputation: inv.reputation || null,
      exit_signals: inv.exit_signals || null
    }));
  }

  // Map market
  if (data.market) {
    const m = data.market;
    result.market = {
      tam: m.tam || null,
      sam: m.sam || null,
      market_growth_rate: m.market_growth_rate || null,
      market_share: m.market_share || null,
      regulatory_environment: m.regulatory_environment || null,
      market_trends: m.market_trends || null
    };
  }

  // Map claims
  if (Array.isArray(data.claims_verification)) {
    result.claims_verification = data.claims_verification.map(c => ({
      claim: c.claim || "",
      source: c.source || "",
      verification_source: c.verification_source || "",
      status: c.status || "Unverified",
      notes: c.notes || null
    }));
  }

  // Map reputation
  if (data.reputation) {
    const r = data.reputation;
    result.reputation = {
      linkedin_insights: r.linkedin_insights || null,
      customer_reviews: r.customer_reviews || null,
      employee_reviews: r.employee_reviews || null,
      red_flags: Array.isArray(r.red_flags) ? r.red_flags : []
    };
  }

  return result;
}

// Background Job execution pipeline
async function executeResearchPipeline(jobId, companyName) {
  const updateLog = (id, text, status = null, progress = null) => {
    const job = jobs.get(id);
    if (!job) return;
    job.logs.push(text);
    if (status) job.status = status;
    if (progress !== null) job.progress = progress;

    const dataPayload = JSON.stringify({
      status: job.status,
      progress: job.progress,
      logs: job.logs,
      result: job.result,
      error: job.error
    });

    job.clients.forEach(res => {
      res.write(`data: ${dataPayload}\n\n`);
    });
  };

  try {
    updateLog(jobId, `Starting research pipeline for '${companyName}'`, 'running', 5);

    let sections = {};
    const rawPath = getRawResearchPath(companyName);

    updateLog(jobId, `[Step 1] Running Browser-Use Cloud deep research (1 API call)...`, null, 10);
    
    if (!BROWSER_USE_API_KEY) {
      updateLog(jobId, `  [Warning] No BROWSER_USE_API_KEY — skipping cloud browser research.`, null, 20);
      sections = Object.keys(SECTION_TAGS).reduce((acc, val) => ({ ...acc, [val]: "" }), {});
    } else {
      updateLog(jobId, `  [Cloud Browser] Starting task using model: ${BROWSER_USE_CLOUD_MODEL}`, null, 15);
      const task = buildDeepResearchTask(companyName);
      const start = Date.now();

      try {
        const client = new BrowserUse({ apiKey: BROWSER_USE_API_KEY });
        const result = await client.run(task, { model: BROWSER_USE_CLOUD_MODEL });
        const raw = result.output || String(result);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        updateLog(jobId, `  [Cloud Browser] Completed in ${elapsed}s (${raw.length.toLocaleString()} chars)`, null, 55);

        sections = parseResearchSections(raw);
        const matched = Object.keys(sections).filter(k => sections[k] && sections[k] !== raw.trim());
        updateLog(jobId, `  [Cloud Browser] Sections parsed: ${matched.length ? matched.join(', ') : 'fallback mode'}`, null, 60);

        // Save raw research immediately
        const totalChars = Object.values(sections).reduce((sum, v) => sum + v.length, 0);
        if (totalChars > 0) {
          const rawPayload = {
            company_name: companyName,
            timestamp: new Date().toISOString(),
            browser_model: BROWSER_USE_CLOUD_MODEL,
            sections,
            section_lengths: Object.keys(sections).reduce((acc, k) => ({ ...acc, [k]: sections[k].length }), {}),
            total_chars: totalChars
          };
          fs.writeFileSync(rawPath, JSON.stringify(rawPayload, null, 2), 'utf8');
          updateLog(jobId, `  [Step 1 ✓] Raw research saved to: ${rawPath}`, null, 65);
        }
      } catch (browserErr) {
        updateLog(jobId, `  [Error] Browser task failed: ${browserErr.message}`, null, 60);
        sections = Object.keys(SECTION_TAGS).reduce((acc, val) => ({ ...acc, [val]: "" }), {});
      }
    }

    // Step 2: Synthesis with Gemini
    updateLog(jobId, `[Step 2] Synthesizing research with Gemini...`, null, 70);
    let rawData = null;
    try {
      rawData = await synthesizeWithGemini(companyName, sections, updateLog, jobId);
    } catch (synthErr) {
      updateLog(jobId, `  [Warning] Gemini synthesis failed: ${synthErr.message}`, null, 85);
    }

    // Step 3: Parse and validate report
    updateLog(jobId, `[Step 3] Building InvestmentAnalysis model...`, null, 92);
    let details = null;
    if (rawData) {
      details = buildInvestmentAnalysis(companyName, rawData, sections);
    }
    if (!details) {
      updateLog(jobId, `  [Warning] Bypassing Gemini synthesis. Generating fallback dossier from raw research...`, null, 94);
      details = buildFallbackAnalysis(companyName, sections);
    }

    // Save final report
    const reportPath = getReportPath(companyName);
    fs.writeFileSync(reportPath, JSON.stringify(details, null, 2), 'utf8');
    updateLog(jobId, `  → Report saved: ${reportPath}`, null, 98);

    // Job finished
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.result = details;
      updateLog(jobId, `Pipeline complete for '${companyName}'! Ready to load dashboard.`, 'completed', 100);
    }

  } catch (err) {
    console.error("Pipeline run error:", err);
    const job = jobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = err.message || String(err);
      updateLog(jobId, `[Fatal Error] Pipeline failed: ${job.error}`, 'failed');
    }
  }
}

// REST Endpoints
app.post('/api/research', (req, res) => {
  const { companyName } = req.body;
  if (!companyName) {
    return res.status(400).json({ error: "Missing companyName in request body." });
  }

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  
  jobs.set(jobId, {
    id: jobId,
    companyName,
    status: 'pending',
    progress: 0,
    logs: [],
    result: null,
    error: null,
    clients: []
  });

  // Start background process
  executeResearchPipeline(jobId, companyName);

  res.json({ jobId });
});

// SSE endpoint to track status
app.get('/api/research/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job ID not found." });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send current state immediately
  const initialPayload = JSON.stringify({
    status: job.status,
    progress: job.progress,
    logs: job.logs,
    result: job.result,
    error: job.error
  });
  res.write(`data: ${initialPayload}\n\n`);

  // Subscribe client
  job.clients.push(res);

  req.on('close', () => {
    job.clients = job.clients.filter(client => client !== res);
  });
});

// Scan workspace for previous reports
app.get('/api/reports', (req, res) => {
  try {
    const dirs = [process.cwd()];
    if (process.env.VERCEL || fs.existsSync('/tmp')) {
      dirs.push('/tmp');
    }
    const reports = [];
    const seenFiles = new Set();

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);

      for (const file of files) {
        if (file.endsWith('_investment_report.json') && !seenFiles.has(file)) {
          seenFiles.add(file);
          const fullPath = path.join(dir, file);
          try {
            const content = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            reports.push({
              filename: file,
              companyName: content.company_name || file.replace('_investment_report.json', ''),
              recommendation: content.recommendation || "Watchlist",
              score: content.score || 5,
              website: content.website || "",
              industry: content.industry || ""
            });
          } catch (e) {
            // ignore corrupted JSON
          }
        }
      }
    }
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Failed to read cached reports list: " + err.message });
  }
});

// Load a specific report
app.get('/api/reports/:filename', (req, res) => {
  const { filename } = req.params;
  // Prevent directory traversal
  const safeFilename = path.basename(filename);
  if (!safeFilename.endsWith('_investment_report.json')) {
    return res.status(400).json({ error: "Invalid report filename format." });
  }

  const dirs = [process.cwd()];
  if (process.env.VERCEL || fs.existsSync('/tmp')) {
    dirs.push('/tmp');
  }

  let reportPath = null;
  for (const dir of dirs) {
    const p = path.join(dir, safeFilename);
    if (fs.existsSync(p)) {
      reportPath = p;
      break;
    }
  }

  if (!reportPath) {
    return res.status(404).json({ error: "Report not found." });
  }

  try {
    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    res.json(reportData);
  } catch (err) {
    res.status(500).json({ error: "Error reading report: " + err.message });
  }
});

// Expose Firebase config variables to the frontend dynamically
app.get('/api/firebase-config', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    databaseURL: process.env.FIREBASE_DATABASE_URL || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    appId: process.env.FIREBASE_APP_ID || ""
  });
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Investment Research Agent running on port ${PORT}`);
  console.log(`  Access dashboard: http://localhost:${PORT}`);
  console.log(`==================================================`);
});
