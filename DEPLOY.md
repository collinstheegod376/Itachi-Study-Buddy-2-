# ITACHI STUDY BUDDY — FULL DEPLOYMENT GUIDE
## Stack: Supabase + Resend + Vercel

---

## FOLDER STRUCTURE

```
itachi-study-buddy/
├── login.html
├── onboarding.html
├── dashboard.html
├── subjects.html
├── timetable.html
├── focus.html
├── progress.html
├── settings.html
├── vercel.json
├── js/
│   └── supabase-client.js          ← shared API layer
└── supabase/
    ├── schema.sql                   ← run once in SQL editor
    └── functions/
        ├── send-email/index.ts      ← email via Resend
        ├── schedule-sessions/index.ts ← smart timetable
        └── streak-check/index.ts    ← daily cron jobs
```

---

## STEP 1 — SUPABASE SETUP (10 minutes)

### 1.1 Create Project
1. Go to https://supabase.com → New Project
2. Name it `itachi-study-buddy`
3. Choose a strong database password (save it!)
4. Select region closest to your users (e.g. `eu-west-1` for Nigeria/Africa)
5. Wait ~2 minutes for provisioning

### 1.2 Run the Schema
1. In your project → go to **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste the entire contents of `supabase/schema.sql`
4. Click **Run** (Ctrl+Enter)
5. You should see: "Success. No rows returned"

### 1.3 Enable Google Auth (optional but recommended)
1. Go to **Authentication** → **Providers**
2. Enable **Google**
3. Follow the instructions to set up OAuth in Google Cloud Console
4. Add your redirect URL: `https://YOUR-VERCEL-URL.vercel.app`

### 1.4 Get Your Keys
1. Go to **Settings** → **API**
2. Copy:
   - `Project URL` → goes into `SUPABASE_URL`
   - `anon/public` key → goes into `SUPABASE_ANON_KEY`
   - `service_role` key → goes into `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

### 1.5 Update supabase-client.js
Open `js/supabase-client.js` and replace lines 8–9:
```js
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

---

## STEP 2 — RESEND SETUP (5 minutes)

### 2.1 Create Resend Account
1. Go to https://resend.com → Sign Up (free tier: 3,000 emails/month)
2. Verify your email

### 2.2 Set Up Domain (recommended) OR use Resend's test domain
**With custom domain** (looks professional):
1. Go to **Domains** → Add Domain
2. Enter your domain (e.g. `itachi.study` or any domain you own)
3. Add the DNS records shown to your DNS provider
4. Wait for verification (usually 5–30 minutes)

**Without custom domain** (for testing):
- Resend gives you `onboarding@resend.dev` for free testing
- Update `FROM_EMAIL` in `send-email/index.ts` to `"Itachi <onboarding@resend.dev>"`

### 2.3 Get API Key
1. Go to **API Keys** → Create API Key
2. Name it `itachi-production`
3. Set permission: **Full access**
4. Copy the key — you'll only see it once!

---

## STEP 3 — DEPLOY EDGE FUNCTIONS (10 minutes)

### 3.1 Install Supabase CLI
```bash
# macOS
brew install supabase/tap/supabase

# Windows (PowerShell as admin)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
curl -sSL https://supabase.com/install.sh | sh
```

### 3.2 Login & Link Project
```bash
supabase login
# Opens browser to authenticate

supabase link --project-ref YOUR_PROJECT_ID
# Find YOUR_PROJECT_ID in Supabase Settings → General
```

