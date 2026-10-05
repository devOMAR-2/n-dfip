# N-DFIP Business Requirements Document

**National Diabetic Foot Intelligence Platform (N-DFIP)**

## 0. Document control

| Item | Value |
|---|---|
| Document | Business Requirements Document (BRD) |
| Product | N-DFIP, National Diabetic Foot Intelligence Platform |
| Version | 0.2 (draft) |
| Date | 2026-10-05 |
| Status | Draft for client review |
| Requirement source | UAT Comments, Round 1 (UAT-01 to UAT-25, F-01 to F-13, EC-01 to EC-15), the N-DFIP Developer Handbook: Clinical Logic and Terminology (the reference for all clinical logic), the N-DFIP Project Dossier, the Primary Care Screening Form (nurse / doctor split), MOH Comprehensive Model of Care for Diabetic Foot Prevention and Management v1.0 (2024), MOH Criteria for Diabetic Foot Emergency, Amputation and Admission v1.0, Diabetic Foot 101 and 102 teaching decks |
| Basis for "Demo status" | The front-end demo build of 5 October 2026 (plain HTML, browser storage, fictional data) |
| Approval | To be reviewed and approved by the client before it is final (UAT-25) |

### 0.1 Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-10-05 | Development team | First draft, written after UAT round 1 |
| 0.2 | 2026-10-05 | Development team | Clinical rules rewritten to the Developer Handbook (sections 5 to 10); F-04, F-05, F-06 resolved; handbook open points added to Section 16 |

### 0.2 How to read this document

- Requirements are numbered **FR-xxx** (functional), **NFR-xxx** (non-functional), **DR-xxx** (data and privacy) and **CR-xxx** (clinical rules).
- Each requirement names its source: a UAT item (UAT-nn), a finding from testing (F-nn), an edge case (EC-nn) or a source document.
- **Demo status** says what the front-end demo already shows:
  - **Shown**: the behaviour can be seen and tested in the demo.
  - **Partial**: part of it is in the demo.
  - **Not started**
  - **Blocked**: waiting for a document or a decision.
- **Back end** says what the production server must add. The demo keeps data in the browser and checks permissions on screen only. **Every check in this document must also be enforced on the server** (see NFR-SEC-01).
- All names, IDs and records in the demo and in this document's examples are fictional.

---

## 1. Purpose

N-DFIP is a clinical platform for diabetic foot screening, assessment, referral and follow-up across a healthcare organisation, built on the Saudi MOH Comprehensive Model of Care (MoC). It supports a two-step encounter:

1. A trained nurse records a structured foot screening.
2. A practitioner reviews it, confirms or overrides the system's suggestions, decides the plan, orders tests, refers and signs.

The platform gives decision support only. It never diagnoses on its own, and the signing practitioner stays responsible for every clinical decision (Project Dossier; UAT-18).

This BRD describes the scope, users, workflows, functional requirements, clinical rules and their sources, data protection, integrations and non-functional requirements. It is written for later submission to a government entity.

## 2. Scope

### 2.1 In scope

- Organisation structure with scoped access: organisation, region or city, facility, department, clinic (UAT-01).
- Roles, permissions and patient-data visibility per role, aligned with the Personal Data Protection Law (PDPL) (UAT-02, UAT-03).
- Staff accounts, password reset and sessions (UAT-04, EC-04, EC-07).
- An audit log of every significant action (UAT-05).
- The Diabetic Foot clinic workflow:
  - arrival and nurse queue
  - nurse screening (Part 1)
  - practitioner review (Part 2)
  - sign-off and reopening
  - (UAT-06 to UAT-10, F-01 to F-03, F-12)
- Clinical decision support from MoC / MOH rules: risk, classifications, alerts, suggested tests, referral suggestion, follow-up (Section 9; F-04 to F-08).
- Medications as free text (UAT-16).
- Test ordering with approval and insurance rules (UAT-17).
- Referral tracking (UAT-12).
- Appointment details, patient file and staff profiles (UAT-11, UAT-21, UAT-22).
- Clinic setup managed in Settings:
  - questions
  - question placement between pages
  - sections
  - tabs
  - versions
  - (UAT-13 to UAT-15, F-13)
- Printing and export (UAT-20).
- Dashboards: operations overview, clinical, system value, staff (UAT-22 to UAT-24).
- Behaviour when things go wrong (EC-01 to EC-15).
- Delivery of this BRD (UAT-25).

### 2.2 Out of scope for this phase (unless the client adds them)

- Autonomous diagnosis or treatment without a practitioner's sign-off.
- Billing and claims processing. Insurance *approval status* for tests is in scope; claims are not.
- Scheduling engine for booking appointments. The platform records how an appointment was booked; booking channels are external (see Section 12).
- Patient-facing mobile app. Bookings from an app or website are recorded as a booking channel only.
- Clinic types other than Diabetic Foot. The structure supports them ("the same clinic definition can run in many facilities"), but only the Diabetic Foot content is specified.

### 2.3 Constraints

- The clinical rules come only from the cited source documents. Where those documents conflict or are silent, the point is listed as an open decision (Section 16).
- The **Developer Handbook** is the reference for the clinical logic; the UAT comments are the reference for screens, permissions and workflow. Items the handbook marks "(prototype)" still need the clinical lead's sign-off (Section 16.1).

## 3. Stakeholders

| Stakeholder | Interest |
|---|---|
| Client (programme owner) | Approves scope, requirements and this BRD |
| Clinical lead / senior doctor of each clinic | Owns the clinical rules, approves thresholds, sets up clinic content (UAT-15, UAT-17) |
| Screening nurses | Record Part 1 |
| Practitioners | Review, decide, order, refer, sign |
| Supervisors (facility) | Queues, locks, approvals escalated to them, facility audit log |
| Directors (region or organisation) | Reports and oversight within their scope |
| System administrators | Organisation structure, staff, roles, visibility, system settings; no clinical decisions |
| Patients | Subjects of the data; receive instructions; book through channels |
| Data protection officer | PDPL compliance, emergency-access review |
| Government entity (future) | Recipient of this BRD |

## 4. Glossary

