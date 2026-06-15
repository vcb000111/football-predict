import React from 'react';

export function renderMessageContent(text) {
  if (!text) return null;

  // Xử lý các ký tự xuống dòng escaped \\n thường gặp khi lưu DB
  const normalizedText = text.replace(/\\n/g, '\n');
  const lines = normalizedText.split('\n');
  const elements = [];
  let i = 0;

  const parseBold = (str) => {
    const parts = str.split('**');
    return parts.map((part, partIdx) => {
      if (partIdx % 2 === 1) {
        return <strong key={partIdx} className="font-extrabold text-white">{part}</strong>;
      }
      return part;
    });
  };

  while (i < lines.length) {
    let line = lines[i];
    let trimmed = line.trim();

    // Kiểm tra xem dòng có phải là một phần của bảng không
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Gom nhóm tất cả các dòng bảng liên tiếp
      const tableLines = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // Parse bảng
      if (tableLines.length > 0) {
        // Dòng đầu tiên là header
        const headerCells = tableLines[0]
          .split('|')
          .map(c => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1); // Bỏ cột rỗng đầu và cuối

        // Dòng thứ hai thường là separator |---|:---|
        let startBodyIdx = 1;
        if (tableLines.length > 1 && tableLines[1].replace(/[\s\-:|]/g, '') === '') {
          startBodyIdx = 2; // Bỏ qua dòng separator
        }

        const bodyRows = [];
        for (let rIdx = startBodyIdx; rIdx < tableLines.length; rIdx++) {
          const cells = tableLines[rIdx]
            .split('|')
            .map(c => c.trim())
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          bodyRows.push(cells);
        }

        elements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-3 rounded-lg border border-card-border/40 shadow-md">
            <table className="min-w-full divide-y divide-card-border/30 bg-[#111827]/30 text-[11px]">
              <thead className="bg-[#151E2E]/80">
                <tr>
                  {headerCells.map((cell, cIdx) => (
                    <th key={cIdx} className="px-3 py-2 text-left font-black text-primary uppercase tracking-wider border-b border-card-border/30">
                      {parseBold(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/20">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-card-border/10 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 text-gray-300 border-r border-card-border/10 last:border-0 font-medium">
                        {parseBold(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue; // Bỏ qua i++ vì i đã được tăng trong vòng lặp tableLines
    }

    // Xử lý các dòng text thông thường khác
    if (!trimmed) {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
      trimmed = trimmed.substring(2, trimmed.length - 2).trim();
    }

    let isHeading = false;
    let headingLevel = 0;
    if (trimmed.startsWith('###')) {
      isHeading = true;
      headingLevel = 3;
      trimmed = trimmed.substring(3).trim();
    } else if (trimmed.startsWith('##')) {
      isHeading = true;
      headingLevel = 2;
      trimmed = trimmed.substring(2).trim();
    } else if (trimmed.startsWith('#')) {
      isHeading = true;
      headingLevel = 1;
      trimmed = trimmed.substring(1).trim();
    }

    let isListItem = false;
    if (!isHeading && (trimmed.startsWith('* ') || trimmed.startsWith('- ') || trimmed.startsWith('• '))) {
      isListItem = true;
      trimmed = trimmed.substring(2).trim();
    }

    const content = parseBold(trimmed);

    if (isHeading) {
      if (headingLevel === 1) elements.push(<h1 key={i} className="text-sm font-black text-white mt-3 mb-1.5 uppercase tracking-wider">{content}</h1>);
      else if (headingLevel === 2) elements.push(<h2 key={i} className="text-xs font-black text-white mt-2.5 mb-1.5 uppercase tracking-wider">{content}</h2>);
      else elements.push(<h3 key={i} className="text-[11px] font-black text-primary mt-2 mb-1 uppercase tracking-wider">{content}</h3>);
    } else if (isListItem) {
      elements.push(
        <div key={i} className="flex items-start pl-2.5 my-0.5">
          <span className="text-primary mr-1.5 select-none">•</span>
          <span className="flex-1 text-[11px] text-gray-300">{content}</span>
        </div>
      );
    } else {
      elements.push(
        <div key={i} className="my-1 text-gray-300 text-xs leading-relaxed">
          {content}
        </div>
      );
    }
    i++;
  }

  return elements;
}
