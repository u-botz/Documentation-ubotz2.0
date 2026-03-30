# EducoreOS — CRM & Admissions Module

## Complete Feature Document

| Field | Value |
|---|---|
| **Document Type** | Product Feature Specification |
| **Module** | CRM & Admissions (Growth Engine) |
| **Version** | 2.0 |
| **Date** | March 26, 2026 |
| **Audience** | Product Owner, Business Stakeholders, Sales Team, Implementation Partners |
| **Status** | Active Development |

---

## 1. Executive Summary

The CRM & Admissions module is EducoreOS's **Growth Engine** — it manages the entire journey of a prospective student from first enquiry to confirmed admission. It gives coaching centers, online academies, and corporate training organizations a unified system to capture leads, track counselor interactions, score lead quality, automate follow-ups, and convert prospects into enrolled students — all within the same platform where those students will learn.

Unlike standalone CRM tools (Salesforce, HubSpot, Zoho), the EducoreOS CRM is purpose-built for education admissions. It understands pipeline stages like "Demo Class Scheduled" and "Application Submitted." It knows that a "walk-in referral" is worth more than a cold Facebook ad click. And because it's integrated with the LMS, a converted lead becomes a student with one click — no CSV exports, no manual data entry, no tool-switching.

**Who uses it:**
- **Counselors / Admissions Staff** — capture leads, log interactions, manage follow-ups, move leads through the pipeline
- **Branch Managers** — oversee their branch's admission pipeline, receive escalations for missed follow-ups, monitor team performance
- **Institution Owners / Admins** — configure automation rules, review lead scoring, analyze source effectiveness, manage CRM settings

---

## 2. The Admission Pipeline

### 2.1 Pipeline Stages

Every lead moves through a defined pipeline that mirrors the real-world admission funnel:

| Stage | What It Means | Typical Actions |
|---|---|---|
| **New Enquiry** | A fresh lead has entered the system — via website form, walk-in, phone call, or ad campaign | Auto-assigned to a counselor. Counselor should make first contact within hours. |
| **Contacted** | The counselor has made first contact with the lead | Counselor logs a Call or WhatsApp activity. Schedules a follow-up if needed. |
| **Interested** | The lead has expressed genuine interest in enrolling | Counselor schedules a campus visit or demo class. Lead score typically rises. |
| **Application Submitted** | The lead has filled out an application form | Admin reviews the application. Fee discussion begins. |
| **Admission Confirmed** | Fees paid, admission complete | Lead converts to a Student in the LMS. The journey continues in the learning system. |
| **Rejected** | Lead is not a fit or has declined | Lead is archived. Score drops to zero. Can be re-opened if the lead returns. |

Counselors move leads between stages via a **Kanban board** — a visual drag-and-drop interface where each column represents a stage and each card represents a lead. This gives the entire admissions team a real-time view of the pipeline at a glance.

### 2.2 Lead Sources

Every lead is tagged with its origin, enabling the institution to understand which marketing channels are actually working:

| Source | Examples |
|---|---|
| **Referral** | Current student/parent recommends a friend |
| **Walk-in** | Prospect visits the campus directly |
| **Website** | Fills out the enquiry form on the institution's EducoreOS-powered website |
| **Social Media** | Organic engagement from Facebook, Instagram, etc. |
| **Google Ads** | Paid search campaigns |
| **Facebook Ads** | Paid social campaigns |
| **Event** | Education fair, open house, workshop |
| **Other** | Any source not in the above categories |

Sources feed directly into lead scoring — a referral lead is automatically scored higher than a cold ad click, because referrals convert at higher rates in education.

---

## 3. Lead Management

### 3.1 Lead Capture

Leads enter the system through multiple channels:

**Website Enquiry Form** — The institution's public website (powered by EducoreOS's Landing Page module) includes a lead capture form. When a visitor submits their details, a lead is automatically created in the CRM and assigned to a counselor.

**Manual Entry** — Counselors or admissions staff can manually create leads for walk-ins, phone enquiries, or referrals.

**Bulk Import** — Admins can upload a CSV/Excel file of leads from external sources (event registrations, purchased lists, etc.).

**Future: Ad Platform Integration** — Meta Lead Ads and WhatsApp Business API integrations are planned for a future phase, enabling leads from Facebook/Instagram ad forms to flow directly into the CRM.

