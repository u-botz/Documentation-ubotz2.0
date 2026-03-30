# Student Dashboard Migration Gap Analysis

Full inventory of Mentora's Student Dashboard features versus what UBOTZ 2.0 currently implements. Since this is a new feature migration, most UBOTZ columns will be marked as missing (❌) indicating work that needs to be done.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented in UBOTZ 2.0 |
| ❌ | Missing — needs implementation |
| ⚠️ | Partially implemented |

---

## 1. Dashboard Overview

The student's main landing page when they log in to the panel.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Enrolled courses count | ✅ | ⚠️ | ⚠️ Enrollment exists but dedicated count query needed |
| Open support tickets count | ✅ | ⚠️ | ⚠️ Tickets exist, student view needed |
| Active comments count | ✅ | ⚠️ | ⚠️ Comments exist but student dashboard widget missing |
| Reserved/booked meetings count | ✅ | ❌ | ❌ Meeting booking not yet implemented |
| Monthly purchase/sales chart | ✅ | ❌ | ❌ Monthly analytics chart for student |
| Gift modal popup (on login) | ✅ | ❌ | ❌ Gift system not yet implemented |

---

## 2. User Profile & Settings

Student account settings — identity, avatar, notifications, and preferences.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Edit basic info (name, email, mobile) | ✅ | ✅ | ✅ `TenantUserWriteController` implemented |
| Change password | ✅ | ✅ | ✅ Password change flow implemented |
| Upload avatar / profile image | ✅ | ❌ | ❌ File upload for tenant user avatar not implemented |
| Upload cover image | ✅ | ❌ | ❌ Cover image upload not implemented |
| Bio / About text | ✅ | ❌ | ❌ `about` and `bio` fields not implemented |
| Signature image upload | ✅ | ❌ | ❌ Signature meta field not implemented |
| Language / Timezone / Currency preference | ✅ | ❌ | ❌ Per-user locale preference not implemented |
| Newsletter opt-in (with reward points) | ✅ | ❌ | ❌ Newsletter subscription + reward not implemented |
| Public messages toggle | ✅ | ❌ | ❌ Public messaging flag not implemented |
| Education & Experience (user metas) | ✅ | ❌ | ❌ Dynamic user meta/custom fields not implemented |
| Occupations / Teaching categories | ✅ | ❌ | ❌ Instructor-specific occupations not implemented |
| Identity scan & certificate upload | ✅ | ❌ | ❌ Identity verification documents not implemented |
| Bank account & financial details | ✅ | ❌ | ❌ Payout bank details not implemented |
| Login history list | ✅ | ✅ | ✅ Audit logs exist; login history partially tracked |
| Delete account request | ✅ | ❌ | ❌ `DeleteAccountRequest` model exists in Mentora; not in UBOTZ |
| Custom form fields (per user type) | ✅ | ❌ | ❌ Dynamic form fields system not implemented |

---

## 3. Notifications

Student notification inbox.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| List notifications (single, group, all users, role-based) | ✅ | ✅ | ✅ Notification system implemented |
| Mark notification as read | ✅ | ✅ | ✅ Read status tracking implemented |
| Mark all as read | ✅ | ✅ | ✅ Bulk read implemented |
| Course-specific notifications (`course_students` type) | ✅ | ❌ | ❌ Course-scoped notification type not yet wired |
| Unread count badge | ✅ | ✅ | ✅ Derived from notification status |

---

## 4. Enrolled Courses

Student's purchased/enrolled course management.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| List purchased courses | ✅ | ✅ | ✅ Enrollment module implemented |
| Course learning page (chapter / content access) | ✅ | ✅ | ✅ Chapter/content hierarchy implemented |
| Course completion tracking | ✅ | ✅ | ✅ Learning progress tracking implemented |
| Prerequisite gate (must complete before accessing) | ✅ | ✅ | ✅ Prerequisite module implemented |
| Favourite / wish-list courses | ✅ | ❌ | ❌ Favorite system not implemented |
| Personal notes per course | ✅ | ❌ | ❌ `course_personal_notes` not implemented |
| Noticeboard / Announcements per course | ✅ | ❌ | ❌ `course_noticeboard` feature not implemented |
| Content access restrictions (sequential) | ✅ | ✅ | ✅ Sequence checks in enrollment/progress |
| Installment purchase plan | ✅ | ❌ | ❌ Installment payment plans not implemented |

---

## 5. Assignments

Student access to and submission of course assignments.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| List my assignments (all enrolled courses) | ✅ | ✅ | ✅ Assignment module implemented |
| Filter assignments (by course, status, date) | ✅ | ✅ | ✅ Filters implemented in query |
| Submit assignment (file/text upload) | ✅ | ✅ | ✅ Assignment submission implemented |
| View assignment history & status (pending/passed/failed) | ✅ | ✅ | ✅ Assignment history tracking |
| Assignment deadline tracking | ✅ | ✅ | ✅ Deadline per assignment implemented |
| Multiple submission attempts | ✅ | ✅ | ✅ Attempts limit implemented |
| Messaging thread per submission | ✅ | ✅ | ✅ Submission messages implemented |

---

## 6. Quizzes

Student quiz participation and results.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Take a quiz | ✅ | ✅ | ✅ Quiz attempt system implemented |
| Multiple question types (MCQ, descriptive, etc.) | ✅ | ✅ | ✅ Question types implemented |
| Auto-grading (for MCQ) | ✅ | ✅ | ✅ Auto-grading implemented |
| View quiz result / score | ✅ | ✅ | ✅ Quiz results implemented |
| Retake quiz (if allowed) | ✅ | ✅ | ✅ Retake logic implemented |
| Time-limited quizzes | ✅ | ✅ | ✅ Timed quiz implemented |
| Random question order | ✅ | ✅ | ✅ Random question shuffle |
| Practice mode / Mock tests | ✅ | ❌ | ❌ Mock test mode not implemented |

