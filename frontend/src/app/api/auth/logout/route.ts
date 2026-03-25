import { NextResponse } from 'next/server'

export async function POST() {
  // For JWT, server-side logout is just returning success as the token is stored on the client
  return NextResponse.json({
    success: true,
    message: 'Logout realizado com sucesso'
  })
}