| Term | Meaning |
|---|---|
| ABI / TBI | Ankle-brachial index / toe-brachial index |
| Active foot disease | MoC segmentation tier: chronic or infected ulceration in a patient who is not systemically ill, or suspected Charcot |
| Acute foot attack | MoC segmentation tier: systemically unwell, or an ulcer with ischaemia or gangrene, cellulitis or spreading infection, abscess or osteomyelitis |
| Clinic | The service a patient is booked into (level 5); questions, tests and rules attach here |
| Clinic definition | The reusable setup (e.g. "Diabetic Foot") that many clinics share |
| DF101 / DF102 | Diabetic Foot 101 / 102 teaching decks (source documents) |
| Editing lock | Only one person can edit an encounter at a time |
| Encounter | One visit of one patient to one clinic; also called an appointment or a file |
| IWGDF | International Working Group on the Diabetic Foot |
| IWGDF/IDSA | Infection classification (uninfected, mild, moderate, severe) |
| LOPS | Loss of protective sensation |
| MoC | MOH Comprehensive Model of Care for Diabetic Foot Prevention and Management v1.0 (2024) |
| MOH-EC | MOH Criteria for Diabetic Foot Emergency, Amputation and Admission v1.0 |
| PAD | Peripheral arterial disease |
| PDPL | Saudi Personal Data Protection Law |
| SINBAD | Ulcer score: Site, Ischaemia, Neuropathy, Bacterial infection, Area, Depth (0–6) |
| SIRS | Systemic inflammatory response signs |
| Stage | Where an encounter is in the workflow (1–5, Section 7.1) |
| WIfI | Wound, Ischaemia, foot Infection classification |
| Wagner | Ulcer grade 1–5 |

## 5. Organisation model (UAT-01)

### 5.1 Levels

| Level | What it is | Example (fictional) | FHIR mapping |
|---|---|---|---|
| 1. Organisation | The owning group or company | A healthcare group | Organization |
| 2. Region or city | Geographic grouping of facilities | Riyadh | Organization (partOf) or Location (area) |
| 3. Facility | One licensed site ("branch"), with a type | North Riyadh medical complex | Location + Organization |
| 4. Department (optional) | Groups clinics by specialty, mainly in hospitals | Endocrinology | Organization (department) |
| 5. Clinic | The service patients are booked into | Diabetic foot clinic | HealthcareService |

- Facility types follow the Saudi Private Health Institutions Law and form a configurable list: hospital, general medical complex, specialised medical complex, clinic, primary healthcare centre.
- A medical complex is a *type* of facility, not a separate level.
- The structure is a tree in which each unit points to its parent, so a level can be added later without code changes.
- One clinic definition can be attached to many facilities. For example, five dental clinics in one city are five clinics under five facilities, all using one definition.

### 5.2 Scoped access

- A director or supervisor can be assigned at any level: the whole organisation, a region, or one or more facilities. Staff members are assigned to one or more clinics.
- Access applies to everything below the assigned level.
- Everything a user sees is limited to their assignment: queues, patients, dashboards and logs.
- A change of assignment takes effect at once, on the user's next action (EC-07).

## 6. Roles and permissions

### 6.1 Roles (defaults; editable in Settings › Roles & permissions)

| Role | Purpose |
|---|---|
| Administrator | Manages organisation, clinics, staff and settings. Makes no clinical decisions. |
| Director | Oversees a region or the whole organisation: reports, referrals, audit log within scope. |
| Supervisor | Supervises facilities: queues, editing locks, escalated approvals, facility audit log. |
| Screening Nurse | Records the Part 1 screening before the practitioner sees the patient. |
| Practitioner | Reviews screenings; decides, prescribes, orders, refers and signs off. |
| Senior Doctor | Clinic lead. Has every practitioner permission, plus clinic setup, test approval, reopening signed encounters, lock release and the audit log. |

### 6.2 Permission catalogue

| Permission | Meaning |
|---|---|
| patients.view | Open patient records |
| patients.search | Search by file number, national ID, phone, name |
| patients.edit | Edit demographics and contact details |
| patients.merge | Merge duplicate patient files (logged, nothing deleted) (EC-12) |
| privacy.emergency | Emergency access to a hidden record with a reason (UAT-02) |
| screening.perform | Perform the nurse screening and send it |
| screening.editOwn | Edit own screening until the review starts |
| screening.pull | Complete the nurse part of a file not yet sent (UAT-07) |
| review.queue | Open the review queue and reviews |
| review.correct | Correct nurse findings (original kept) |
| review.decide | Make a clinical decision: confirm or override a recommendation (UAT-03) |
| medication.prescribe | Edit the medication section (UAT-03, UAT-16) |
| review.orders | Order tests |
| review.referral | Make referral decisions |
| review.signoff | Sign off an encounter (UAT-03) |
| review.reopen | Reopen a signed encounter with a reason (UAT-03, EC-06) |
| tests.approve | Approve or reject tests; record insurance decisions (UAT-17) |
| referrals.track | View referrals and update their status (UAT-12) |
| lock.release | Release another user's editing lock, with a reason (UAT-09) |
| notes.print | Print and export notes and instructions (UAT-20) |
| audit.view | View the audit log within scope (UAT-05) |
| staff.view | View staff profiles and the staff dashboard (UAT-22) |
| reports.clinic / reports.national | Dashboards within scope / approved national aggregates |
| admin.clinics | Manage clinics and the clinic builder |
| clinic.setup | Clinic setup: page layout, tabs, sections, question placement, tests and approval rules (UAT-13 to UAT-15, UAT-17) |
| admin.roles | Manage roles and permissions |
| admin.users | Manage staff accounts and password resets |
| admin.org | Manage the organisation structure and assignments |
| admin.privacy | Manage data visibility per role |
| admin.system | System settings: file rules, test tools |

### 6.3 Default permission matrix

✓ = granted by default.

| Permission | Admin | Director | Supervisor | Nurse | Practitioner | Senior Doctor |
|---|---|---|---|---|---|---|
| patients.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| patients.search | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| patients.edit | ✓ | | | | | |
| patients.merge | ✓ | | | | | |
| privacy.emergency | | | | | ✓ | ✓ |
| screening.perform | | | | ✓ | | |
| screening.editOwn | | | | ✓ | | |
| screening.pull | | | | | ✓ | ✓ |
| review.queue / correct / decide / orders / referral / signoff | | | | | ✓ | ✓ |
| medication.prescribe | | | | | ✓ | ✓ |
| review.reopen | | | | | | ✓ |
| tests.approve | | | | | | ✓ |
| referrals.track | | ✓ | ✓ | | ✓ | ✓ |
| lock.release | ✓ | | ✓ | | | ✓ |
| notes.print | | | | | ✓ | ✓ |
| audit.view | ✓ | ✓ | ✓ | | | ✓ |
| staff.view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reports.clinic | ✓ | ✓ | ✓ | | ✓ | ✓ |
| reports.national | | ✓ | | | | |
| admin.clinics, admin.roles, admin.users, admin.org, admin.privacy, admin.system | ✓ | | | | | |
| clinic.setup | ✓ | | | | | ✓ |

**Rule:** where a section of a form is locked for a role (UAT-14) and also depends on a permission, the stricter of the two applies.

## 7. Workflows

### 7.1 Encounter stages (UAT-07)

