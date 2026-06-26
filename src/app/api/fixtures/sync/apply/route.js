import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getDB } from '@/lib/db';
import {
  ensureScheduleSchema,
  getCandidatesByRun,
  markCandidateApplied,
  syncCanonicalToRuntimeFixture,
  upsertCanonicalFixture
} from '@/lib/schedule/repository';

export async function POST(request) {
  try {
    const { syncRunId, candidateIds = [] } = await request.json();
    if (!syncRunId) {
      return NextResponse.json(
        { error: 'Thiếu syncRunId để apply lịch đấu.' },
        { status: 400 }
      );
    }

    const db = await getDB();
    await ensureScheduleSchema(db);

    const allCandidates = await getCandidatesByRun(db, syncRunId);
    const selectedIds = new Set(candidateIds.map(Number));
    const candidates = selectedIds.size > 0
      ? allCandidates.filter((candidate) => selectedIds.has(Number(candidate.id)))
      : allCandidates.filter((candidate) => candidate.diffType !== 'unchanged');

    let appliedCount = 0;
    const rejectedCandidates = [];

    for (const candidate of candidates) {
      const canApply = ['valid', 'manual_review'].includes(candidate.validationStatus) && candidate.diffType !== 'rejected';
      if (!canApply) {
        rejectedCandidates.push({
          id: candidate.id,
          reason: candidate.validationReason || 'Candidate chưa qua validator.'
        });
        continue;
      }

      await upsertCanonicalFixture(db, candidate.payload);
      await syncCanonicalToRuntimeFixture(db, candidate.payload);
      await markCandidateApplied(db, candidate.id);
      appliedCount++;
    }

    try {
      revalidatePath('/');
      revalidatePath('/match/[id]');
    } catch (cacheErr) {
      console.warn('⚠️ Lỗi revalidate sau apply canonical fixtures:', cacheErr.message);
    }

    return NextResponse.json({
      success: true,
      syncRunId,
      appliedCount,
      rejectedCandidates,
      message: `Đã apply ${appliedCount} thay đổi lịch đấu đã validate.`
    });
  } catch (error) {
    console.error('Lỗi apply canonical fixtures:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi apply lịch đấu canonical', details: error.message },
      { status: 500 }
    );
  }
}
