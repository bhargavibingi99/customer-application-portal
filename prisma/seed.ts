import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seeds a small but realistic dataset:
 *  - two teams, so manager team-scoping is observable
 *  - four users covering every role
 *  - six customers, so search returns meaningful subsets
 *  - twelve applications spread across stages/priorities, so filters and
 *    pagination (page size 10) both have something to show
 */
async function main() {
  // Order matters: children before parents because of foreign keys.
  await prisma.activityLog.deleteMany()
  await prisma.workItem.deleteMany()
  await prisma.application.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.user.deleteMany()
  await prisma.team.deleteMany()

  const operations = await prisma.team.create({ data: { name: 'Operations' } })
  const compliance = await prisma.team.create({ data: { name: 'Compliance' } })

  const admin = await prisma.user.create({
    data: { name: 'Alice Admin', email: 'admin@system.com', role: 'ADMIN', teamId: operations.id },
  })
  const manager = await prisma.user.create({
    data: { name: 'Bob Manager', email: 'manager@system.com', role: 'MANAGER', teamId: operations.id },
  })
  const charlie = await prisma.user.create({
    data: { name: 'Charlie Exec', email: 'exec@system.com', role: 'EXECUTIVE', teamId: operations.id },
  })
  // Deliberately on a different team so Bob (Operations manager) cannot see Dana's work.
  const dana = await prisma.user.create({
    data: { name: 'Dana Exec', email: 'dana@system.com', role: 'EXECUTIVE', teamId: compliance.id },
  })

  const customerSeeds = [
    { name: 'Acme Corp', email: 'contact@acme.com', company: 'Acme Industries', phone: '+1 415 555 0101' },
    { name: 'Starlight Retail', email: 'billing@starlight.io', company: 'Starlight LLC', phone: '+1 415 555 0102' },
    { name: 'Northwind Traders', email: 'ops@northwind.com', company: 'Northwind Group', phone: '+1 415 555 0103' },
    { name: 'Globex Logistics', email: 'hello@globex.com', company: 'Globex Worldwide', phone: '+1 415 555 0104' },
    { name: 'Initech Systems', email: 'admin@initech.com', company: 'Initech Inc', phone: '+1 415 555 0105' },
    { name: 'Umbrella Health', email: 'care@umbrella.org', company: 'Umbrella Health Group', phone: '+1 415 555 0106' },
  ]

  const customers = []
  for (const data of customerSeeds) {
    customers.push(await prisma.customer.create({ data }))
  }

  type Seed = {
    title: string
    description: string
    priority: string
    stage: string
    customerIndex: number
    assignee: { id: string; name: string } | null
    workItems: Array<{ title: string; status: string; assignee?: { id: string; name: string } }>
    sync?: { status: string; attempts: number; error?: string }
  }

  const applicationSeeds: Seed[] = [
    {
      title: 'Enterprise Onboarding - 500 seats',
      description: 'Onboard Acme Industries onto the enterprise tier, including SSO and billing setup.',
      priority: 'HIGH',
      stage: 'NEW',
      customerIndex: 0,
      assignee: charlie,
      workItems: [
        { title: 'Verify tax identification documents', status: 'PENDING', assignee: charlie },
        { title: 'Provision SAML single sign-on', status: 'PENDING', assignee: manager },
      ],
    },
    {
      title: 'Credit Limit Increase to $50k',
      description: 'Customer requests an increase of their trade credit limit from $10k to $50k.',
      priority: 'CRITICAL',
      stage: 'IN_PROGRESS',
      customerIndex: 1,
      assignee: manager,
      workItems: [
        { title: 'Run financial audit check', status: 'COMPLETED', assignee: manager },
        { title: 'Obtain underwriting approval', status: 'IN_PROGRESS', assignee: manager },
      ],
    },
    {
      title: 'Annual Compliance Review',
      description: 'Yearly KYC and sanctions screening refresh for Northwind Group.',
      priority: 'MEDIUM',
      stage: 'UNDER_REVIEW',
      customerIndex: 2,
      assignee: dana,
      workItems: [
        { title: 'Collect updated ownership records', status: 'COMPLETED', assignee: dana },
        { title: 'Complete sanctions screening', status: 'COMPLETED', assignee: dana },
        { title: 'Sign off final review', status: 'IN_PROGRESS', assignee: dana },
      ],
    },
    {
      title: 'Freight Account Setup',
      description: 'New freight forwarding account with customs documentation requirements.',
      priority: 'MEDIUM',
      stage: 'WAITING_FOR_INFO',
      customerIndex: 3,
      assignee: charlie,
      workItems: [{ title: 'Request customs broker licence', status: 'PENDING', assignee: charlie }],
    },
    {
      title: 'Legacy System Migration',
      description: 'Migrate Initech from the legacy billing platform to the current stack.',
      priority: 'HIGH',
      stage: 'COMPLETED',
      customerIndex: 4,
      assignee: charlie,
      workItems: [
        { title: 'Export legacy invoices', status: 'COMPLETED', assignee: charlie },
        { title: 'Validate migrated balances', status: 'COMPLETED', assignee: manager },
      ],
      // Already synchronised successfully with the external system.
      sync: { status: 'SUCCESS', attempts: 1 },
    },
    {
      title: 'Healthcare Data Processing Agreement',
      description: 'Execute a data processing agreement covering patient records.',
      priority: 'CRITICAL',
      stage: 'COMPLETED',
      customerIndex: 5,
      assignee: dana,
      workItems: [{ title: 'Legal review of DPA clauses', status: 'COMPLETED', assignee: dana }],
      // Left in a failed state so the "Retry sync" flow can be demonstrated immediately.
      sync: {
        status: 'FAILED',
        attempts: 2,
        error: 'External system unavailable (503) after 2 attempts',
      },
    },
    {
      title: 'Payment Terms Renegotiation',
      description: 'Move Acme from net-30 to net-60 payment terms.',
      priority: 'LOW',
      stage: 'NEW',
      customerIndex: 0,
      assignee: null,
      workItems: [],
    },
    {
      title: 'Additional User Licences',
      description: 'Starlight requests 25 additional user licences mid-contract.',
      priority: 'LOW',
      stage: 'IN_PROGRESS',
      customerIndex: 1,
      assignee: charlie,
      workItems: [{ title: 'Confirm pro-rata pricing', status: 'IN_PROGRESS', assignee: charlie }],
    },
    {
      title: 'Warehouse Address Change',
      description: 'Update the primary shipping address and revalidate delivery zones.',
      priority: 'MEDIUM',
      stage: 'UNDER_REVIEW',
      customerIndex: 2,
      assignee: charlie,
      workItems: [{ title: 'Verify new address documentation', status: 'COMPLETED', assignee: charlie }],
    },
    {
      title: 'Insurance Certificate Renewal',
      description: 'Collect and file the renewed cargo insurance certificate.',
      priority: 'HIGH',
      stage: 'WAITING_FOR_INFO',
      customerIndex: 3,
      assignee: dana,
      workItems: [{ title: 'Chase broker for certificate', status: 'PENDING', assignee: dana }],
    },
    {
      title: 'API Rate Limit Increase',
      description: 'Initech requests a higher API quota for their integration.',
      priority: 'LOW',
      stage: 'NEW',
      customerIndex: 4,
      assignee: null,
      workItems: [],
    },
    {
      title: 'Vendor Security Questionnaire',
      description: 'Complete the customer-supplied security questionnaire and evidence pack.',
      priority: 'MEDIUM',
      stage: 'IN_PROGRESS',
      customerIndex: 5,
      assignee: dana,
      workItems: [
        { title: 'Answer infrastructure section', status: 'COMPLETED', assignee: dana },
        { title: 'Attach penetration test summary', status: 'PENDING', assignee: dana },
      ],
    },
  ]

  for (const seed of applicationSeeds) {
    const isCompleted = seed.stage === 'COMPLETED'

    await prisma.application.create({
      data: {
        title: seed.title,
        description: seed.description,
        priority: seed.priority,
        stage: seed.stage,
        customerId: customers[seed.customerIndex].id,
        assignedUserId: seed.assignee?.id ?? null,
        syncStatus: seed.sync?.status ?? (isCompleted ? 'PENDING' : 'NOT_REQUIRED'),
        syncAttempts: seed.sync?.attempts ?? 0,
        lastSyncError: seed.sync?.error ?? null,
        lastSyncedAt: seed.sync?.status === 'SUCCESS' ? new Date() : null,
        workItems: {
          create: seed.workItems.map((item) => ({
            title: item.title,
            status: item.status,
            assignedUserId: item.assignee?.id ?? null,
            completedAt: item.status === 'COMPLETED' ? new Date() : null,
          })),
        },
        activityLogs: {
          create: buildHistory(seed, admin),
        },
      },
    })
  }

  const counts = {
    teams: 2,
    users: 4,
    customers: customers.length,
    applications: applicationSeeds.length,
  }

  console.log('Database seeded successfully.')
  console.log(
    `  ${counts.teams} teams, ${counts.users} users, ${counts.customers} customers, ${counts.applications} applications`
  )
  console.log('\nSign in with any of these emails (no password required):')
  console.log('  admin@system.com     ADMIN      (Operations)')
  console.log('  manager@system.com   MANAGER    (Operations)')
  console.log('  exec@system.com      EXECUTIVE  (Operations)')
  console.log('  dana@system.com      EXECUTIVE  (Compliance)')
}

/** Builds a plausible activity trail for a seeded application. */
function buildHistory(
  seed: { stage: string; assignee: { id: string; name: string } | null; sync?: { status: string; error?: string } },
  admin: { id: string }
) {
  const history: Array<{ action: string; details: string; userId: string | null }> = [
    { action: 'CREATED', details: 'Application created', userId: admin.id },
  ]

  if (seed.assignee) {
    history.push({
      action: 'ASSIGNED',
      details: `Application assigned to ${seed.assignee.name}`,
      userId: admin.id,
    })
  }

  if (seed.stage !== 'NEW') {
    history.push({
      action: 'STAGE_CHANGED',
      details: `Transitioned stage from NEW to ${seed.stage}`,
      userId: admin.id,
    })
  }

  if (seed.sync?.status === 'SUCCESS') {
    history.push({
      action: 'SYNC_SUCCEEDED',
      details: 'External sync completed with status SYNCED',
      userId: null,
    })
  }

  if (seed.sync?.status === 'FAILED') {
    history.push({
      action: 'SYNC_FAILED',
      details: `External sync failed: ${seed.sync.error}`,
      userId: null,
    })
  }

  return history
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
