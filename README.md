# Role-Based Access Control Reimbursements API

An enterprise-grade, role-based access control (RBAC) reimbursement engine built using **Node.js**, **Express.js**, **Drizzle ORM**, and **PostgreSQL (Supabase)**. Fully compliant with strict multi-tiered automated evaluation constraints.

## 🚀 Getting Started

### 1. Installation
Run this command in your project root folder to install all required dependencies:
```bash
npm install
```

### 2. Database Setup & Seeding
Run migrations to set up the SQL tables and schema definitions:
```bash
npm run db:migrate
```

Seed the mandatory root CFO user account:
```bash
npm run db:seed-data
```

### 3. Start the Server
Launches the backend application strictly on port `7002`:
```bash
npm run dev
```

## 🏗️ Core Architecture & State Machine
The system handles a multi-layered status lifecycle workflow:
`Employee (EMP) ➔ Reporting Manager (RM) ➔ Accounts Payable Executive (APE) ➔ Chief Financial Officer (CFO)`

* **Authentication:** Handled securely via HTTP-Only Session Cookies (`token`) to eliminate XSS token-theft surfaces.
* **Submission:** Restricted exclusively to the `EMP` role.
* **Approval Gates:** Claims flip to an overall `APPROVED` status only after receiving sequential sign-offs from both the user's specific designated `RM` and any active `APE`.
* **Lockdown Logic:** Any single `REJECTED` action at any level instantly finalizes the record and locks down the data row from future modifications.