### 3.3 Set Secrets
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Verify secrets were set
supabase secrets list
```

### 3.4 Deploy All Functions
```bash
# From the root of your project folder
supabase functions deploy send-email
supabase functions deploy schedule-sessions
supabase functions deploy streak-check
```

Expected output for each:
```
✓ Function send-email deployed to https://YOUR_PROJECT_ID.supabase.co/functions/v1/send-email
```

### 3.5 Set Up Cron Jobs (streak-check)
1. Go to Supabase Dashboard → **Edge Functions** → `streak-check`
2. Click **Schedule**
3. Add two schedules:

| Name | Cron Expression | Body |
|------|----------------|------|
| Morning (8AM UTC) | `0 8 * * *` | `{"trigger":"morning"}` |
| Evening (8PM UTC) | `0 20 * * *` | `{"trigger":"evening"}` |

> **Note:** 8AM UTC = 9AM WAT (Nigeria). Adjust if needed.

---

## STEP 4 — INTEGRATE BACKEND INTO HTML PAGES

### 4.1 Add Script Tag to Every Page
Add this **before** the closing `</body>` tag in ALL 8 HTML files:

```html
<!-- Supabase Backend -->
<script src="js/supabase-client.js"></script>
```

### 4.2 Wire login.html
Replace the login button onclick:
```html
<!-- BEFORE -->
onclick="window.location.href='onboarding.html'"

