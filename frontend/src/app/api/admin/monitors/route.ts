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

export async function GET(request: NextRequest) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const monitors = await prisma.portalMonitor.findMany({
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ success: true, data: monitors });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await checkAdmin(request))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, url, type, intervalHours, enabled, selectors } = body;

    const newMonitor = await prisma.portalMonitor.create({
      data: {
        name,
        url,
        type: type as PortalType,
        intervalHours: intervalHours || 24,
        enabled: enabled !== undefined ? enabled : true,
        selectors: selectors || undefined,
      }
    });

    return NextResponse.json({ success: true, data: newMonitor });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
