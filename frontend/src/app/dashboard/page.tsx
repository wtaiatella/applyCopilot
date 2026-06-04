import { ProtectedRoute } from '@/components/auth'
import { getCurrentUser } from '@/lib/auth'

export default async function DashboardPage() {
  const user = await getCurrentUser()

  return (
    <ProtectedRoute>
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl mb-4">Welcome!</h2>
          {user ? (
            <div>
              <p className="mb-2">
                <span className="font-semibold">Name:</span> {user.name}
              </p>
              <p>
                <span className="font-semibold">Email:</span> {user.email}
              </p>
            </div>
          ) : (
            <p>Loading user information...</p>
          )}
        </div>
      </div>
    </ProtectedRoute>
  )
}
