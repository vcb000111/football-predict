import { NextResponse } from 'next/server';
import { getDB } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const prompts = await db.all("SELECT * FROM system_prompts ORDER BY id ASC");
    return NextResponse.json({ success: true, prompts });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách prompts:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi lấy prompts', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { promptKey, promptContent } = await request.json();

    if (!promptKey || promptContent === undefined) {
      return NextResponse.json(
        { error: 'Thiếu thông tin promptKey hoặc promptContent' },
        { status: 400 }
      );
    }

    const db = await getDB();
    
    // Cập nhật nội dung prompt và cập nhật cột last_updated
    const result = await db.run(
      `UPDATE system_prompts 
       SET prompt_content = ?, last_updated = CURRENT_TIMESTAMP 
       WHERE prompt_key = ?`,
      [promptContent, promptKey]
    );

    if (result.changes === 0) {
      return NextResponse.json(
        { error: `Không tìm thấy prompt với key: ${promptKey}` },
        { status: 404 }
      );
    }

    console.log(`🟢 [PROMPT UPDATE] Đã cập nhật thành công prompt: ${promptKey}`);
    return NextResponse.json({ success: true, message: 'Đã cập nhật prompt thành công' });
  } catch (error) {
    console.error('Lỗi khi cập nhật prompt:', error);
    return NextResponse.json(
      { error: 'Lỗi máy chủ khi cập nhật prompt', details: error.message },
      { status: 500 }
    );
  }
}