| Stage | Name | Who acts | Leaves the stage when |
|---|---|---|---|
| 1 | Waiting for screening | — (patient has arrived) | A nurse, or a practitioner who pulls the file, opens it |
| 2 | Screening (nurse) | Nurse (or practitioner with screening.pull) | The screening is sent |
| 3 | Waiting for practitioner | — | A practitioner opens the review |
| 4 | Practitioner review | Practitioner | The encounter is signed |
| 5 | Signed | — | A user with review.reopen reopens it with a reason (back to 4) |

- The current stage and the person holding the file appear on every queue row and at the top of the file.
- A patient never appears under "Awaiting practitioner review" before the nurse has sent the screening (UAT-06).
- Starting the review ends the nurse's ability to edit Part 1.

### 7.2 Nurse queue and screening (UAT-06, F-03)

1. The nurse's home page shows **Awaiting screening**: patients who have arrived in the nurse's clinics, in order of arrival, with the stage and holder.
2. Opening a row opens the screening and takes the editing lock (stage 1 → 2).
3. Edits are kept as a draft automatically. The record changes only on **Save** or **Send** (UAT-10).
4. **Send** runs the required-field and value checks, then shows the flags the practitioner will see. After confirmation the file moves to stage 3 and leaves the nurse queue.

### 7.3 Practitioner pulling a file at stage 1 or 2 (UAT-07)

- Practitioners see files at stages 1 and 2 in a separate list ("Not yet sent by the nurse").
- They can pull one and fill in or edit the nurse's part. The audit log records that the practitioner entered the nurse's part.
- If the nurse is editing at that moment, the editing lock applies.

### 7.4 Review queue (UAT-08)

- Shows only patients booked in the practitioner's own clinics. A patient booked in several clinics appears for each of those clinics' practitioners.
- Order: urgency first (critical alert, then other alerts), then waiting time.
- Shows how long each patient has waited since the nurse sent the screening.

### 7.5 Editing lock (UAT-09, F-02, EC-01)

- Only the first person to open an encounter can edit it. Others see it read-only with a label such as "Under review by Dr. [name] since 10:42". The same label shows in the queue.
- The lock releases when the holder leaves, after a period of inactivity (demo: 20 minutes), or when an authorised supervisor releases it with a reason. Releases are logged.
- Only a user with review permission can start a review.

### 7.6 Practitioner review (Part 2)

The review page is organised in tabs (Section 8.6). The patient header, clinical alerts, the file's stage and the pending counter stay visible on every tab.

The practitioner:
- sees the nurse's findings and corrects them (originals are kept)
- confirms or overrides each system recommendation, with a reason for overrides; "Confirm all" covers the per-foot cards (F-12)
- completes the wound evaluation (including abscess, F-07), labs, PAD and infection management
- enters medications, orders tests, decides the referral and plan
- reviews the generated note and patient instructions, then signs

### 7.7 Sign-off (UAT-18, UAT-03)

- Sign-off needs the "sign off" permission and is blocked while any required item is pending in any tab.
- Before signing, the practitioner must acknowledge this notice:

> "The suggestions and proposed tests in this system are generated from rules set by the clinic's senior doctor for general cases. They are decision support only. The signing practitioner remains fully responsible for all clinical decisions."

- The acknowledgement can't be skipped. It is stored with the signature and recorded in the audit log.
- A signed encounter is locked.

### 7.8 Reopening a signed encounter (UAT-03, EC-06)

- Only a user with "reopen" can reopen a signed encounter, and must give a reason.
- The signed version is kept in the history; it is never overwritten.
- The action is logged.

### 7.9 Referrals (UAT-12)

- The referral decision at sign-off creates a referral: destination, urgency, timing, due date, status "sent".
- Status moves through sent → received → attended → closed (or cancelled), each change with who, when and an optional note.
- When the system suggested a referral that the practitioner did not make, the suggestion is recorded as declined with the practitioner's reason, and it appears in the referral report and the system value dashboard.

### 7.10 Test ordering and approval (UAT-17, EC-13)

Each test in clinic setup has two extra settings.

- **Approval**, one of:
  - not needed
  - needed from a role level (practitioner or higher)
  - needed from one named person
  - needed from several named people, all of whom must approve, regardless of role
- **Insurance**: whether insurance approval is required. It is tracked with its own status (waiting, approved, rejected), separate from the clinical approval.

An ordered test that needs approval waits in a clear state: waiting, approved or rejected, with by whom and when. The approver is notified.

Pending approvals are listed with their age. After a set time, a request goes to a named backup, or else to the facility supervisor (EC-13).

### 7.11 Password reset (UAT-04)

1. An administrator starts a reset from the staff list, or an employee uses "Forgot password" on the sign-in page.
2. The system e-mails a one-time link to the employee's registered address. The link expires after a short time (e.g. 30 minutes).
3. The employee chooses the new password; the administrator never sees or sets it.
4. A second use of the link is refused, and the old password stops working.
5. The employee's other sessions are signed out.

Every request is logged with who asked. An account with no e-mail on file shows a clear message instead of failing silently.

## 8. Functional requirements

Columns: **ID** · **Requirement** · **Source** · **Demo status** · **Back end needed**.

### 8.1 Access, organisation and privacy

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-001 | Model the organisation as a five-level tree (Section 5) with configurable facility types; units are added, renamed, moved or closed, never deleted. | UAT-01, EC-09 | Shown (Settings › Organisation) | Persist tree; server-side validation |
| FR-002 | Assign staff to any node(s); a user sees everything below their assignments. Changes apply at once. | UAT-01, EC-07 | Shown | Scope filter on every query and response |
| FR-003 | A user assigned to facility A can't find, open or count anything from facility B. | UAT-01 | Shown (queues, file links, patients, dashboards, audit) | Enforce on server (NFR-SEC-01) |
| FR-004 | Per role, set each data group (sensitive identifiers; general data; medical record) to hidden, masked or visible. | UAT-02 | Shown (Settings › Data visibility) | Apply in every API response and export |
| FR-005 | Masked shows only part of a value: the last 4 digits of the national ID, the year of birth, the initials of the name. | UAT-02 | Shown | Server-side masking |
| FR-006 | Visibility applies everywhere: lists, search, timeline, dashboards, exports, print. | UAT-02, UAT-20 | Partial (main pages, print, CSV) | Central enforcement |
| FR-007 | Emergency access: a user can open a hidden record by entering a reason; the reason is logged and flagged for review. | UAT-02 | Shown | Review workflow for flagged access; time-limited grant |
| FR-008 | Four separate permissions per role: prescribe medication, make a clinical decision, sign off, reopen a signed encounter. | UAT-03 | Shown | Server-side checks |
| FR-009 | Pages and actions follow the role; menu items a role can't use are hidden; direct links show "no access". Administrators can't make clinical decisions. | F-01 | Shown | Server refuses forbidden requests |
| FR-010 | Roles are created and edited in Settings; a role in use is deactivated, not deleted. | UAT-03, EC-09 | Shown | — |

