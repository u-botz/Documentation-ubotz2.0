# UBOTZ 2.0 Fee Business Findings

## Executive Summary
The Fee module is a core component of the Ubotz 2.0 student billing ecosystem. It defines the structural obligations (charges) that students must fulfill to access platform resources. It translates academic enrollments into financial liabilities and manages the lifecycle of these dues from generation to reconciliation.

## Operational Modalities

### 1. Fee Generation & Types
Fees are generated based on the student's interaction with the platform:
- **Course/Bundle Fees**: Charged at the point of enrollment or purchase.
- **Admission Fees**: One-time charges typically applied during the initial lead-to-student conversion.
- **Late Fees**: Automated penalties triggered by delinquent payment behavior beyond defined grace periods.

### 2. Concessions & Adjustments
The system supports sophisticated discount strategies to accommodate scholarships and promotional offers:
- **Fee Concessions**: Policy-driven reductions applied to a student's total due.
- **Concession Types**: Categorizations (e.g., "Merit-based", "Sibling discount") for financial auditing.
- **Step Adjustments**: Granular controls used to distribute concessions across multiple installment steps.

### 3. Delinquency Management
- **Late Fee Charges**: Systematic penalties applied to overdue installment orders.
- **Grace Periods**: Configurable buffers (e.g., 3 days) allowing students to settle dues without incurring penalties.

## Commercial Integration
Fees are the prerequisite for the `Payment` and `Installment` modules. They provide the "base amount" which is then taxed (VAT), divided into installments, or discounted via concessions before being presented as a `Student Order` for settlement via the payment gateway.

---

## Linked References
- Status report: `../../status reports/Fee_Status_Report.md`
- Related Modules: `Payment`, `Installment`, `Student Billing`.
