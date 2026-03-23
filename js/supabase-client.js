// js/supabase-client.js
// ============================================================
// CONFIG — replace with your actual Supabase project values
// ============================================================
const SUPABASE_URL = 'https://cfqdyxfyxnbqfqptpyox.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmcWR5eGZ5eG5icWZxcHRweW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjE4ODUsImV4cCI6MjA4OTc5Nzg4NX0.ZySccEvuJQ4nMrAwzvoDH8L3f2iW2mxHM8nR01FNmTs';

// Create client immediately (synchronous)
window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// AUTH HELPERS
// ============================================================
const Auth = {
  async signIn(email, password) {
    const { data, error } = await window._supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signUp(email, password) {
    const { data, error } = await window._supabase.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithGoogle() {
    const { error } = await window._supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth-callback.html` },
    });
    if (error) throw error;
  },

  async signOut() {
    await window._supabase.auth.signOut();
    window.location.href = 'login.html';
  },

  async getUser() {
    const { data: { user } } = await window._supabase.auth.getUser();
    return user;
  },

  async getSession() {
    const { data: { session } } = await window._supabase.auth.getSession();
    return session;
  },

  async requireAuth() {
    const user = await this.getUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    
    // Check onboarding if not currently on the onboarding page
    if (!window.location.pathname.endsWith('onboarding.html') && !window.location.pathname.endsWith('auth-callback.html')) {
      const profile = await ProfileAPI.get(user.id);
      if (!profile || !profile.onboarding_complete) {
        window.location.href = 'onboarding.html';
        return null;
      }
    }
    
    return user;
  },

  async resetPassword(email) {
    const { error } = await window._supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`,
    });
    if (error) throw error;
  },
};

