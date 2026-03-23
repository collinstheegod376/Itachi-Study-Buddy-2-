// supabase/functions/schedule-sessions/index.ts
// Generates a smart study timetable based on subjects, preferences & deadlines
// Deploy: supabase functions deploy schedule-sessions

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface Subject {
  id: string;
  name: string;
  exam_date: string;
  difficulty: 'easy' | 'medium' | 'hard';
  total_topics: number;
  covered_topics: number;
  color: string;
  days_remaining: number;
  coverage_pct: number;
  priority_score: number;
}

interface Profile {
  id: string;
  daily_study_goal_hours: number;
  available_days: number[];
  study_start_time: string;
  study_end_time: string;
  break_style: string;
  focus_duration_mins: number;
  short_break_mins: number;
  reserve_revision_days: boolean;
}

interface GeneratedSession {
  user_id: string;
  subject_id: string;
  subject_name: string;
  topic: string;
  scheduled_date: string;
  start_time: string;
  duration_mins: number;
  color: string;
  is_auto_scheduled: boolean;
  session_type: 'study' | 'revision';
}

// ============================================================
// CORE SCHEDULING ALGORITHM
// ============================================================
function generateSchedule(
  userId: string,
  subjects: Subject[],
  profile: Profile,
  weeksAhead: number = 4
): GeneratedSession[] {
  const sessions: GeneratedSession[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const difficultyDuration: Record<string, number> = {
    easy: 45,
    medium: 60,
    hard: 90,
  };

  // For each day in the range
  for (let dayOffset = 0; dayOffset < weeksAhead * 7; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);
    const dayOfWeek = date.getDay();
    const dateStr = date.toISOString().split('T')[0];

    // Skip days user doesn't study
    if (!profile.available_days.includes(dayOfWeek)) continue;

    // Get active subjects that haven't had their exam yet
    const activeSubjects = subjects.filter(s => {
      if (!s.exam_date) return true;
      return new Date(s.exam_date) > date;
    });

    if (activeSubjects.length === 0) continue;

    // Calculate how many sessions fit in the day
    const [startH, startM] = profile.study_start_time.split(':').map(Number);
    const [endH, endM] = profile.study_end_time.split(':').map(Number);
    const availableMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    const goalMinutes = profile.daily_study_goal_hours * 60;
    const minutesForStudy = Math.min(availableMinutes, goalMinutes);

    // Prioritise subjects by score (urgency × difficulty × remaining coverage)
    const prioritised = [...activeSubjects].sort((a, b) => {
      // Boost score if exam is within the week
      const aScore = a.priority_score * (a.days_remaining <= 7 ? 2.5 : 1);
      const bScore = b.priority_score * (b.days_remaining <= 7 ? 2.5 : 1);
      return bScore - aScore;
    });

    // Reserve revision day if exam is tomorrow
    const revisionSubjects = prioritised.filter(s => s.days_remaining === 1 || s.days_remaining === 2);

    let currentTime = startH * 60 + startM;
    let minutesUsed = 0;

    // If exam is tomorrow, fill the day with revision for that subject only
    if (revisionSubjects.length > 0 && profile.reserve_revision_days) {
      for (const sub of revisionSubjects) {
        const dur = difficultyDuration[sub.difficulty];
        if (minutesUsed + dur > minutesForStudy) break;

        sessions.push({
          user_id: userId,
          subject_id: sub.id,
          subject_name: sub.name,
          topic: 'Revision — Final Review',
          scheduled_date: dateStr,
          start_time: minsToTime(currentTime),
          duration_mins: dur,
          color: sub.color || '#c4c0ff',
          is_auto_scheduled: true,
          session_type: 'revision',
        });

        currentTime += dur + profile.short_break_mins;
        minutesUsed += dur + profile.short_break_mins;
      }
      continue;
    }

    // Distribute sessions weighted by priority score
    const totalScore = prioritised.reduce((sum, s) => sum + s.priority_score, 0);

    for (const sub of prioritised) {
      if (minutesUsed >= minutesForStudy) break;

      // How much of today's time should this subject get?
      const shareRatio = totalScore > 0 ? sub.priority_score / totalScore : 1 / prioritised.length;
      const allocatedMins = Math.round(shareRatio * minutesForStudy);
      const sessionDur = difficultyDuration[sub.difficulty];

      if (allocatedMins < sessionDur * 0.5) continue; // Not worth a session

      const numSessions = Math.max(1, Math.floor(allocatedMins / (sessionDur + profile.short_break_mins)));

      for (let i = 0; i < numSessions; i++) {
        if (minutesUsed + sessionDur > minutesForStudy) break;

        sessions.push({
          user_id: userId,
          subject_id: sub.id,
          subject_name: sub.name,
          topic: getTopicLabel(sub, i),
          scheduled_date: dateStr,
          start_time: minsToTime(currentTime),
          duration_mins: sessionDur,
          color: sub.color || '#c4c0ff',
          is_auto_scheduled: true,
          session_type: 'study',
        });

        currentTime += sessionDur + profile.short_break_mins;
        minutesUsed += sessionDur + profile.short_break_mins;
      }
    }
  }

  return sessions;
}

