import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyToken, extractTokenFromHeader } from '@/lib/jwt'

// PATCH /api/cv-manager/[id] - Update CV (name, isDefault)
export async function PATCH(
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

    const body = await request.json()
    const { name, isDefault } = body

    // 1. If setting as default, unset others first
    if (isDefault === true) {
      await (prisma as any).managedCV.updateMany({
        where: { userId: decoded.userId },
        data: { isDefault: false }
      })
    }

    // 2. Update this CV
    const updatedCv = await (prisma as any).managedCV.update({
      where: { 
        id: id,
        userId: decoded.userId // Safety check
      },
      data: {
        ...(name !== undefined && { name }),
        ...(isDefault !== undefined && { isDefault })
      }
    })

    return NextResponse.json({
      success: true,
      message: 'CV updated successfully',
      data: updatedCv
    })

  } catch (error: any) {
    console.error('Update CV Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error updating CV',
      error: error.message
    }, { status: 500 })
  }
}

// DELETE /api/cv-manager/[id] - Delete a CV template
export async function DELETE(
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

    // Delete the CV template
    await (prisma as any).managedCV.delete({
      where: { 
        id: id,
        userId: decoded.userId // Safety check
      }
    })

    return NextResponse.json({
      success: true,
      message: 'CV template deleted successfully'
    })

  } catch (error: any) {
    console.error('Delete CV Error:', error)
    return NextResponse.json({
      success: false,
      message: 'Internal error deleting CV template',
      error: error.message
    }, { status: 500 })
  }
}
