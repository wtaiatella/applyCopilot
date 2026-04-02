import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

// GET /api/cv-manager - List all CVs for the user
export async function GET(request: Request) {
  try {
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

    const cvs = await (prisma as any).managedCV.findMany({
      where: { userId: decoded.userId },
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({
      success: true,
      data: cvs
    })

  } catch (error: any) {
    console.error('List CVs Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error listing CVs',
      error: error.message
    }, { status: 500 })
  }
}

// POST /api/cv-manager - Create a new CV template from Profile snapshot
export async function POST(request: Request) {
  try {
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

    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json({ success: false, message: 'CV name is required' }, { status: 400 })
    }

    // 1. Fetch current profile to take a snapshot
    const profile = await prisma.profile.findUnique({
      where: { userId: decoded.userId }
    })

    if (!profile) {
      return NextResponse.json({ success: false, message: 'Profile not found. Please create a profile first.' }, { status: 404 })
    }

    // 2. Create the ManagedCV with a snapshot of the profile
    const newCv = await (prisma as any).managedCV.create({
      data: {
        userId: decoded.userId,
        name: name,
        isDefault: false,
        content: {
          summary: profile.summary,
          skills: profile.skills,
          experiences: profile.experiences,
          education: profile.education,
          projects: profile.projects
        }
      }
    })

    return NextResponse.json({
      success: true,
      message: 'CV template created successfully',
      data: newCv
    })

  } catch (error: any) {
    console.error('Create CV Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error creating CV template',
      error: error.message
    }, { status: 500 })
  }
}
