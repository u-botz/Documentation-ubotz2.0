# UBOTZ 2.0 Reward System Business Findings

## Executive Summary
The Reward module is the primary engine for student engagement and retention (Gamification). It incentivizes positive academic behaviors—such as quiz completion, daily attendance, and course progress—by granting "Reward Points" that can be tracked in the student’s profile.

## Operational Modalities

### 1. Point Injection Rules (`reward_configs`)
Administrators define the "Exchange Rate" for platform interactions:
- **Daily Check-in**: 5 Points.
- **Quiz Completion**: 20 Points.
- **Achieving 90%+ in Assessment**: 50 Points.
- These rules can be toggled `is_active` per tenant to suit institutional culture.

### 2. The Reward Ledger
Every point movement is an immutable entry in the `reward_ledger`. 
- Students can view their transaction history, providing transparency and motivation.
- Achievements are derived from these ledger totals, allowing students to "Level Up" or earn badges.

### 3. Source Context
Rewards are always tied back to a specific action (e.g., a specific `quiz_attempt_id` or `attendance_session_id`). This prevents "Point Farming" and allows for automatic claw-backs if a source event is invalidated (e.g., a quiz attempt was flagged for cheating).

## Commercial Retention
By turning academic labor into a tangible digital asset, tenants can drive significantly higher completion rates for their B2C products.

---

## Linked References
- Related Modules: `Quiz`, `Attendance`, `User`.