---

## 7. Certificates & Achievements

Student certificates earned by passing quizzes.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| List my achievements (passed quizzes) | ✅ | ✅ | ✅ Certificate module implemented |
| Download certificate PDF | ✅ | ✅ | ✅ Certificate PDF generation implemented |
| Filter achievements by course / quiz / grade | ✅ | ✅ | ✅ Filtering on achievements implemented |
| Average grade & failed count stats | ✅ | ✅ | ✅ Stats derived from quiz results |
| Certificate validation page (public) | ✅ | ❌ | ❌ Public certificate verification URL not implemented |

---

## 8. Rewards

Student reward points and gamification.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| View reward points history | ✅ | ❌ | ❌ Student reward ledger not implemented |
| Total / available / spent points | ✅ | ❌ | ❌ Point balance calculation not implemented |
| Exchange points for wallet credit | ✅ | ❌ | ❌ Points-to-wallet conversion not implemented |
| Leaderboard (top reward earners) | ✅ | ❌ | ❌ Reward leaderboard not implemented |
| Automatic reward on actions (quiz, comment, enroll) | ✅ | ❌ | ❌ Reward triggers on student actions not implemented |

---

## 9. Comments (Course/Blog)

Student ability to post and manage comments on courses and blog posts.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Post comment on course | ✅ | ✅ | ✅ Course comment system implemented |
| Reply to comment | ✅ | ✅ | ✅ Reply system implemented |
| Edit own comment | ✅ | ❌ | ❌ Student self-edit of comment not implemented |
| Post comment on blog post | ✅ | ❌ | ❌ Student-facing blog comment submission not implemented |
| View comment status (active/pending) | ✅ | ❌ | ❌ Comment status visibility for student not implemented |

---

## 10. Support Tickets

Student help desk / support ticket system.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Create support ticket (linked to course) | ✅ | ✅ | ✅ Support/ticket system implemented |
| List my tickets | ✅ | ✅ | ✅ Student ticket listing implemented |
| Reply to ticket | ✅ | ✅ | ✅ Ticket messaging implemented |
| Close ticket | ✅ | ✅ | ✅ Ticket status management implemented |
| Ticket priority / category | ✅ | ❌ | ❌ Priority/category tags not implemented |

---

## 11. Wallet & Payments

Student financial panel.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| View wallet balance | ✅ | ❌ | ❌ Student wallet balance view not implemented |
| Top-up wallet | ✅ | ❌ | ❌ Wallet top-up not implemented |
| Purchase history / receipts | ✅ | ✅ | ✅ Payment/purchase history implemented |
| Refund requests | ✅ | ❌ | ❌ Refund request flow not implemented |
| Gift a course to another user | ✅ | ❌ | ❌ Course gifting system not implemented |
| Discount coupon redemption | ✅ | ❌ | ❌ Coupon/discount system not implemented |
| Affiliate / referral program | ✅ | ❌ | ❌ Referral/affiliate system not implemented |

---

## 12. Forums

Student community discussion forums.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Browse forum topics | ✅ | ❌ | ❌ Forum module not implemented |
| Post a new topic | ✅ | ❌ | ❌ Topic creation not implemented |
| Reply to a topic | ✅ | ❌ | ❌ Forum replies not implemented |
| Like / vote on posts | ✅ | ❌ | ❌ Forum voting not implemented |
| Search forums | ✅ | ❌ | ❌ Forum search not implemented |

---

## 13. Live Sessions & Meetings

Student access to live classes, webinars, and 1-on-1 meetings.

| Feature | Mentora | UBOTZ 2.0 | Gap? |
|---------|---------|-----------|------|
| Join live session (Agora/Zoom) | ✅ | ✅ | ✅ Live session module implemented |
| Book a 1-on-1 meeting (instructor) | ✅ | ❌ | ❌ Meeting booking / calendar not implemented |
| View upcoming meetings | ✅ | ❌ | ❌ Reserved meetings list not implemented |
| Video call integration (Agora) | ✅ | ✅ | ✅ Agora integration implemented |
| Meeting waitlist | ✅ | ❌ | ❌ Meeting waitlist not implemented |

---

## Architectural Considerations for UBOTZ 2.0

Key decisions for migrating the Student Dashboard:

1. **Role Identifier**: In UBOTZ 2.0, the concept of `role_name = 'user'` from Mentora maps to the `student` role hierarchy. All student-specific capabilities must be seeded via the RBAC system.
2. **Tenant Scoping**: Every student's data (enrollments, quizzes, assignments, purchases) must be strictly scoped to `tenant_id` to prevent cross-tenant leaks.
3. **Wallet System**: The Mentora wallet (`Accounting` model) is a global concept. In UBOTZ 2.0, wallet/financial data must be tenant-scoped and may require a dedicated **Wallet Bounded Context**.
4. **Rewards**: The `reward_accountings` table in Mentora is global. UBOTZ 2.0 must implement a tenant-scoped reward ledger within the **Rewards Bounded Context**.
5. **File Uploads**: Avatar, cover image, and document uploads must be stored in tenant-namespaced storage paths to prevent path traversal and data leakage.
6. **Forum**: Mentora's forum is a complex feature with threads, replies, and voting. In UBOTZ 2.0, a dedicated **Forum Bounded Context** would be required.
7. **Payments**: Installment plans, refunds, wallet top-ups, and gifts are part of the **Payment Bounded Context** and should be implemented separately with idempotency keys.
