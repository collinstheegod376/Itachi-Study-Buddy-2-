-- ============================================================
-- ITACHI STUDY BUDDY — SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  date_of_birth DATE,
  -- Academic info
  university TEXT,
  faculty TEXT,
  department TEXT,
  academic_year TEXT,  -- '100L', '200L', etc.
  degree_type TEXT,    -- 'BSc', 'BEng', 'MBBS', etc.
  semester TEXT,       -- 'First', 'Second', 'Full Year'
  -- Study preferences
  preferred_study_time TEXT,  -- 'morning', 'afternoon', 'evening', 'night'
  daily_study_goal_hours NUMERIC(3,1) DEFAULT 3,
  break_style TEXT DEFAULT 'pomodoro', -- 'pomodoro', 'deep', 'sprint', 'custom'
  focus_duration_mins INTEGER DEFAULT 25,
  short_break_mins INTEGER DEFAULT 5,
  long_break_mins INTEGER DEFAULT 20,
  sessions_before_long_break INTEGER DEFAULT 4,
  -- Notification preferences
  notify_daily_reminder BOOLEAN DEFAULT TRUE,
  notify_falling_behind BOOLEAN DEFAULT TRUE,
  notify_exam_countdown BOOLEAN DEFAULT TRUE,
  notify_streak_reminder BOOLEAN DEFAULT TRUE,
  notify_weekly_summary BOOLEAN DEFAULT FALSE,
  notify_milestone BOOLEAN DEFAULT TRUE,
  notification_email TEXT,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  -- Scheduling preferences
  auto_reschedule BOOLEAN DEFAULT TRUE,
  reserve_revision_days BOOLEAN DEFAULT TRUE,
  scheduling_algorithm TEXT DEFAULT 'adaptive',
  available_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun 6=Sat
  study_start_time TIME DEFAULT '08:00',
  study_end_time TIME DEFAULT '22:00',
  -- Meta
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBJECTS
-- ============================================================
CREATE TABLE subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  exam_date DATE,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  total_topics INTEGER DEFAULT 50,
  covered_topics INTEGER DEFAULT 0,
  color TEXT DEFAULT '#c4c0ff',
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Computed column helper: days until exam
CREATE OR REPLACE FUNCTION days_until_exam(exam_date DATE)
RETURNS INTEGER AS $$
  SELECT GREATEST(0, (exam_date - CURRENT_DATE)::INTEGER);
$$ LANGUAGE SQL IMMUTABLE;