function minsToTime(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function getTopicLabel(sub: Subject, sessionIndex: number): string {
  const topicNum = sub.covered_topics + sessionIndex + 1;
  return `Topic ${topicNum} of ${sub.total_topics}`;
}

// ============================================================
// RESCHEDULE SKIPPED SESSIONS
// ============================================================
async function rescheduleSkipped(userId: string, profile: Profile) {
  const today = new Date().toISOString().split('T')[0];

  const { data: skippedSessions } = await supabase
    .from('study_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'skipped')
    .lt('scheduled_date', today);

  if (!skippedSessions || skippedSessions.length === 0) return 0;

  // Find next available slot (tomorrow onwards)
  let rescheduledCount = 0;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  for (const session of skippedSessions) {
    // Find next available day
    for (let offset = 1; offset <= 14; offset++) {
      const candidate = new Date(tomorrow);
      candidate.setDate(tomorrow.getDate() + offset);
      const dayOfWeek = candidate.getDay();

      if (!profile.available_days.includes(dayOfWeek)) continue;

      const candidateStr = candidate.toISOString().split('T')[0];

      // Check how many sessions are already on this day
      const { count } = await supabase
        .from('study_sessions')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('scheduled_date', candidateStr)
        .eq('status', 'scheduled');

      const maxPerDay = Math.floor((profile.daily_study_goal_hours * 60) / 45);
      if ((count || 0) < maxPerDay) {
        await supabase
          .from('study_sessions')
          .update({
            scheduled_date: candidateStr,
            status: 'rescheduled',
            rescheduled_from: session.id,
          })
          .eq('id', session.id);

        rescheduledCount++;
        break;
      }
    }
  }

  return rescheduledCount;
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { user_id, action, weeks_ahead } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: 'Missing user_id' }), { status: 400 });

    // Get profile
    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user_id)
      .single();

    if (pErr || !profile) return new Response(JSON.stringify({ error: 'Profile not found' }), { status: 404 });

    if (action === 'reschedule_skipped') {
      const count = await rescheduleSkipped(user_id, profile);
      return new Response(JSON.stringify({ rescheduled: count }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default: generate full schedule
    const { data: subjects, error: sErr } = await supabase
      .from('subject_priority')
      .select('*')
      .eq('user_id', user_id);

    if (sErr) return new Response(JSON.stringify({ error: sErr.message }), { status: 500 });

    const schedule = generateSchedule(user_id, subjects || [], profile, weeks_ahead || 4);

    if (action === 'preview') {
      return new Response(JSON.stringify({ sessions: schedule, count: schedule.length }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete existing auto-scheduled future sessions and replace
    const today = new Date().toISOString().split('T')[0];
    await supabase
      .from('study_sessions')
      .delete()
      .eq('user_id', user_id)
      .eq('is_auto_scheduled', true)
      .eq('status', 'scheduled')
      .gte('scheduled_date', today);

    // Insert new schedule in batches
    const BATCH_SIZE = 100;
    let inserted = 0;
    for (let i = 0; i < schedule.length; i += BATCH_SIZE) {
      const batch = schedule.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase.from('study_sessions').insert(batch);
      if (!insertErr) inserted += batch.length;
    }

    return new Response(JSON.stringify({ success: true, sessions_created: inserted }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('schedule-sessions error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