### 3.2 Auto-Assignment

When a new lead enters the system, it is automatically assigned to a counselor using a **workload-balanced round-robin** algorithm:

1. The system identifies all active counselors in the lead's branch
2. It selects the counselor with the fewest currently open (non-converted, non-rejected) leads
3. If two counselors have equal workloads, the one who was last assigned a lead longest ago gets the new one

This ensures even distribution of leads across the admissions team without manual intervention. Branch managers can always manually reassign leads if needed.

### 3.3 Lead-to-Student Conversion

When a lead reaches "Admission Confirmed" and fees are paid, the counselor can convert the lead into a student with one click. The system:

- Creates a Student user account in the LMS
- Copies the lead's contact information to the student profile
- Preserves the full interaction history for reference
- Triggers the student onboarding workflow (welcome email, course assignment, etc.)

This eliminates the manual handoff between "admissions" and "academics" that plagues institutions using separate CRM and LMS tools.

---

## 4. Counselor Activity Tracking

### 4.1 Structured Activities

Every interaction a counselor has with a lead is recorded as a **structured activity** — not a free-text note, but a typed, categorized, and outcome-tracked record. This structure enables the platform to score leads, trigger automation, and generate meaningful reports.

**Activity Types:**

| Activity Type | Description | Possible Outcomes |
|---|---|---|
| **Call** | Phone call to or from the lead | Answered, No Answer, Voicemail, Busy, Callback Requested |
| **WhatsApp Message** | WhatsApp conversation with the lead | Sent, Delivered, Read, Replied |
| **Meeting / Walk-in Visit** | In-person meeting or campus visit | Attended, No Show, Rescheduled |
| **Demo Class Scheduled** | Lead attended or was scheduled for a demo | Attended, No Show, Rescheduled |
| **Note** | General observation or internal note | (No outcome — free text only) |

Each activity record captures who performed it, when it happened, the outcome, and an optional free-text body for details. Activities are immutable once logged — they form an honest, uneditable history of every counselor interaction with the lead.

### 4.2 Activity Feed

Every lead has an activity feed — a chronological timeline of all interactions. Counselors, branch managers, and admins can see exactly what happened, when, and by whom. The feed can be filtered by activity type (e.g., "show me only Calls on this lead").

---

## 5. Follow-up Task Management

### 5.1 Scheduling Follow-ups

After interacting with a lead, counselors schedule follow-up tasks with a specific date, time, and planned activity type. For example:

- "Call back Rahul on March 28 at 2:00 PM to confirm his campus visit"
- "Send WhatsApp message to Priya on March 30 about the scholarship deadline"

Each follow-up task has a status: **Pending** → **Overdue** → **Completed** or **Cancelled**.

### 5.2 Reminders

The system sends a **reminder notification** (in-app + email) to the assigned counselor before a follow-up is due. The reminder lead time is configurable by the institution (default: 1 hour before the due time).

### 5.3 Tiered Escalation for Missed Follow-ups

