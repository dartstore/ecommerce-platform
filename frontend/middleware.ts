import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_ROUTES = [
  '/dashboard',
  '/settings',
  '/profile',
]

const AUTH_PAGES = [
  '/login',
  '/register',
]

function isTokenExpired(
  token: string
) {

  try {

    const payload =
      JSON.parse(
        atob(
          token.split('.')[1]
        )
      )

    if (!payload.exp)
      return false

    return (
      Date.now() >=
      payload.exp * 1000
    )

  } catch {

    return true
  }
}

export function middleware(
  request: NextRequest
) {

  const {
    pathname,
    searchParams
  } = request.nextUrl

  const token =
    request.cookies.get(
      'access_token'
    )?.value

  const isProtected =
    PROTECTED_ROUTES.some(
      route =>
        pathname.startsWith(route)
    )

  const isAuthPage =
    AUTH_PAGES.some(
      route =>
        pathname.startsWith(route)
    )

  /**
   * =========================
   * reasons
   * =========================
   */

  const reason =
    searchParams.get(
      'reason'
    )

  const skipRedirect =

    reason === 'timeout' ||

    reason === 'force_logout'

  /**
   * =========================
   * intended
   * =========================
   */

  const intended =
    searchParams.get(
      'intended'
    )

  /**
   * =========================
   * protected routes
   * =========================
   */

  if (isProtected) {

    /**
     * ❌ no token
     */

    if (!token) {

      return NextResponse.redirect(

        new URL(

          `/login?intended=${encodeURIComponent(pathname)}`,

          request.url
        )
      )
    }

    /**
     * ❌ expired token
     */

    if (
      isTokenExpired(token)
    ) {

      const response =
        NextResponse.redirect(

          new URL(

            `/login?reason=timeout&intended=${encodeURIComponent(pathname)}`,

            request.url
          )
        )

      response.cookies.delete(
        'access_token'
      )

      return response
    }
  }

  /**
   * =========================
   * auth pages
   * =========================
   */

  if (isAuthPage) {

  // السماح دائماً بصفحة اللوجين بعد الطرد
  if (
    reason === 'timeout' ||
    reason === 'force_logout'
  ) {

    const response =
      NextResponse.next()

    response.cookies.delete(
      'access_token'
    )

    return response
  }

  if (token) {

    if (isTokenExpired(token)) {

      const response =
        NextResponse.next()

      response.cookies.delete(
        'access_token'
      )

      return response
    }

    const intendedTarget =

      intended &&

      !intended.startsWith('/login') &&

      !intended.startsWith('/register')

        ? intended

        : '/dashboard'

    return NextResponse.redirect(
      new URL(
        intendedTarget,
        request.url
      )
    )
  }
}

  /**
   * =========================
   * continue
   * =========================
   */

  const response =
    NextResponse.next()

  response.headers.set(

    'x-user-auth',

    token ? '1' : '0'
  )

  return response
}

export const config = {

  matcher: [

    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}