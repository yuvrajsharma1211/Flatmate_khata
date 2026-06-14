import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');
  
  // Clear existing database records to prevent duplicate key errors
  await prisma.importAnomaly.deleteMany();
  await prisma.expenseSplit.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.group.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);

  // 1. Create users
  const aisha = await prisma.user.create({
    data: { name: 'Aisha', email: 'aisha@example.com', password_hash: passwordHash }
  });
  const rohan = await prisma.user.create({
    data: { name: 'Rohan', email: 'rohan@example.com', password_hash: passwordHash }
  });
  const priya = await prisma.user.create({
    data: { name: 'Priya', email: 'priya@example.com', password_hash: passwordHash }
  });
  const meera = await prisma.user.create({
    data: { name: 'Meera', email: 'meera@example.com', password_hash: passwordHash }
  });
  const sam = await prisma.user.create({
    data: { name: 'Sam', email: 'sam@example.com', password_hash: passwordHash }
  });
  const dev = await prisma.user.create({
    data: { name: 'Dev', email: 'dev@example.com', password_hash: passwordHash }
  });

  console.log('Users created successfully:', [aisha, rohan, priya, meera, sam, dev].map(u => u.name));

  // 2. Create Group "The Flat"
  const group = await prisma.group.create({
    data: {
      name: 'The Flat',
      base_currency: 'INR',
      created_by: aisha.id
    }
  });

  console.log('Group created:', group.name);

  // 3. Create Group Memberships
  // - Aisha, Rohan, Priya: joined_at = 2026-02-01, left_at = NULL
  // - Meera: joined_at = 2026-02-01, left_at = 2026-03-31
  // - Sam: joined_at = 2026-04-14, left_at = NULL
  // - Dev: do NOT add as a group member
  await prisma.groupMember.createMany({
    data: [
      {
        group_id: group.id,
        user_id: aisha.id,
        role: 'admin',
        joined_at: new Date('2026-02-01'),
        left_at: null
      },
      {
        group_id: group.id,
        user_id: rohan.id,
        role: 'member',
        joined_at: new Date('2026-02-01'),
        left_at: null
      },
      {
        group_id: group.id,
        user_id: priya.id,
        role: 'member',
        joined_at: new Date('2026-02-01'),
        left_at: null
      },
      {
        group_id: group.id,
        user_id: meera.id,
        role: 'member',
        joined_at: new Date('2026-02-01'),
        left_at: new Date('2026-03-31')
      },
      {
        group_id: group.id,
        user_id: sam.id,
        role: 'member',
        joined_at: new Date('2026-04-14'),
        left_at: null
      }
    ]
  });

  console.log('Group members seeded successfully');

  // 4. Create Settings
  await prisma.setting.createMany({
    data: [
      {
        group_id: group.id,
        key: 'usd_to_inr_rate',
        value: '83'
      },
      {
        group_id: group.id,
        key: 'rounding_rule',
        value: 'remainder_to_payer'
      }
    ]
  });

  console.log('Settings seeded successfully');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