### 8.2 Accounts and sessions

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-020 | Administrator-initiated password reset by e-mail to the employee's own address (Section 7.11). | UAT-04 | Shown (demo mailbox replaces e-mail) | Real e-mail; hashed passwords; token store |
| FR-021 | "Forgot password" on the sign-in page sends the same e-mail; same neutral answer whether or not the ID exists. | UAT-04 | Shown | As FR-020 |
| FR-022 | Reset links are single-use and expire (e.g. 30 minutes). | UAT-04 | Shown | Server tokens |
| FR-023 | After a reset, the employee's other sessions are signed out. | UAT-04 | Shown | Session revocation |
| FR-024 | Warn the user before the session expires; after signing in again they return to the same place with their draft. | EC-04 | Shown | Server session timeout |
| FR-025 | A disabled user is signed out; a user whose permissions change is refused on their next action. | EC-07 | Shown | Server-side |
| FR-026 | Staff accounts: add, edit, disable or enable (never delete). Disabling lists the user's open files for reassignment. | EC-09 | Shown | Reassignment workflow |

### 8.3 Audit log

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-030 | One audit log page where nothing can be edited or deleted, by anyone, including the system administrator. | UAT-05 | Shown (read-only page) | Append-only, tamper-evident store |
| FR-031 | Log the events listed in Section 11.1. | UAT-05 | Partial (most events logged) | Server writes the log in the same transaction as the change |
| FR-032 | Each entry shows who, their role, when, facility and clinic, the action, the affected patient or record, old and new value, and the reason where given. | UAT-05 | Shown | — |
| FR-033 | Filters by user, patient, action type, date range, facility and clinic; export is available. | UAT-05 | Shown (CSV) | Server-side paging |
| FR-034 | A supervisor sees only the logs of their own facility. | UAT-05 | Shown | Server scope |

### 8.4 Workflow

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-040 | Nurse queue "Awaiting screening" on the nurse's home page; each row opens the screening; sending moves the patient to the practitioner queue. | UAT-06, F-03 | Shown | — |
| FR-041 | Five encounter stages with stage and holder on every queue row and at the top of the file. | UAT-07 | Shown | Server-owned state machine |
| FR-042 | Practitioners see stage 1–2 files in a separate list and can pull one; the pull is logged. | UAT-07 | Shown | — |
| FR-043 | Review queue limited to the practitioner's clinics, sorted by urgency then waiting time, showing time since the screening was sent. | UAT-08 | Shown | Server scope and sort |
| FR-044 | Editing lock with holder name and time, read-only for others, released on leaving, inactivity or by a supervisor with a reason. | UAT-09, F-02 | Shown | Server-side lock |
| FR-045 | Only users with review permission can start a review. | F-02 | Shown | Server-side |
| FR-046 | Drafts: edits are kept automatically, so nothing is lost if the browser closes. The record changes only on Save or Send/Sign. | UAT-10, EC-03 | Shown (draft kept in the browser) | Server draft store across devices |
| FR-047 | Leaving with a draft shows a warning. "Discard changes" lists the edited sections and restores the saved values after confirmation; cancelling keeps the edits. | UAT-10 | Shown | — |
| FR-048 | Sign-off notice must be acknowledged; the acknowledgement is stored with the signature and logged. | UAT-18 | Shown | — |
| FR-049 | Reopen a signed encounter with a reason, keeping the signed version in the history. | UAT-03, EC-06 | Shown | Versioned storage |

### 8.5 Clinical content

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-060 | Nurse screening, sections A–J: patient & encounter, risk history, neurological findings with foot map, vascular bedside signs, perfusion measurements, deformity and skin, nail and footwear, Charcot red-flag screen, previous ulcer/amputation, wounds with foot map. | Screening form | Shown | — |
| FR-061 | Foot map orientation: the sole view reads right foot, then left foot, with the big toes towards the centre; the top view shows the left foot on the left. Views are titled "Sole view" and "Top view". | F-11 | Shown | — |
| FR-062 | Practitioner review sections: screening findings (correctable), system recommendations, wound evaluation, lab results, PAD, infection management, medications, adjunctive therapies, orders, clinical interpretation, referral decision, plan, patient instructions, clinical note, sign-off. | Screening form, UAT-16 | Shown | — |
| FR-063 | "Confirm all" for the per-foot recommendation cards, keeping individual Override on each card. | F-12 | Shown | — |
| FR-064 | Wound evaluation includes abscess (yes / no), used for Wagner 3, moderate infection and acute foot attack. | F-07 | Shown | — |
| FR-065 | Labs include CBC (WBC, Hb, platelets) and renal function (urea, creatinine, eGFR) with sex-specific ranges from MOH Table 7; creatinine in mg/dL. | F-08 | Shown | Lab interface (Section 12) |
| FR-066 | Medications: free-text section (medication, dose, instructions); the patient's recorded allergies are shown next to it; it appears in the clinical note and the patient file. | UAT-16 | Shown | — |
| FR-067 | Referral suggestion follows the MOH segment (handbook §5 step 6, CR-12), shown with the segment and its action. | F-04 | Shown; matches handbook test cases 1 to 4 | — |
| FR-068 | Clinical alerts per handbook §8: levels critical ("Act now"), warning ("Check"), info ("Note"); each with title, reason and action; sorted by level; nurse-side "Tell the practitioner now". | F-05 | Shown | Thresholds from the approved rule set |
| FR-069 | WIfI clinical stage 1 to 4 from the handbook §6 table (W, I, fI), overridable with a reason; ischaemia estimated from pulses / Doppler when no measurement exists, and flagged. | F-06 | Shown | Table approval by the clinical lead |
| FR-070 | Test approval rules and insurance approval (Section 7.10), with clear states and approver notification. | UAT-17 | Shown (in-app bell; no e-mail) | Notifications (e-mail/SMS), insurance interface |
| FR-071 | Escalation of pending approvals after a set time to a named backup or the supervisor. | EC-13 | Shown | Scheduled job on the server |
| FR-072 | Generated clinical note and patient instructions, editable, regenerable. | Screening form | Shown | — |

