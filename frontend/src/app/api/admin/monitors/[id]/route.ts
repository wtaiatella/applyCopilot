import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import { PortalType } from '@prisma/client';

async function checkAdmin(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return false;
  }
  return true;
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await props.params;
    const body = await request.json();
    const { name, url, type, intervalHours, enabled, selectors } = body;

    const updatedMonitor = await prisma.portalMonitor.update({
      where: { id },
      data: {
        name,
        url,
        type: type as PortalType,
        intervalHours,
        enabled,
        selectors: selectors || undefined,
      }
    });

    return NextResponse.json({ success: true, data: updatedMonitor });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await props.params;
    await prisma.portalMonitor.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
