# UBOTZ 2.0 Locale & Internationalization Business Findings

## Executive Summary
The Locale module enables the Ubotz 2.0 platform to serve as a truly global educational infrastructure. It manages the linguistic, temporal, and cultural preferences of the institution, ensuring that pedagogy is delivered in the native context of the student.

## Operational Modalities

### 1. Regional Identity (`tenant_locale_settings`)
Tenants define their primary operating context:
- **Default Locale**: The fallback language for all system-generated emails and interface labels.
- **RTL Support**: Native compatibility for Right-to-Left scripts (Arabic, Hebrew, Persian/Farsi).
- **Timezone Governance**: Ensures that the `Timetable` and `Meeting` calendars display times correctly for the local institution, regardless of where the servers are hosted.

### 2. Personal Preferences
While the tenant has a global setting, individual **Users** can override their personal `locale`.
- **Scenario**: An institution in the UAE may have it's default as Arabic, but an English-speaking international instructor can toggle their personal dashboard to English.

### 3. Cultural Formatting
Locale settings govern the display of:
- **Numbers & Currency**: Placement of decimal points and currency symbols ($ vs. ₹ vs. AED).
- **Date/Time Formats**: DD/MM/YYYY vs. MM/DD/YYYY to match regional expectations.

## Commercial Advantage
By supporting RTL and localized timezones out-of-the-box, Ubotz enables tenants to frictionlessly expand into the MENA (Middle East & North Africa) and European markets.

---

## Linked References
- Related Modules: `User`, `Blog`, `Store`, `Timetable`.
