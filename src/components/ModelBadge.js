'use client';

import { useState, useEffect } from 'react';
import { getLastUsedModel, formatModelName } from '@/lib/models-client';

export default function ModelBadge({ isFloat = false }) {
  const [modelName, setModelName] = useState('Google Gemini');

  useEffect(() => {
    const updateModel = () => {
      const lastModel = getLastUsedModel();
      if (lastModel) {
        setModelName(formatModelName(lastModel));
      } else {
        setModelName('Google Gemini');
      }
    };

    updateModel();

    window.addEventListener('last-model-used-changed', updateModel);
    return () => {
      window.removeEventListener('last-model-used-changed', updateModel);
    };
  }, []);

  if (isFloat) {
    return (
      <div className="flex items-center space-x-1.5 bg-[#0D1324]/80 backdrop-blur-md border border-card-border/60 rounded-full py-1 px-2.5 shadow-lg whitespace-nowrap">
        <span className="h-1.5 w-1.5 rounded-full bg-primary live-indicator flex-shrink-0"></span>
        <span className="text-[9px] font-bold text-gray-350 tracking-wide transition-all duration-300">
          {modelName}
        </span>
      </div>
    );
  }

  return (
    <div className="hidden sm:flex items-center space-x-2 bg-card-border/50 border border-card-border rounded-full py-1 px-3">
      <span className="h-2 w-2 rounded-full bg-primary live-indicator"></span>
      <span className="text-xs font-semibold text-gray-300 transition-all duration-300">
        {modelName}
      </span>
    </div>
  );
}
