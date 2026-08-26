import { cookies } from 'next/headers'
import { prisma } from './prisma'

export const SESSION_COOKIE = 'cap_session'

export async function getCurrentUser() {
  const cookieStore = cookies()
  const userId = cookieStore.get(SESSION_COOKIE)?.value
  if (!userId) return null
  return prisma.user.findUnique({
    where: { id: userId },
    include: { team: true },
  })
}

export async function getCurrentUserOrThrow() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}