// ============================================================
// PROFILE API
// ============================================================
const ProfileAPI = {
  async get(userId) {
    const { data, error } = await window._supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || {};
  },

  async update(userId, updates) {
    // Remove any undefined values
    Object.keys(updates).forEach(key => {
      if (updates[key] === undefined) delete updates[key];
    });
    
    const { data, error } = await window._supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
      
    if (error) {
      console.error('Update error:', error);
      throw new Error(error.message);
    }
    return data;
  },

  async completeOnboarding(userId, profileData) {
    const { data, error } = await window._supabase
      .from('profiles')
      .update({ ...profileData, onboarding_complete: true })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

// ============================================================
// SUBJECTS API
// ============================================================
const SubjectsAPI = {
  async getAll(userId) {
    const { data, error } = await window._supabase
      .from('subjects')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('exam_date', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getPriority(userId) {
    const { data, error } = await window._supabase
      .from('subject_priority')
      .select('*')
      .eq('user_id', userId)
      .order('priority_score', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async create(userId, subject) {
    const { data, error } = await window._supabase
      .from('subjects')
      .insert({ ...subject, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await window._supabase
      .from('subjects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await window._supabase
      .from('subjects')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  },

  async updateCoverage(id, coveredTopics) {
    return this.update(id, { covered_topics: coveredTopics });
  },
};

// ============================================================
// SESSIONS API
// ============================================================
const SessionsAPI = {
  async getByDate(userId, date) {
    const { data, error } = await window._supabase
      .from('study_sessions')
      .select('*, subjects(name, color, difficulty)')
      .eq('user_id', userId)
      .eq('scheduled_date', date)
      .order('start_time', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  async getByWeek(userId, startDate, endDate) {
    const { data, error } = await window._supabase
      .from('study_sessions')
      .select('*, subjects(name, color)')
      .eq('user_id', userId)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date')
      .order('start_time');
    if (error) throw error;
    return data || [];
  },

  async getToday(userId) {
    const today = new Date().toISOString().split('T')[0];
    return this.getByDate(userId, today);
  },

  async create(userId, session) {
    const { data, error } = await window._supabase
      .from('study_sessions')
      .insert({ ...session, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async complete(id, actualDurationMins, pomodoroCount = 0) {
    const { data, error } = await window._supabase
      .from('study_sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        actual_duration_mins: actualDurationMins,
        pomodoro_count: pomodoroCount,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async skip(id) {
    const { data, error } = await window._supabase
      .from('study_sessions')
      .update({ status: 'skipped' })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await window._supabase
      .from('study_sessions')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getStats(userId) {
    const { data, error } = await window._supabase
      .from('weekly_summary')
      .select('*')
      .eq('user_id', userId)
      .single();
    return data || { completed_sessions: 0, skipped_sessions: 0, total_mins: 0, days_studied: 0 };
  },
};

// ============================================================
// FOCUS SESSION API
// ============================================================
const FocusAPI = {
  async start(userId, subjectId, subjectName, mode, plannedMins) {
    const { data, error } = await window._supabase
      .from('focus_sessions')
      .insert({
        user_id: userId,
        subject_id: subjectId,
        subject_name: subjectName,
        mode,
        planned_duration_mins: plannedMins,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async end(id, actualMins, completed) {
    const { data, error } = await window._supabase
      .from('focus_sessions')
      .update({
        actual_duration_mins: actualMins,
        completed,
        ended_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getHistory(userId, limit = 20) {
    const { data, error } = await window._supabase
      .from('focus_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async getTodayMinutes(userId) {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await window._supabase
      .from('focus_sessions')
      .select('actual_duration_mins')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('started_at', today);

    return (data || []).reduce((sum, s) => sum + (s.actual_duration_mins || 0), 0);
  },
};

// ============================================================
// STREAK API
// ============================================================
const StreakAPI = {
  async get(userId) {
    const { data, error } = await window._supabase
      .from('streaks')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return { current_streak: 0, longest_streak: 0, total_study_days: 0 };
    return data;
  },
};

// ============================================================
// SCHEDULING API (calls Edge Function)
// ============================================================
const SchedulerAPI = {
  async generate(userId, weeksAhead = 4) {
    const session = await Auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, weeks_ahead: weeksAhead }),
    });
    if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
    return res.json();
  },

  async preview(userId, weeksAhead = 2) {
    const session = await Auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, action: 'preview', weeks_ahead: weeksAhead }),
    });
    if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
    return res.json();
  },

  async rescheduleSkipped(userId) {
    const session = await Auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ user_id: userId, action: 'reschedule_skipped' }),
    });
    if (!res.ok) throw new Error(`Scheduler API error: ${res.status}`);
    return res.json();
  },
};

// ============================================================
// PROGRESS API
// ============================================================
const ProgressAPI = {
  async getSummary(userId) {
    const [subjects, streak, weekStats] = await Promise.all([
      SubjectsAPI.getPriority(userId),
      StreakAPI.get(userId),
      SessionsAPI.getStats(userId),
    ]);

    const totalTopics = subjects.reduce((s, sub) => s + sub.total_topics, 0);
    const coveredTopics = subjects.reduce((s, sub) => s + sub.covered_topics, 0);
    const overallPct = totalTopics > 0 ? Math.round((coveredTopics / totalTopics) * 100) : 0;

    return {
      subjects,
      streak,
      weekStats,
      overall_coverage_pct: overallPct,
      total_topics: totalTopics,
      covered_topics: coveredTopics,
    };
  },

  async getHeatmap(userId, daysBack = 112) {
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const { data } = await window._supabase
      .from('study_sessions')
      .select('scheduled_date, actual_duration_mins')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('scheduled_date', since.toISOString().split('T')[0]);

    const map = {};
    (data || []).forEach(s => {
      map[s.scheduled_date] = (map[s.scheduled_date] || 0) + (s.actual_duration_mins || 0);
    });
    return map;
  },
};

// ============================================================
// TOAST UTILITY (shared across all pages)
// ============================================================
function showToast(msg, type = 'success') {
  const existing = document.getElementById('global-toast');
  if (existing) existing.remove();

  const icons = { success: 'check_circle', error: 'error', info: 'info' };
  const colors = { success: '#c4c0ff', error: '#ffb4ab', info: '#ffb785' };

  const toast = document.createElement('div');
  toast.id = 'global-toast';
  toast.style.cssText = `
    position:fixed;bottom:100px;left:50%;transform:translateX(-50%);
    background:#282a30;border:1px solid rgba(255,255,255,0.1);
    border-radius:100px;padding:10px 20px;font-size:13px;font-weight:700;
    color:#e2e2eb;z-index:9999;display:flex;align-items:center;gap:8px;
    box-shadow:0 8px 32px rgba(0,0,0,0.4);
    animation:slideUp 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
  `;
  toast.innerHTML = `
    <span class="material-symbols-outlined" style="color:${colors[type]};font-size:18px;font-variation-settings:'FILL' 1">${icons[type]}</span>
    ${msg}
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideDown 0.2s ease forwards';
    setTimeout(() => toast.remove(), 200);
  }, 3000);
}

// ============================================================
// EXPOSE ALL APIS GLOBALLY
// ============================================================
window.Auth = Auth;
window.ProfileAPI = ProfileAPI;
window.SubjectsAPI = SubjectsAPI;
window.SessionsAPI = SessionsAPI;
window.FocusAPI = FocusAPI;
window.StreakAPI = StreakAPI;
window.SchedulerAPI = SchedulerAPI;
window.ProgressAPI = ProgressAPI;
window.showToast = showToast;

console.log('%c🔮 Itachi Study Buddy — Backend Connected', 'color:#c4c0ff;font-weight:900;font-size:14px;');