### 8.6 Page layout managed from Settings

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-080 | Tabs instead of one long page on the nurse and practitioner pages; each tab groups existing sections. On a phone the tabs scroll sideways. | UAT-13 | Shown | — |
| FR-081 | Tabs are managed in Settings, per clinic and per page: add, rename, reorder, delete, choose which sections sit in each. Settings refuses to save a layout that leaves a section outside every tab. | UAT-13 | Shown: Settings › Page layout edits tabs and refuses a section outside every tab; versioned | Server-side versioning |
| FR-082 | Patient header, clinical alerts, the file's stage and the pending counter stay visible on every tab. Each tab shows its status (complete, or how many items are pending). The pending counter takes the user to the item. | UAT-13 | Shown | — |
| FR-083 | Section control: each section can be switched on or off, marked optional or required, and locked per role (e.g. medication locked for the nurse). A locked section is read-only for that role. A required section blocks sign-off until complete. | UAT-14 | Shown: Settings › Page layout and live pages | — |
| FR-084 | Layout changes are versioned; each encounter records the version it started with, so old and open encounters display as they were. | UAT-14, EC-10 | Shown | Versioned configuration store |
| FR-085 | Each question is assigned to the nurse page or the practitioner page; moving it in setup makes it disappear from one page and appear on the other for new encounters. | UAT-15 | Shown (clinic builder → live pages) | — |
| FR-086 | The Foot map question type shows the real interactive diagram in the builder preview and on the live page. The administrator chooses the view (sole or top) and the tappable sites. | F-13 | Shown | — |
| FR-087 | Questions added, moved or switched off in Settings appear, move or disappear on the live form. | F-13 | Shown for the Diabetic Foot clinic | — |

### 8.7 Records, reports and documents

| ID | Requirement | Source | Demo status | Back end needed |
|---|---|---|---|---|
| FR-100 | Appointment details: who booked it (practitioner, reception, or the patient through the app or website), when, whether confirmed, whether from a referral or a regular booking. | UAT-11 | Shown | Booking interface |
| FR-101 | Referral tracking with status history, destination, urgency, due date; declined suggestions with reason; export. | UAT-12 | Shown | — |
| FR-102 | Patient file: details, all appointments as a timeline with clinic and practitioner, previous tests (structured values, files or images); images and PDFs open inside the page. | UAT-21 | Shown | Document storage |
| FR-103 | Allowed file types and maximum upload size are set in Settings. A failed, broken or too-large upload shows a clear message, attaches nothing and can be retried. | UAT-21, EC-14 | Shown | Server validation, virus scan |
| FR-104 | Duplicate national IDs are flagged for review instead of showing two patients. Merging is a logged action for authorised users only. Name and record number stay visible at the top of every page of the file. | EC-12 | Shown | Master patient index |
| FR-105 | Staff profile: general information, experience, assigned clinics, latest patients. Staff dashboard with four figures per practitioner: patients served, encounters signed, average review time, tests and referrals ordered. | UAT-22 | Shown | — |
| FR-106 | Operations overview with filters (city, facility, clinic, date range); counts of appointments and tests ordered. Every figure opens its list; an appointment shows the practitioner's comment, treatments and the time from the nurse sending to the practitioner opening. Export. | UAT-23 | Shown (synthetic data) | Reporting store |
| FR-107 | System value dashboard: tests suggested and accepted or dismissed (with reasons); recommendations confirmed unchanged or overridden (with reasons); alerts raised by level; referrals suggested, made and missed. Figures must match a manual count. | UAT-24 | Shown (synthetic data) | Reporting store |
| FR-108 | Print or export as PDF: the visit summary with the clinical note, and the patient instructions. Exports respect visibility settings. | UAT-20 | Shown (browser print to PDF) | Server-rendered PDF |
| FR-109 | Every page has clear empty, loading and error states. | UAT-19 | Shown on main pages | — |
| FR-110 | Deliver this BRD; the client reviews and approves it before it is final. | UAT-25 | This document (draft 0.1) | — |

## 9. Clinical rules and sources

The **Developer Handbook (Clinical Logic and Terminology)**, sections 5 to 8, is the reference. Every rule is a pure function (findings in, results out), recomputed on every change, and every threshold sits in a versioned rule set (`df-rules` 1.0) that the clinical lead approves. A signed encounter stores the computed results, the alerts shown and the rule-set and layout versions (handbook §10). "Not assessed" is never "normal": a missing value is null and a comparison with it is false. The demo passes the handbook's test cases 1 to 8 (`node tools/test_rules.js`); cases 9 and 10 (locking, edit trail) are workflow rules shown in the demo.

| ID | Rule | Logic (summary) | Handbook | Status |
|---|---|---|---|---|
| CR-01 | SIRS | Temperature > 38 or < 36 °C; heart rate > 90; respiratory rate > 20; WBC > 12 or < 4 ×10⁹/L. SIRS = 2 or more points. | §5 step 4 | SIRS without PaCO₂ and immature white cells (open point) |
| CR-02 | LOPS per foot | Any monofilament site absent, or tuning fork absent | §5 step 1 | — |
| CR-03 | PAD per foot | Monophasic Doppler; ABI < 0.90; ankle < 100 mmHg (prototype); TBI < 0.75; toe < 60; TcPO₂ < 55; or both pulses absent. History of PAD or revascularisation counts. ABI > 1.30 with no toe value: possible calcification, unreliable. | §5 step 2 | Ankle 100 and TcPO₂ 55 need sign-off |
| CR-04 | Critical perfusion | ABI < 0.50, ankle < 50, toe < 30 or TcPO₂ < 25 | §5 step 2 | — |
| CR-05 | Supporting flags | Deformity (claw, hammer, prominent MTH, hallux valgus, change in foot shape, previous Charcot); callus; dry skin / fissures / nail changes; previous ulcer; previous amputation; ESRD; CKD; active ulcer | §5 step 3 | — |
| CR-06 | Charcot flag | 2 or more red flags including warmth, swelling or redness; or skin temperature difference > 2 °C | §5 step 4 | Needs sign-off |
| CR-07 | IWGDF risk 0–3 | 0; LOPS or PAD → 1; both, or with deformity → 2; plus previous ulcer, amputation or ESRD → 3. Deformity alone stays 0. Sets the screening interval. | §5 step 5 | — |
| CR-08 | MOH segment 0–4 | See the table below. Drives the referral. | §5 step 6 | "Any active ulcer" and "CKD without dialysis = moderate" need sign-off |
| CR-09 | Infection severity 0–3 | 2+ local signs, abscess or confirmed osteomyelitis: SIRS → Severe; erythema ≥ 2 cm or deep → Moderate; else Mild. Otherwise Uninfected ("Antibiotics are not indicated"). "(O)" when bone is involved. | §6 | Abscess / bone infection counting as infected (open point) |
| CR-10 | Wagner 1–5 | Whole-foot gangrene 5; any gangrene 4; abscess or confirmed osteomyelitis 3; exposed structure or probe-to-bone 2; else 1 | §6 | — |
| CR-11 | SINBAD 0–6 | Site not forefoot; neither pulse present; LOPS; infection ≥ 1; area ≥ 1 cm²; reaches deeper structures. 0–2 mild, 3–4 moderate, 5–6 severe. | §6 | — |
| CR-12 | WIfI stage 1–4 | W (1–3), I (worst of ABI / ankle / toe / TcPO₂ grades; estimated from Doppler and pulses when missing), fI (worst infection on that foot) → handbook stage table | §6 | Estimate and W shortcut need sign-off |
| CR-13 | Healing, type, offloading, dressing | Not healing: ≥ 4 weeks of care and area shrank by less than half. Suggested type from LOPS / PAD. Offloading and dressing suggestions by first match. | §6 | — |
| CR-14 | Suggested tests | Baseline panel (set in Clinic setup) for an active ulcer; procalcitonin; electrolytes; lactate, deep tissue culture, blood cultures; albumin; bone culture; plain X-ray; weight-bearing X-ray (Charcot); MRI (Charcot with a normal X-ray). Only active tests are suggested. | §7 | — |
| CR-15 | Follow-up, disposition, teams | Follow-up from the segment (≥ 2: 1–2 months; 1: 3–6 months; 0: IWGDF interval). Disposition by first match (sepsis, deep infection, limb ischaemia → emergency …). Teams: surgery, vascular, infectious disease, diabetologist, wound care, orthotics, dietician, physiotherapy, nephrology, social worker. | §7 | — |
| CR-16 | Lab reference checks | WBC 4.5–11; Hb 13.8–17.2 (M) / 12.1–15.1 (F); platelets 150–400 or 450; ESR < 20; CRP < 10; procalcitonin < 0.1; fasting glucose 70–100; HbA1c < 7; creatinine 0.74–1.35 (M) / 0.59–1.04 (F); lactate < 2; albumin 35–50 g/L | §7 | Platelet limit open |
| CR-17 | Clinical alerts | Full handbook §8 list: 10 critical, 22 warning and 15 info alerts, plus the nurse's "Tell the practitioner now" | §8 | Every threshold needs sign-off |

