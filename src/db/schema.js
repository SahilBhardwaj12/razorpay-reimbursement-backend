const {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  pgEnum,
} = require('drizzle-orm/pg-core');

// ---------- Enums ----------

const roleEnum = pgEnum('role', ['EMP', 'RM', 'APE', 'CFO']);

const statusEnum = pgEnum('status', ['PENDING', 'APPROVED', 'REJECTED']);

// ---------- Tables ----------

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('EMP'),
  managerId: integer('manager_id').references(() => users.id),
});

const reimbursements = pgTable('reimbursements', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id')
    .notNull()
    .references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  amount: integer('amount').notNull(),
  status: statusEnum('status').notNull().default('PENDING'),
  approvedByRm: boolean('approved_by_rm').notNull().default(false),
  approvedByApe: boolean('approved_by_ape').notNull().default(false),
});

module.exports = { users, reimbursements, roleEnum, statusEnum };
