'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [rules, setRules] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('ddl_generator_global_rules');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setRules(parsed);
      } catch (e) {
        console.error('Failed to parse rules:', e);
      }
    }
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">调试页面 - 查看 localStorage</h1>
      <div className="bg-gray-100 p-4 rounded">
        <h2 className="text-lg font-semibold mb-2">当前 localStorage 中的规则：</h2>
        {rules ? (
          <pre className="bg-white p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(rules, null, 2)}
          </pre>
        ) : (
          <p>没有找到规则</p>
        )}
      </div>
      <button
        onClick={() => {
          localStorage.removeItem('ddl_generator_global_rules');
          window.location.reload();
        }}
        className="mt-4 px-4 py-2 bg-red-500 text-white rounded"
      >
        清除 localStorage 并刷新
      </button>
    </div>
  );
}