<!-- AFTER -->
onclick="handleLogin()"
```

Add to bottom of login.html `<script>`:
```js
async function handleLogin() {
  const email = document.querySelector('input[type=email]').value;
  const password = document.getElementById('pw-login').value;
  
  const btn = event.target;
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  
  try {
    await Auth.signIn(email, password);
    
    // Check if onboarding is complete
    const user = await Auth.getUser();
    const profile = await ProfileAPI.get(user.id);
    
    if (!profile.onboarding_complete) {
      window.location.href = 'onboarding.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    showToast(err.message || 'Login failed', 'error');
    btn.textContent = 'Enter the Arena';
    btn.disabled = false;
  }
}

async function handleSignup() {
  const email = document.querySelector('#form-signup input[type=email]').value;
  const password = document.getElementById('pw-signup').value;
  
  try {
    await Auth.signUp(email, password);
    showToast('Account created! Check your email to verify.');
    // Auto-redirect after email verification
  } catch (err) {
    showToast(err.message, 'error');
  }
}
```

### 4.3 Wire dashboard.html
Add at the top of the script section:
```js
let currentUser = null;

async function initDashboard() {
  currentUser = await Auth.requireAuth();
  if (!currentUser) return;
  
  // Load real data
  const [todaySessions, streak, summary] = await Promise.all([
    SessionsAPI.getToday(currentUser.id),
    StreakAPI.get(currentUser.id),
    ProgressAPI.getSummary(currentUser.id),
  ]);
  
  // Update streak badge
  document.querySelector('[data-streak]').textContent = `${streak.current_streak} Day Streak`;
  
  // Update progress ring
  const pct = summary.overall_coverage_pct;
  const ring = document.querySelector('[data-ring]');
  const offset = 176 - (176 * pct / 100);
  ring.setAttribute('stroke-dashoffset', offset);
  
  // Render sessions
  renderSessionCards(todaySessions);
  
  // Get upcoming exam (nearest)
  if (summary.subjects.length > 0) {
    const nearest = summary.subjects[0];
    document.querySelector('[data-exam-name]').textContent = nearest.name.toUpperCase();
    document.querySelector('[data-days-left]').textContent = nearest.days_remaining;
  }
}

initDashboard();
```

### 4.4 Wire subjects.html
```js
let currentUser = null;
let subjectsList = [];

async function initSubjects() {
  currentUser = await Auth.requireAuth();
  if (!currentUser) return;
  
  subjectsList = await SubjectsAPI.getAll(currentUser.id);
  renderSubjects(subjectsList);
}

async function addSubject() {
  const name = document.getElementById('new-subject-name').value;
  const difficulty = document.querySelector('.diff-btn.active')?.dataset.level || 'medium';
  const examDate = document.querySelector('input[type=date]').value;
  const totalTopics = parseInt(document.querySelector('input[type=number]').value) || 50;
  
  try {
    const subject = await SubjectsAPI.create(currentUser.id, {
      name, difficulty, exam_date: examDate, total_topics: totalTopics,
    });
    subjectsList.push(subject);
    renderSubjects(subjectsList);
    document.getElementById('add-modal').classList.add('hidden');
    
    // Regenerate schedule with new subject
    await SchedulerAPI.generate(currentUser.id);
    showToast('Subject added & schedule updated!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

initSubjects();
```

### 4.5 Wire timetable.html
```js
let currentUser = null;
let weekSessions = {};

async function initTimetable() {
  currentUser = await Auth.requireAuth();
  if (!currentUser) return;
  
  await loadWeek();
}

async function loadWeek() {
  const weekStart = getWeekStart(currentWeekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  const sessions = await SessionsAPI.getByWeek(
    currentUser.id,
    weekStart.toISOString().split('T')[0],
    weekEnd.toISOString().split('T')[0]
  );
  
  // Group by day-of-week
  weekSessions = {};
  sessions.forEach(s => {
    const day = new Date(s.scheduled_date).getDay();
    if (!weekSessions[day]) weekSessions[day] = [];
    weekSessions[day].push({
      id: s.id,
      subject: s.subject_name || s.subjects?.name,
      topic: s.topic,
      time: s.start_time?.slice(0,5),
      dur: `${s.duration_mins} min`,
      color: s.color || s.subjects?.color || '#c4c0ff',
      done: s.status === 'completed',
    });
  });
  
  renderWeek();
  renderSessions();
}

// Override toggleSession to call real API
async function toggleSession(id) {
  const daySessions = weekSessions[selectedDayIndex] || [];
  const s = daySessions.find(x => x.id === id);
  if (!s) return;
  
  try {
    if (!s.done) {
      await SessionsAPI.complete(id, s.dur.replace(' min','') * 1);
      s.done = true;
      showToast('Session completed! 🎉');
    } else {
      // Un-complete: just update status back to scheduled
      await window._supabase.from('study_sessions').update({ status: 'scheduled' }).eq('id', id);
      s.done = false;
    }
    renderSessions();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

initTimetable();
```

### 4.6 Wire focus.html
```js
let currentUser = null;
let activeFocusSessionId = null;

async function initFocus() {
  currentUser = await Auth.requireAuth();
  if (!currentUser) return;
  
  const streak = await StreakAPI.get(currentUser.id);
  document.getElementById('streak-badge').textContent = `${streak.current_streak} Day Streak`;
  
  const todayMins = await FocusAPI.getTodayMinutes(currentUser.id);
  document.getElementById('mins-focused').textContent = Math.round(todayMins);
}

// Override startTimer to log to Supabase
const _originalStartTimer = startTimer;
async function startTimer() {
  _originalStartTimer();
  
  if (currentUser && !activeFocusSessionId) {
    try {
      const focusSession = await FocusAPI.start(
        currentUser.id, null, currentSubject, currentMode, workMins
      );
      activeFocusSessionId = focusSession.id;
    } catch (e) {
      console.warn('Could not log focus session:', e);
    }
  }
}

// Override phaseComplete to log completion
const _originalPhaseComplete = phaseComplete;
async function phaseComplete() {
  _originalPhaseComplete();
  
  if (!isBreak && activeFocusSessionId && currentUser) {
    try {
      await FocusAPI.end(activeFocusSessionId, workMins, true);
      activeFocusSessionId = null;
    } catch (e) {
      console.warn('Could not complete focus session:', e);
    }
  }
}

initFocus();
```

### 4.7 Wire onboarding.html (save all 5 steps)
On the final "Enter the Arena" button:
```js
async function completeOnboarding() {
  const user = await Auth.getUser();
  if (!user) return;
  
  try {
    // Save profile data
    await ProfileAPI.completeOnboarding(user.id, {
      full_name: document.getElementById('student-name').value,
      nickname: document.getElementById('student-nickname').value,
      university: document.getElementById('university-input').value,
      faculty: document.getElementById('faculty-select').value,
      // ... preferences from step 4
    });
    
    // Save subjects
    for (const subjectName of selectedSubjects) {
      await SubjectsAPI.create(user.id, {
        name: subjectName,
        difficulty: 'medium', // from per-subject config
      });
    }
    
    // Generate initial schedule
    await SchedulerAPI.generate(user.id);
    
    window.location.href = 'dashboard.html';
  } catch (err) {
    showToast(err.message, 'error');
  }
}
```

---

## STEP 5 — DEPLOY TO VERCEL (5 minutes)

### Option A: Deploy from GitHub (Recommended)

1. Push your project to GitHub:
```bash
git init
git add .
git commit -m "Initial commit — Itachi Study Buddy"
git remote add origin https://github.com/YOUR_USERNAME/itachi-study-buddy.git
git push -u origin main
```

2. Go to https://vercel.com → **New Project**
3. Import your GitHub repository
4. Framework Preset: **Other** (plain static)
5. Root Directory: `.` (leave blank)
6. Click **Deploy**

### Option B: Deploy with CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from project root
cd your-project-folder
vercel

# Follow prompts:
# ? Set up and deploy? Y
# ? Which scope? (your account)
# ? Link to existing project? N
# ? What's your project's name? itachi-study-buddy
# ? In which directory is your code? ./
# ✓ Deployed to https://itachi-study-buddy.vercel.app
```

### Add Environment Variables to Vercel (NOT needed for frontend)
The `supabase-client.js` already has the public keys embedded. Nothing secret
goes in the HTML. The secret `SERVICE_ROLE_KEY` only lives in Supabase Edge Functions.

### Custom Domain (optional)
1. Vercel Dashboard → your project → **Settings** → **Domains**
2. Add `itachi.study` (or whatever domain you have)
3. Add the DNS records shown to your domain provider
4. SSL is automatic — done in ~2 minutes

---

## STEP 6 — VERIFY EVERYTHING WORKS

### Checklist
- [ ] Sign up creates a user in `auth.users`
- [ ] Profile row auto-created via trigger
- [ ] Onboarding saves to `profiles`
- [ ] Subjects save to `subjects`
- [ ] Schedule generates sessions in `study_sessions`
- [ ] Completing a session updates `streaks`
- [ ] Focus timer logs to `focus_sessions`
- [ ] Test email: in Supabase SQL Editor, run:
  ```sql
  SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;
  ```
- [ ] Vercel shows all pages correctly

### Test an Email Manually
In Supabase Dashboard → Edge Functions → `send-email` → Test:
```json
{
  "type": "daily_reminder",
  "user_id": "YOUR_USER_UUID",
  "data": {
    "sessions_today": 2,
    "sessions": [
      { "subject": "Linear Algebra", "time": "10:00", "duration": 90, "color": "#c4c0ff" }
    ],
    "streak": 5
  }
}
```

---

## ENVIRONMENT SUMMARY

| Variable | Where it lives | Value |
|----------|---------------|-------|
| `SUPABASE_URL` | `supabase-client.js` (public) | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | `supabase-client.js` (public) | `eyJhb...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Edge Function secrets | `eyJhb...` (secret!) |
| `RESEND_API_KEY` | Supabase Edge Function secrets | `re_xxx...` (secret!) |

---

## COSTS (Free Tier Limits)

| Service | Free Tier | Paid |
|---------|-----------|------|
| Supabase | 500MB DB, 2GB bandwidth, 50MB file storage | $25/mo |
| Resend | 3,000 emails/month, 100/day | $20/mo for 50k |
| Vercel | Unlimited static deploys, 100GB bandwidth | $20/mo |

**For a small app with <500 users, everything runs free.**

---

## COMMON ISSUES

**"Invalid API key" error on login**
→ Check `SUPABASE_ANON_KEY` in `supabase-client.js` is correct

**Edge function returns 500**
→ Run `supabase functions logs send-email` to see the error

**Emails not sending**
→ Check `email_logs` table for `status: 'failed'`
→ Verify `RESEND_API_KEY` is set: `supabase secrets list`

**RLS blocking queries**
→ In Supabase → Authentication → make sure "Row Level Security" policies exist
→ Re-run the RLS section of `schema.sql` if needed

**Vercel shows blank pages**
→ Check `vercel.json` is in the root directory
→ Check browser console for 404s on JS/CSS files

---

## WHAT TO DO NEXT (Phase 3)

1. **PWA / Offline mode** — Add `manifest.json` + service worker for installable app
2. **Push notifications** — Web Push API for real-time session reminders  
3. **PDF export** — Generate timetable PDF via Supabase Edge Function + pdfkit
4. **Leaderboard** — Public streak rankings between friends
5. **AI study tips** — Claude API integration for subject-specific advice
