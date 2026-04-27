import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Define protected and public routes
const publicRoutes = [
  '/auth/signin',
  '/auth/signup',
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/[...nextauth]',
  '/',
  '/api/profile/upload-cv', // TEMPORARY: Allow CV upload for testing without auth
]

const protectedRoutes = [
  '/dashboard',
  '/profile',
  '/jobs',
  '/applications',
  '/api/dashboard',
  '/api/profile',
  '/api/jobs',
  '/api/applications',
]

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth?.token

    // Allow public routes without authentication check
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))
    if (isPublicRoute) {
      return NextResponse.next()
    }

    // Check if the route is protected and user is not authenticated
    const isProtectedRoute = protectedRoutes.some(route => 
      pathname.startsWith(route)
    )

    if (isProtectedRoute && !token) {
      const signInUrl = new URL('/auth/signin', req.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(signInUrl)
    }

    // Redirect authenticated users away from auth pages
    const isAuthPage = pathname.startsWith('/auth/')
    if (isAuthPage && token) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized({ req, token }) {
        // Allow public routes without authentication
        const { pathname } = req.nextUrl
        
        if (publicRoutes.some(route => pathname.startsWith(route))) {
          return true
        }

        // Require token for protected routes
        return token !== null
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
)

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
