import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

export async function PATCH(request: Request) {
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

    // Update profile in MongoDB using the userId from token
    const updatedProfile = await prisma.profile.update({
      where: { userId: decoded.userId },
      data: {
        summary: body.summary,
        skills: body.skills,
        experiences: body.experiences,
        education: body.education,
        phone: body.phone,
        linkedinUrl: body.linkedinUrl,
        githubUrl: body.githubUrl,
        portfolioUrl: body.portfolioUrl,
        currentPosition: body.currentPosition,
        // search preferences
        contractTypes: body.contractTypes,
        workModality: body.workModality,
        salaryMin: body.salaryMin,
        salaryMax: body.salaryMax,
        locationsOfInterest: body.locationsOfInterest
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile
    })

  } catch (error: any) {
    console.error('Update profile error:', error)
    return NextResponse.json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    }, { status: 500 })
  }
}
