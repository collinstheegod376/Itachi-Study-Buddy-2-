// supabase/functions/streak-check/index.ts
// Runs on a cron schedule — checks streaks, sends reminders, exam countdowns
// Deploy: supabase functions deploy streak-check
// Cron: set in Supabase Dashboard → Edge Functions → streak-check → Schedule
// Schedule: "0 8 * * *" (8AM UTC daily) and "0 20 * * *" (8PM UTC streak reminder)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function callSendEmail(payload: object) {
  return fetch(`${FUNCTION_URL}/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(payload),
  });
}

serve(async (req) => {
  const { trigger } = await req.json().catch(() => ({ trigger: 'morning' }));

  try {
    // Get all users who have completed onboarding
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, nickname, notification_email, notify_daily_reminder, notify_streak_reminder, notify_exam_countdown, notify_falling_behind, daily_study_goal_hours')
      .eq('onboarding_complete', true);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }));
    }

    let emailsSent = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const profile of profiles) {
      // ---- MORNING TRIGGER (8AM): daily reminder + exam countdown ----
      if (trigger === 'morning') {

        // Daily Reminder: get today's sessions
        if (profile.notify_daily_reminder) {
          const { data: todaySessions } = await supabase
            .from('study_sessions')
            .select('*, subjects(name, color)')
            .eq('user_id', profile.id)
            .eq('scheduled_date', today)
            .eq('status', 'scheduled');

          const { data: streak } = await supabase
            .from('streaks')
            .select('current_streak')
            .eq('user_id', profile.id)
            .single();

          await callSendEmail({
            type: 'daily_reminder',
            user_id: profile.id,
            data: {
              sessions_today: todaySessions?.length || 0,
              sessions: (todaySessions || []).map(s => ({
                subject: s.subject_name || s.subjects?.name,
                time: s.start_time,
                duration: s.duration_mins,
                color: s.color || s.subjects?.color,
              })),
              streak: streak?.current_streak || 0,
            },
          });
          emailsSent++;
        }

        // Exam Countdown: check for exams in 7, 3, or 1 days
        if (profile.notify_exam_countdown) {
          const { data: upcomingExams } = await supabase
            .from('subjects')
            .select('id, name, exam_date, covered_topics, total_topics, color')
            .eq('user_id', profile.id)
            .eq('is_active', true)
            .in('exam_date', [
              daysFromToday(1),
              daysFromToday(3),
              daysFromToday(7),
            ]);

          for (const exam of upcomingExams || []) {
            const daysLeft = Math.ceil((new Date(exam.exam_date).getTime() - Date.now()) / 86400000);
            const coveragePct = Math.round((exam.covered_topics / Math.max(exam.total_topics, 1)) * 100);

            const { data: remaining } = await supabase
              .from('study_sessions')
              .select('id', { count: 'exact' })
              .eq('user_id', profile.id)
              .eq('subject_id', exam.id)
              .eq('status', 'scheduled');

            await callSendEmail({
              type: 'exam_countdown',
              user_id: profile.id,
              data: {
                subject_id: exam.id,
                subject_name: exam.name,
                exam_date: new Date(exam.exam_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
                days_left: daysLeft,
                coverage_pct: coveragePct,
                sessions_remaining: remaining?.length || 0,
              },
            });
            emailsSent++;
          }
        }

        // Falling Behind: check if user has missed 2+ sessions in last 3 days
        if (profile.notify_falling_behind) {
          const threeDaysAgo = daysFromToday(-3);
          const { data: missedSessions } = await supabase
            .from('study_sessions')
            .select('subject_id, subject_name')
            .eq('user_id', profile.id)
            .eq('status', 'skipped')
            .gte('scheduled_date', threeDaysAgo)
            .lt('scheduled_date', today);

          if (missedSessions && missedSessions.length >= 2) {
            // Group by subject
            const bySubject = missedSessions.reduce((acc: any, s) => {
              const key = s.subject_id || 'unknown';
              if (!acc[key]) acc[key] = { name: s.subject_name, count: 0 };
              acc[key].count++;
              return acc;
            }, {});

            for (const [subjectId, info] of Object.entries(bySubject) as any[]) {
              if (info.count < 2) continue;

              const { data: sub } = await supabase
                .from('subjects')
                .select('exam_date, covered_topics, total_topics')
                .eq('id', subjectId)
                .single();

              await callSendEmail({
                type: 'falling_behind',
                user_id: profile.id,
                data: {
                  subject_id: subjectId,
                  subject_name: info.name,
                  missed_count: info.count,
                  days_left: sub ? Math.ceil((new Date(sub.exam_date).getTime() - Date.now()) / 86400000) : '?',
                  coverage_pct: sub ? Math.round((sub.covered_topics / Math.max(sub.total_topics, 1)) * 100) : 0,
                },
              });
              emailsSent++;
            }
          }
        }
      }

      // ---- EVENING TRIGGER (8PM): streak reminder ----
      if (trigger === 'evening' && profile.notify_streak_reminder) {
        // Check if user has NOT studied today
        const { data: todayCompletedSessions } = await supabase
          .from('study_sessions')
          .select('id')
          .eq('user_id', profile.id)
          .eq('scheduled_date', today)
          .eq('status', 'completed')
          .limit(1);

        if (!todayCompletedSessions || todayCompletedSessions.length === 0) {
          const { data: streak } = await supabase
            .from('streaks')
            .select('current_streak, longest_streak')
            .eq('user_id', profile.id)
            .single();

          // Only send if they have a streak worth saving
          if (streak && streak.current_streak >= 2) {
            await callSendEmail({
              type: 'streak_reminder',
              user_id: profile.id,
              data: {
                streak: streak.current_streak,
                longest_streak: streak.longest_streak,
              },
            });
            emailsSent++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, emails_sent: emailsSent, users_processed: profiles.length }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('streak-check error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}