**CR-08 MOH segments.** Checked from the top; the first match wins.

| Segment | Condition | Action |
|---|---|---|
| 4 Acute foot attack | Active ulcer AND (any ulcer with moderate or severe infection, OR patient looks unwell, OR gangrene, abscess or confirmed bone infection, OR critical perfusion on that foot) | Send directly to the Emergency Department |
| 3 Active foot disease | Active ulcer OR Charcot flag | Same-day referral to tertiary care. Recall in 1 to 2 months |
| 2 High risk | LOPS and PAD; or (LOPS or PAD) with callus or deformity; or previous ulcer, amputation or ESRD | Secondary care within 1 week. Recall in 1 to 2 months |
| 1 Moderate risk | LOPS, PAD, deformity, dry skin / fissures / nail changes, or CKD | Secondary care within 3 weeks. Recall in 3 to 6 months |
| 0 Low risk | None of the above | Annual foot review and education |

**Governance**
- Rules are set by the clinic's senior doctor for general cases (UAT-18).
- A change to a rule or threshold is a versioned clinic-setup change, approved by the clinical lead and logged.
- Encounters keep the rule version they used.

## 10. Data model summary

| Entity | Key contents |
|---|---|
| Organisation unit | id, parent, level, name, facility type, clinic definition, status (active/closed) |
| Staff member | id, name, role, title, contact (e-mail, phone), assigned units, status, experience |
| Role | id, name, permissions, status |
| Visibility setting | role × data group → hidden / masked / visible |
| Patient | file number, national ID, name, sex, date of birth, phone, diabetes type and duration, allergies, risk history, registering facility, merge links |
| Encounter (appointment) | id, patient, clinic, booking (by whom, channel, when, confirmed, source: regular / referral), stage, timestamps (arrived, started, sent, opened, signed), holder (lock), nurse answers, practitioner answers, decisions, corrections, medications, clinical note, instructions, sign-off with notice acknowledgement, history of signed versions, layout version, revision number |
| Test catalogue item | id, label, group, approval rule, insurance flag, escalation time, backup approver, status (active/retired), revision |
| Test order | encounter, test (label snapshot), ordered by and when, approval status and decisions, insurance status, escalation |
| Suggestion outcome | encounter, suggested test or referral, accepted / dismissed, reason, who, when |
| Referral | encounter, destination, urgency, timing, due date, status history |
| Attachment | patient, encounter, type, size, file, uploaded by and when |
| Layout version | number, published by and when, note, pages (tabs, sections, locks), question placement, clinic questions |
| Audit entry | Section 11 |

## 11. Audit requirements (UAT-05)

### 11.1 Events to log

- **Account events:**
  - sign-in, sign-out, failed attempts, session expiry
  - password reset requests
  - users created, changed, disabled or enabled
- **Permission and setup changes:**
  - permissions and facility or clinic assignments granted, changed or removed, and by whom
  - clinic setup changes: questions, tests, approval rules, section and tab settings, layout versions
- **Patient record access:**
  - patient file viewed
  - emergency access (flagged)
  - patient files merged
- **Clinical record changes:**
  - every edit to a recorded value, with old and new value
  - recommendation confirmed or overridden
  - suggestion accepted or dismissed
  - medication entered
- **Orders and referrals:**
  - test ordered, approved or rejected (including insurance decisions and escalations)
  - referral created and its status changes
- **Workflow events:**
  - stage changes
  - sign-off and notice acknowledgement
  - reopening
  - editing lock taken, released or forced
  - discarded changes
- **Output and errors:**
  - exports and prints
  - system errors, for the support team (EC-15)

### 11.2 Entry contents and rules

Each entry records:
- who
- their role
- when
- facility
- clinic
- the action
- the affected patient or record
- old and new value
- the reason where given
- a flag for review

Rules:
- Entries are append-only. No user, including the system administrator, can change or delete one.
- A supervisor sees only the logs of their own facility.
- Old and new medical values are shown only to viewers allowed to see medical records.

## 12. Integrations (to be confirmed)

None of these is committed. Each needs a decision on scope, standard and owner.

| ID | Integration | Purpose | Status |
|---|---|---|---|
| INT-01 | Hospital information system / EMR | Patient registration, demographics, appointments, encounter export (FHIR R4 preferred) | TBC |
| INT-02 | National identity verification | Confirm patient identity from the national ID | TBC |
| INT-03 | Staff single sign-on | Staff sign-in with the organisation's identity provider | TBC |
| INT-04 | Laboratory (LIS) | Receive structured results; send orders | TBC |
| INT-05 | Imaging (PACS / RIS) | Imaging orders and reports | TBC |
| INT-06 | Insurance approval | Status of insurance approval for tests | TBC |
| INT-07 | E-mail and SMS | Password reset links, approval notifications, patient reminders | TBC (required for UAT-04 in production) |
| INT-08 | Booking channels (app, website, call centre) | Record who booked and how (UAT-11) | TBC |
| INT-09 | Referral destinations | Electronic referral to secondary/tertiary care and status updates | TBC |
| INT-10 | National reporting | Approved aggregate indicators only (reports.national) | TBC |

## 13. Data protection and PDPL