When a counselor misses a follow-up (doesn't complete it by the due time), the system escalates automatically in two tiers:

**Tier 1 — Re-notify the Counselor:** After a configurable grace period (default: 2 hours past due), the system sends a high-priority notification to the counselor reminding them of the overdue task.

**Tier 2 — Escalate to Branch Manager:** If the follow-up is still not completed after a second threshold (default: 24 hours past due), the system notifies the branch manager. The manager can then decide to reassign the lead, counsel the staff member, or take direct action.

Both escalation thresholds are configurable per institution — a high-velocity online academy might set Tier 1 at 30 minutes and Tier 2 at 4 hours, while a coaching center with slower cycles might use the defaults.

### 5.4 Stale Lead Detection

Independently from follow-up escalation, the system runs a daily scan for **stale leads** — leads that have had no activity at all for 3+ days. Stale leads trigger a high-priority notification to the assigned counselor. This catches leads that "fall through the cracks" because no follow-up was ever scheduled.

| Detection Type | What It Catches | Who Is Notified |
|---|---|---|
| **Stale Lead Detection** | Leads abandoned entirely — no activity for 3+ days | Assigned counselor |
| **Follow-up Escalation** | Scheduled follow-ups that weren't completed on time | Tier 1: Counselor. Tier 2: Branch manager |

---

## 6. Lead Scoring

### 6.1 How It Works

Every lead in the system receives an automatic **Lead Score** (0–100) that reflects its likelihood of converting to a student. The score is computed from five signals:

| Signal | What It Measures | Weight (Default) |
|---|---|---|
| **Source Quality** | How valuable is this lead's origin? Referrals score higher than cold ads. | 15% |
| **Pipeline Stage** | How far along the admission funnel? "Application Submitted" scores higher than "New Enquiry." | 30% |
| **Engagement** | How much has the counselor interacted with this lead? More calls, meetings, and diverse activity types = higher score. | 25% |
| **Website Interest** | How many times has the lead visited the institution's website? More visits = more interest. | 10% |
| **Recency** | How recent was the last interaction? A lead contacted yesterday scores higher than one untouched for 2 weeks. | 20% |

### 6.2 Temperature Classification

Based on the score, every lead is classified into one of three tiers:

| Temperature | Score Range (Default) | Visual | Meaning |
|---|---|---|---|
| **Hot** | 70–100 | 🔴 Red/Orange badge | High conversion likelihood. Prioritize immediately. |
| **Warm** | 40–69 | 🟡 Yellow/Amber badge | Moderate interest. Needs nurturing. |
| **Cold** | 0–39 | 🔵 Blue/Gray badge | Low engagement or stale. May need re-engagement or qualification. |

Temperature badges appear directly on Kanban cards, so counselors can visually scan the board and focus on Hot leads first. The lead detail page shows the full numeric score and a breakdown of how each signal contributed.

### 6.3 Customization

Institution admins can tune the scoring system to match their specific admission funnel:

**Adjust Signal Weights** — An online academy that gets most leads from website ads can increase the Website Interest weight and decrease the Source Quality weight. A coaching center that relies heavily on referrals can do the opposite. All five weights must sum to 100%.

**Customize Source Scores** — Institutions can set how much each lead source is worth. If a particular institution finds that Event leads convert better than Walk-ins, they can adjust the source scores accordingly.

**Adjust Temperature Thresholds** — Institutions can change the score boundaries for Hot, Warm, and Cold. A selective program might set Hot at 85+, while a high-volume center might set it at 60+.

### 6.4 Automatic Recalculation

Lead scores are **not static** — they recalculate automatically:

- **Instantly** when a counselor logs an activity, changes a lead's pipeline stage, or the lead's website visit count updates
- **Nightly** across all leads to account for recency decay — a lead that was "Hot" two weeks ago cools down automatically if no one has interacted with it

This means the Kanban board always reflects the current priority landscape without anyone manually updating scores.

---

## 7. CRM Workflow Automation

### 7.1 What Is It?

CRM Workflow Automation lets institution admins create **rules** that automatically perform actions when specific events happen in the CRM. Instead of relying on counselors to remember every process step, the system handles routine tasks automatically.

Each rule follows a simple **"When this happens → Check if → Then do this"** structure:

- **Trigger**: What event starts the rule (e.g., "a new lead is created")
- **Condition** (optional): A filter that narrows when the rule applies (e.g., "only if the source is Website")
- **Action**: What the system does automatically (e.g., "create a call follow-up task due in 2 hours")

### 7.2 Available Triggers

| Trigger | When It Fires |
|---|---|
| **Lead Created** | A new lead enters the pipeline (from any source) |
| **Lead Stage Changed** | A lead moves from one pipeline stage to another |
| **Lead Assigned** | A lead is assigned (or reassigned) to a counselor |
| **Activity Logged** | A counselor logs any activity (call, WhatsApp, meeting, etc.) |
| **Lead Score Changed** | A lead's score or temperature classification changes |
| **Lead Stale** | The stale lead detection system flags a lead |
| **Follow-up Overdue** | A scheduled follow-up task becomes overdue |

### 7.3 Available Conditions

Conditions let admins narrow when a rule should fire. Multiple conditions can be combined (all must be true):

| Condition | Example Use |
|---|---|
| **Lead Source is...** | "Only for Website leads" or "Only for Referral leads" |
| **Current Stage is...** | "Only if the lead is in Interested stage" |
| **New Stage is...** | "Only when the lead moves TO Application Submitted" |
| **Temperature is...** | "Only if the lead is currently Hot" |
| **Temperature Changed to...** | "Only when the lead just became Hot" (not when it was already Hot) |
| **Activity Type is...** | "Only when a Demo Class activity is logged" |

### 7.4 Available Actions

| Action | What It Does | Example |
|---|---|---|
| **Send Notification** | Sends an in-app + email notification to a person | "Notify the branch manager: Hot Lead Alert — {lead_name} is now Hot!" |
| **Create Follow-up Task** | Schedules a follow-up task on the lead | "Create a Call follow-up due in 2 hours" |
| **Reassign Lead** | Reassigns the lead to another counselor | "Reassign via round-robin to the next available counselor" |
| **Change Pipeline Stage** | Moves the lead to a different stage | "Move to Interested stage" |
| **Log System Note** | Adds an automated note to the lead's activity feed | "Auto-note: Lead re-engaged after stale detection" |

Notification messages support **dynamic variables** — placeholders like `{lead_name}`, `{lead_score}`, `{assignee_name}`, and `{branch_name}` that are filled in automatically when the notification is sent.

### 7.5 Example Automation Rules

Here are real-world examples of rules institutions commonly set up:

**"Auto-schedule a call for new website leads"**
- Trigger: Lead Created
- Condition: Source is Website
- Action: Create a Call follow-up due in 2 hours
- *Why: Website leads are time-sensitive — the first call within 2 hours dramatically improves conversion.*

**"Alert the branch manager when a lead becomes Hot"**
- Trigger: Lead Score Changed
- Condition: Temperature Changed to Hot
- Action: Send notification to Branch Manager — "Hot Lead: {lead_name} (Score: {lead_score}). Source: {lead_source}. Assigned to: {assignee_name}."
- *Why: Hot leads represent the highest revenue potential. Managers want visibility.*

**"Auto-advance demo attendees to Interested"**
- Trigger: Activity Logged
- Condition: Activity Type is Demo Class
- Action: Change stage to Interested
- *Why: If someone attended a demo, they're interested by definition. Saves the counselor a manual step.*

**"Reassign stale leads to a fresh counselor"**
- Trigger: Lead Stale
- Condition: (none — applies to all stale leads)
- Action: Reassign via round-robin
- *Why: If a counselor hasn't touched a lead in 3+ days, a fresh pair of eyes may re-engage them.*

**"Create urgent follow-up when a hot lead's follow-up is overdue"**
- Trigger: Follow-up Overdue
- Condition: Temperature is Hot
- Action: Send notification to Branch Manager — "URGENT: Overdue follow-up on Hot Lead {lead_name}. Assigned to: {assignee_name}."
- *Why: An overdue follow-up on a Hot lead is a revenue risk.*

### 7.6 Rule Management

- Rules can be **enabled or disabled** without deletion — allowing institutions to experiment safely
- Each rule execution is **logged** — admins can see exactly which rules fired, for which leads, at what time, and whether the action succeeded or failed
- The number of active rules is controlled by the institution's subscription plan
- Rules are configured via a simple form interface — no coding, no flowcharts, just dropdown menus

### 7.7 Safety: No Infinite Loops

A common risk with automation is circular chains — Rule A changes a stage, which triggers Rule B, which reassigns the lead, which triggers Rule A again, forever. EducoreOS prevents this by design: **actions performed by automation rules do not trigger further automation rules.** The loop stops after one pass. This is enforced at the system level and cannot be overridden.

---

## 8. Multi-Branch Support

The CRM module is fully integrated with EducoreOS's Branch Management system:

- Leads are associated with a specific branch
- Auto-assignment considers only counselors within the lead's branch
- Branch managers see all leads in their branch(es) but cannot access other branches' leads
- Escalation notifications route to the correct branch manager
- Automation rules apply across all branches in the institution (rules are institution-wide, not branch-specific)

This means a coaching center with 5 branches gets a single CRM with branch-level visibility controls — no need for separate systems per location.

---

## 9. CRM Settings

Institution admins configure CRM behavior through a dedicated settings page:

### 9.1 Follow-up & Escalation Settings

| Setting | Default | Description |
|---|---|---|
| Reminder lead time | 60 minutes | How far before a follow-up's due time should the counselor be reminded? |
| Tier 1 escalation delay | 2 hours | How long after a missed follow-up before re-notifying the counselor? |
| Tier 2 escalation delay | 24 hours | How long after a missed follow-up before notifying the branch manager? |

### 9.2 Lead Scoring Settings

| Setting | Default | Description |
|---|---|---|
| Signal weights | Source: 15%, Stage: 30%, Engagement: 25%, Visits: 10%, Recency: 20% | How much each scoring factor matters. Must sum to 100%. |
| Source scores | Referral: 90, Walk-in: 85, Website: 60, etc. | How much each lead source is worth (0–100). |
| Hot threshold | Score ≥ 70 | Minimum score to classify a lead as Hot. |
| Warm threshold | Score ≥ 40 | Minimum score to classify a lead as Warm. Below this = Cold. |

### 9.3 Automation Settings

| Setting | Default | Description |
|---|---|---|
| Maximum active rules | Plan-dependent | How many automation rules can be active simultaneously. |

---

## 10. User Experience Summary

### 10.1 Counselor Experience

A counselor's daily workflow in EducoreOS CRM:

1. **Start of day:** Check the follow-up tasks due today — the system has already sent reminders for upcoming ones.
2. **Work the pipeline:** Open the Kanban board. Hot leads have red badges — prioritize those. Drag completed leads to the next stage.
3. **Log every interaction:** After each call or meeting, log a structured activity with the outcome. The lead's score updates automatically.
4. **Schedule next steps:** After logging an activity, create a follow-up task for the next touchpoint.
5. **Convert winners:** When a lead confirms admission and pays fees, click "Convert to Student" — the lead becomes a student in the LMS instantly.

The counselor never worries about automation rules or scoring configuration — those are set up by the admin. The counselor just works leads, logs activities, and the system handles the rest.

### 10.2 Branch Manager Experience

A branch manager's oversight workflow:

1. **Monitor the pipeline:** See all leads across their branch in one Kanban view. Filter by temperature to find at-risk opportunities.
2. **Receive escalations:** Get notified when counselors miss follow-ups on important leads. Take action — reassign, counsel, or follow up directly.
3. **Review activity:** Check which counselors are logging activities consistently and which leads are being neglected.
4. **Sort by score:** Use the lead list view sorted by score to understand which leads represent the highest conversion potential.

### 10.3 Admin Experience

An institution admin's configuration workflow:

1. **Set up scoring:** Adjust signal weights and source scores to match the institution's admission funnel.
2. **Configure escalation:** Set appropriate escalation timings based on the team's workload and response expectations.
3. **Create automation rules:** Define rules like "website leads get an auto follow-up" or "hot leads alert the manager."
4. **Review automation logs:** Check which rules are firing, which are failing, and refine accordingly.
5. **Analyze source effectiveness:** Use lead data to understand which sources produce the most Hot leads and the best conversion rates.

---

## 11. Integration with Other EducoreOS Modules

The CRM module doesn't exist in isolation — it integrates with the rest of the platform:

| Module | Integration |
|---|---|
| **Landing Pages & Website** | Enquiry forms on the institution's public website create leads automatically |
| **Notification System** | All reminders, escalations, and automation notifications flow through the centralized notification engine (in-app + email) |
| **User Management** | Lead-to-Student conversion creates a user account in the LMS |
| **Branch Management** | Leads are scoped to branches. Access controls follow branch boundaries. |
| **Subscription Plans** | Automation rule limits are controlled by the institution's plan tier |
| **Audit Logs** | Every CRM action (stage change, activity, escalation, automation rule execution) is audit-logged for compliance |

---

## 12. Feature Availability by Plan

| Feature | Starter | Professional | Business |
|---|---|---|---|
| Lead Pipeline (Kanban) | ✅ | ✅ | ✅ |
| Lead Source Tracking | ✅ | ✅ | ✅ |
| Auto-Assignment | ✅ | ✅ | ✅ |
| Structured Activity Logging | ✅ | ✅ | ✅ |
| Follow-up Task Scheduling | ✅ | ✅ | ✅ |
| Reminder Notifications | ✅ | ✅ | ✅ |
| Tiered Escalation | — | ✅ | ✅ |
| Lead Scoring | — | ✅ | ✅ |
| Scoring Customization (Weights) | — | — | ✅ |
| Automation Rules | — | Up to 10 rules | Up to 50 rules |
| Lead-to-Student Conversion | ✅ | ✅ | ✅ |
| Multi-Branch CRM | — | ✅ | ✅ |
| Stale Lead Detection | ✅ | ✅ | ✅ |

*Note: Plan-to-feature mapping is indicative. Final plan configuration is managed by the platform's subscription and capability system.*

---

## 13. Competitive Positioning

### 13.1 Why Not Use a General CRM?

| Challenge | General CRM (Salesforce, HubSpot, Zoho) | EducoreOS CRM |
|---|---|---|
| Pipeline stages | Generic: "Prospect → Qualified → Negotiation → Closed" — must be customized for education | Pre-built for admissions: "New Enquiry → Contacted → Interested → App Submitted → Confirmed" |
| Lead-to-student conversion | Requires integration with a separate LMS. Data must be exported and re-imported. | One-click conversion — the lead becomes a student in the same platform. |
| Cost | ₹1,000–₹5,000 per user per month for CRM alone | Included in the EducoreOS subscription alongside LMS, ERP, and website |
| Setup complexity | Requires CRM consultants, custom fields, workflow builder expertise | Works out of the box. Scoring and automation are pre-configured with sensible defaults. |
| Branch management | Enterprise-tier feature in most CRMs | Built-in at every plan tier that supports it |
| Integration with classes & courses | None — CRM has no concept of demo classes, course enrollment, or student progress | Native — demo class activities, course-based scoring signals, and enrollment-aware conversion |

### 13.2 Why Not Build a Custom CRM?

Building a custom admission CRM costs ₹10–30 lakhs and takes 3–6 months for a basic version. Maintaining it (bug fixes, feature requests, mobile support) costs another ₹5–10 lakhs per year. EducoreOS provides a more capable CRM as part of the platform subscription, with regular updates, zero maintenance burden, and integration with every other module the institution uses.

---

## 14. Future Roadmap

The following capabilities are planned for future CRM releases:

| Feature | Description | Status |
|---|---|---|
| **Meta Lead Ads Integration** | Leads from Facebook/Instagram ad forms flow directly into the CRM | Planned (requires Meta App Review) |
| **WhatsApp Business API** | Send and receive WhatsApp messages directly from the CRM, with auto-logging | Planned |
| **Drip Email Campaigns** | Automated multi-step email sequences (Day 1: Welcome, Day 3: Course info, Day 7: Offer) | Planned |
| **Delay/Wait Steps in Automation** | "Wait 3 days, then send a follow-up email" — timed automation actions | Planned |
| **Lead Score History & Trends** | Track how a lead's score changed over time — identify engagement patterns | Planned |
| **Source ROI Analytics** | "We spent ₹50,000 on Google Ads. 120 leads came in. 18 converted. Cost per admission: ₹2,778." | Planned |
| **Visual Workflow Builder** | Drag-and-drop automation rule builder for complex multi-step workflows | Planned |
| **Admissions Application Processing** | Online application forms, merit lists, interview scheduling, document verification | Planned |
| **SMS Notification Channel** | Follow-up reminders and automation notifications via SMS | Planned |

---

## 15. Glossary

| Term | Definition |
|---|---|
| **Lead** | A prospective student or parent who has expressed interest in the institution's programs |
| **Pipeline Stage** | A step in the admission funnel (New Enquiry → Contacted → Interested → App Submitted → Admission Confirmed → Rejected) |
| **Counselor** | An admissions staff member responsible for engaging and converting leads |
| **Activity** | A structured record of a counselor interaction with a lead (Call, WhatsApp, Meeting, Demo Class, Note) |
| **Follow-up Task** | A scheduled action a counselor must complete by a specific date and time |
| **Escalation** | Automatic notification to a supervisor when a follow-up is missed |
| **Lead Score** | A number (0–100) representing a lead's conversion likelihood, computed from source, stage, engagement, visits, and recency |
| **Temperature** | A classification (Hot / Warm / Cold) derived from the lead score |
| **Automation Rule** | A configurable "when → if → then" rule that performs actions automatically on CRM events |
| **Stale Lead** | A lead with no counselor activity for 3+ days |
| **Kanban Board** | A visual pipeline view where each column is a stage and each card is a lead |
| **Auto-Assignment** | Automatic distribution of new leads to counselors based on workload balance |
| **Branch** | A physical location of the institution (e.g., "Mumbai Center", "Delhi Center") |

---

*End of Document — EducoreOS CRM & Admissions Module Feature Specification — March 2026*
