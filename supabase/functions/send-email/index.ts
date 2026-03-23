// supabase/functions/send-email/index.ts
// Supabase Edge Function — handles ALL email types via Resend
// Deploy: supabase functions deploy send-email

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "Itachi Study Buddy <noreply@itachi.study>";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================================
// EMAIL TEMPLATES
// ============================================================

const baseStyle = `
  font-family: Inter, -apple-system, sans-serif;
  background: #111319;
  color: #e2e2eb;
  max-width: 560px;
  margin: 0 auto;
  padding: 40px 32px;
  border-radius: 16px;
`;

const btnStyle = `
  display: inline-block;
  padding: 14px 32px;
  background: linear-gradient(135deg, #c4c0ff, #8781ff);
  color: #111319;
  text-decoration: none;
  font-weight: 900;
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  border-radius: 8px;
  margin-top: 24px;
`;

function logo() {
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:32px;">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path d="M16 4 L20 12 L28 13 L22 19 L23.5 27 L16 23 L8.5 27 L10 19 L4 13 L12 12 Z"
          fill="none" stroke="#c4c0ff" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="16" cy="16" r="4" fill="#8781ff" opacity="0.6"/>
      </svg>
      <span style="font-weight:900;font-size:14px;letter-spacing:-0.02em;color:#c4c0ff;">ITACHI STUDY BUDDY</span>
    </div>
  `;
}

function footer() {
  return `
    <div style="margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#64748b;">
      <p>You're receiving this because you enabled this notification type in your settings.</p>
      <p style="margin-top:4px;"><a href="https://itachi.study/settings" style="color:#c4c0ff;text-decoration:none;">Manage notifications</a></p>
    </div>
  `;
}

const templates = {
  daily_reminder: (data: any) => ({
    subject: `⏰ Time to study, ${data.nickname || data.name}`,
    html: `
      <div style="${baseStyle}">
        ${logo()}
        <h1 style="font-size:28px;font-weight:900;letter-spacing:-0.03em;margin:0 0 8px;">
          Your study session starts <span style="color:#c4c0ff;">now.</span>
        </h1>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">
          You have ${data.sessions_today} session${data.sessions_today !== 1 ? 's' : ''} scheduled for today. 
          Don't let the streak die.
        </p>
        ${data.sessions_today > 0 ? `
          <div style="background:#191b22;border-radius:12px;padding:20px;margin-bottom:16px;">
            <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Today's Plan</div>
            ${data.sessions.slice(0,3).map((s: any) => `
              <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="width:3px;height:36px;background:${s.color};border-radius:2px;flex-shrink:0;"></div>
                <div>
                  <div style="font-weight:700;font-size:13px;">${s.subject}</div>
                  <div style="font-size:11px;color:#64748b;">${s.time} · ${s.duration} min</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${data.streak > 0 ? `
          <div style="display:inline-flex;align-items:center;gap:6px;background:#1e1a00;border:1px solid rgba(255,183,133,0.2);padding:6px 12px;border-radius:100px;margin-bottom:20px;">
            <span style="font-size:14px;">🔥</span>
            <span style="font-weight:700;font-size:12px;color:#ffb785;">${data.streak} Day Streak — Don't break it</span>
          </div>
        ` : ''}
        <a href="https://itachi.study" style="${btnStyle}">Open Itachi →</a>
        ${footer()}
      </div>
    `
  }),

  falling_behind: (data: any) => ({
    subject: `⚠️ You're falling behind on ${data.subject_name}`,
    html: `
      <div style="${baseStyle}">
        ${logo()}
        <h1 style="font-size:28px;font-weight:900;letter-spacing:-0.03em;margin:0 0 8px;">
          <span style="color:#ffb4ab;">Warning:</span> You're behind schedule.
        </h1>
        <p style="color:#94a3b8;font-size:14px;margin-bottom:24px;">
          You've missed ${data.missed_count} sessions for <strong style="color:#e2e2eb;">${data.subject_name}</strong>. 
          With your exam ${data.days_left} days away, this could hurt.
        </p>
        <div style="background:#1a0a0a;border:1px solid rgba(255,180,171,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="font-size:13px;font-weight:700;color:#ffb4ab;margin-bottom:8px;">${data.subject_name}</div>
          <div style="background:rgba(255,255,255,0.05);border-radius:6px;height:6px;overflow:hidden;margin-bottom:8px;">
            <div style="height:100%;width:${data.coverage_pct}%;background:linear-gradient(90deg,#c4c0ff,#8781ff);border-radius:6px;"></div>
          </div>
          <div style="font-size:11px;color:#64748b;">${data.coverage_pct}% covered · ${data.days_left} days to exam</div>
        </div>
        <p style="color:#94a3b8;font-size:13px;">Itachi has automatically rescheduled your missed sessions. 
        Open the app to review your updated timetable.</p>
        <a href="https://itachi.study/timetable" style="${btnStyle}">View Updated Schedule →</a>
        ${footer()}
      </div>
    `
  }),

  exam_countdown: (data: any) => ({
    subject: `📅 ${data.days_left} day${data.days_left !== 1 ? 's' : ''} until ${data.subject_name} exam`,
    html: `
      <div style="${baseStyle}">
        ${logo()}
        <div style="text-align:center;padding:40px 0;">
          <div style="font-size:72px;font-weight:900;letter-spacing:-0.05em;color:${data.days_left <= 1 ? '#ffb4ab' : data.days_left <= 3 ? '#ffb785' : '#c4c0ff'};">
            ${data.days_left}
          </div>
          <div style="font-size:13px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;margin-top:4px;">
            Day${data.days_left !== 1 ? 's' : ''} Remaining
          </div>
        </div>
        <h2 style="font-size:22px;font-weight:900;text-align:center;margin:0 0 8px;">${data.subject_name}</h2>
        <p style="text-align:center;color:#64748b;font-size:13px;margin-bottom:32px;">
          Exam on ${data.exam_date} ${data.exam_time ? `at ${data.exam_time}` : ''}
        </p>
        <div style="background:#191b22;border-radius:12px;padding:20px;margin-bottom:24px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center;">
            <div>
              <div style="font-size:24px;font-weight:900;color:#c4c0ff;">${data.coverage_pct}%</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-top:4px;">Syllabus Covered</div>
            </div>
            <div>
              <div style="font-size:24px;font-weight:900;color:#ffb785;">${data.sessions_remaining}</div>
              <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-top:4px;">Sessions Left</div>
            </div>
          </div>
        </div>
        ${data.days_left <= 1 ? `
          <p style="text-align:center;color:#ffb4ab;font-size:13px;font-weight:700;">This is it. You've prepared for this. Execute.</p>
        ` : `
          <p style="text-align:center;color:#94a3b8;font-size:13px;">Keep going. Every session counts.</p>
        `}
        <div style="text-align:center;">
          <a href="https://itachi.study/focus" style="${btnStyle}">Start Focus Session →</a>
        </div>
        ${footer()}
      </div>
    `
  }),

  streak_reminder: (data: any) => ({
    subject: `🔥 Don't lose your ${data.streak}-day streak, ${data.nickname || data.name}`,
    html: `
      <div style="${baseStyle}">
        ${logo()}
        <div style="text-align:center;padding:32px 0;">
          <div style="font-size:64px;">🔥</div>
          <div style="font-size:48px;font-weight:900;color:#ffb785;letter-spacing:-0.03em;margin-top:8px;">${data.streak} Days</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;font-weight:600;">CURRENT STREAK</div>
        </div>
        <h2 style="font-size:20px;font-weight:900;text-align:center;margin-bottom:8px;">
          Don't break the chain.
        </h2>
        <p style="text-align:center;color:#94a3b8;font-size:13px;margin-bottom:24px;">
          You haven't studied yet today. Log at least one session to keep your 
          ${data.streak}-day streak alive. It resets at midnight.
        </p>
        <div style="background:#1a1200;border:1px solid rgba(255,183,133,0.2);border-radius:12px;padding:16px;text-align:center;margin-bottom:24px;">
          <div style="font-size:12px;color:#ffb785;font-weight:700;">Personal Best: ${data.longest_streak} days</div>
        </div>
        <div style="text-align:center;">
          <a href="https://itachi.study/focus" style="${btnStyle}">Study Now →</a>
        </div>
        ${footer()}
      </div>
    `
  }),

  weekly_summary: (data: any) => ({
    subject: `📊 Your week in review — ${data.completed_sessions} sessions done`,
    html: `
      <div style="${baseStyle}">
        ${logo()}
        <h1 style="font-size:26px;font-weight:900;letter-spacing:-0.03em;margin-bottom:4px;">Week in Review</h1>
        <p style="color:#64748b;font-size:13px;margin-bottom:32px;">${data.week_range}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:32px;">
          <div style="background:#191b22;border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:900;color:#c4c0ff;">${data.completed_sessions}</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">Sessions</div>
          </div>
          <div style="background:#191b22;border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:900;color:#ffb785;">${data.total_hours}h</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">Studied</div>
          </div>
          <div style="background:#191b22;border-radius:10px;padding:16px;text-align:center;">
            <div style="font-size:28px;font-weight:900;color:#e2e2eb;">${data.completion_rate}%</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-top:4px;">Completion</div>
          </div>
        </div>
        ${data.top_subject ? `
          <div style="background:#191b22;border-radius:12px;padding:16px;margin-bottom:16px;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:8px;">Most Studied</div>
            <div style="font-weight:700;font-size:14px;">${data.top_subject} — ${data.top_subject_hours}h</div>
          </div>
        ` : ''}
        <p style="color:#94a3b8;font-size:13px;">${data.motivation_message}</p>
        <a href="https://itachi.study/progress" style="${btnStyle}">View Full Stats →</a>
        ${footer()}
      </div>
    `
  }),
};

