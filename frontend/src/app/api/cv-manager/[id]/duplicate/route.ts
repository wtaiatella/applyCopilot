import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

// POST /api/cv-manager/[id]/duplicate - Duplicate an existing CV
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = await params
    const authHeader = request.headers.get('Authorization')
    const token = extractTokenFromHeader(authHeader)
    if (!token) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }
    
    let decoded;
    try {
      decoded = verifyToken(token)
    } catch (e) {
      return NextResponse.json({ success: false, message: 'Invalid token' }, { status: 401 })
    }

    // 1. Fetch the source CV
    const sourceCv = await (prisma as any).managedCV.findUnique({
      where: { 
        id: id,
        userId: decoded.userId
      }
    })

    if (!sourceCv) {
      return NextResponse.json({ success: false, message: 'Source CV not found' }, { status: 404 })
    }

    // 2. Create the duplicate
    const duplicatedCv = await (prisma as any).managedCV.create({
      data: {
        userId: decoded.userId,
        name: `${sourceCv.name} (Copy)`,
        isDefault: false,
        content: sourceCv.content as any,
        applicationCount: 0 // New copy hasn't been used yet
      }
    })

    return NextResponse.json({
      success: true,
      message: 'CV duplicated successfully',
      data: duplicatedCv
    })

  } catch (error: any) {
    console.error('Duplicate CV Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error duplicating CV',
      error: error.message
    }, { status: 500 })
  }
}