-- ============================================================
-- STUDY SESSIONS
-- ============================================================
CREATE TABLE study_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  subject_name TEXT, -- denormalized for history after subject deletion
  topic TEXT,
  scheduled_date DATE NOT NULL,
  start_time TIME,
  duration_mins INTEGER DEFAULT 45,
  color TEXT DEFAULT '#c4c0ff',
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','skipped','rescheduled')),
  completed_at TIMESTAMPTZ,
  actual_duration_mins INTEGER, -- tracked via focus timer
  session_type TEXT DEFAULT 'study' CHECK (session_type IN ('study','revision','break','free')),
  pomodoro_count INTEGER DEFAULT 0,
  notes TEXT,
  is_auto_scheduled BOOLEAN DEFAULT FALSE,
  rescheduled_from UUID REFERENCES study_sessions(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STREAKS
-- ============================================================
CREATE TABLE streaks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_study_date DATE,
  total_study_days INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- FOCUS SESSIONS (individual timer runs)
-- ============================================================
CREATE TABLE focus_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  study_session_id UUID REFERENCES study_sessions(id) ON DELETE SET NULL,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  subject_name TEXT,
  mode TEXT DEFAULT 'pomodoro', -- 'pomodoro', 'deep', 'sprint', 'custom'
  planned_duration_mins INTEGER,
  actual_duration_mins INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- ============================================================
-- EMAIL LOGS (prevent spam / track sends)
-- ============================================================
CREATE TABLE email_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  email_type TEXT NOT NULL, -- 'daily_reminder', 'falling_behind', 'exam_countdown', 'streak_reminder', 'weekly_summary'
  recipient TEXT NOT NULL,
  subject_ref UUID REFERENCES subjects(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped'))
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/write their own
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);

-- Subjects: users can only read/write their own
CREATE POLICY "subjects_own" ON subjects FOR ALL USING (auth.uid() = user_id);

-- Study sessions: users can only read/write their own
CREATE POLICY "sessions_own" ON study_sessions FOR ALL USING (auth.uid() = user_id);

-- Streaks: users can only read/write their own
CREATE POLICY "streaks_own" ON streaks FOR ALL USING (auth.uid() = user_id);

-- Focus sessions: users can only read/write their own
CREATE POLICY "focus_own" ON focus_sessions FOR ALL USING (auth.uid() = user_id);

-- Email logs: users can only read their own
CREATE POLICY "email_logs_read" ON email_logs FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create profile + streak row when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, notification_email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET notification_email = EXCLUDED.notification_email;

  INSERT INTO streaks (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Error in handle_new_user trigger for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER subjects_updated_at BEFORE UPDATE ON subjects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER sessions_updated_at BEFORE UPDATE ON study_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Update subject covered_topics when session completed
CREATE OR REPLACE FUNCTION update_subject_coverage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.subject_id IS NOT NULL THEN
    UPDATE subjects
    SET covered_topics = LEAST(total_topics, covered_topics + 1)
    WHERE id = NEW.subject_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_completion_coverage
  AFTER UPDATE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION update_subject_coverage();

-- Update streak when session completed
CREATE OR REPLACE FUNCTION update_streak_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_last_date DATE;
  v_current INTEGER;
  v_longest INTEGER;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT last_study_date, current_streak, longest_streak
    INTO v_last_date, v_current, v_longest
    FROM streaks WHERE user_id = NEW.user_id;

    IF v_last_date = CURRENT_DATE THEN
      -- Already studied today, no change
      NULL;
    ELSIF v_last_date = CURRENT_DATE - 1 THEN
      -- Consecutive day
      v_current := v_current + 1;
    ELSE
      -- Streak broken
      v_current := 1;
    END IF;

    v_longest := GREATEST(v_longest, v_current);

    UPDATE streaks
    SET current_streak = v_current,
        longest_streak = v_longest,
        last_study_date = CURRENT_DATE,
        total_study_days = total_study_days + (CASE WHEN v_last_date != CURRENT_DATE THEN 1 ELSE 0 END),
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_completion_streak
  AFTER UPDATE ON study_sessions
  FOR EACH ROW EXECUTE FUNCTION update_streak_on_completion();

-- ============================================================
-- INDEXES (performance)
-- ============================================================
CREATE INDEX idx_subjects_user ON subjects(user_id);
CREATE INDEX idx_subjects_exam_date ON subjects(exam_date);
CREATE INDEX idx_sessions_user ON study_sessions(user_id);
CREATE INDEX idx_sessions_date ON study_sessions(scheduled_date);
CREATE INDEX idx_sessions_subject ON study_sessions(subject_id);
CREATE INDEX idx_sessions_status ON study_sessions(status);
CREATE INDEX idx_focus_user ON focus_sessions(user_id);
CREATE INDEX idx_email_logs_user ON email_logs(user_id);
CREATE INDEX idx_email_logs_type ON email_logs(email_type, sent_at);

-- ============================================================
-- VIEWS (useful for frontend queries)
-- ============================================================

-- Priority score for scheduling algorithm
CREATE VIEW subject_priority AS
SELECT
  s.id,
  s.user_id,
  s.name,
  s.exam_date,
  s.difficulty,
  s.total_topics,
  s.covered_topics,
  days_until_exam(s.exam_date) AS days_remaining,
  ROUND(s.covered_topics::NUMERIC / NULLIF(s.total_topics, 0) * 100, 1) AS coverage_pct,
  -- Priority score: urgency (1/days) * difficulty weight * (1 - coverage)
  ROUND((
    (1.0 / GREATEST(days_until_exam(s.exam_date), 1)) * 100 *
    CASE s.difficulty WHEN 'hard' THEN 3.0 WHEN 'medium' THEN 2.0 ELSE 1.0 END *
    (1.0 - s.covered_topics::NUMERIC / NULLIF(s.total_topics, 0))
  )::NUMERIC, 4) AS priority_score
FROM subjects s
WHERE s.is_active = TRUE;

-- Today's sessions with subject info
CREATE VIEW today_sessions AS
SELECT
  ss.*,
  sub.name AS subject_name_full,
  sub.difficulty,
  sub.color AS subject_color,
  days_until_exam(sub.exam_date) AS days_to_exam
FROM study_sessions ss
LEFT JOIN subjects sub ON ss.subject_id = sub.id
WHERE ss.scheduled_date = CURRENT_DATE;

-- Weekly study summary per user
CREATE VIEW weekly_summary AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_sessions,
  COUNT(*) FILTER (WHERE status = 'skipped') AS skipped_sessions,
  SUM(actual_duration_mins) FILTER (WHERE status = 'completed') AS total_mins,
  COUNT(DISTINCT scheduled_date) AS days_studied
FROM study_sessions
WHERE scheduled_date >= DATE_TRUNC('week', CURRENT_DATE)
GROUP BY user_id;