// ============================================================
// RATE LIMIT CHECK
// ============================================================
async function canSendEmail(userId: string, emailType: string, subjectId?: string): Promise<boolean> {
  const cooldowns: Record<string, number> = {
    daily_reminder: 20,       // max once per 20 hours
    falling_behind: 48,       // max once per 48 hours per subject
    exam_countdown: 12,       // max once per 12 hours per subject
    streak_reminder: 20,      // max once per 20 hours
    weekly_summary: 150,      // max once per ~6 days
  };

  const hours = cooldowns[emailType] || 24;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const query = supabase
    .from("email_logs")
    .select("id")
    .eq("user_id", userId)
    .eq("email_type", emailType)
    .gte("sent_at", since);

  if (subjectId) query.eq("subject_ref", subjectId);

  const { data } = await query.limit(1);
  return !data || data.length === 0;
}

// ============================================================
// SEND VIA RESEND
// ============================================================
async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  return res.ok;
}

// ============================================================
// MAIN HANDLER
// ============================================================
serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const { type, user_id, data } = body;

    if (!type || !user_id) {
      return new Response(JSON.stringify({ error: "Missing type or user_id" }), { status: 400 });
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), { status: 404 });
    }

    // Check notification preference
    const notifKey = `notify_${type}` as keyof typeof profile;
    if (profile[notifKey] === false) {
      return new Response(JSON.stringify({ skipped: true, reason: "User disabled this notification" }));
    }

    // Check rate limit
    const canSend = await canSendEmail(user_id, type, data?.subject_id);
    if (!canSend) {
      return new Response(JSON.stringify({ skipped: true, reason: "Rate limited" }));
    }

    // Check quiet hours
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (profile.quiet_hours_start && profile.quiet_hours_end) {
      const start = profile.quiet_hours_start;
      const end = profile.quiet_hours_end;
      // Simple check (handles overnight quiet hours like 22:00–07:00)
      if (start > end) {
        if (currentTime >= start || currentTime <= end) {
          return new Response(JSON.stringify({ skipped: true, reason: "Quiet hours" }));
        }
      } else if (currentTime >= start && currentTime <= end) {
        return new Response(JSON.stringify({ skipped: true, reason: "Quiet hours" }));
      }
    }

    const templateFn = templates[type as keyof typeof templates];
    if (!templateFn) {
      return new Response(JSON.stringify({ error: "Unknown email type" }), { status: 400 });
    }

    const enrichedData = {
      name: profile.full_name,
      nickname: profile.nickname,
      streak: 0,
      ...data,
    };

    // Get current streak
    const { data: streakData } = await supabase
      .from("streaks")
      .select("current_streak, longest_streak")
      .eq("user_id", user_id)
      .single();

    if (streakData) {
      enrichedData.streak = streakData.current_streak;
      enrichedData.longest_streak = streakData.longest_streak;
    }

    const { subject: emailSubject, html } = templateFn(enrichedData);
    const recipient = profile.notification_email || data?.email;

    if (!recipient) {
      return new Response(JSON.stringify({ error: "No recipient email" }), { status: 400 });
    }

    const sent = await sendEmail(recipient, emailSubject, html);

    // Log the send
    await supabase.from("email_logs").insert({
      user_id,
      email_type: type,
      recipient,
      subject_ref: data?.subject_id || null,
      status: sent ? "sent" : "failed",
    });

    return new Response(JSON.stringify({ success: sent }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("send-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