| ID | Requirement | Source |
|---|---|---|
| DR-01 | Process personal health data only for the stated clinical and operational purposes; record the lawful basis. | PDPL |
| DR-02 | Data minimisation through role-based visibility (hidden / masked / visible per data group), applied everywhere, including exports and print. | UAT-02 |
| DR-03 | Emergency access ("break the glass") needs a reason; it is logged, flagged and reviewed. | UAT-02 |
| DR-04 | All access to patient files is logged (patient file viewed). | UAT-05 |
| DR-05 | Data is hosted in the Kingdom of Saudi Arabia, per applicable regulation. | TBC with client |
| DR-06 | Retention periods for clinical records, audit logs, drafts and attachments are set by the client's records policy. | TBC |
| DR-07 | Data subject rights (access, correction) handled through the organisation's process; corrections keep history. | PDPL; TBC |
| DR-08 | Breach notification process and contacts defined by the client. | PDPL; TBC |
| DR-09 | Data is encrypted in transit (TLS 1.2+) and at rest. | NFR |
| DR-10 | Demo and test environments use fictional data only. | Project practice |

**Default visibility (editable):**

| Role | Sensitive identifiers | General data | Medical record |
|---|---|---|---|
| Administrator | Masked | Visible | Hidden |
| Director | Hidden | Masked | Visible |
| Supervisor | Masked | Visible | Visible |
| Nurse, Practitioner, Senior Doctor | Visible | Visible | Visible |

## 14. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-SEC-01 | **Every check runs on the server**: permission, scope, stage, lock, visibility, validation and revision checks. Hiding or disabling a control is not enough; a forbidden request is refused, logged and answered with a clear message. (UAT edge-case rule) |
| NFR-SEC-02 | Passwords are stored as salted hashes with a modern algorithm; a password policy is enforced; reset tokens are single-use and expire. |
| NFR-SEC-03 | Sessions expire after inactivity (default to be set by client; demo 30 minutes) with a warning. |
| NFR-SEC-04 | Protection against common web risks (OWASP Top 10); penetration test before go-live. |
| NFR-SEC-05 | File uploads: type and size limits from Settings; malware scanning. |
| NFR-AVL-01 | Availability target to be agreed (proposed 99.5% monthly in clinic hours); planned maintenance announced. |
| NFR-BCK-01 | Daily backups, point-in-time recovery; recovery objectives to be agreed (proposed RPO ≤ 1 h, RTO ≤ 4 h). |
| NFR-PRF-01 | Pages usable within 2 seconds on a typical clinic connection; queues refresh without reload. |
| NFR-ACC-01 | WCAG 2.1 AA: keyboard operation, focus visibility, labels and inline errors on every input, colour contrast, screen-reader names. |
| NFR-LOC-01 | Arabic and English with right-to-left layout: TBC with client. The demo is English only. |
| NFR-BRW-01 | Current versions of Chrome, Edge, Safari and Firefox on desktop and tablet; phone layouts without horizontal scrolling. |
| NFR-MOB-01 | On phones, tabs scroll sideways and tables become cards or scroll within their container. |
| NFR-OBS-01 | Errors are recorded for the support team with time, user, page and message (EC-15); monitoring and alerting in production. |
| NFR-CON-01 | Concurrent actions are resolved by revision checks: one succeeds, the other is told who changed the record (EC-01, EC-11). |
| NFR-AUD-01 | The audit log is append-only and tamper-evident. |
| NFR-VER-01 | Clinic setup and rules are versioned; encounters keep the version they started with. |

## 15. Edge cases as requirements (EC-01 to EC-15)

| ID | What if | Required behaviour | Demo status | Back end needed |
|---|---|---|---|---|
| EC-01 | Two people act on the same thing at the same moment | Only one succeeds; the other gets a clear message naming who has it; nothing is silently overwritten | Shown (revision check, lock, approvals) | Atomic server-side checks |
| EC-02 | A button is pressed twice (Send, Sign, Accept, Order, Approve) | The action happens once; the button is disabled while running | Shown | Idempotency keys |
| EC-03 | Connection drops or the browser closes mid-work | Draft kept; a save completes fully or not at all; lock released after timeout; the user continues on return | Shown | Transactions |
| EC-04 | Session expires on a long form | Warning before expiry; after signing in, back to the same place with the draft | Shown | Server sessions |
| EC-05 | Browser Back or an old tab after sending or signing | Page shows the current state; can't send or sign twice; an outdated save is refused | Shown | Server revision check |
| EC-06 | An action the stage doesn't allow | Refused with a message and logged; a signed encounter is corrected only by reopening with a reason; the original stays in history | Shown | Server state machine |
| EC-07 | Permissions, assignment or account status change while a page is open | Checked on every action; the next action is refused; a disabled user is signed out | Shown | Server-side |
| EC-08 | Missing or impossible value | Required fields block the step and name the field; impossible values are rejected (e.g. temperature 370); a missing value is never treated as normal; same on the practitioner page and in Settings | Shown | Server validation |
| EC-09 | Something others depend on is removed (practitioner leaves, clinic closes, test retired, question switched off, role deleted) | Never deleted, only deactivated; old records show the original name and value; open files of deactivated users or clinics are flagged for reassignment | Shown (staff, roles, tests, units, questions); clinic reassignment list partial | Server-side |
| EC-10 | Setup or rules change while an encounter is open | The open encounter keeps its version; new encounters use the new one | Shown | Versioned config |
| EC-11 | Two admins change the same setting at once | One succeeds; the other is told | Shown | Server revision check |
| EC-12 | The same patient exists twice, or the wrong file is opened | Same national ID flagged for review; name and record number visible at the top of every page of the file; merging is logged and authorised | Shown | Master patient index |
| EC-13 | A test approver is away | Pending approvals listed with age; after a set time, escalated to the backup or supervisor | Shown | Scheduled job |
| EC-14 | Upload fails or is too large | Clear message; nothing partial attached; retry possible | Shown | Server validation |
| EC-15 | A save fails for a technical reason | The user is told it failed and what to do; nothing partly saved; error recorded for support; never fails silently | Shown (simulated failures in Settings › System) | Server error handling |

## 16. Open items and decisions

### 16.1 Clinical decisions (clinical lead)

These are the handbook's open points (section 10) plus items from UAT round 1. The demo follows the handbook's working choice for each.

