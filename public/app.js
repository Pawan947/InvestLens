import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, runTransaction, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Global references assigned dynamically after config fetch
let auth = null;
let db = null;

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('research-form');
  const btnRun = document.getElementById('btn-run');
  const companyInput = document.getElementById('company-name');
  
  const progressContainer = document.getElementById('progress-container');
  const progressFill = document.getElementById('progress-fill');
  const progressVal = document.getElementById('progress-val');
  
  const dashboardContainer = document.getElementById('dashboard-container');
  const reportsList = document.getElementById('reports-list');
  
  const appHeader = document.getElementById('app-header');
  const appContainer = document.getElementById('app-container');
  const appFooter = document.getElementById('app-footer');
  
  const userDisplay = document.getElementById('user-display');
  const btnSignout = document.getElementById('btn-signout');
  
  const rateLimitInfo = document.getElementById('rate-limit-info');
  const remainingAttemptsText = document.getElementById('remaining-attempts-text');
  
  let currentUser = null;
  let currentEventSource = null;
  let currentReportData = null; // Holds the active report data for JSON export

  // Fetch Firebase config and initialize
  try {
    const configResponse = await fetch('/api/firebase-config');
    const firebaseConfig = await configResponse.json();
    
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    
    // Bind authentication lifecycle and form handlers
    setupAuthentication();
  } catch (err) {
    console.error("Failed to initialize Firebase Auth/Database:", err);
    alert("Security subsystem initialization failed. Page execution aborted.");
  }

  function setupAuthentication() {
    // Auth State Listener
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        // Reveal application layouts once verified
        appHeader.classList.remove('hidden');
        appContainer.classList.remove('hidden');
        appFooter.classList.remove('hidden');
        
        userDisplay.textContent = user.email;
        userDisplay.style.display = 'inline-block';
        btnSignout.style.display = 'inline-block';
        loadCachedReportsList();
        updateAttemptsDisplay();
      } else {
        currentUser = null;
        // Redirect immediately to the separate login page
        window.location.href = '/login.html';
      }
    });

    // Logout handler
    btnSignout.addEventListener('click', async () => {
      try {
        await signOut(auth);
      } catch (err) {
        alert("Sign out failed: " + err.message);
      }
    });
  }

  // Tab switching logic
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all buttons and panels
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      
      // Add active to current button and target panel
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');
    });
  });


  // Download PDF Report (Triggers print preview with custom media styling)
  document.getElementById('btn-download-pdf').addEventListener('click', () => {
    window.print();
  });


  // Handle run research submission
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("You must be signed in to access this feature.");
      return;
    }
    const companyName = companyInput.value.trim();
    if (!companyName) return;

    // Reset UI state
    btnRun.classList.add('loading');
    btnRun.disabled = true;
    dashboardContainer.classList.add('hidden');
    
    try {
      // Get current date key (e.g. "2026-07-09")
      const today = new Date().toISOString().split('T')[0];
      const limitRef = ref(db, `users/${currentUser.uid}/limits/${today}`);
      
      // Perform transaction to safely check and increment limit
      let overLimit = false;
      let newCount = 1;
      
      const transactionResult = await runTransaction(limitRef, (currentValue) => {
        const count = currentValue || 0;
        if (count >= 10) {
          overLimit = true;
          return; // Abort transaction
        }
        newCount = count + 1;
        return newCount;
      });
      
      if (overLimit || !transactionResult.committed) {
        alert("Daily rate limit reached (10/10 queries). Please try again tomorrow.");
        updateAttemptsDisplay();
        btnRun.classList.remove('loading');
        btnRun.disabled = false;
        return;
      }

      // Update remaining attempts display
      updateAttemptsDisplay();

      // Reset progress
      progressFill.style.width = '0%';
      progressVal.textContent = '0';
      updateStepper(0, 'pending');
      progressContainer.classList.remove('hidden');

      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName
        })
      });

      const data = await response.json();
      if (data.error) {
        alert(`Server initialization failed: ${data.error}`);
        // Decrement the counter since the job failed to initialize
        await runTransaction(limitRef, (currentValue) => {
          const count = currentValue || 0;
          return count > 0 ? count - 1 : 0;
        });
        updateAttemptsDisplay();
        btnRun.classList.remove('loading');
        btnRun.disabled = false;
        return;
      }

      // Establish EventSource for status updates
      subscribeToJobStatus(data.jobId);

    } catch (err) {
      alert(`Connection failed: ${err.message}`);
      updateAttemptsDisplay();
      btnRun.classList.remove('loading');
      btnRun.disabled = false;
    }
  });

  // Subscribes client to Server-Sent Events status stream
  function subscribeToJobStatus(jobId) {
    if (currentEventSource) {
      currentEventSource.close();
    }

    currentEventSource = new EventSource(`/api/research/status/${jobId}`);
    
    currentEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Update progress
      if (data.progress !== undefined) {
        progressFill.style.width = `${data.progress}%`;
        progressVal.textContent = data.progress;
        updateStepper(data.progress, data.status);
      }

      // Handle final output conditions
      if (data.status === 'completed') {
        currentEventSource.close();
        currentEventSource = null;
        updateStepper(100, 'completed');
        
        setTimeout(() => {
          renderDashboard(data.result);
          progressContainer.classList.add('hidden');
          btnRun.classList.remove('loading');
          btnRun.disabled = false;
          loadCachedReportsList(); // Refresh sidebar
          updateAttemptsDisplay();
        }, 1000);
      } else if (data.status === 'failed') {
        currentEventSource.close();
        currentEventSource = null;
        
        alert(`Pipeline run aborted: ${data.error || 'Unknown error'}`);
        updateAttemptsDisplay();
        btnRun.classList.remove('loading');
        btnRun.disabled = false;
      }
    };

    currentEventSource.onerror = (err) => {
      console.error("SSE connection error:", err);
    };
  }


  // Update Stepper Wizard Indicators
  function updateStepper(progress, status) {
    const stepInit = document.getElementById('step-init');
    const stepScraping = document.getElementById('step-scraping');
    const stepSynthesis = document.getElementById('step-synthesis');
    const stepCompiling = document.getElementById('step-compiling');

    // Reset classes
    [stepInit, stepScraping, stepSynthesis, stepCompiling].forEach(s => {
      if (s) s.classList.remove('active', 'complete');
    });

    if (status === 'completed') {
      [stepInit, stepScraping, stepSynthesis, stepCompiling].forEach(s => {
        if (s) s.classList.add('complete');
      });
      return;
    }

    if (progress <= 5) {
      if (stepInit) stepInit.classList.add('active');
    } else if (progress > 5 && progress < 70) {
      if (stepInit) stepInit.classList.add('complete');
      if (stepScraping) stepScraping.classList.add('active');
    } else if (progress >= 70 && progress < 92) {
      if (stepInit) stepInit.classList.add('complete');
      if (stepScraping) stepScraping.classList.add('complete');
      if (stepSynthesis) stepSynthesis.classList.add('active');
    } else if (progress >= 92 && progress < 100) {
      if (stepInit) stepInit.classList.add('complete');
      if (stepScraping) stepScraping.classList.add('complete');
      if (stepSynthesis) stepSynthesis.classList.add('complete');
      if (stepCompiling) stepCompiling.classList.add('active');
    }
  }

  // Save report to LocalStorage for offline/Vercel persistence
  function saveReportToLocalStorage(report) {
    if (!report || !report.company_name) return;
    try {
      const key = `report_${report.company_name.toLowerCase().replace(/\s+/g, '_').replace(/\./g, '')}`;
      localStorage.setItem(key, JSON.stringify(report));
    } catch (err) {
      console.warn("Could not save to localStorage:", err);
    }
  }

  // Load and combine server-side reports and local storage caching
  async function loadCachedReportsList() {
    try {
      // 1. Fetch reports from Server API
      let serverReports = [];
      try {
        const res = await fetch('/api/reports');
        serverReports = await res.json();
      } catch (err) {
        console.warn("Could not fetch reports from server:", err);
      }
      
      // 2. Read reports from LocalStorage
      const clientReports = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('report_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            clientReports.push({
              filename: `local_${key.substring(7)}`,
              companyName: data.company_name,
              recommendation: data.recommendation || "Watchlist",
              score: data.score || 5,
              website: data.website || "",
              industry: data.industry || "",
              isLocal: true,
              localKey: key
            });
          } catch (e) {
            // skip corrupted
          }
        }
      }

      // 3. Combine both lists, de-duplicating by company name (local storage takes priority)
      const reportsMap = new Map();
      
      // Add server reports first
      serverReports.forEach(r => {
        reportsMap.set(r.companyName.toLowerCase(), {
          ...r,
          isLocal: false
        });
      });
      
      // Add client reports (overwrites server reports if duplicates exist, showing 'Local' badge)
      clientReports.forEach(r => {
        reportsMap.set(r.companyName.toLowerCase(), r);
      });

      const reports = Array.from(reportsMap.values());
      
      reportsList.innerHTML = '';
      if (!reports.length) {
        reportsList.innerHTML = '<div class="no-reports">No reports cached yet.</div>';
        return;
      }

      reports.forEach(rep => {
        const item = document.createElement('div');
        item.className = 'cached-item';
        
        let scoreClass = 'low';
        if (rep.score >= 8) scoreClass = 'high';
        else if (rep.score >= 5) scoreClass = 'med';

        item.innerHTML = `
          <div class="cached-item-header">
            <span class="cached-company">${escapeHtml(rep.companyName)}</span>
            <span class="cached-score ${scoreClass}">${rep.score}/10</span>
          </div>
          <div class="cached-industry">
            ${escapeHtml(rep.industry || 'Unknown Sector')}
            ${rep.isLocal ? '<span class="pill-local" style="font-size:0.6rem; padding:0.1rem 0.35rem; background:rgba(59,130,246,0.1); color:#3b82f6; border-radius:4px; margin-left:5px; font-weight:700;">Local</span>' : ''}
          </div>
        `;

        item.addEventListener('click', () => {
          if (rep.isLocal) {
            const data = JSON.parse(localStorage.getItem(rep.localKey));
            renderDashboard(data);
            dashboardContainer.scrollIntoView({ behavior: 'smooth' });
          } else {
            loadReportFromFile(rep.filename);
          }
        });

        reportsList.appendChild(item);
      });

    } catch (err) {
      console.error("Failed to load reports index:", err);
      reportsList.innerHTML = '<div class="no-reports">Failed to load reports index.</div>';
    }
  }

  // Load dynamic report data on click
  async function loadReportFromFile(filename) {
    try {
      progressContainer.classList.add('hidden');
      const res = await fetch(`/api/reports/${encodeURIComponent(filename)}`);
      const report = await res.json();
      renderDashboard(report);
      // Smooth scroll to dashboard
      dashboardContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      alert("Failed to load cached report data: " + err.message);
    }
  }

  // Map and render the JSON analysis schema to dashboard elements
  function renderDashboard(data) {
    if (!data) return;

    // Cache the data globally for downloads and save to LocalStorage
    currentReportData = data;
    saveReportToLocalStorage(data);

    // Adjust theme class of dashboard container based on recommendation
    const rec = (data.recommendation || 'Watchlist').toLowerCase();
    dashboardContainer.className = 'dashboard-wrapper'; // reset
    if (rec === 'invest') dashboardContainer.classList.add('verdict-invest');
    else if (rec === 'pass') dashboardContainer.classList.add('verdict-pass');
    else dashboardContainer.classList.add('verdict-watchlist');

    // Verdict Elements
    document.getElementById('meta-verdict').textContent = data.recommendation ? data.recommendation.toUpperCase() : 'WATCHLIST';
    document.getElementById('meta-score-num').textContent = data.score || '5';
    document.getElementById('meta-score-bar').style.width = `${(data.score || 5) * 10}%`;

    document.getElementById('meta-company-name').textContent = data.company_name || '-';
    document.getElementById('meta-industry').textContent = data.industry || '-';
    document.getElementById('meta-founded').textContent = data.founded_year || 'Unknown';
    
    const webLink = document.getElementById('meta-website');
    if (data.website) {
      webLink.textContent = data.website;
      webLink.href = data.website.startsWith('http') ? data.website : `https://${data.website}`;
      webLink.classList.remove('hidden');
    } else {
      webLink.textContent = '-';
      webLink.removeAttribute('href');
    }

    // Thesis & Key Strengths / Risks
    document.getElementById('thesis-content').textContent = data.investment_thesis || 'No thesis generated.';
    
    const strengthsUl = document.getElementById('strengths-list');
    strengthsUl.innerHTML = '';
    const strengths = Array.isArray(data.key_strengths) ? data.key_strengths : [];
    if (strengths.length) {
      strengths.forEach(s => {
        const li = document.createElement('li');
        li.textContent = s;
        strengthsUl.appendChild(li);
      });
    } else {
      strengthsUl.innerHTML = '<li>No key strengths highlighted.</li>';
    }

    const risksUl = document.getElementById('risks-list');
    risksUl.innerHTML = '';
    const risks = Array.isArray(data.key_risks) ? data.key_risks : [];
    if (risks.length) {
      risks.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        risksUl.appendChild(li);
      });
    } else {
      risksUl.innerHTML = '<li>No key risks highlighted.</li>';
    }

    // Profile overview
    document.getElementById('profile-business-model').textContent = data.business_model || 'Unknown';
    document.getElementById('profile-value-prop').textContent = data.value_proposition || 'N/A';
    document.getElementById('profile-growth-traction').textContent = data.growth_traction || 'No traction indicators available.';

    // Founders Cards
    const foundersGrid = document.getElementById('founders-grid');
    foundersGrid.innerHTML = '';
    const founders = Array.isArray(data.founders) ? data.founders : [];
    if (founders.length) {
      founders.forEach(f => {
        const fCard = document.createElement('div');
        fCard.className = 'founder-card';

        let pastventures = '';
        if (Array.isArray(f.previous_ventures) && f.previous_ventures.length) {
          pastventures = f.previous_ventures.map(v => `<span class="pill">${escapeHtml(v)}</span>`).join('');
        } else {
          pastventures = '<span class="pill">None Listed</span>';
        }

        fCard.innerHTML = `
          <div class="founder-header">
            <div class="founder-title">
              <h4>${escapeHtml(f.name)}</h4>
              <span>${escapeHtml(f.role || 'Co-founder')}</span>
            </div>
            ${f.linkedin_url ? `<a href="${escapeHtml(f.linkedin_url)}" target="_blank" class="founder-linkedin no-print">🔗</a>` : ''}
          </div>
          <div class="founder-body">
            <div class="founder-detail-row">
              <label>Education & Professional History</label>
              <p>${escapeHtml(f.background || 'Details not available.')}</p>
            </div>
            <div class="founder-detail-row">
              <label>Prior Exits & Ventures</label>
              <div class="pill-list">${pastventures}</div>
            </div>
            <div class="founder-detail-row">
              <label>Advisory & Executive Networks</label>
              <p>${escapeHtml(f.notable_connections || 'None identified.')}</p>
            </div>
            ${f.red_flags ? `
              <div class="founder-detail-row red-flag">
                <label>⚠ CONTROVERSIES / FAILURE RED FLAGS</label>
                <p>${escapeHtml(f.red_flags)}</p>
              </div>
            ` : ''}
          </div>
        `;
        foundersGrid.appendChild(fCard);
      });
    } else {
      foundersGrid.innerHTML = '<div class="card inner-card"><p>No founder profile dossiers generated.</p></div>';
    }

    // Financial Profile Spreadsheet
    const fin = data.financials || {};
    document.getElementById('fin-funding-stage').textContent = fin.funding_stage || 'Unknown';
    document.getElementById('fin-total-funding').textContent = fin.total_funding || 'N/A';
    document.getElementById('fin-last-valuation').textContent = fin.last_valuation || 'N/A';
    document.getElementById('fin-arr').textContent = fin.estimated_arr || 'N/A';
    document.getElementById('fin-revenue').textContent = fin.estimated_revenue || 'N/A';
    document.getElementById('fin-growth').textContent = fin.revenue_growth || 'N/A';
    document.getElementById('fin-margin').textContent = fin.gross_margin || 'N/A';
    document.getElementById('fin-burn').textContent = fin.burn_rate || 'N/A';
    document.getElementById('fin-runway').textContent = fin.runway_estimate || 'N/A';
    document.getElementById('fin-profitability').textContent = fin.profitability || 'N/A';
    document.getElementById('fin-unit-economics').textContent = fin.unit_economics || 'N/A';

    // Investors Cap Table
    const investorsTbody = document.getElementById('investors-tbody');
    investorsTbody.innerHTML = '';
    const investors = Array.isArray(data.notable_investors) ? data.notable_investors : [];
    if (investors.length) {
      investors.forEach(inv => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHtml(inv.name)}</strong></td>
          <td><span class="pill">${escapeHtml(inv.type)}</span></td>
          <td><span class="pill" style="color:var(--text-main);">${escapeHtml(inv.round || 'Unknown')}</span></td>
          <td>${escapeHtml(inv.reputation || '-')}</td>
          <td>${inv.exit_signals ? `<span style="color:var(--accent-red); font-weight:500;">⚠ ${escapeHtml(inv.exit_signals)}</span>` : '-'}</td>
        `;
        investorsTbody.appendChild(tr);
      });
    } else {
      investorsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dark);">No investor capitalization table data available.</td></tr>';
    }

    // Market opportunity & Competitors
    const mkt = data.market || {};
    document.getElementById('market-tam').textContent = mkt.tam || 'Unknown';
    document.getElementById('market-sam').textContent = mkt.sam || 'Unknown';
    document.getElementById('market-growth').textContent = mkt.market_growth_rate || 'Unknown';
    document.getElementById('market-share').textContent = mkt.market_share || 'Unknown';
    document.getElementById('market-trends').textContent = mkt.market_trends || 'No macro trends identified.';
    document.getElementById('market-regulatory').textContent = mkt.regulatory_environment || 'No compliance boundaries identified.';

    const competitorsUl = document.getElementById('competitors-list');
    competitorsUl.innerHTML = '';
    const competitors = Array.isArray(data.competitors) ? data.competitors : [];
    if (competitors.length) {
      competitors.forEach(comp => {
        const li = document.createElement('li');
        li.textContent = comp;
        competitorsUl.appendChild(li);
      });
    } else {
      competitorsUl.innerHTML = '<li>No competitors listed.</li>';
    }

    // Claims Verification Checklist
    const claimsTbody = document.getElementById('claims-tbody');
    claimsTbody.innerHTML = '';
    const claims = Array.isArray(data.claims_verification) ? data.claims_verification : [];
    if (claims.length) {
      claims.forEach(c => {
        const tr = document.createElement('tr');
        
        let statusClass = 'unverified';
        const st = (c.status || '').toLowerCase();
        if (st.includes('verified') && !st.includes('partially')) statusClass = 'verified';
        else if (st.includes('partially')) statusClass = 'partially';
        else if (st.includes('disputed')) statusClass = 'disputed';

        tr.innerHTML = `
          <td><strong>${escapeHtml(c.claim)}</strong></td>
          <td><span class="pill">${escapeHtml(c.source || 'General')}</span></td>
          <td><span class="pill">${escapeHtml(c.verification_source || 'Search')}</span></td>
          <td><span class="status-tag ${statusClass}">${escapeHtml(c.status || 'Unverified')}</span></td>
          <td>${escapeHtml(c.notes || '-')}</td>
        `;
        claimsTbody.appendChild(tr);
      });
    } else {
      claimsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-dark);">No core metrics checklist generated.</td></tr>';
    }

    // Reputation, Red flags, Reality Checks
    const rep = data.reputation || {};
    document.getElementById('rep-linkedin').textContent = rep.linkedin_insights || 'No LinkedIn signals recorded.';
    document.getElementById('rep-customer').textContent = rep.customer_reviews || 'No G2/Trustpilot feedback synthesized.';
    document.getElementById('rep-employee').textContent = rep.employee_reviews || 'No employee feedback records summarized.';
    
    // Red Flags
    const redflagsUl = document.getElementById('redflags-list');
    redflagsUl.innerHTML = '';
    const redflags = Array.isArray(rep.red_flags) ? rep.red_flags : [];
    if (redflags.length) {
      redflags.forEach(f => {
        const li = document.createElement('li');
        li.textContent = f;
        redflagsUl.appendChild(li);
      });
    } else {
      redflagsUl.innerHTML = '<li>No company-level red flags flagged.</li>';
    }

    // Reality check
    document.getElementById('rep-reality-check').textContent = data.reality_check || 'No critical reality checks compiled.';

    // Controversies
    const controversiesUl = document.getElementById('controversies-list');
    controversiesUl.innerHTML = '';
    const controversies = Array.isArray(data.criticisms_controversies) ? data.criticisms_controversies : [];
    if (controversies.length) {
      controversies.forEach(c => {
        const li = document.createElement('li');
        li.textContent = c;
        controversiesUl.appendChild(li);
      });
    } else {
      controversiesUl.innerHTML = '<li>No public controversies recorded.</li>';
    }

    // Reveal Dashboard
    dashboardContainer.classList.remove('hidden');
    
    // Default to Overview tab on render
    tabButtons.forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tabButtons[0].classList.add('active');
    document.getElementById('tab-overview').classList.add('active');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Fetch and update attempts remaining today
  async function updateAttemptsDisplay() {
    if (!currentUser || !db) return;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      const limitRef = ref(db, `users/${currentUser.uid}/limits/${today}`);
      const snapshot = await get(limitRef);
      
      const count = snapshot.exists() ? snapshot.val() : 0;
      const remaining = Math.max(0, 10 - count);
      
      remainingAttemptsText.textContent = `Remaining queries today: ${remaining}/10`;
      
      // Toggle warning color if 0 attempts are remaining
      if (remaining === 0) {
        rateLimitInfo.classList.add('warning');
      } else {
        rateLimitInfo.classList.remove('warning');
      }
      
      rateLimitInfo.style.display = 'inline-flex';
    } catch (err) {
      console.error("Failed to read rate limits:", err);
    }
  }
});