| ID | Question | Current demo behaviour |
|---|---|---|
| OD-01 | Platelet upper limit: 400 ×10⁹/L (training deck) or 450 (MOH table)? | 400, with both shown |
| OD-02 | Treating any active ulcer as "Active foot disease" (the MOH guide names chronic or infected ulcers only) | Any active ulcer counts |
| OD-03 | Ankle pressure below 100 mmHg counted as PAD (MOH says below 50 in one chart, 50 to 99 in another) | 100 |
| OD-04 | TcPO₂ below 55 mmHg as a PAD criterion | 55 |
| OD-05 | Estimating the WIfI ischaemia grade from pulses and Doppler when no measurement exists | Estimated and flagged |
| OD-06 | The Charcot flag rule (2 red flags including an inflammatory one, or > 2 °C difference) | As written |
| OD-07 | What counts as "Acute foot attack" | As in CR-08 |
| OD-08 | SIRS without PaCO₂ and immature white cells | 4 items |
| OD-09 | The W grade shortcut using heel location and an area of 10 cm² | As written |
| OD-10 | Every alert threshold: glucose 70 and 300, systolic BP 100, HbA1c 9, albumin 35, haemoglobin 10, eGFR 60, ESR 70, ulcer area 2 and 4 cm², pain 6 | As written |
| OD-11 | Antibiotic regimen and duration tables (prototype's Clinical reference screen, not in the handbook) | Not built: needs the tables |
| OD-12 | Counting an abscess or a confirmed bone infection as infected with fewer than 2 surface signs | Counted |
| OD-13 | Chronic kidney disease without dialysis in the moderate segment (the MOH guide lists renal replacement therapy only, under high risk) | Counted as moderate |
| OD-14 | Urea and eGFR reference ranges (not in the sources) | No flag shown |
| OD-15 | Interface language: the handbook says English only; NFR-LOC-01 left Arabic to be confirmed | English only |

### 16.2 Developer Handbook items (resolved in version 0.2)

| ID | Item | Status |
|---|---|---|
| BL-01 | F-05: the alert list (§8) | Built (CR-17) |
| BL-02 | F-06: WIfI stage table (§6) | Built (CR-12); table approval is OD-05 / OD-09 |
| BL-03 | F-04: referral rule checked against §5 step 6 | Built as the MOH segment (CR-08); handbook test cases 1 to 4 pass |
| BL-04 | Alert thresholds needing clinical sign-off (§10) | Listed as OD-10 |

Known gaps the handbook asks to build, not yet in the demo: marking the site of deformity and skin findings on the foot diagram; date and level details for each previous amputation beyond the level choice; a second sample clinic package (the eye clinic) to prove that a new clinic needs no engine change; rules stored as data evaluated by a generic evaluator (the demo keeps them as pure functions with a versioned threshold table).

### 16.3 Other open items

| ID | Item |
|---|---|
| OI-01 | Integrations INT-01 to INT-10: scope, standards and owners |
| OI-02 | Hosting, retention periods, breach process (DR-05, DR-06, DR-08) |
| OI-03 | Arabic localisation (NFR-LOC-01) |
| OI-04 | Session timeout and lock timeout values for production |
| OI-05 | Reassignment workflow for open files of a closed clinic (EC-09) |
| OI-06 | Settings › Page layout editor: built; client to confirm the default tab grouping for both pages |

## 17. Assumptions

1. One encounter belongs to one clinic. A patient booked in two clinics has two encounters.
2. The nurse and practitioner pages of each clinic definition are the two live pages. Additional builder steps have no live page until specified.
3. The front-end demo stores data in the browser for demonstration only. Production stores all data on the server.
4. The demo mailbox stands in for e-mail; production uses a real e-mail service (INT-07).
5. Demo dashboards use generated synthetic data so figures are rich; production dashboards read real records.
6. All users are staff of the organisation. There is no patient access to the platform in this phase.

## 18. Traceability matrix

| UAT / Finding / Edge case | Requirements | Demo status | Back end needed |
|---|---|---|---|
| UAT-01 Organisation and scoped access | FR-001–003 | Shown | Yes: server scope filter |
| UAT-02 Patient data visibility (PDPL) | FR-004–007, DR-02–03 | Shown / partial (FR-006) | Yes |
| UAT-03 Sensitive permissions | FR-008, FR-049 | Shown | Yes |
| UAT-04 Password reset | FR-020–023 | Shown (demo mailbox) | Yes: e-mail, tokens |
| UAT-05 Audit log page | FR-030–034, Section 11 | Shown / partial (FR-031) | Yes: append-only store |
| UAT-06 Nurse queue | FR-040 | Shown | — |
| UAT-07 Stages | FR-041–042 | Shown | Yes: state machine |
| UAT-08 Review queue | FR-043 | Shown | Yes |
| UAT-09 Editing lock | FR-044 | Shown | Yes |
| UAT-10 Unsaved changes | FR-046–047 | Shown | Server drafts (optional) |
| UAT-11 Appointment details | FR-100 | Shown | Booking interface |
| UAT-12 Referral tracking | FR-101, Section 7.9 | Shown | Referral interface (TBC) |
| UAT-13 Tabs | FR-080–082 | Shown | Versioned config |
| UAT-14 Section control | FR-083–084 | Shown | Versioned config |
| UAT-15 Question placement | FR-085 | Shown | Versioned config |
| UAT-16 Medications | FR-066 | Shown | — |
| UAT-17 Test approval rules | FR-070, Section 7.10 | Shown | Notifications, insurance |
| UAT-18 Sign-off notice | FR-048 | Shown | — |
| UAT-19 Page states | FR-109 | Shown | — |
| UAT-20 Print and export | FR-108, FR-006 | Shown | Server PDF |
| UAT-21 Patient file | FR-102–103 | Shown | Document storage |
| UAT-22 Staff profile | FR-105 | Shown | — |
| UAT-23 Operations overview | FR-106 | Shown (synthetic) | Reporting store |
| UAT-24 System value dashboard | FR-107 | Shown (synthetic) | Reporting store |
| UAT-25 BRD | FR-110 | Draft 0.1 | — |
| F-01 Roles not enforced | FR-009 | Fixed in demo | Server enforcement |
| F-02 "In review" set by anyone | FR-044–045 | Fixed | Server |
| F-03 No nurse queue | FR-040 | Fixed | — |
| F-04 Referral per MoC guide | FR-067, CR-08 | Fixed; matches the handbook | — |
| F-05 Alerts | FR-068, CR-17 | Shown | Approved thresholds |
| F-06 WIfI stage | FR-069, CR-12 | Shown | Table approval |
| F-07 Abscess | FR-064, CR-07, CR-08, CR-12 | Fixed | — |
| F-08 Labs | FR-065, CR-15 | Fixed; OD-01 open | — |
| F-09 Product name | Document title, all pages | Fixed | — |
| F-10 Company palette in charts | NFR-ACC-01 (contrast) | Fixed | — |
| F-11 Foot map orientation | FR-061 | Fixed | — |
| F-12 Confirm all | FR-063 | Fixed | — |
| F-13 Foot map in builder; builder drives live pages | FR-086–087 | Fixed (Diabetic Foot clinic) | Versioned config |
| EC-01 to EC-15 | Section 15 | See Section 15 | Yes: all need server-side enforcement |

---

*End of draft 0.1. Please send comments against the requirement IDs.*
